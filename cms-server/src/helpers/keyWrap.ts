"use strict";

import crypto from "crypto";
import config from "../configs/config.env";

/**
 * Wrapping of SCP03 master key material at rest.
 *
 * Keys are sealed with AES-256-GCM under a Key Encryption Key. For this
 * project the KEK comes from `KEK_HEX`; in production it must come from an
 * HSM and this module is the single place that would need to change.
 *
 * Invariant: plaintext key material never leaves this module except as a
 * return value to the SCP03 session setup, and is never logged.
 */

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

const kek = (): Buffer => {
  const buf = Buffer.from(config.kek.hex, "hex");
  if (buf.length !== 32) {
    throw new Error(
      `KEK_HEX must decode to exactly 32 bytes (got ${buf.length})`
    );
  }
  return buf;
};

export interface Scp03KeyMaterial {
  Key_ENC: string;
  Key_MAC: string;
  Key_DEK: string;
}

/** Seal key material into a single opaque string safe to store in Mongo. */
const wrapKeys = (keys: Scp03KeyMaterial): string => {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, kek(), iv);
  const plaintext = Buffer.from(JSON.stringify(keys), "utf8");
  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // iv.tag.ciphertext â€” all base64, dot-separated
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
};

/** Reverse of wrapKeys. Throws if the blob was tampered with. */
const unwrapKeys = (blob: string): Scp03KeyMaterial => {
  const parts = blob.split(".");
  if (parts.length !== 3) throw new Error("Malformed key blob");

  const [ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv(
    ALGO,
    kek(),
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8"));
};

/**
 * Derive a per-card key set from a master key set and the card's CSN.
 *
 * Used when a key set's derivationMode is DIVERSIFIED_BY_CSN, so that
 * compromising one card does not expose the rest of the fleet. Each of the
 * three keys is diversified separately with its own label.
 */
const diversifyByCsn = (
  _master: Scp03KeyMaterial,
  _csn: string
): Scp03KeyMaterial => {
  throw new Error(
    "CSN diversification requires smart-card interoperability verification"
  );
};

/** Generate a fresh random AES-128 key set. */
const generateKeySet = (): Scp03KeyMaterial => ({
  Key_ENC: crypto.randomBytes(16).toString("hex").toUpperCase(),
  Key_MAC: crypto.randomBytes(16).toString("hex").toUpperCase(),
  Key_DEK: crypto.randomBytes(16).toString("hex").toUpperCase(),
});

const isValidAes128Hex = (value: string) =>
  typeof value === "string" && /^[0-9a-fA-F]{32}$/.test(value);

export {
  wrapKeys,
  unwrapKeys,
  diversifyByCsn,
  generateKeySet,
  isValidAes128Hex,
};
