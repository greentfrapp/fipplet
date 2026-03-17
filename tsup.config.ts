import { defineConfig, type Options } from "tsup";
import pkg from "./package.json";
import module from "node:module";

const nodeBuiltins = module.builtinModules.flatMap((m) => [m, `node:${m}`]);

const bundlePlaywright: Partial<Options> = {
  noExternal: ["playwright-core"],
  external: ["chromium-bidi", "ws", ...nodeBuiltins],
  platform: "node",
  esbuildPlugins: [
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

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    splitting: false,
    ...bundlePlaywright,
  },
  {
    entry: ["src/cli.ts"],
    format: ["cjs"],
    banner: { js: "#!/usr/bin/env node" },
    splitting: false,
    ...bundlePlaywright,
    define: {
      __FIPPLET_VERSION__: JSON.stringify(pkg.version),
    },
  },
]);
