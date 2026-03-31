import { createTsupConfig } from "../../tsup.shared";

export default createTsupConfig({
	entry: {
		index: "src/index.ts",
	},
	dts: true,
});
