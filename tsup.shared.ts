import { defineConfig, type Options } from "tsup";

const extension = { js: ".mjs", dts: ".d.ts" };

type SharedOptions = {
	entry: Options["entry"];
	dts?: boolean;
	shebang?: boolean;
	noExternal?: Options["noExternal"];
	external?: Options["external"];
};

export function createTsupConfig(options: SharedOptions) {
	return defineConfig({
		entry: options.entry,
		format: ["esm"],
		dts: options.dts ?? false,
		clean: true,
		sourcemap: true,
		splitting: false,
		target: "node20",
		treeshake: true,
		shims: false,
		bundle: true,
		skipNodeModulesBundle: true,
		noExternal: options.noExternal,
		external: options.external,
		outExtension() {
			return extension;
		},
	});
}
