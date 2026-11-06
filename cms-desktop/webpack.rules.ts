import type { ModuleOptions } from "webpack";

type Rules = Required<ModuleOptions>["rules"];

/**
 * Loaders shared by the main and renderer bundles.
 *
 * Deliberately free of native-module handling: see `nativeModuleRules` below.
 */
export const rules: Rules = [
  {
    test: /\.tsx?$/,
    exclude: /(node_modules|\.webpack)/,
    use: {
      loader: "ts-loader",
      options: { transpileOnly: true },
    },
  },
  {
    test: /\.s[ac]ss$/i,
    use: [
      "style-loader",
      "css-loader",
      // dart-sass deprecates the legacy JS API that sass-loader defaults to
      { loader: "sass-loader", options: { api: "modern" } },
    ],
  },
  {
    test: /\.(png|svg|jpg|jpeg|gif)$/i,
    type: "asset/resource",
  },
];

/**
 * Native-module support — **main process only**.
 *
 * `@vercel/webpack-asset-relocator-loader` emits a runtime line
 *
 *   __webpack_require__.ab = __dirname + "/native_modules/"
 *
 * which needs `__dirname`. The main process has it; a sandboxed renderer or
 * preload does not, so including these rules there throws
 * `ReferenceError: __dirname is not defined` before any app code runs — the
 * preload fails to load and the window renders blank.
 *
 * Only the main process touches native addons here (PC/SC via `smartcard`),
 * so these rules belong to it alone.
 */
export const nativeModuleRules: Rules = [
  {
    // The asset relocator emits a "fake" .node file that is really CommonJS.
    test: /native_modules[/\\].+\.node$/,
    use: "node-loader",
  },
  {
    test: /[/\\]node_modules[/\\].+\.(m?js|node)$/,
    parser: { amd: false },
    use: {
      loader: "@vercel/webpack-asset-relocator-loader",
      options: { outputAssetBase: "native_modules" },
    },
  },
];
