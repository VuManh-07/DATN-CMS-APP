"use strict";

import { Request, Response } from "express";
import { Scp03Init, Scp03 } from "../services/scp03.service";
import { OK } from "../core/success.response";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../core/error.response";
import {
  saveScp03Init,
  getScp03Init,
  updateScp03Init,
  deleteScp03Init,
  entityIdOf,
} from "../models/repo/scp03.repo";
import { ecdhServer } from "../services/ECDH.service";
import Scp03Session from "../models/scp03Session.model";
import cardService from "../services/card.service";
import keySetService from "../services/keySet.service";
import auditService from "../services/audit.service";
import { AuditResult } from "../types/enums";

/**
 * SCP03 host-side endpoints — the server acts as the key authority.
 *
 * The operator terminal never sees key material: it reports what the card
 * said, and this controller returns the APDUs to send next. Keys come from the
 * card's assigned key set (keySet.service), diversified by CSN when the key
 * set says so, and exist in plaintext only inside a single request.
 */

/** Load a live session and fail clearly if it expired or never existed. */
const loadSession = async (entityId: string) => {
  if (!entityId) throw new BadRequestError("entityId is required");

  const session = await getScp03Init(entityId);
  if (!session?.Key_MAC || !session?.Key_ENC || !session?.Key_DEK || !session?.aid) {
    throw new NotFoundError(
      "SCP03 session not found or expired; start again with /hostChallenge"
    );
  }
  return session;
};

/**
 * Load a session that has completed EXTERNAL AUTHENTICATE.
 *
 * wrap/unwrap used to run on any session that still had keys in Redis, so a
 * caller that opened a channel and never passed the card cryptogram could
 * still have commands wrapped for it. ChannelFinish recorded the failure in
 * the audit log and then let it through anyway.
 */
const loadAuthenticatedSession = async (entityId: string) => {
  const session = await loadSession(entityId);
  if (!new Scp03(session).isEnableSecureChannel()) {
    throw new ForbiddenError(
      "SCP03 session is not authenticated; complete /channelFinish first"
    );
  }
  return session;
};

/** Count one APDU against the session's audit summary. */
const bumpApduCount = (entityId: string) =>
  Scp03Session.updateOne({ entityId }, { $inc: { apduCount: 1 } }).catch(
    () => undefined
  );

class Scp03Controller {
  /**
   * Open a session for a specific card.
   *
   * Requires `cardId` so the right key set is used — unlike the original demo,
   * which hardcoded the GlobalPlatform test key for every card.
   */
  hostChallenge = async (req: Request, res: Response) => {
    const { clientPublicKey, cardId } = req.body || {};
    if (!cardId) throw new BadRequestError("cardId is required");

    const card = await cardService.findByIdOrCardId(cardId);
    if (!card.keySetId) {
      throw new BadRequestError(
        `Card ${card.cardId} has no key set assigned`
      );
    }

    const { keys, kvn, keySet } = await keySetService.resolveCardKeys(
      card.keySetId.toString(),
      card.csn
    );

    // Transport encryption is optional: when the client sends a public key we
    // agree a secret and encrypt wrap/unwrap payloads, otherwise they travel
    // as plain hex over whatever transport security is already in place.
    const sharedSecret = clientPublicKey
      ? ecdhServer.computeSharedKey(clientPublicKey)
      : "";

    const scp03 = new Scp03(
      new Scp03Init({
        Key_MAC: keys.Key_MAC,
        Key_ENC: keys.Key_ENC,
        Key_DEK: keys.Key_DEK,
        aid: card.aid,
        sharedSecret,
      })
    );

    const { hostChallenge } = await scp03.HostChallenge();

    const saved = await saveScp03Init(scp03);
    const entityId = entityIdOf(saved);

    await Scp03Session.create({
      entityId,
      cardId: card._id,
      csn: card.csn,
      kvn,
      keySetId: keySet._id,
      actorId: req.actor?.id,
      result: "OPEN",
    });

    await auditService.record({
      actor: req.actor,
      action: "SCP03_SESSION_OPEN",
      targetType: "Card",
      targetId: card.cardId,
      detail: { entityId, kvn, keySet: keySet.name },
      req,
    });

    new OK({
      message: "Session opened",
      metadata: {
        hostChallenge,
        entityId,
        aid: card.aid,
        kvn,
        keySetName: keySet.name,
        serverPublicKey: clientPublicKey
          ? ecdhServer.getPublicKeyBase64()
          : undefined,
      },
    }).send(res);
  };

  /** Feed the card's INITIALIZE UPDATE response in and derive session keys. */
  initHostSCP03 = async (req: Request, res: Response) => {
    const { cardParam, entityId } = req.body || {};
    if (!cardParam) throw new BadRequestError("cardParam is required");

    const session = await loadSession(entityId);
    const scp03 = new Scp03(session);
    const inited = await scp03.InitHostSCP03(cardParam);
    await updateScp03Init(entityId, scp03);

    new OK({ message: "OK", metadata: { ...inited, entityId } }).send(res);
  };

  hostCryptogram = async (req: Request, res: Response) => {
    const entityId = (req.query?.entityId || req.body?.entityId)?.toString();

    const session = await loadSession(entityId);
    const scp03 = new Scp03(session);
    const result = await scp03.HostCryptogram();
    await updateScp03Init(entityId, scp03);

    new OK({ message: "OK", metadata: { ...result, entityId } }).send(res);
  };

  /** Produce the MAC'd EXTERNAL AUTHENTICATE (or any CMAC'd command). */
  generateCMAC = async (req: Request, res: Response) => {
    const { command, data, entityId } = req.body || {};
    if (!command) throw new BadRequestError("command is required");

    // Deliberately NOT the authenticated variant: this is what builds the
    // EXTERNAL AUTHENTICATE command, so requiring an authenticated session
    // here would make authentication impossible.
    const session = await loadSession(entityId);
    const scp03 = new Scp03(session);
    const { generateCMAC } = await scp03.GenerateCMAC(command, data);
    await updateScp03Init(entityId, scp03);

    new OK({ message: "OK", metadata: { generateCMAC, entityId } }).send(res);
  };

  channelFinish = async (req: Request, res: Response) => {
    const { authResponse, entityId } = req.body || {};

    const session = await loadSession(entityId);
    const scp03 = new Scp03(session);
    const isAuth: boolean = scp03.ChannelFinish(authResponse);
    await updateScp03Init(entityId, scp03);

    if (isAuth) {
      // Durable proof of card possession. The Redis session knows this too,
      // but it is volatile and keyed by entityId only; endpoints authorised
      // by a session rather than a CMS role need it on the record that also
      // carries the cardId.
      await Scp03Session.updateOne(
        { entityId },
        { $set: { authenticatedAt: new Date() } }
      );
    }

    if (!isAuth) {
      await auditService.recordFailure({
        actor: req.actor,
        action: "SCP03_AUTH",
        targetType: "Scp03Session",
        targetId: entityId,
        detail: { authResponse },
        req,
      });
    }

    new OK({ message: "OK", metadata: { isAuth, entityId } }).send(res);
  };

  /**
   * Wrap a command APDU: encrypt the data field and append the CMAC.
   *
   * `data` may be plain hex, or an ECDH envelope when the session was opened
   * with a client public key.
   */
  wrap = async (req: Request, res: Response) => {
    const { command, data, entityId } = req.body || {};
    if (!command) throw new BadRequestError("command is required");

    const session = await loadAuthenticatedSession(entityId);
    const scp03 = new Scp03(session);

    const plainData = this.decodePayload(data, session.sharedSecret);
    const wrapped = await scp03.Wrap(command, plainData);

    await updateScp03Init(entityId, scp03);
    await bumpApduCount(entityId);

    new OK({
      message: "OK",
      metadata: {
        wrap: this.encodePayload(wrapped, session.sharedSecret),
        entityId,
      },
    }).send(res);
  };

  /** Unwrap a response APDU: verify the R-MAC and decrypt the payload. */
  unwrap = async (req: Request, res: Response) => {
    const { data, entityId } = req.body || {};

    const session = await loadAuthenticatedSession(entityId);
    const scp03 = new Scp03(session);

    const plainData = this.decodePayload(data, session.sharedSecret);
    const unwrapped = await scp03.Unwrap(plainData);

    await updateScp03Init(entityId, scp03);

    new OK({
      message: "OK",
      metadata: {
        unwrap: this.encodePayload(unwrapped, session.sharedSecret),
        entityId,
      },
    }).send(res);
  };

  /** Close the session and delete the session keys from Redis. */
  reset = async (req: Request, res: Response) => {
    const entityId = (req.query?.entityId || req.body?.entityId)?.toString();
    if (!entityId) throw new BadRequestError("entityId is required");

    const result = (req.query?.result || req.body?.result)?.toString();

    await deleteScp03Init(entityId);

    await Scp03Session.updateOne(
      { entityId },
      {
        endedAt: new Date(),
        result: result === "SUCCESS" ? "SUCCESS" : "ABANDONED",
      }
    );

    await auditService.record({
      actor: req.actor,
      action: "SCP03_SESSION_CLOSE",
      targetType: "Scp03Session",
      targetId: entityId,
      result: AuditResult.SUCCESS,
      detail: { result },
      req,
    });

    new OK({ message: "Session closed", metadata: { entityId } }).send(res);
  };

  /** Accept either a plain value or an ECDH envelope. */
  private decodePayload(data: any, sharedSecret?: string) {
    if (data && typeof data === "object" && data.iv && data.authTag) {
      if (!sharedSecret) {
        throw new BadRequestError(
          "Encrypted payload received but session has no shared secret"
        );
      }
      return JSON.parse(ecdhServer.decrypt(data, sharedSecret));
    }
    return data;
  }

  /** Mirror of decodePayload: encrypt only if the session negotiated a secret. */
  private encodePayload(value: any, sharedSecret?: string) {
    if (!sharedSecret) return value;
    return ecdhServer.encrypt(JSON.stringify(value), sharedSecret);
  }
}

export default new Scp03Controller();
