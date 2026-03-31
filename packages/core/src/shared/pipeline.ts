export type PipelineStep = (next: () => Promise<void>) => Promise<void> | void;

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
