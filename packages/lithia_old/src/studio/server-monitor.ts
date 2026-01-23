import { EventEmitter } from "node:events";
import type { Lithia } from "lithia/types";

export interface ServerStats {
	uptime: number;
	memoryUsage: {
		rss: number;
		heapTotal: number;
		heapUsed: number;
		external: number;
		arrayBuffers: number;
	};
	nodeVersion: string;
	platform: string;
	arch: string;
	cpuUsage: number;
	timestamp: Date;
}

/**
 * Server monitoring component that collects system statistics
 * and emits them to connected Studio clients.
 */
export class ServerMonitor extends EventEmitter {
	private intervalId: NodeJS.Timeout | null = null;
	private startTime: Date;
	private isRunning = false;

	constructor(_lithia: Lithia) {
		super();
		this.startTime = new Date();
	}

	/**
	 * Start monitoring server statistics.
	 */
	start(intervalMs: number = 5000): void {
		if (this.isRunning) return;

		this.isRunning = true;
		this.startTime = new Date();

		// Emit initial stats
		this.emitStats();

		// Set up interval for periodic updates
		this.intervalId = setInterval(() => {
			this.emitStats();
		}, intervalMs);
	}

	/**
	 * Stop monitoring server statistics.
	 */
	stop(): void {
		if (!this.isRunning) return;

		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}

		this.isRunning = false;
	}

	/**
	 * Get current server statistics.
	 */
	getStats(): ServerStats {
		const memoryUsage = process.memoryUsage();
		const uptime = Date.now() - this.startTime.getTime();

		return {
			uptime,
			memoryUsage: {
				rss: memoryUsage.rss,
				heapTotal: memoryUsage.heapTotal,
				heapUsed: memoryUsage.heapUsed,
				external: memoryUsage.external,
				arrayBuffers: memoryUsage.arrayBuffers,
			},
			nodeVersion: process.version,
			platform: process.platform,
			arch: process.arch,
			cpuUsage: process.cpuUsage().user / 1000000, // Convert to milliseconds
			timestamp: new Date(),
		};
	}

	/**
	 * Emit current statistics to listeners.
	 */
	private emitStats(): void {
		const stats = this.getStats();
		this.emit("stats", stats);
	}

	/**
	 * Force emit current statistics immediately (for immediate requests).
	 */
	emitCurrentStats(): void {
		this.emitStats();
	}

	/**
	 * Check if monitoring is currently running.
	 */
	isMonitoring(): boolean {
		return this.isRunning;
	}
}
