"use strict";

import { Request, Response } from "express";
import { OK, CREATED } from "../core/success.response";
import userService from "../services/user.service";

class UserController {
  list = async (req: Request, res: Response) => {
    new OK({
      message: "Users",
      metadata: await userService.list(req.query as any),
    }).send(res);
  };

  create = async (req: Request, res: Response) => {
    new CREATED({
      message: "User created",
      metadata: await userService.create(req.body, req.actor, req),
    }).send(res);
  };

  detail = async (req: Request, res: Response) => {
    new OK({
      message: "User detail",
      metadata: await userService.findById(req.params.id),
    }).send(res);
  };

  update = async (req: Request, res: Response) => {
    new OK({
      message: "User updated",
      metadata: await userService.update(
        req.params.id,
        req.body,
        req.actor,
        req
      ),
    }).send(res);
  };
}

export default new UserController();
