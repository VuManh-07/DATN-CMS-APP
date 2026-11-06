/**
 * Key set helpers shared by the screens that have to name one.
 *
 * A card's key set decides whether its secure channel will ever open — the
 * personalization plan never writes keys to a chip — so the choice is always
 * made explicitly, and only ACTIVE key sets may be given to new cards.
 */

export interface KeySetRow {
  id: string;
  name: string;
  kvn: number;
  status: string;
  derivationMode: string;
  description?: string;
}

export const loadActiveKeySets = async (): Promise<KeySetRow[]> => {
  const all: KeySetRow[] = await window.cms.api.get("/keysets");
  return all.filter((k) => k.status === "ACTIVE");
};

export const keySetOptions = (rows: KeySetRow[]) =>
  rows.map((k) => ({
    value: k.id,
    label: `${k.name} — KVN ${k.kvn}, ${
      k.derivationMode === "DIVERSIFIED_BY_CSN" ? "per-card" : "static"
    }`,
  }));
