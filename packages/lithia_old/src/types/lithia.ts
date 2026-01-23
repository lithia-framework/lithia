import type { Hookable } from "hookable";
import type { Logger } from "../core/log";
import type { LithiaOptions } from "./config";
import type { LithiaHooks } from "./hooks";

export type Lithia = {
	options: LithiaOptions;
	hooks: Hookable<LithiaHooks>;
	logger: Logger;
};
