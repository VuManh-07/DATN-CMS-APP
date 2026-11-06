"use strict";

import { Request, Response } from "express";
import { OK } from "../core/success.response";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../core/error.response";
import Card from "../models/card.model";
import Scp03Session from "../models/scp03Session.model";
import cardService from "../services/card.service";

/**
 * Chip-to-card resolution for an unauthenticated caller.
 *
 * Deliberately minimal: the card id a secure channel needs, plus the state
 * the wallet uses to decide whether the card is usable. Nothing about the
 * cardholder, the key set or the card's history leaves this endpoint, and the
 * lookup is exact — it is not a search, so the card base cannot be walked.
 */
class PublicCardController {
  lookup = async (req: Request, res: Response) => {
    const csn = req.query?.csn?.toString().trim().toUpperCase();
    if (!csn) throw new BadRequestError("csn is required");

    const card = await Card.findOne({ csn }).select("cardId state aid csn");
    if (!card) throw new NotFoundError("No card is bound to this CSN");

    new OK({
      message: "Card",
      metadata: {
        cardId: card.cardId,
        csn: card.csn,
        state: card.state,
        aid: card.aid,
      },
    }).send(res);
  };

  /**
   * Activation reported by the wallet, after the holder sets the card up.
   *
   * Authorised by possession of the chip, not by a CMS role: the caller must
   * supply an `entityId` whose SCP03 session passed EXTERNAL AUTHENTICATE,
   * which only the real card with the real key set can produce. The card is
   * taken from that session, never from the request body — otherwise any
   * caller could activate any card by naming it.
   */
  activate = async (req: Request, res: Response) => {
    const entityId = req.body?.entityId?.toString().trim();
    if (!entityId) throw new BadRequestError("entityId is required");

    const session = await Scp03Session.findOne({ entityId });
    if (!session) throw new NotFoundError("Unknown SCP03 session");

    if (!session.authenticatedAt) {
      throw new ForbiddenError(
        "SCP03 session has not authenticated the card; complete /channelFinish first"
      );
    }
    if (session.endedAt) {
      throw new ForbiddenError("SCP03 session has already been closed");
    }
    if (!session.cardId) {
      throw new BadRequestError("SCP03 session is not bound to a card");
    }

    const card = await Card.findById(session.cardId);
    if (!card) throw new NotFoundError("Card not found");

    const accounts = Array.isArray(req.body?.accounts)
      ? req.body.accounts
      : undefined;

    const updated = await cardService.activateFromWallet(card, accounts, req);

    new OK({ message: "Card activated", metadata: updated }).send(res);
  };
}

export default new PublicCardController();
