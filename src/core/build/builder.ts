import type { Lithia } from 'lithia/types';
import type { BuildResult } from './context';
import { isDevelopment } from '../lithia-context';
import {
  type BuildStrategy,
  DevelopmentBuildStrategy,
  ProductionBuildStrategy,
} from './strategies';

/**
 * Interface for build manager implementations.
 *
 * Implementations of this interface coordinate the build process by selecting
 * appropriate build strategies and managing the overall build workflow.
 *
 * @interface
 */
export interface BuildManager {
  /**
   * Executes the build process for the given Lithia instance.
   *
   * @param lithia - The Lithia instance to build
   * @returns Promise that resolves to build result
   */
  build(lithia: Lithia): Promise<BuildResult>;
}

/**
 * Default implementation of BuildManager that selects strategies based on environment.
 *
 * This manager automatically selects the appropriate build strategy based on
 * the command or environment, providing a unified interface for building
 * Lithia applications.
 *
 * @class
 * @implements {BuildManager}
 */
export class DefaultBuildManager implements BuildManager {
  private readonly devStrategy: BuildStrategy;
  private readonly prodStrategy: BuildStrategy;

  /**
   * Creates a new DefaultBuildManager instance.
   *
   * @param devStrategy - Optional custom development build strategy
   * @param prodStrategy - Optional custom production build strategy
   */
  constructor(devStrategy?: BuildStrategy, prodStrategy?: BuildStrategy) {
    this.devStrategy = devStrategy || new DevelopmentBuildStrategy();
    this.prodStrategy = prodStrategy || new ProductionBuildStrategy();
  }

  /**
   * Executes the build process using the appropriate strategy.
   *
   * Automatically selects between development and production build strategies
   * based on the CLI command or environment configuration.
   *
   * @param lithia - The Lithia instance to build
   * @returns Promise that resolves to build result
   */
  async build(lithia: Lithia): Promise<BuildResult> {
    const strategy = this.selectStrategy(lithia);
    return await strategy.build(lithia);
  }

  /**
   * Selects the appropriate build strategy based on Lithia configuration.
   *
   * This method is called within runWithContext, so it can use isDevelopment()
   * from the context to determine the environment.
   *
   * @private
   * @param lithia - The Lithia instance containing configuration
   * @returns The selected build strategy
   */
  private selectStrategy(lithia: Lithia): BuildStrategy {
    // Use context to determine environment
    // This is called within runWithContext, so isDevelopment() will work
    return isDevelopment() ? this.devStrategy : this.prodStrategy;
  }
}

/**
 * Convenience function for building Lithia applications.
 *
 * This function provides a simple API for building Lithia applications using
 * the default build manager. For custom build behavior, use the BuildManager
 * interface directly.
 *
 * @param lithia - The Lithia instance to build
 * @returns Promise that resolves to build result
 *
 * @example
 * ```typescript
 * const lithia = await createLithia(config);
 * const result = await buildLithia(lithia);
 *
 * if (result.success) {
 *   console.log(`Build completed in ${result.buildTime}ms`);
 * } else {
 *   console.error('Build failed:', result.errors);
 * }
 * ```
 */
export async function buildLithia(lithia: Lithia): Promise<BuildResult> {
  const manager = new DefaultBuildManager();
  return await manager.build(lithia);
}

/**
 * Creates a build manager with custom strategies.
 *
 * This function allows using custom build strategies instead of the default
 * development and production strategies.
 *
 * @param devStrategy - Custom development build strategy
 * @param prodStrategy - Custom production build strategy
 * @returns A build manager with the provided strategies
 *
 * @example
 * ```typescript
 * const customDevStrategy = new MyCustomDevStrategy();
 * const customProdStrategy = new MyCustomProdStrategy();
 * const manager = createBuildManager(customDevStrategy, customProdStrategy);
 * const result = await manager.build(lithia);
 * ```
 */
export function createBuildManager(
  devStrategy?: BuildStrategy,
  prodStrategy?: BuildStrategy,
): BuildManager {
  return new DefaultBuildManager(devStrategy, prodStrategy);
}
