"use strict";

import { Request, Response } from "express";
import { OK, CREATED } from "../core/success.response";
import keySetService from "../services/keySet.service";

class KeySetController {
  list = async (req: Request, res: Response) => {
    new OK({ message: "Key sets", metadata: await keySetService.list() }).send(
      res
    );
  };

  create = async (req: Request, res: Response) => {
    new CREATED({
      message: "Key set created",
      metadata: await keySetService.create(req.body, req.actor, req),
    }).send(res);
  };

  detail = async (req: Request, res: Response) => {
    new OK({
      message: "Key set",
      metadata: await keySetService.findById(req.params.id),
    }).send(res);
  };

  remove = async (req: Request, res: Response) => {
    new OK({
      message: "Key set deleted",
      metadata: await keySetService.remove(req.params.id, req.actor, req),
    }).send(res);
  };

  deprecate = async (req: Request, res: Response) => {
    new OK({
      message: "Key set deprecated",
      metadata: await keySetService.deprecate(req.params.id, req.actor, req),
    }).send(res);
  };
}

export default new KeySetController();
