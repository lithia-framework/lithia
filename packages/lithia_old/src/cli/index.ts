#!/usr/bin/env node

import { defineCommand, runMain } from "citty";
import { lithiaVersion } from "lithia/meta";

const main = defineCommand({
	meta: {
		name: "lithia",
		description: "Lithia CLI",
		version: lithiaVersion,
	},
	subCommands: {
		build: import("./commands/build").then((m) => m.default),
		dev: import("./commands/dev").then((m) => m.default),
		start: import("./commands/start").then((m) => m.default),
	},
});

runMain(main).then();
