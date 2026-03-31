import { describe, expect, it } from "vitest";
import {
	FunctionConvention,
	FunctionPathTransformer,
	FunctionProcessor,
} from "./functions";

describe("functions discovery", () => {
	it("detects CRON and TASK triggers from file names", () => {
		const convention = new FunctionConvention();
		expect(
			convention.extractFunction("app/functions/revalidate.cron.ts"),
		).toEqual({
			trigger: "CRON",
			rawName: "revalidate",
		});
		expect(convention.extractFunction("functions/mail/send.ts")).toEqual({
			trigger: "TASK",
			rawName: "mail/send",
		});
	});

	it("normalizes function identifiers", () => {
		const transformer = new FunctionPathTransformer();
		expect(transformer.normalizeIdentifier("(admin)/mail/send")).toBe(
			"mail:send",
		);
	});

	it("builds function metadata from scanned files", () => {
		const processor = new FunctionProcessor();
		expect(
			processor.processFunctionFile({
				path: "app/functions/user/create.cron.ts",
				fullPath: "/abs/dist/app/functions/user/create.cron.js",
			}),
		).toEqual({
			id: "user:create",
			trigger: "CRON",
			filePath: "/abs/dist/app/functions/user/create.cron.js",
			schedule: undefined,
		});
	});
});
