import {
  blue,
  bold,
  gray,
  green,
  purple,
  red,
  white,
  yellow,
} from "./picocolors.mjs";

export type LogLevel =
	| "info"
	| "warn"
	| "error"
	| "debug"
	| "success"
	| "ready"
	| "event"
	| "wait";

function formatMeta(meta: any) {
	if (meta === undefined) return "";
	try {
		if (typeof meta === "string") return meta;
		return JSON.stringify(meta);
	} catch {
		return String(meta);
	}
}

export class Logger {
	info(msg: any, meta?: any) {
		const m = formatMeta(meta);
		console.log(`  ${msg}${m ? ` — ${m}` : ""}`);
	}

	warn(msg: any, meta?: any) {
		const symbol = yellow(bold("○"));
		const m = formatMeta(meta);
		console.warn(`${symbol} ${msg}${m ? ` — ${m}` : ""}`);
	}

	error(msg: any, meta?: any) {
		const symbol = red(bold("○"));
		const m = formatMeta(meta);
		console.error(`${symbol} ${msg}${m ? ` — ${m}` : ""}`);
	}

	success(msg: any, meta?: any) {
		const symbol = green(bold("▲"));
		const m = formatMeta(meta);
		console.log(`${symbol} ${msg}${m ? ` — ${m}` : ""}`);
	}

	event(msg: any, meta?: any) {
		const symbol = blue(bold("▲"));
		const m = formatMeta(meta);
		console.log(`${symbol} ${msg}${m ? ` — ${m}` : ""}`);
	}

	debug(msg: any, meta?: any) {
		if (process.env.DEBUG !== "1") return;
		const symbol = purple(bold("»"));
		const m = formatMeta(meta);
		console.log(`${symbol} ${gray(msg)}${m ? ` — ${m}` : ""}`);
	}

	wait(msg: any, meta?: any) {
		const symbol = white(bold("○"));
		const m = formatMeta(meta);
		console.log(`${symbol} ${msg}${m ? ` — ${m}` : ""}`);
	}
}

export const logger = new Logger();
