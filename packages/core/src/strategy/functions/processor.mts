import type { FileInfo } from "../../scanner.mjs";
import { FunctionConvention, type FunctionTrigger } from "./convention.mjs";
import { FunctionPathTransformer } from "./transformer.mjs";

export interface FunctionCore {
	id: string;
	trigger: FunctionTrigger;
	filePath: string;
	schedule?: string;
}

export class FunctionProcessor {
	private convention: FunctionConvention;
	private transformer: FunctionPathTransformer;

	constructor(
		convention?: FunctionConvention,
		transformer?: FunctionPathTransformer,
	) {
		this.convention = convention ?? new FunctionConvention();
		this.transformer = transformer ?? new FunctionPathTransformer();
	}

	public process(files: FileInfo[]): FunctionCore[] {
		return files.map((f) => this.processFunctionFile(f));
	}

	public processFunctionFile(file: FileInfo): FunctionCore {
		const extracted = this.convention.extractFunction(file.path);
		const id = this.transformer.normalizeIdentifier(extracted.rawName);

		return {
			id,
			trigger: extracted.trigger,
			filePath: file.fullPath,
			schedule: undefined,
		};
	}
}
