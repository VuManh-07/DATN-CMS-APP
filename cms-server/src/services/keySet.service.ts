"use strict";

import { Request } from "express";
import KeySet, { IKeySet } from "../models/keySet.model";
import Card from "../models/card.model";
import {
  BadRequestError,
  ConflictRequestError,
  NotFoundError,
} from "../core/error.response";
import { KeySetStatus, KeyDerivationMode } from "../types/enums";
import { Actor } from "../types/actor";
import auditService from "./audit.service";
import {
  wrapKeys,
  unwrapKeys,
  diversifyByCsn,
  generateKeySet,
  isValidAes128Hex,
  Scp03KeyMaterial,
} from "../helpers/keyWrap";

export interface CreateKeySetInput {
  name: string;
  kvn?: number;
  derivationMode?: KeyDerivationMode;
  description?: string;
  /** Supply explicit keys, or omit to have a random set generated. */
  keys?: Scp03KeyMaterial;
}

const create = async (
  input: CreateKeySetInput,
  actor: Actor,
  req?: Request
) => {
  if (!input.name) throw new BadRequestError("name is required");

  if (await KeySet.findOne({ name: input.name })) {
    throw new ConflictRequestError(`Key set "${input.name}" already exists`);
  }

  if (input.derivationMode === KeyDerivationMode.DIVERSIFIED_BY_CSN) {
    throw new BadRequestError(
      "CSN diversification is not yet verified against the smart card"
    );
  }
  let keys: Scp03KeyMaterial;
  if (input.keys) {
    const { Key_ENC, Key_MAC, Key_DEK } = input.keys;
    if (
      !isValidAes128Hex(Key_ENC) ||
      !isValidAes128Hex(Key_MAC) ||
      !isValidAes128Hex(Key_DEK)
    ) {
      throw new BadRequestError(
        "Key_ENC, Key_MAC and Key_DEK must each be 32 hex characters (AES-128)"
      );
    }
    keys = { Key_ENC, Key_MAC, Key_DEK };
  } else {
    keys = generateKeySet();
  }

  const keySet = await KeySet.create({
    name: input.name,
    kvn: input.kvn ?? 1,
    keyType: "AES-128",
    derivationMode: input.derivationMode || KeyDerivationMode.STATIC,
    encryptedKeyBlob: wrapKeys(keys),
    description: input.description,
    status: KeySetStatus.ACTIVE,
    createdBy: actor.id,
  });

  // Note what happened, but never the key values themselves.
  await auditService.record({
    actor,
    action: "KEYSET_CREATE",
    targetType: "KeySet",
    targetId: keySet._id.toString(),
    detail: {
      name: keySet.name,
      kvn: keySet.kvn,
      derivationMode: keySet.derivationMode,
      generated: !input.keys,
    },
    req,
  });

  return sanitize(keySet);
};

/** Strip the wrapped blob before anything is returned over the API. */
const sanitize = (keySet: IKeySet) => ({
  id: keySet._id,
  name: keySet.name,
  kvn: keySet.kvn,
  keyType: keySet.keyType,
  derivationMode: keySet.derivationMode,
  status: keySet.status,
  description: keySet.description,
  createdAt: keySet.createdAt,
  deprecatedAt: keySet.deprecatedAt,
});

const list = async () => {
  const items = await KeySet.find().sort({ createdAt: -1 });
  return items.map(sanitize);
};

const findById = async (id: string) => {
  const keySet = await KeySet.findById(id);
  if (!keySet) throw new NotFoundError("Key set not found");
  return sanitize(keySet);
};

const deprecate = async (id: string, actor: Actor, req?: Request) => {
  const keySet = await KeySet.findById(id);
  if (!keySet) throw new NotFoundError("Key set not found");

  keySet.status = KeySetStatus.DEPRECATED;
  keySet.deprecatedAt = new Date();
  await keySet.save();

  await auditService.record({
    actor,
    action: "KEYSET_DEPRECATE",
    targetType: "KeySet",
    targetId: id,
    detail: { name: keySet.name },
    req,
  });

  return sanitize(keySet);
};

/**
 * Delete a key set outright.
 *
 * A key set is CMS-side metadata for keys that physically live on the chips,
 * so removing one while cards still point at it would strand those cards with
 * no way to open a secure channel. Those cards must be rotated onto another
 * key set first; deprecate is the softer option when the record must be kept.
 */
const remove = async (id: string, actor: Actor, req?: Request) => {
  const keySet = await KeySet.findById(id);
  if (!keySet) throw new NotFoundError("Key set not found");

  const inUse = await Card.countDocuments({ keySetId: keySet._id });
  if (inUse > 0) {
    throw new ConflictRequestError(
      `Key set "${keySet.name}" is still assigned to ${inUse} card(s); rotate them onto another key set first`
    );
  }

  await keySet.deleteOne();

  await auditService.record({
    actor,
    action: "KEYSET_DELETE",
    targetType: "KeySet",
    targetId: id,
    detail: { name: keySet.name, kvn: keySet.kvn },
    req,
  });

  return sanitize(keySet);
};

/**
 * Resolve the key material to use for a card.
 *
 * This is the only path by which plaintext keys enter the SCP03 session, and
 * the result must not be logged or returned to a client.
 */
const resolveCardKeys = async (
  keySetId: string,
  csn?: string
): Promise<{ keys: Scp03KeyMaterial; kvn: number; keySet: IKeySet }> => {
  const keySet = await KeySet.findById(keySetId).select("+encryptedKeyBlob");
  if (!keySet) throw new NotFoundError("Key set not found");

  if (keySet.status === KeySetStatus.COMPROMISED) {
    throw new BadRequestError(
      `Key set "${keySet.name}" is marked COMPROMISED and cannot be used`
    );
  }

  const master = unwrapKeys(keySet.encryptedKeyBlob);

  if (keySet.derivationMode === KeyDerivationMode.DIVERSIFIED_BY_CSN) {
    if (!csn) {
      throw new BadRequestError(
        `Key set "${keySet.name}" diversifies by CSN, but the card has no CSN bound yet`
      );
    }
    return { keys: diversifyByCsn(master, csn), kvn: keySet.kvn, keySet };
  }

  return { keys: master, kvn: keySet.kvn, keySet };
};

export default {
  create,
  list,
  findById,
  deprecate,
  remove,
  resolveCardKeys,
};
