import { createTsupConfig } from "../../tsup.shared";

export default createTsupConfig({
	entry: ["src/index.ts", "src/_entrypoint.ts"],
	shebang: true,
});
