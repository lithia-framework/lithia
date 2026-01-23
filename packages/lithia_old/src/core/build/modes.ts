import type { RouteBuilder } from "./route-builder";
import { SWCRouteBuilder } from "./route-builder";

/**
 * Build builder types for different compilation strategies.
 *
 * @type
 */
export type BuildBuilder = "swc";

/**
 * Build builder configuration options.
 *
 * @interface
 */
export interface BuildBuilderConfig {
	/** The build builder to use */
	builder: BuildBuilder;
}

/**
 * Factory for creating route builders based on build builder.
 *
 * This factory creates appropriate RouteBuilder implementations based on
 * the selected build builder, allowing easy switching between different
 * compilation strategies.
 *
 * @class
 */
export class BuildBuilderFactory {
	/**
	 * Creates a RouteBuilder instance based on the build builder.
	 *
	 * @param builder - The build builder to use
	 * @param externalPackages - Custom external packages (for future use)
	 * @returns RouteBuilder instance for the specified builder
	 *
	 * @example
	 * ```typescript
	 * // SWC builder (stable, good performance)
	 * const swcBuilder = BuildBuilderFactory.createBuilder('swc');
	 * ```
	 */
	static createBuilder(builder: BuildBuilder): RouteBuilder {
		switch (builder) {
			case "swc":
				return new SWCRouteBuilder();
			default:
				throw new Error(`Unknown build builder: ${builder}`);
		}
	}

	/**
	 * Gets build builder recommendations based on project characteristics.
	 *
	 * @param routeCount - Number of routes in the project
	 * @param hasLargeDeps - Whether the project uses large dependencies
	 * @returns Recommended build builder and configuration
	 *
	 * @example
	 * ```typescript
	 * const recommendation = BuildBuilderFactory.getRecommendation(100, true);
	 * // Returns: { builder: 'swc', reason: 'SWC provides excellent performance...' }
	 * ```
	 */
	static getRecommendation(
		_routeCount: number,
		_hasLargeDeps: boolean,
	): { builder: BuildBuilder; reason: string } {
		return {
			builder: "swc",
			reason:
				"SWC provides excellent performance with proper path resolution and compatibility",
		};
	}

	/**
	 * Gets performance characteristics of each build builder.
	 *
	 * @returns Object describing performance characteristics of each builder
	 */
	static getPerformanceCharacteristics(): Record<
		BuildBuilder,
		{
			buildSpeed: "fast" | "medium" | "slow";
			bundleSize: "small" | "medium" | "large";
			duplicateDeps: boolean;
			compatibility: "high" | "medium" | "low";
			description: string;
		}
	> {
		return {
			swc: {
				buildSpeed: "fast",
				bundleSize: "small",
				duplicateDeps: false,
				compatibility: "high",
				description:
					"Fast builds with SWC, no duplicate dependencies, excellent compatibility and native path resolution",
			},
		};
	}
}
