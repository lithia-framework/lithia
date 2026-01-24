import { buildProject } from "@lithiajs/native";
import { defineCommand } from "citty";

const build = defineCommand({
	meta: {
		name: "build",
		description: "Start the build process",
	},
	run() {
		buildProject();
	},
});

export default build;
