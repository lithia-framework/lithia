import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	TaskConvention,
	TaskManifestGenerator,
	TaskPathTransformer,
	TaskProcessor,
} from "./tasks";

describe("tasks discovery", () => {
	it("detects CRON and ON_DEMAND triggers from file names", () => {
		const convention = new TaskConvention();
		expect(convention.extractTask("app/tasks/revalidate.cron.ts")).toEqual({
			trigger: "CRON",
			rawName: "revalidate",
		});
		expect(convention.extractTask("tasks/mail/send.ts")).toEqual({
			trigger: "ON_DEMAND",
			rawName: "mail/send",
		});
	});

	it("normalizes task identifiers", () => {
		const transformer = new TaskPathTransformer();
		expect(transformer.normalizeIdentifier("(admin)/mail/send")).toBe(
			"mail:send",
		);
	});

	it("builds task metadata from scanned files", () => {
		const processor = new TaskProcessor();
		expect(
			processor.processTaskFile({
				path: "app/tasks/user/create.cron.ts",
				fullPath: "/abs/dist/app/tasks/user/create.cron.js",
			}),
		).toEqual({
			id: "user:create",
			trigger: "CRON",
			filePath: "/abs/dist/app/tasks/user/create.cron.js",
			schedule: undefined,
			retries: undefined,
		});
	});

	it("extracts cron schedules into the tasks manifest", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "lithia-task-manifest-"));

		try {
			const outRoot = path.join(root, "dist");
			const taskFile = path.join(root, "app/tasks/revalidate.cron.mjs");
			await mkdir(path.dirname(taskFile), { recursive: true });

			await writeFile(
				taskFile,
				`export const schedule = "*/5 * * * *";
export const retries = 2;
export default async function task() {}
`,
				"utf-8",
			);

			const generator = new TaskManifestGenerator();
			const manifest = await generator.generateManifest(outRoot, [
				{
					path: "app/tasks/revalidate.cron.mjs",
					fullPath: taskFile,
				},
			]);

			expect(manifest?.tasks).toEqual([
				{
					id: "revalidate",
					trigger: "CRON",
					filePath: taskFile,
					schedule: "*/5 * * * *",
					retries: 2,
				},
			]);

			const writtenManifest = JSON.parse(
				await readFile(path.join(outRoot, "tasks.json"), "utf-8"),
			);
			expect(writtenManifest.tasks[0].schedule).toBe("*/5 * * * *");
			expect(writtenManifest.tasks[0].retries).toBe(2);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("ignores empty task modules while they are still being created", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "lithia-task-manifest-"));

		try {
			const outRoot = path.join(root, "dist");
			const cronTaskFile = path.join(root, "app/tasks/revalidate.cron.mjs");
			const onDemandTaskFile = path.join(root, "app/tasks/mail/send.mjs");
			await mkdir(path.dirname(onDemandTaskFile), { recursive: true });

			await writeFile(cronTaskFile, "   \n", "utf-8");
			await writeFile(onDemandTaskFile, "// still writing\n", "utf-8");

			const generator = new TaskManifestGenerator();
			const manifest = await generator.generateManifest(outRoot, [
				{
					path: "app/tasks/revalidate.cron.mjs",
					fullPath: cronTaskFile,
				},
				{
					path: "app/tasks/mail/send.mjs",
					fullPath: onDemandTaskFile,
				},
			]);

			expect(manifest?.tasks).toEqual([]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
