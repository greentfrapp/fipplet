import { defineConfig } from "tsup";
import pkg from "./package.json";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    splitting: false,
  },
  {
    entry: ["src/cli.ts"],
    format: ["esm"],
    banner: { js: "#!/usr/bin/env node" },
    splitting: false,
    define: {
      __FIPPLET_VERSION__: JSON.stringify(pkg.version),
    },
  },
]);
