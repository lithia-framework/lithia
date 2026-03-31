import { loadConfig as loadConfigC12 } from "c12";
import { klona } from "klona";
import {
	DEFAULT_CONFIG,
	type LithiaConfig,
	type LithiaOptions,
} from "../config";

export async function loadConfig(): Promise<LithiaOptions> {
	const configOptions = {
		name: "lithia",
		configFile: "lithia.config",
		cwd: process.cwd(),
		dotenv: true,
		defaults: DEFAULT_CONFIG,
	};

	const { config } = await loadConfigC12<LithiaConfig>(configOptions);
	return klona(config) as LithiaOptions;
}
