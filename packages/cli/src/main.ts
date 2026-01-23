import { defineCommand, runMain } from "citty";
import build from "./cmd/build";
import dev from "./cmd/dev";
import start from "./cmd/start";
import { version } from "./meta";

const main = defineCommand({
	meta: {
		name: "lithia",
		description: "Lithia CLI",
		version,
	},
	subCommands: {
		dev,
		build,
		start,
	},
});

runMain(main).then();
