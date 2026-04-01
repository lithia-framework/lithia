import cron from "node-cron";
import type { TaskCore } from "../../discovery/tasks";

/**
 * Scheduled job handle returned by `node-cron`.
 */
type ScheduledCronJob = ReturnType<typeof cron.schedule>;

/**
 * Registers and manages CRON-backed Lithia tasks inside the app worker.
 *
 * The scheduler only handles tasks already resolved as `CRON` in the task
 * manifest. CRON task semantics are described in
 * [Async Tasks](https://lithiajs.org/docs/latest/async-tasks) and
 * [Deploying](https://lithiajs.org/docs/latest/deploying).
 */
export class TaskScheduler {
	private readonly cronJobs: ScheduledCronJob[] = [];

	/**
	 * Creates a scheduler for the task manifest loaded into the current app
	 * worker.
	 *
	 * @param {TaskCore[]} tasks - Task manifest entries available to the app
	 * runtime.
	 */
	constructor(private readonly tasks: TaskCore[]) {}

	/**
	 * Starts all CRON tasks and invokes the callback when a schedule fires.
	 *
	 * Each CRON task must already include a validated `schedule` string. When a
	 * schedule triggers, the scheduler invokes `onTrigger` with the original
	 * task metadata.
	 *
	 * @param {(task: TaskCore) => void} onTrigger - Callback invoked when a CRON
	 * task schedule fires.
	 * @throws {Error} Throws when a CRON task is missing its resolved
	 * `schedule`.
	 */
	public start(onTrigger: (task: TaskCore) => void): void {
		const cronTasks = this.tasks.filter((task) => task.trigger === "CRON");

		for (const task of cronTasks) {
			if (!task.schedule) {
				throw new Error(
					`CRON task '${task.id}' is missing a resolved schedule.`,
				);
			}

			const job = cron.schedule(task.schedule, () => {
				onTrigger(task);
			});

			this.cronJobs.push(job);
		}
	}

	/**
	 * Stops and destroys all registered CRON jobs.
	 *
	 * This is used during app shutdown to ensure scheduled tasks no longer fire
	 * after the runtime begins closing.
	 */
	public stop(): void {
		for (const job of this.cronJobs.splice(0)) {
			job.stop();
			if ("destroy" in job && typeof job.destroy === "function") {
				job.destroy();
			}
		}
	}
}
