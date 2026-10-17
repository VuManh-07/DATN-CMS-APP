"use strict";

import { Types } from "mongoose";
import { AdminRole } from "./enums";

/** The authenticated admin performing an action, attached to req by authenticate(). */
export interface Actor {
  id: Types.ObjectId | string;
  username: string;
  role: AdminRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: Actor;
    }
  }
}
