import type { FileInfo } from "../../scanner.mjs";
import { EventConvention } from "./convention.mjs";
import { EventPathTransformer } from "./transformer.mjs";

export interface Event {
	name: string;
	filePath: string;
	namespace: string | null;
}

export class EventProcessor {
	private transformer: EventPathTransformer;
	private convention: EventConvention;

	constructor(
		transformer?: EventPathTransformer,
		convention?: EventConvention,
	) {
		this.transformer = transformer ?? new EventPathTransformer();
		this.convention = convention ?? new EventConvention();
	}

	public process(files: FileInfo[]): Event[] {
		return files.map((f) => this.processEventFile(f));
	}

	public processEventFile(file: FileInfo): Event {
		const intermediate = this.convention.extractEventPath(file.path);
		const normalized = this.transformer.normalize(intermediate);

		const parts = normalized.split("/").filter((p) => p.length > 0);

		let eventName = "";

		if (parts.length === 1) {
			eventName = parts[0];
		} else if (parts.length > 1) {
			const last = parts[parts.length - 1];

			if (last === "connection" || last === "disconnect") {
				eventName = last;
			} else {
				eventName = parts.join(":");
			}
		}

		const namespace = eventName.includes(":") ? eventName.split(":")[0] : null;

		return {
			name: eventName,
			filePath: file.fullPath,
			namespace,
		};
	}
}
