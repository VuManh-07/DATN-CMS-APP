"use strict";

import { ICard } from "../models/card.model";

/**
 * The ordered list of applet commands the desktop app must run to personalise
 * a card. The server owns this list so the operator terminal stays a dumb
 * executor: it walks the steps, wraps each one through /scp03/wrap, and
 * reports back.
 *
 * INS values match the applet's command table in Demo-Smartcard
 * (wallet-smartcard/src/user/User.java, mirrored in wallet.ts).
 */

export const INS = {
  GENERATE_SEED: "00",
  IMPORT_SEED: "01",
  RESET_WALLET: "02",
  GET_ACCOUNT: "03",
  GET_ACCOUNT_0: "04",
  VERIFY_PIN: "07",
  CHANGE_PIN: "08",
  IMPORT_INFO: "0D",
  GET_INFOMATION: "0E",
  GET_STATUS: "0F",
  RESET_WITH_AUTH: "23",
} as const;

export interface PersonalizationStep {
  /** Stable key so the client can report per-step results. */
  key: string;
  label: string;
  ins: string;
  p1: string;
  p2: string;
  /** Hex payload, or null for commands that take no data. */
  data: string | null;
  /** When true, a failure aborts the run; otherwise it is recorded and skipped. */
  required: boolean;
  /**
   * Status words that count as success.
   *
   * Needed because the applet does not answer 9000 everywhere: GET STATUS
   * reports the wallet state in SW itself. Without this the terminal has no
   * way to tell a real failure from a normal answer, which is how a card
   * whose PIN step returned 6985 was still recorded as personalised.
   */
  expectSw: string[];
}

export interface PersonalizationPlan {
  cardId: string;
  csn?: string;
  aid: string;
  kvn: number;
  /** Echoed back on /personalize/complete so the server can match the run. */
  planVersion: string;
  steps: PersonalizationStep[];
}

const toHex = (value: string): string =>
  Buffer.from(value, "utf8").toString("hex").toUpperCase();

/** Wallet state reported in SW by GET STATUS. */
const WALLET_NOT_INSTALLED = "0000";
const WALLET_INACTIVE = "0001";
const WALLET_ACTIVE = "0002";

/**
 * CHANGE PIN takes the new PIN followed by the current one, both as raw
 * bytes with no length prefix and no padding — the layout the applet
 * implements (wallet-js/src/wallet.js). Anything else answers 6985.
 */
const changePinData = (newPin: string, currentPin: string): string =>
  `${toHex(newPin)}${toHex(currentPin)}`;

export interface PlanOptions {
  /** Card code written to the applet; defaults to the CMS cardId. */
  cardCode?: string;
  /** PIN the card leaves the factory with; the holder changes it on activation. */
  initialPin?: string;
  /**
   * Generate the on-card HD wallet seed during personalization.
   *
   * Off by default, and that is deliberate. The wallet app creates the
   * seed itself so the cardholder is present when the mnemonic appears —
   * it is their only copy, and nobody else should ever see it. Its New
   * Wallet flow also refuses a card that already reports an active wallet,
   * so seeding here would lock the holder out of their own setup.
   *
   * Turn it on only for cards that must leave personalization ready to
   * use, accepting that the mnemonic is generated with no holder present.
   */
  generateSeed?: boolean;
}

const DEFAULT_INITIAL_PIN = "11111111";

/** The PIN a blank applet starts life with, and so the one CHANGE PIN replaces. */
const FACTORY_PIN = process.env.CMS_FACTORY_PIN ?? "";

/**
 * Build the plan for a card. Kept pure and free of DB access so it is easy to
 * test and so the same function can serve both single and batch runs.
 */
export const buildPersonalizationPlan = (
  card: ICard,
  options: PlanOptions = {}
): PersonalizationPlan => {
  const cardCode = options.cardCode || card.cardId;
  const initialPin = options.initialPin;

if (!FACTORY_PIN) {
  throw new Error("CMS_FACTORY_PIN must be configured");
}

if (typeof initialPin !== "string" || !initialPin.trim()) {
  throw new Error("Initial PIN must be provided for personalization");
}

  const steps: PersonalizationStep[] = [
    {
      key: "status-before",
      label: "Read card status",
      ins: INS.GET_STATUS,
      p1: "00",
      p2: "00",
      data: null,
      required: true,
      // Any known wallet state is fine here; this step only reports.
      expectSw: [WALLET_NOT_INSTALLED, WALLET_INACTIVE, WALLET_ACTIVE],
    },
    {
      key: "import-info",
      label: "Write card identity",
      ins: INS.IMPORT_INFO,
      p1: "00",
      p2: "00",
      data: toHex(cardCode),
      required: true,
      expectSw: ["9000"],
    },
  ];

  // The PIN belongs to the wallet, so both of these only exist once there
  // is one. On a card left for its holder to seed, CHANGE PIN answers 6985
  // — the card simply keeps the factory PIN until the wallet app sets it.
  if (options.generateSeed === true) {
    steps.push(
      {
        key: "generate-seed",
        label: "Generate on-card HD wallet seed",
        ins: INS.GENERATE_SEED,
        p1: "00",
        p2: "00",
        data: null,
        required: true,
        expectSw: ["9000"],
      },
      {
        key: "set-initial-pin",
        label: "Set initial PIN",
        ins: INS.CHANGE_PIN,
        p1: "00",
        p2: "00",
        data: changePinData(initialPin, FACTORY_PIN),
        required: true,
        expectSw: ["9000"],
      }
    );
  }

  steps.push(
    {
      key: "status-after",
      label: "Verify card status",
      ins: INS.GET_STATUS,
      p1: "00",
      p2: "00",
      data: null,
      required: true,
      // What counts as a finished card depends on who seeds it: with a
      // seed written here the wallet must be active, without one it must
      // be installed and waiting for the holder to create it.
      expectSw:
        options.generateSeed === true
          ? [WALLET_ACTIVE]
          : [WALLET_INACTIVE],
    }
  );

  return {
    cardId: card.cardId,
    csn: card.csn,
    aid: card.aid,
    kvn: card.kvn,
    planVersion: "1.0",
    steps,
  };
};
