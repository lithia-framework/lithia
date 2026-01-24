import { buildProject } from "@lithiajs/native";
import { defineCommand } from "citty";

const build = defineCommand({
	meta: {
		name: "build",
		description: "Start the build process (uses native-builder)",
	},
	run() {
		try {
			buildProject();
			return 0;
		} catch {
			return 1;
		}
	},
});

export default build;
