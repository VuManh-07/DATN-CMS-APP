"use strict";

import { ipcMain, BrowserWindow } from "electron";
import { apiClient } from "../api/apiClient";
import cardService from "../card/cardService";
import readerService from "../card/reader";

/**
 * The IPC surface the renderer is allowed to use.
 *
 * Follows the pattern from the wallet demo's registerListeners.ts, with one
 * rule added: the renderer never receives the JWT. It calls `api:*` channels
 * and the token stays in apiClient, in this process.
 *
 * Handlers return `{ ok, data }` / `{ ok, error }` rather than throwing, so a
 * server-side validation message (e.g. an illegal lifecycle transition) reaches
 * the UI as text instead of an opaque "Error invoking remote method".
 */

type Handler = (...args: any[]) => Promise<any> | any;

const ok = (data: any) => ({ ok: true, data });
const fail = (error: any) => ({
  ok: false,
  error: error?.message || String(error),
});

const handle = (channel: string, fn: Handler) => {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return ok(await fn(...args));
    } catch (error: any) {
      console.error(`[ipc] ${channel}:`, error.message);
      return fail(error);
    }
  });
};

/** Push an event to every open window. */
const broadcast = (channel: string, payload: any) => {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  });
};

export const registerIpc = () => {
  // ---------- auth ----------
  handle("auth:login", (username: string, password: string) =>
    apiClient.login(username, password)
  );
  handle("auth:logout", () => apiClient.logout());
  handle("auth:current-user", () => apiClient.getCurrentUser());

  // ---------- reader ----------
  handle("reader:state", () => readerService.getState());

  // ---------- card operations ----------
  handle("card:read-csn", () => cardService.readCsn());
  handle("card:open-session", (cardId: string) =>
    cardService.openSession(cardId)
  );
  handle("card:close-session", (result?: "SUCCESS" | "ABANDONED") =>
    cardService.closeSession(result)
  );
  handle("card:session-state", () => cardService.getSessionState());
  handle("card:personalize", (cardId: string, options: any) =>
    cardService.personalize(cardId, options || {})
  );
  handle(
    "card:send-command",
    (ins: string, data: string | null, p1?: string, p2?: string) =>
      cardService.sendCommand(ins, data, p1, p2)
  );

  // ---------- CMS data (thin pass-through to cms-server) ----------
  handle("api:get", (path: string, params?: any) =>
    apiClient.get(path, params)
  );
  handle("api:post", (path: string, body?: any) => apiClient.post(path, body));
  handle("api:delete", (path: string) => apiClient.del(path));
  handle("api:patch", (path: string, body?: any) =>
    apiClient.patch(path, body)
  );

  // ---------- events pushed to the renderer ----------
  readerService.on("state", (state) => broadcast("reader:state-changed", state));
  readerService.on("card-inserted", (p) => broadcast("reader:card-inserted", p));
  readerService.on("card-removed", (p) => broadcast("reader:card-removed", p));

  cardService.on("trace", (entry) => broadcast("card:trace", entry));
  cardService.on("progress", (p) => broadcast("card:progress", p));
};

export default registerIpc;
