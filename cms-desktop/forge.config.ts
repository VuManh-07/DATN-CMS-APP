import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { WebpackPlugin } from "@electron-forge/plugin-webpack";

import { mainConfig } from "./webpack.main.config";
import { rendererConfig } from "./webpack.renderer.config";

const config: ForgeConfig = {
  packagerConfig: {
    name: "CMS Operator Terminal",
    // The PC/SC addon must ship unpacked to be loadable from the app bundle.
    asar: { unpack: "**/node_modules/{smartcard,@pokusew}/**" },
  },
  /**
   * `smartcard` is kept external (see webpack.main.config.ts) and loaded at
   * runtime from node_modules, so Forge does not need to rebuild it here.
   * A machine that will actually talk to a reader still needs the addon built
   * for this Electron version — see README "Native module setup".
   */
  rebuildConfig: { onlyModules: [] },
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ["darwin"]),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new WebpackPlugin({
      mainConfig,
      /**
       * The renderer only ever talks to cms-server on localhost. No
       * 'unsafe-eval': the renderer uses non-eval source maps (see
       * webpack.renderer.config.ts), so dev matches the packaged policy.
       * ws: is for webpack's hot-reload socket.
       */
      devContentSecurityPolicy:
        "default-src 'self'; connect-src 'self' http://localhost:1255 http://127.0.0.1:1255 ws://localhost:3000 ws://127.0.0.1:3000; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:",
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: "./public/index.html",
            js: "./src/index.tsx",
            name: "main_window",
            preload: { js: "./process/electron/preload.ts" },
          },
        ],
      },
    }),
  ],
};

export default config;
