import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

/**
 * The only bridge between the renderer and Node.
 *
 * Mirrors the `window.cms` shape declared in src/@type/preload.d.ts. Every
 * call unwraps the `{ ok, data | error }` envelope from ipc.ts and throws on
 * failure, so pages can use plain try/catch.
 */

const invoke = async (channel: string, ...args: any[]) => {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result?.ok) throw new Error(result?.error || "Unknown IPC error");
  return result.data;
};

/** Subscribe to a push channel; returns an unsubscribe function. */
const on = (channel: string, cb: (payload: any) => void) => {
  const listener = (_e: IpcRendererEvent, payload: any) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld("cms", {
  auth: {
    login: (username: string, password: string) =>
      invoke("auth:login", username, password),
    logout: () => invoke("auth:logout"),
    currentUser: () => invoke("auth:current-user"),
  },

  reader: {
    state: () => invoke("reader:state"),
    onStateChanged: (cb: (s: any) => void) => on("reader:state-changed", cb),
    onCardInserted: (cb: (p: any) => void) => on("reader:card-inserted", cb),
    onCardRemoved: (cb: (p: any) => void) => on("reader:card-removed", cb),
  },

  card: {
    readCsn: () => invoke("card:read-csn"),
    openSession: (cardId: string) => invoke("card:open-session", cardId),
    closeSession: (result?: string) => invoke("card:close-session", result),
    sessionState: () => invoke("card:session-state"),
    personalize: (cardId: string, options?: any) =>
      invoke("card:personalize", cardId, options),
    sendCommand: (ins: string, data?: string, p1?: string, p2?: string) =>
      invoke("card:send-command", ins, data ?? null, p1, p2),
    onTrace: (cb: (entry: any) => void) => on("card:trace", cb),
    onProgress: (cb: (p: any) => void) => on("card:progress", cb),
  },

  api: {
    get: (path: string, params?: any) => invoke("api:get", path, params),
    post: (path: string, body?: any) => invoke("api:post", path, body),
    patch: (path: string, body?: any) => invoke("api:patch", path, body),
    del: (path: string) => invoke("api:delete", path),
  },
});
