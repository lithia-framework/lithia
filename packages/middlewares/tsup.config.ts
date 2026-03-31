import { createTsupConfig } from "../../tsup.shared";

export default createTsupConfig({
	entry: ["src/index.ts"],
	dts: true,
});
