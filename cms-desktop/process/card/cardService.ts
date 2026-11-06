"use strict";

import { EventEmitter } from "events";
import CardSession, { ApduTraceEntry } from "./cardSession";
import readerService from "./reader";
import { apiClient } from "../api/apiClient";

/**
 * Orchestrates a personalization run end to end.
 *
 * The server owns the plan (which commands, in which order); this service
 * walks it, reports per-step results, and tells the server how it went. That
 * split is what lets the GUI replace running code by hand without the
 * terminal needing to know what personalization means.
 */

export interface PlanStep {
  key: string;
  label: string;
  ins: string;
  p1: string;
  p2: string;
  data: string | null;
  required: boolean;
  /** Status words that count as success; defaults to 9000 when absent. */
  expectSw?: string[];
}

export interface StepResult {
  key: string;
  ok: boolean;
  sw?: string;
  error?: string;
}

export interface PersonalizeProgress {
  stepIndex: number;
  totalSteps: number;
  step: PlanStep;
  phase: "start" | "done" | "failed";
  sw?: string;
  error?: string;
}

class CardService extends EventEmitter {
  private session: CardSession | null = null;

  constructor() {
    super();
    // A card pulled mid-run invalidates the session immediately.
    readerService.on("card-removed", () => {
      if (this.session) {
        this.emit("trace", {
          direction: "error",
          text: "Card removed — abandoning session",
          at: Date.now(),
        } as ApduTraceEntry);
        void this.session.close("ABANDONED");
        this.session = null;
      }
    });
  }

  /** Pipe a session's APDU trace up to the UI. */
  private attachTrace(session: CardSession) {
    session.on("trace", (entry: ApduTraceEntry) => this.emit("trace", entry));
  }

  /** Read the chip identifier without opening a secure channel. */
  async readCsn(): Promise<string> {
    const probe = new CardSession("probe");
    this.attachTrace(probe);
    return probe.readCsn();
  }

  async openSession(cardId: string) {
    await this.closeSession();
    const session = new CardSession(cardId);
    this.attachTrace(session);
    const info = await session.openSecureChannel();
    this.session = session;
    return info;
  }

  async closeSession(result: "SUCCESS" | "ABANDONED" = "ABANDONED") {
    if (this.session) {
      await this.session.close(result);
      this.session = null;
    }
  }

  getSessionState() {
    return {
      open: !!this.session?.isOpen(),
      entityId: this.session?.getEntityId() || null,
      cardId: this.session?.cardId || null,
    };
  }

  /** Run a single application command in the open session. */
  async sendCommand(ins: string, data: string | null, p1 = "00", p2 = "00") {
    if (!this.session) throw new Error("No open session");
    return this.session.secureMessage(ins, data, p1, p2);
  }

  /**
   * Full personalization: ask the server for the plan, open a secure channel,
   * execute every step, then report the outcome back.
   *
   * On failure the card is left in PERSONALIZE_FAILED with the error recorded,
   * never in limbo — the operator can retry from the card detail screen.
   */
  async personalize(
    cardId: string,
    options: { cardCode?: string; initialPin?: string; generateSeed?: boolean } = {}
  ) {
    const { plan, card: startedCard } = await apiClient.post(
      `/cards/${cardId}/personalize/start`,
      options
    );

    const steps: PlanStep[] = plan.steps;
    const stepResults: StepResult[] = [];
    let csn: string | undefined;
    let failure: string | undefined;

    try {
      csn = await this.readCsn();

      // The CSN has to reach the server *before* the secure channel opens:
      // a key set with DIVERSIFIED_BY_CSN derives the session keys from it,
      // so on a card record with no CSN yet host-challenge would fail — the
      // closing /personalize/complete call binds it too late for this run.
      if (!startedCard?.csn) {
        await apiClient.post(`/cards/${cardId}/bind-csn`, { csn });
      }

      await this.openSession(cardId);

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        this.emit("progress", {
          stepIndex: i,
          totalSteps: steps.length,
          step,
          phase: "start",
        } as PersonalizeProgress);

        try {
          const result = await this.sendCommand(
            step.ins,
            step.data,
            step.p1,
            step.p2
          );

          // A card that answers is not a card that agreed. Only an
          // exception used to fail a step, so an applet rejection like 6985
          // was recorded as a success and the run still reported
          // "personalization succeeded" over a half-written card.
          const expected = step.expectSw?.length ? step.expectSw : ["9000"];
          if (!expected.includes(result.sw)) {
            throw new Error(
              `card answered SW ${result.sw}, expected ${expected.join(" or ")}`
            );
          }

          stepResults.push({ key: step.key, ok: true, sw: result.sw });
          this.emit("progress", {
            stepIndex: i,
            totalSteps: steps.length,
            step,
            phase: "done",
            sw: result.sw,
          } as PersonalizeProgress);
        } catch (err: any) {
          stepResults.push({
            key: step.key,
            ok: false,
            error: err.message,
          });
          this.emit("progress", {
            stepIndex: i,
            totalSteps: steps.length,
            step,
            phase: "failed",
            error: err.message,
          } as PersonalizeProgress);

          // A required step failing aborts the run; optional ones are noted.
          if (step.required) {
            failure = `Step "${step.label}" failed: ${err.message}`;
            break;
          }
        }
      }
    } catch (err: any) {
      failure = err.message;
    }

    const success = !failure;
    await this.closeSession(success ? "SUCCESS" : "ABANDONED");

    // Always report, success or not, so the card never stays in PERSONALIZING.
    const card = await apiClient.post(`/cards/${cardId}/personalize/complete`, {
      success,
      error: failure,
      csn,
      stepResults,
    });

    return { success, error: failure, stepResults, card, plan };
  }
}

export const cardService = new CardService();
export default cardService;
