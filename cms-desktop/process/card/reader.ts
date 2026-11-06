"use strict";

import { EventEmitter } from "events";

/**
 * PC/SC reader management.
 *
 * Differences from the wallet demo this is derived from:
 *
 *  - No auto-open. The demo called SecureChannel() 500 ms after every
 *    card-inserted event. Here insertion only raises an event; opening a
 *    secure channel is an explicit action, which is what batch mode and a
 *    wizard with a confirmation step both need.
 *  - Reader state is owned by this module and exposed through events, so the
 *    UI can show "reader connected / card present" instead of guessing.
 */

let smartcard: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  smartcard = require("smartcard");
} catch (error: any) {
  console.warn(
    "[reader] smartcard native module unavailable — card features disabled:",
    error.message
  );
}

export const Iso7816Application = smartcard?.Iso7816Application;

export interface ReaderState {
  /** False when the native module could not be loaded at all. */
  available: boolean;
  deviceName: string | null;
  cardPresent: boolean;
  atr: string | null;
}

class ReaderService extends EventEmitter {
  private devices: any = null;
  private device: any = null;
  private card: any = null;
  private atr: string | null = null;
  start() {
    if (!smartcard) return;
    if (this.devices) return;

    this.devices = new smartcard.Devices();

    this.devices.on("device-activated", (event: any) => {
      this.device = event.device;
      this.emit("reader-connected", { deviceName: String(this.device) });
      this.emit("state", this.getState());

      this.device.on("card-inserted", (ev: any) => {
        this.card = ev.card;
        this.atr = ev.card.getAtr();
        this.emit("card-inserted", { atr: this.atr });
        this.emit("state", this.getState());
      });

      this.device.on("card-removed", () => {
        this.card = null;
        this.atr = null;
        // Any open session is now meaningless — tell listeners so they can
        // tear theirs down rather than issuing commands into the void.
        this.emit("card-removed", {});
        this.emit("state", this.getState());
      });
    });

    this.devices.on("device-deactivated", () => {
      this.device = null;
      this.card = null;
      this.atr = null;
      this.emit("reader-disconnected", {});
      this.emit("state", this.getState());
    });
  }

  getState(): ReaderState {
    return {
      available: !!smartcard,
      deviceName: this.device ? String(this.device) : null,
      cardPresent: !!this.card,
      atr: this.atr,
    };
  }

  /** The raw card handle, for CardSession. Throws with a usable message. */
  requireCard() {
    if (!smartcard) {
      throw new Error(
        "PC/SC support is not installed in this build. See README > Native module setup."
      );
    }
    if (!this.device) throw new Error("No card reader detected.");
    if (!this.card) throw new Error("No card in the reader.");
    return this.card;
  }

  hasCard() {
    return !!this.card;
  }
}

export const readerService = new ReaderService();
export default readerService;
