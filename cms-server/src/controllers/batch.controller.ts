"use strict";

import { Request, Response } from "express";
import { OK, CREATED } from "../core/success.response";
import { BadRequestError } from "../core/error.response";
import batchService from "../services/batch.service";

class BatchController {
  list = async (req: Request, res: Response) => {
    new OK({ message: "Batches", metadata: await batchService.list() }).send(
      res
    );
  };

  create = async (req: Request, res: Response) => {
    new CREATED({
      message: "Batch created",
      metadata: await batchService.create(req.body, req.actor, req),
    }).send(res);
  };

  importUsers = async (req: Request, res: Response) => {
    const { batchId, csv } = req.body || {};
    if (!batchId || !csv) {
      throw new BadRequestError("batchId and csv (string) are required");
    }
    new OK({
      message: "Import finished",
      metadata: await batchService.importUsers(batchId, csv, req.actor, req),
    }).send(res);
  };

  progress = async (req: Request, res: Response) => {
    new OK({
      message: "Batch progress",
      metadata: await batchService.progress(req.params.id),
    }).send(res);
  };

  setStatus = async (req: Request, res: Response) => {
    const { status } = req.body || {};
    if (!status) throw new BadRequestError("status is required");
    new OK({
      message: "Batch status updated",
      metadata: await batchService.setStatus(
        req.params.id,
        status,
        req.actor,
        req
      ),
    }).send(res);
  };
}

export default new BatchController();
