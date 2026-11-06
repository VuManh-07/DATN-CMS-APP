import {
  CARD_TRANSITIONS,
  isTransitionAllowed,
} from "../src/services/cardLifecycle.service";
import {
  CardState,
  TERMINAL_CARD_STATES,
  LIVE_CARD_STATES,
} from "../src/types/enums";

describe("card lifecycle transition table", () => {
  it("covers every state", () => {
    Object.values(CardState).forEach((state) => {
      expect(CARD_TRANSITIONS[state]).toBeDefined();
    });
  });

  it("allows the happy path CREATED -> ACTIVE", () => {
    expect(isTransitionAllowed(CardState.CREATED, CardState.PERSONALIZING)).toBe(true);
    expect(isTransitionAllowed(CardState.PERSONALIZING, CardState.PERSONALIZED)).toBe(true);
    expect(isTransitionAllowed(CardState.PERSONALIZED, CardState.ISSUED)).toBe(true);
    expect(isTransitionAllowed(CardState.ISSUED, CardState.ACTIVE)).toBe(true);
  });

  it("rejects skipping personalization", () => {
    expect(isTransitionAllowed(CardState.CREATED, CardState.ACTIVE)).toBe(false);
    expect(isTransitionAllowed(CardState.CREATED, CardState.ISSUED)).toBe(false);
  });

  it("keeps terminal states terminal", () => {
    TERMINAL_CARD_STATES.forEach((terminal) => {
      expect(CARD_TRANSITIONS[terminal]).toEqual([]);
      Object.values(CardState).forEach((to) => {
        expect(isTransitionAllowed(terminal, to)).toBe(false);
      });
    });
  });

  it("cannot resurrect a revoked card", () => {
    expect(isTransitionAllowed(CardState.REVOKED, CardState.ACTIVE)).toBe(false);
    expect(isTransitionAllowed(CardState.EXPIRED, CardState.ACTIVE)).toBe(false);
  });

  it("supports lock then unlock", () => {
    expect(isTransitionAllowed(CardState.ACTIVE, CardState.LOCKED)).toBe(true);
    expect(isTransitionAllowed(CardState.LOCKED, CardState.ACTIVE)).toBe(true);
  });

  it("supports suspend then resume", () => {
    expect(isTransitionAllowed(CardState.ACTIVE, CardState.SUSPENDED)).toBe(true);
    expect(isTransitionAllowed(CardState.SUSPENDED, CardState.ACTIVE)).toBe(true);
  });

  it("allows retrying a failed personalization", () => {
    expect(
      isTransitionAllowed(CardState.PERSONALIZE_FAILED, CardState.PERSONALIZING)
    ).toBe(true);
  });

  it("allows re-personalize / key rotation from live states", () => {
    [CardState.ISSUED, CardState.ACTIVE, CardState.LOCKED].forEach((from) => {
      expect(isTransitionAllowed(from, CardState.PERSONALIZING)).toBe(true);
    });
  });

  it("lets every live state be revoked", () => {
    LIVE_CARD_STATES.forEach((from) => {
      expect(isTransitionAllowed(from, CardState.REVOKED)).toBe(true);
    });
  });

  it("never lists a state as its own successor", () => {
    Object.entries(CARD_TRANSITIONS).forEach(([from, targets]) => {
      expect(targets).not.toContain(from);
    });
  });

  it("only references known states", () => {
    const known = Object.values(CardState) as string[];
    Object.values(CARD_TRANSITIONS).forEach((targets) => {
      targets.forEach((t) => expect(known).toContain(t));
    });
  });
});
