import { createTsupConfig } from "../../tsup.shared";

export default createTsupConfig({
	entry: {
		index: "src/index.ts",
		_index: "src/_index.ts",
		"workers/app-worker": "src/runtime/workers/app-worker.ts",
		"workers/function-worker": "src/runtime/workers/function-worker.ts",
	},
	dts: true,
});
