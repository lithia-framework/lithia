#! /usr/bin/env node

import { defineCommand, runMain } from "citty";
import build from "./cmd/build";
import dev from "./cmd/dev";
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
	},
});

runMain(main).then();
