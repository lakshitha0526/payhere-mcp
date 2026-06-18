import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	target: "node18",
	platform: "node",
	dts: true,
	sourcemap: true,
	clean: true,
	splitting: false,
	shims: false,
	// Preserve the shebang from src/index.ts so the bin works after install.
	banner: { js: "#!/usr/bin/env node" },
});
