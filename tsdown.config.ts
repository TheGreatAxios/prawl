import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/cli.ts"],
  outDir: "./dist",
  format: ["esm"],
  platform: "node",
  minify: true,
  sourcemap: false,
  dts: false,
  splitting: false,
  clean: true,
});
