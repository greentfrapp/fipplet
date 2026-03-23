import { defineConfig, type Options } from "tsup";
import pkg from "./package.json";
import module from "node:module";
import nodePath from "node:path";
import nodeFs from "node:fs";

const nodeBuiltins = module.builtinModules.flatMap((m) => [m, `node:${m}`]);

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

const bundlePlaywright: Partial<Options> = {
  noExternal: ["playwright-core"],
  external: ["chromium-bidi", "ws", ...nodeBuiltins],
  platform: "node",
  esbuildPlugins: [
    resolvePngAssets,
    {
      name: "patch-playwright-coredir",
      setup(build) {
        // playwright-core's nodePlatform.js does:
        //   require.resolve("../../../package.json")
        // to find its install root. When bundled, this path is wrong.
        // Replace it with __dirname so coreDir points to dist/.
        build.onLoad({ filter: /nodePlatform\.js$/ }, async (args) => {
          const fs = await import("node:fs");
          let contents = fs.readFileSync(args.path, "utf8");
          contents = contents.replace(
            /import_path\.default\.dirname\(require\.resolve\("\.\.\/\.\.\/\.\.\/package\.json"\)\)/,
            "__dirname"
          );
          return { contents, loader: "js" };
        });
      },
    },
  ],
};

const assetLoaders: Partial<Options> = {
  loader: { ".svg": "text", ".html": "text" },
};

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    splitting: false,
    minify: true,
    ...bundlePlaywright,
    ...assetLoaders,
  },
  {
    entry: ["src/cli.ts"],
    format: ["cjs"],
    banner: { js: "#!/usr/bin/env node" },
    splitting: false,
    minify: true,
    ...bundlePlaywright,
    ...assetLoaders,
    define: {
      __FIPPLET_VERSION__: JSON.stringify(pkg.version),
    },
  },
]);
