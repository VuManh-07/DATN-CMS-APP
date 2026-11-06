"use strict";

import { EventEmitter } from "events";
import readerService, { Iso7816Application } from "./reader";
import { apiClient } from "../api/apiClient";
import { GET_DATA_CPLC, parseCplcSerial } from "./cplc";

/**
 * One SCP03 secure-channel session against the card in the reader.
 *
 * All cryptography happens on cms-server: this class only moves APDUs between
 * the server and the card. It never holds, derives, or even sees a key — which
 * is the whole point of the server-as-key-authority design, and the reason the
 * demo's local scp03.ts is deliberately not ported here.
 *
 * Instances are single-use and own their own state (unlike the module-level
 * globals in the wallet demo), so batch mode can run card after card without
 * leaking session state between them.
 */

const SELECT = "00A40400";
const INITIALIZE_UPDATE = "80503000";
const EXTERNAL_AUTHENTICATE = "80823300";

/** CLA used for application commands once the channel is open. */
const APP_CLA = "B0";

export interface ApduTraceEntry {
  direction: "command" | "response" | "info" | "error";
  text: string;
  at: number;
}

export interface SecureMessageResult {
  data: string;
  sw?: string;
}

export class CardSession extends EventEmitter {
  /** Server-side session handle, returned by /scp03/hostChallenge. */
  private entityId: string | null = null;
  private application: any = null;
  private open = false;
  private closed = false;
  readonly cardId: string;

  constructor(cardId: string) {
    super();
    this.cardId = cardId;
  }

  private trace(direction: ApduTraceEntry["direction"], text: string) {
    const entry: ApduTraceEntry = { direction, text, at: Date.now() };
    this.emit("trace", entry);
  }

  isOpen() {
    return this.open;
  }

  getEntityId() {
    return this.entityId;
  }

  /** Issue a raw APDU to the card and return its response. */
  private async issue(hex: string): Promise<{ data: string; sw: string }> {
    this.trace("command", hex);
    const response = await this.application.issueCommand(
      Buffer.from(hex, "hex")
    );
    const data: string = response["data"] || "";
    const sw = `${response.toString()}`.slice(-4);
    this.trace("response", `${data}${data ? " " : ""}${response.meaning()}`);
    return { data, sw };
  }

  /**
   * Read the card serial number.
   *
   * Read before any secure channel exists, which is what lets the wizard
   * identify an unknown blank card. GET DATA for the CPLC record gives a
   * genuinely per-chip identifier; the ATR is only a fallback, and a poor
   * one — it is identical across every chip of the same product, so two
   * cards from one batch would collide on the CMS's unique CSN index.
   */
  async readCsn(): Promise<string> {
    const card = readerService.requireCard();
    const atr: string = String(card.getAtr()).toUpperCase().replace(/\s+/g, "");

    if (!this.application) this.application = new Iso7816Application(card);

    try {
      const response = await this.issue(GET_DATA_CPLC);
      const serial =
        response.sw === "9000" ? parseCplcSerial(response.data) : null;
      if (serial) {
        this.trace("info", `CSN (CPLC): ${serial}`);
        return serial;
      }
      this.trace(
        "info",
        `CPLC unavailable (SW ${response.sw}) — falling back to the ATR`
      );
    } catch (error: any) {
      this.trace("info", `CPLC read failed (${error.message}) — using the ATR`);
    }

    this.trace("info", `CSN (ATR fallback): ${atr}`);
    return atr;
  }

  /**
   * Run the full SCP03 mutual authentication:
   * SELECT -> INITIALIZE UPDATE -> EXTERNAL AUTHENTICATE.
   *
   * Every cryptographic step is a call to cms-server.
   */
  async openSecureChannel(): Promise<{ entityId: string; aid: string; kvn: number }> {
    if (this.closed) throw new Error("Session already closed");
    if (this.open) throw new Error("Secure channel is already open");

    const card = readerService.requireCard();
    this.application = new Iso7816Application(card);

    // 1. Ask the server to open a session for this card and mint a host challenge.
    const opened = await apiClient.post("/scp03/hostChallenge", {
      cardId: this.cardId,
    });
    this.entityId = opened.entityId;
    const aid: string = opened.aid;
    const keySetName: string = opened.keySetName || "unknown";
    this.trace(
      "info",
      `Session ${this.entityId} opened (AID ${aid}, key set "${keySetName}", KVN ${opened.kvn})`
    );

    // 2. SELECT the security domain / applet.
    const aidLength = (aid.length / 2).toString(16).padStart(2, "0").toUpperCase();
    await this.issue(`${SELECT}${aidLength}${aid}`);

    // 3. INITIALIZE UPDATE carries the host challenge.
    const initUpdate = await this.issue(
      `${INITIALIZE_UPDATE}08${opened.hostChallenge}`
    );

    // 4. Hand the card's response to the server; it derives the session keys.
    await apiClient.post("/scp03/initHostSCP03", {
      entityId: this.entityId,
      cardParam: initUpdate.data.slice(0, 64),
    });

    // 5. Server computes the host cryptogram, then MACs EXTERNAL AUTHENTICATE.
    const crypto = await apiClient.get("/scp03/hostCryptogram", {
      entityId: this.entityId,
    });
    const hostCryptogram: string =
      crypto.hostCryptogram || crypto.HostCryptogram || crypto;

    const cmac = await apiClient.post("/scp03/generateCMAC", {
      entityId: this.entityId,
      command: EXTERNAL_AUTHENTICATE,
      data: String(hostCryptogram).slice(0, 16),
    });

    // 6. EXTERNAL AUTHENTICATE — the card verifies us, we verify the card.
    const authResponse = await this.issue(cmac.generateCMAC);

    const finish = await apiClient.post("/scp03/channelFinish", {
      entityId: this.entityId,
      authResponse: authResponse.data,
    });

    if (!finish.isAuth) {
      this.trace("error", "Mutual authentication failed");
      // The card rejected our cryptogram, which can only mean the key set the
      // CMS signed with is not the one on the chip. Name it, and point at the
      // one action that fixes it — the operator cannot guess this.
      throw new Error(
        `The card rejected key set "${keySetName}": the keys on this chip are different ones. ` +
          `Open the card and use "Change key set" to point it at the key set this chip was loaded with ` +
          `(lab cards keep the GlobalPlatform default, "test-gp-default").`
      );
    }

    this.open = true;
    this.trace("info", "Secure channel established");
    return { entityId: this.entityId, aid, kvn: opened.kvn };
  }

  /**
   * Send one application command inside the secure channel.
   *
   * The server wraps (encrypt + CMAC) and unwraps (verify R-MAC + decrypt);
   * this method only carries bytes.
   */
  async secureMessage(
    ins: string,
    data: string | null = null,
    p1 = "00",
    p2 = "00"
  ): Promise<SecureMessageResult> {
    if (!this.open) throw new Error("Secure channel is not open");
    if (!readerService.hasCard()) {
      throw new Error("Card was removed from the reader");
    }

    const wrapped = await apiClient.post("/scp03/wrap", {
      entityId: this.entityId,
      command: `${APP_CLA}${ins}${p1}${p2}`,
      data,
    });

    const response = await this.issue(wrapped.wrap);

    const unwrapped = await apiClient.post("/scp03/unwrap", {
      entityId: this.entityId,
      data: response.data,
    });

    return { data: unwrapped.unwrap, sw: response.sw };
  }

  /**
   * Close the session server-side so the session keys leave Redis straight
   * away rather than waiting for the TTL. Safe to call more than once.
   */
  async close(result: "SUCCESS" | "ABANDONED" = "ABANDONED") {
    if (this.closed) return;
    this.closed = true;
    this.open = false;

    if (this.entityId) {
      try {
        await apiClient.get("/scp03/reset", {
          entityId: this.entityId,
          result,
        });
        this.trace("info", `Session ${this.entityId} closed (${result})`);
      } catch (err: any) {
        // Not fatal: the TTL will reap the session anyway.
        this.trace("error", `Could not close session cleanly: ${err.message}`);
      }
    }
    this.application = null;
  }
}

export default CardSession;
