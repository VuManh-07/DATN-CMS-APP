"use strict";

import { Request, Response } from "express";
import { OK, CREATED } from "../core/success.response";
import { BadRequestError } from "../core/error.response";
import cardService from "../services/card.service";

class CardController {
  list = async (req: Request, res: Response) => {
    new OK({
      message: "Cards",
      metadata: await cardService.list(req.query as any),
    }).send(res);
  };

  create = async (req: Request, res: Response) => {
    new CREATED({
      message: "Card created",
      metadata: await cardService.create(req.body, req.actor, req),
    }).send(res);
  };

  detail = async (req: Request, res: Response) => {
    new OK({
      message: "Card detail",
      metadata: await cardService.detail(req.params.id),
    }).send(res);
  };

  assignUser = async (req: Request, res: Response) => {
    const { userId } = req.body || {};
    if (!userId) throw new BadRequestError("userId is required");
    new OK({
      message: "Cardholder assigned",
      metadata: await cardService.assignUser(
        req.params.id,
        userId,
        req.actor,
        req
      ),
    }).send(res);
  };

  bindCsn = async (req: Request, res: Response) => {
    new OK({
      message: "CSN bound to card",
      metadata: await cardService.bindCsn(
        req.params.id,
        req.body?.csn,
        req.actor,
        req
      ),
    }).send(res);
  };

  startPersonalization = async (req: Request, res: Response) => {
    new OK({
      message: "Personalization started",
      metadata: await cardService.startPersonalization(
        req.params.id,
        req.body || {},
        req.actor,
        req
      ),
    }).send(res);
  };

  completePersonalization = async (req: Request, res: Response) => {
    const { success } = req.body || {};
    if (typeof success !== "boolean") {
      throw new BadRequestError("success (boolean) is required");
    }
    new OK({
      message: "Personalization recorded",
      metadata: await cardService.completePersonalization(
        req.params.id,
        req.body,
        req.actor,
        req
      ),
    }).send(res);
  };

  issue = async (req: Request, res: Response) => {
    new OK({
      message: "Card issued",
      metadata: await cardService.issue(req.params.id, req.actor, req),
    }).send(res);
  };

  activate = async (req: Request, res: Response) => {
    new OK({
      message: "Card activated",
      metadata: await cardService.activate(req.params.id, req.actor, req),
    }).send(res);
  };

  lock = async (req: Request, res: Response) => {
    new OK({
      message: "Card locked",
      metadata: await cardService.lock(
        req.params.id,
        req.body?.reason,
        req.actor,
        req
      ),
    }).send(res);
  };

  unlock = async (req: Request, res: Response) => {
    new OK({
      message: "Card unlocked",
      metadata: await cardService.unlock(req.params.id, req.actor, req),
    }).send(res);
  };

  suspend = async (req: Request, res: Response) => {
    new OK({
      message: "Card suspended",
      metadata: await cardService.suspend(
        req.params.id,
        req.body?.reason,
        req.actor,
        req
      ),
    }).send(res);
  };

  /**
   * The holder wiped the wallet data on the chip. Audit-only: the card keeps
   * its lifecycle state, so this is not routed through a transition.
   */
  walletReset = async (req: Request, res: Response) => {
    new OK({
      message: "Wallet reset recorded",
      metadata: await cardService.recordWalletReset(
        req.params.id,
        req.body || {},
        req.actor,
        req
      ),
    }).send(res);
  };

  revoke = async (req: Request, res: Response) => {
    new OK({
      message: "Card revoked",
      metadata: await cardService.revoke(
        req.params.id,
        req.body?.reason,
        req.actor,
        req
      ),
    }).send(res);
  };

  replace = async (req: Request, res: Response) => {
    new CREATED({
      message: "Replacement card created",
      metadata: await cardService.replace(
        req.params.id,
        req.body?.reason,
        req.actor,
        req
      ),
    }).send(res);
  };

  rotateKey = async (req: Request, res: Response) => {
    const { targetKeySetId } = req.body || {};
    if (!targetKeySetId) {
      throw new BadRequestError("targetKeySetId is required");
    }
    new OK({
      message: "Key rotation started",
      metadata: await cardService.rotateKey(
        req.params.id,
        targetKeySetId,
        req.actor,
        req
      ),
    }).send(res);
  };
}

export default new CardController();
