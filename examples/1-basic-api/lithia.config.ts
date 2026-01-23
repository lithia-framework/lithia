import { defineLithiaConfig } from "lithia";
import type { LithiaConfig, LithiaRequest, LithiaResponse } from "lithia/types";

const config: LithiaConfig = {
	debug: true,
	server: {
		host: "localhost",
		port: 3000,
	},
	studio: {
		enabled: true,
	},
};

export default defineLithiaConfig(config);
