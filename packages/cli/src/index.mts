#! /usr/bin/env node

import { defineCommand, runMain } from "citty";
import build from "./cmd/build.mjs";
import dev from "./cmd/dev.mjs";
import { version } from "./meta.mjs";

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
