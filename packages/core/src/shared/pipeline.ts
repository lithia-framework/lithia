/**
 * Single middleware-style step executed by the shared pipeline runner.
 *
 * Each step receives a continuation that advances to the next step or final
 * handler.
 */
export type PipelineStep = (next: () => Promise<void>) => Promise<void> | void;

/**
 * Executes an ordered middleware pipeline followed by a final handler.
 *
 * The runner prevents backward re-entry by ignoring calls that try to dispatch
 * an already executed index. Each step must call its provided continuation if
 * it wants the pipeline to proceed.
 *
 * @param {PipelineStep[]} steps - Ordered pipeline steps to execute.
 * @param {() => Promise<void>} handler - Final handler executed after the last
 * step calls its continuation.
 * @returns {Promise<void>} Resolves after the pipeline reaches its terminal
 * step.
 */
export async function executePipeline(
	steps: PipelineStep[],
	handler: () => Promise<void>,
): Promise<void> {
	let index = -1;

	const dispatch = async (stepIndex: number): Promise<void> => {
		if (stepIndex <= index) return;
		index = stepIndex;

		if (stepIndex === steps.length) {
			return handler();
		}

		const step = steps[stepIndex];
		if (step) {
			await step(() => dispatch(stepIndex + 1));
		}
	};

	await dispatch(0);
}
