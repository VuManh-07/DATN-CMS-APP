"use strict";

import { Request, Response } from "express";
import { OK } from "../core/success.response";
import { BadRequestError } from "../core/error.response";
import authService from "../services/auth.service";

class AuthController {
  login = async (req: Request, res: Response) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      throw new BadRequestError("username and password are required");
    }
    new OK({
      message: "Login successful",
      metadata: await authService.login(username, password, req),
    }).send(res);
  };

  refresh = async (req: Request, res: Response) => {
    const { refreshToken } = req.body || {};
    if (!refreshToken) throw new BadRequestError("refreshToken is required");
    new OK({
      message: "Token refreshed",
      metadata: await authService.refresh(refreshToken),
    }).send(res);
  };

  logout = async (req: Request, res: Response) => {
    new OK({
      message: "Logged out",
      metadata: await authService.logout(req),
    }).send(res);
  };

  me = async (req: Request, res: Response) => {
    new OK({ message: "Current actor", metadata: req.actor }).send(res);
  };
}

export default new AuthController();
