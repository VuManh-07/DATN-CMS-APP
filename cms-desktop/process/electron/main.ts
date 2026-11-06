import { app, BrowserWindow } from "electron";
import path from "path";
import dotenv from "dotenv";
import registerIpc from "./ipc";
import readerService from "../card/reader";

// Load CMS_API_BASE_URL etc. before anything reads process.env.
dotenv.config({ path: path.join(app.getAppPath(), ".env") });

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
  app.quit();
}

const createWindow = (): void => {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: "CMS Operator Terminal",
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      // The renderer gets no Node access; everything goes through the
      // contextBridge surface defined in preload.ts.
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Surface renderer problems in the terminal. Without this a crashed renderer
  // just shows a white window and the reason stays hidden in DevTools.
  const levels = ["debug", "info", "warn", "error"];
  mainWindow.webContents.on(
    "console-message",
    (_e, level, message, line, sourceId) => {
      const tag = levels[level] || String(level);
      if (tag === "error" || tag === "warn") {
        console.log(`[renderer:${tag}] ${message} (${sourceId}:${line})`);
      }
    }
  );

  mainWindow.webContents.on(
    "did-fail-load",
    (_e, code, description, url) => {
      console.error(`[renderer] failed to load ${url}: ${description} (${code})`);
    }
  );

  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    console.error("[renderer] process gone:", details.reason);
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
};

app.on("ready", () => {
  registerIpc();
  // Start watching for readers once the IPC listeners exist, so the first
  // device-activated event is not lost.
  readerService.start();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
