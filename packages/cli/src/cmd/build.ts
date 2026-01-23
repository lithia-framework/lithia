import { buildProject } from "@lithiajs/native-builder";
import { defineCommand } from "citty";

const build = defineCommand({
	meta: {
		name: "build",
		description: "Start the build process (uses native-builder)",
	},
	run() {
		const outDir = ".lithia";
		try {
			buildProject("src", outDir);
			return 0;
		} catch {
			return 1;
		}
	},
});

export default build;
