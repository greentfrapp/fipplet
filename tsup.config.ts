import { defineConfig } from "tsup";
import pkg from "./package.json";
import nodePath from "node:path";
import nodeFs from "node:fs";

/**
 * esbuild plugin that copies .png imports to the output directory
 * and replaces the import with `path.join(__dirname, "<filename>")`.
 */
const resolvePngAssets: import("esbuild").Plugin = {
  name: "resolve-png-assets",
  setup(build) {
    build.onLoad({ filter: /\.png$/ }, (args) => {
      const basename = nodePath.basename(args.path);
      const outdir = build.initialOptions.outDir ?? "dist";
      const dest = nodePath.resolve(outdir, basename);
      nodeFs.mkdirSync(nodePath.dirname(dest), { recursive: true });
      nodeFs.copyFileSync(args.path, dest);
      return {
        contents: `module.exports = require("path").join(__dirname, ${JSON.stringify(basename)});`,
        loader: "js",
      };
    });
  },
};

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    splitting: false,
    minify: true,
    platform: "node",
    external: ["playwright-core"],
    esbuildPlugins: [resolvePngAssets],
    loader: { ".svg": "text", ".html": "text" },
  },
  {
    entry: ["src/cli.ts"],
    format: ["cjs"],
    banner: { js: "#!/usr/bin/env node" },
    splitting: false,
    minify: true,
    platform: "node",
    external: ["playwright-core"],
    esbuildPlugins: [resolvePngAssets],
    loader: { ".svg": "text", ".html": "text" },
    define: {
      __FIPPLET_VERSION__: JSON.stringify(pkg.version),
    },
  },
  {
    entry: ["src/fixture.ts"],
    format: ["esm", "cjs"],
    dts: true,
    splitting: false,
    minify: true,
    platform: "node",
    external: ["playwright-core", "@playwright/test"],
    esbuildPlugins: [resolvePngAssets],
    loader: { ".svg": "text", ".html": "text" },
  },
]);
