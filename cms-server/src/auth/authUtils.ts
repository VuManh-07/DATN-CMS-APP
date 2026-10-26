"use strict";

import jwt from "jsonwebtoken";
import config from "../configs/config.env";
import { AdminRole } from "../types/enums";

export interface TokenPayload {
  sub: string;
  username: string;
  role: AdminRole;
}

const signAccessToken = (payload: TokenPayload) =>
  jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessTtl,
  } as jwt.SignOptions);

const signRefreshToken = (payload: TokenPayload) =>
  jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshTtl,
  } as jwt.SignOptions);

const verifyAccessToken = (token: string): TokenPayload =>
  jwt.verify(token, config.jwt.accessSecret) as TokenPayload;

const verifyRefreshToken = (token: string): TokenPayload =>
  jwt.verify(token, config.jwt.refreshSecret) as TokenPayload;

const createTokenPair = (payload: TokenPayload) => ({
  accessToken: signAccessToken(payload),
  refreshToken: signRefreshToken(payload),
});

export {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  createTokenPair,
};
