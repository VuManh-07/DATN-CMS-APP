import type { Configuration } from "webpack";

import { rules, nativeModuleRules } from "./webpack.rules";

export const mainConfig: Configuration = {
  /** First file to run in the main process. */
  entry: "./process/electron/main.ts",
  module: {
    // Native-module loaders apply here only — the renderer and preload run
    // sandboxed without __dirname, which those loaders require.
    rules: [...rules, ...nativeModuleRules],
  },
  resolve: {
    extensions: [".js", ".ts", ".jsx", ".tsx", ".css", ".json"],
  },
  /**
   * `smartcard` pulls in the native `@pokusew/pcsclite` addon. Keeping it
   * external means a machine without the PC/SC build toolchain can still
   * bundle the app; the require is guarded at runtime in process/card/reader.ts.
   */
  externals: {
    smartcard: "commonjs smartcard",
  },
};
