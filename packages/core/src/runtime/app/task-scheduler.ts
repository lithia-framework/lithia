import cron from "node-cron";
import type { TaskCore } from "../../discovery/tasks";

type ScheduledCronJob = ReturnType<typeof cron.schedule>;

export class TaskScheduler {
	private readonly cronJobs: ScheduledCronJob[] = [];

	constructor(private readonly tasks: TaskCore[]) {}

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

	public stop(): void {
		for (const job of this.cronJobs.splice(0)) {
			job.stop();
			if ("destroy" in job && typeof job.destroy === "function") {
				job.destroy();
			}
		}
	}
}
