import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import cron from "node-cron";
import { version } from "../meta";
import { fileHasMeaningfulModuleContent } from "../shared/filesystem";
import type { FileInfo } from "./scanner";

/**
 * Execution model assigned to a discovered Lithia task.
 */
export type TaskTrigger = "CRON" | "ON_DEMAND";

/**
 * Result of extracting task metadata from a task file path.
 */
export interface ExtractedTask {
	/**
	 * Trigger type inferred from the filename convention.
	 */
	trigger: TaskTrigger;
	/**
	 * Task-relative name before identifier normalization.
	 */
	rawName: string;
}

/**
 * Runtime manifest entry describing one discovered async task.
 */
export interface TaskCore {
	/**
	 * Stable task identifier derived from the file path under `src/app/tasks`.
	 */
	id: string;
	/**
	 * Execution model assigned to the task.
	 */
	trigger: TaskTrigger;
	/**
	 * Compiled module path loaded by the task runtime.
	 */
	filePath: string;
	/**
	 * Cron expression required for CRON-triggered tasks.
	 */
	schedule?: string;
	/**
	 * Maximum retry count allowed for CRON-triggered tasks.
	 */
	retries?: number;
}

/**
 * Versioned manifest written by the build step for discovered tasks.
 */
export interface TasksManifest {
	/**
	 * Schema version used to validate build/runtime compatibility.
	 */
	version: string;
	/**
	 * Discovered task entries available to the runtime.
	 */
	tasks: TaskCore[];
}

/**
 * Runtime shape of optional metadata exported by a CRON task module.
 */
type CronTaskModule = {
	schedule?: string;
	retries?: number;
};

/**
 * Applies Lithia's filesystem conventions for task filenames.
 *
 * Tasks are discovered under `src/app/tasks`, as described in
 * [Async Tasks](https://lithiajs.org/docs/latest/async-tasks) and
 * [Project Structure](https://lithiajs.org/docs/latest/project-structure).
 */
export class TaskConvention {
	private readonly taskRegex = /^(.*?)(?:\.(cron))?\.(mts|mjs|ts|js)$/i;

	/**
	 * Extracts the task trigger type and raw identifier from a task file path.
	 *
	 * The optional `.cron` marker changes the trigger from `ON_DEMAND` to
	 * `CRON`.
	 *
	 * @param {string} filePath - Task-relative file path returned by the
	 * scanner.
	 * @returns {ExtractedTask} Task trigger metadata derived from the filename.
	 */
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

/**
 * Normalizes task file paths into runtime identifiers and display labels.
 */
export class TaskPathTransformer {
	private readonly removeGroups = /\(([^([\\/]+)\)[\\/]/g;

	/**
	 * Converts a raw task path into Lithia's colon-delimited task identifier.
	 *
	 * Grouping segments are removed and remaining path segments are joined with
	 * colons.
	 *
	 * @param {string} rawName - Task-relative name extracted from the file path.
	 * @returns {string} Stable runtime task identifier.
	 */
	public normalizeIdentifier(rawName: string): string {
		const withoutGroups = rawName.replace(this.removeGroups, "");

		return withoutGroups
			.replace(/\\/g, "/")
			.split("/")
			.filter((part) => part.length > 0)
			.join(":");
	}

	/**
	 * Converts a task identifier into a human-readable display label.
	 *
	 * @param {string} identifier - Colon-delimited task identifier.
	 * @returns {string} Space-delimited display name with capitalized segments.
	 */
	public formatDisplayName(identifier: string): string {
		return identifier
			.split(":")
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(" ");
	}
}

/**
 * Converts discovered task files into runtime manifest entries.
 */
export class TaskProcessor {
	constructor(
		private readonly convention = new TaskConvention(),
		private readonly transformer = new TaskPathTransformer(),
	) {}

	/**
	 * Processes multiple discovered task files into manifest entries.
	 *
	 * @param {FileInfo[]} files - Discovered task files to transform.
	 * @returns {TaskCore[]} Runtime task entries derived from the input files.
	 */
	public process(files: FileInfo[]): TaskCore[] {
		return files.map((file) => this.processTaskFile(file));
	}

	/**
	 * Resolves one discovered task file into a runtime manifest entry.
	 *
	 * CRON metadata such as `schedule` and `retries` is attached later during
	 * manifest generation after the module can be loaded from the build output.
	 *
	 * @param {FileInfo} file - Discovered task file to transform.
	 * @returns {TaskCore} Manifest entry with identifier, trigger, and module
	 * path.
	 */
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

/**
 * Writes the versioned task manifest consumed by the Lithia runtime.
 */
export class TaskManifestGenerator {
	constructor(private readonly processor = new TaskProcessor()) {}

	/**
	 * Generates `tasks.json` from scanned build output files.
	 *
	 * The generator filters scanned files to task handler locations, converts
	 * them into runtime task entries, resolves CRON metadata from compiled task
	 * modules, and writes a versioned manifest that is later loaded by the host
	 * runtime.
	 *
	 * @param {string} outRoot - Build output directory that receives the
	 * manifest.
	 * @param {FileInfo[]} scannedFiles - Files scanned from the compiled output
	 * tree.
	 * @returns {Promise<TasksManifest | null>} The generated manifest, or
	 * `null` when no task files are present.
	 * @throws {Error} Throws when task metadata is invalid or when the manifest
	 * file cannot be written.
	 */
	public async generateManifest(
		outRoot: string,
		scannedFiles: FileInfo[],
	): Promise<TasksManifest | null> {
		const taskFiles = scannedFiles.filter((file) => {
			const normalized = file.path.split(path.sep).join("/");
			return normalized.includes("tasks/") || normalized.includes("app/tasks/");
		});

		if (taskFiles.length === 0) return null;

		const tasks = await this.attachCronSchedules(
			this.processor.process(taskFiles),
		);
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

	/**
	 * Loads CRON metadata for discovered tasks and removes empty task modules.
	 *
	 * Files without meaningful module content are skipped entirely. CRON tasks
	 * are dynamically imported so their `schedule` and optional `retries`
	 * exports can be validated and attached to the manifest.
	 *
	 * @param {TaskCore[]} tasks - Task entries produced by the task processor.
	 * @returns {Promise<TaskCore[]>} Task entries ready to be written to the
	 * manifest.
	 * @throws {Error} Throws when a CRON task exports an invalid schedule.
	 */
	private async attachCronSchedules(tasks: TaskCore[]): Promise<TaskCore[]> {
		const resolvedTasks = await Promise.all(
			tasks.map(async (task) => {
				if (!(await fileHasMeaningfulModuleContent(task.filePath))) {
					return null;
				}

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

		return resolvedTasks.filter((task): task is TaskCore => task !== null);
	}

	/**
	 * Reads and validates CRON-specific exports from a compiled task module.
	 *
	 * The module is imported with a cache-busting query string so repeated build
	 * runs do not reuse a stale module instance.
	 *
	 * @param {string} filePath - Compiled task module path to import.
	 * @returns {Promise<{ schedule: string; retries: number }>} Validated CRON
	 * configuration attached to the task manifest.
	 * @throws {Error} Throws when `schedule` is missing or not a string, or when
	 * `retries` is not a non-negative integer.
	 */
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
