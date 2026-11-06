"use strict";

/**
 * Chip identity read from CPLC data.
 *
 * The ATR describes a card *model*, not a card: every chip of the same product
 * answers with the same bytes, so using it as a serial number makes the second
 * card of a batch look like a duplicate of the first. CPLC (Card Production
 * Life Cycle) carries the fields that really are per-chip.
 */

/** GET DATA for tag 9F7F — the CPLC record. */
export const GET_DATA_CPLC = "80CA9F7F00";

/**
 * Pull a stable per-chip identifier out of a CPLC response.
 *
 * IC fabricator + IC type + fabrication date + IC serial number: the
 * combination GlobalPlatform tooling conventionally treats as a card's unique
 * id. Returns null when the response is not CPLC-shaped, so callers can fall
 * back rather than bind a card to garbage.
 */
export const parseCplcSerial = (hex: string): string | null => {
  let v = (hex || "").toUpperCase().replace(/[^0-9A-F]/g, "");

  // Strip the 9F7F tag and its one-byte length, if the card echoed them.
  if (v.startsWith("9F7F")) v = v.slice(6);

  // Fabricator(2) Type(2) OSID(2) OSDate(2) OSLevel(2) FabDate(2) Serial(4)
  if (v.length < 32) return null;

  const id = `${v.slice(0, 8)}${v.slice(20, 24)}${v.slice(24, 32)}`;
  return /^0+$/.test(id) ? null : id;
};
