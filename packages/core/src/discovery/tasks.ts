import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import cron from "node-cron";
import { version } from "../meta";
import type { FileInfo } from "./scanner";

export type TaskTrigger = "CRON" | "ON_DEMAND";

export interface ExtractedTask {
	trigger: TaskTrigger;
	rawName: string;
}

export interface TaskCore {
	id: string;
	trigger: TaskTrigger;
	filePath: string;
	schedule?: string;
	retries?: number;
}

export interface TasksManifest {
	version: string;
	tasks: TaskCore[];
}

type CronTaskModule = {
	schedule?: string;
	retries?: number;
};

export class TaskConvention {
	private readonly taskRegex = /^(.*?)(?:\.(cron))?\.(mts|mjs|ts|js)$/i;

	public extractTask(filePath: string): ExtractedTask {
		const cleanPath = filePath
			.replace(/\\/g, "/")
			.replace(/^(app\/)?tasks\//, "");

		const match = cleanPath.match(this.taskRegex);
		const isCron = match?.[2]?.toLowerCase() === "cron";
		const rawName = match?.[1] || cleanPath;

		return {
			trigger: isCron ? "CRON" : "ON_DEMAND",
			rawName,
		};
	}
}

export class TaskPathTransformer {
	private readonly removeGroups = /\(([^([\\/]+)\)[\\/]/g;

	public normalizeIdentifier(rawName: string): string {
		const withoutGroups = rawName.replace(this.removeGroups, "");

		return withoutGroups
			.replace(/\\/g, "/")
			.split("/")
			.filter((part) => part.length > 0)
			.join(":");
	}

	public formatDisplayName(identifier: string): string {
		return identifier
			.split(":")
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(" ");
	}
}

export class TaskProcessor {
	constructor(
		private readonly convention = new TaskConvention(),
		private readonly transformer = new TaskPathTransformer(),
	) {}

	public process(files: FileInfo[]): TaskCore[] {
		return files.map((file) => this.processTaskFile(file));
	}

	public processTaskFile(file: FileInfo): TaskCore {
		const extracted = this.convention.extractTask(file.path);
		const id = this.transformer.normalizeIdentifier(extracted.rawName);

		return {
			id,
			trigger: extracted.trigger,
			filePath: file.fullPath,
			schedule: undefined,
			retries: undefined,
		};
	}
}

export class TaskManifestGenerator {
	constructor(private readonly processor = new TaskProcessor()) {}

	public async generateManifest(
		outRoot: string,
		scannedFiles: FileInfo[],
	): Promise<TasksManifest | null> {
		const taskFiles = scannedFiles.filter((file) => {
			const normalized = file.path.split(path.sep).join("/");
			return normalized.includes("tasks/") || normalized.includes("app/tasks/");
		});

		if (taskFiles.length === 0) return null;

		const tasks = await this.attachCronSchedules(this.processor.process(taskFiles));
		const manifest: TasksManifest = { version, tasks };
		const manifestPath = path.join(outRoot, "tasks.json");

		try {
			await fs.mkdir(path.dirname(manifestPath), { recursive: true });
			await fs.writeFile(
				manifestPath,
				JSON.stringify(manifest, null, 2),
				"utf-8",
			);
		} catch (error) {
			throw new Error(`Failed to write tasks manifest: ${error}`);
		}

		return manifest;
	}

	private async attachCronSchedules(tasks: TaskCore[]): Promise<TaskCore[]> {
		return await Promise.all(
			tasks.map(async (task) => {
				if (task.trigger !== "CRON") return task;

				const { schedule, retries } = await this.readCronConfig(task.filePath);
				if (!cron.validate(schedule)) {
					throw new Error(
						`Invalid cron schedule '${schedule}' for task '${task.id}'.`,
					);
				}

				return {
					...task,
					schedule,
					retries,
				};
			}),
		);
	}

	private async readCronConfig(
		filePath: string,
	): Promise<{ schedule: string; retries: number }> {
		const fileUrl = new URL(pathToFileURL(filePath).href);
		fileUrl.searchParams.set("t", `${Date.now()}`);
		const mod = (await import(fileUrl.href)) as CronTaskModule;

		if (!mod.schedule || typeof mod.schedule !== "string") {
			throw new Error(
				`CRON task '${filePath}' must export 'schedule' as a string.`,
			);
		}

		if (
			mod.retries !== undefined &&
			(!Number.isInteger(mod.retries) || mod.retries < 0)
		) {
			throw new Error(
				`CRON task '${filePath}' must export 'retries' as a non-negative integer.`,
			);
		}

		return {
			schedule: mod.schedule,
			retries: mod.retries ?? 0,
		};
	}
}
