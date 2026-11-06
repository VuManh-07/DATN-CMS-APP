import type { Configuration } from "webpack";

import { rules } from "./webpack.rules";
import { plugins } from "./webpack.plugins";

rules.push({
  test: /\.css$/,
  use: [{ loader: "style-loader" }, { loader: "css-loader" }],
});

export const rendererConfig: Configuration = {
  // The renderer is a browser context: no Node globals, so webpack must not
  // emit references to __dirname (see webpack.rules.ts).
  target: "web",
  /**
   * Plain source maps instead of webpack's default eval-based ones.
   *
   * The eval variants require `unsafe-eval` in the CSP, which Electron flags
   * as an insecure policy. Rebuilds are a little slower; keeping the dev CSP
   * as strict as the packaged one is worth it in a project about key custody.
   */
  devtool: "source-map",
  module: { rules },
  plugins,
  resolve: {
    extensions: [".js", ".ts", ".jsx", ".tsx", ".css"],
  },
};
