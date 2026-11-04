"use strict";

import crypto from "crypto";

/**
 * ECDH key agreement + AES-256-GCM transport encryption for the operator link.
 *
 * Two deliberate differences from the original demo implementation:
 *
 * 1. `encrypt`/`decrypt` take the session's shared secret as an argument
 *    instead of reading instance state. In the demo a single ECDHServer
 *    instance was shared by every request, so each new `hostChallenge` call
 *    overwrote `sharedKeyBase64` and concurrent operators corrupted each
 *    other's sessions. The secret now lives with the session in Redis.
 *
 * 2. The raw ECDH output is run through HKDF-SHA256 before being used as an
 *    AES key, rather than used directly. A raw P-256 shared secret is not a
 *    uniformly random key and must not be used as one.
 */

const CURVE = "prime256v1";
const HKDF_INFO = "cms-scp03-transport-v1";
const AES_KEY_BYTES = 32;
const IV_BYTES = 12;

export interface EncryptedEnvelope {
  iv: string;
  encryptedData: string;
  authTag: string;
}

/** Stretch a raw ECDH secret into a proper AES-256 key. */
const deriveTransportKey = (sharedSecretBase64: string): Buffer => {
  if (!sharedSecretBase64) {
    throw new Error("Session has no shared secret; call hostChallenge first");
  }
  const ikm = Buffer.from(sharedSecretBase64, "base64");
  // Salt is empty by design: the secret is already session-unique, and both
  // sides must derive the same key without extra negotiation.
  return Buffer.from(
    crypto.hkdfSync("sha256", ikm, Buffer.alloc(0), HKDF_INFO, AES_KEY_BYTES)
  );
};

class ECDHServer {
  private ecdh: crypto.ECDH;
  private publicKeyBase64: string;

  constructor() {
    this.ecdh = crypto.createECDH(CURVE);
    this.publicKeyBase64 = this.ecdh.generateKeys().toString("base64");
  }

  public getPublicKeyBase64(): string {
    return this.publicKeyBase64;
  }

  /**
   * Agree a secret with a client public key.
   *
   * The result is returned to the caller to be stored on the session; it is
   * intentionally not retained on this object.
   */
  public computeSharedKey(clientPublicKeyBase64: string): string {
    if (!clientPublicKeyBase64) {
      throw new Error("clientPublicKey is required");
    }
    const clientPublicKey = Buffer.from(clientPublicKeyBase64, "base64");
    return this.ecdh.computeSecret(clientPublicKey).toString("base64");
  }

  public encrypt(data: string, sharedSecretBase64: string): EncryptedEnvelope {
    const key = deriveTransportKey(sharedSecretBase64);
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

    let encrypted = cipher.update(data, "utf8", "base64");
    encrypted += cipher.final("base64");

    return {
      iv: iv.toString("base64"),
      encryptedData: encrypted,
      authTag: cipher.getAuthTag().toString("base64"),
    };
  }

  public decrypt(
    envelope: EncryptedEnvelope,
    sharedSecretBase64: string
  ): string {
    const { iv, encryptedData, authTag } = envelope || ({} as EncryptedEnvelope);
    if (!iv || !encryptedData || !authTag) {
      throw new Error("Malformed encrypted envelope");
    }

    const key = deriveTransportKey(sharedSecretBase64);
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(authTag, "base64"));

    let decrypted = decipher.update(encryptedData, "base64", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }
}

/**
 * One server keypair per process. Safe to share — unlike the shared secret, the
 * private key is never mutated by a request.
 */
export const ecdhServer = new ECDHServer();

export default ECDHServer;
