import type { Event } from "@lithia-js/native";
import type { Socket } from "socket.io";
import type { LithiaApp } from "../lithia-app.mjs";
import { loadModule } from "../module-loader.js";

/**
 * Tipagens para suporte a Middlewares em Events
 */
export type NextEvent = () => Promise<void> | void;

export type EventMiddleware = (
	socket: Socket,
	next: NextEvent,
) => Promise<void>;

export type EventErrorMiddleware = (
	error: Error,
	socket: Socket,
	next: NextEvent,
) => Promise<void>;

export type EventHandler = (socket: Socket, data?: any) => Promise<void>;

export type EventModule = {
	default: EventHandler;
	middlewares?: EventMiddleware[];
};

export class LithiaEventProcessor {
	constructor(private readonly app: LithiaApp) {}

	/**
	 * Processa um evento específico do Socket.io
	 * @param socket A instância do socket
	 * @param event Definição do evento (metadados)
	 * @param data Dados enviados pelo cliente
	 */
	async process(socket: Socket, event: Event, data?: any): Promise<void> {
		try {
			// 1. Carregamento do Módulo
			const mod = await loadModule<EventModule>(event.filePath);

			// 2. Montagem da Pipeline (Global + Local)
			const pipeline: EventMiddleware[] = [...(mod.middlewares || [])];

			// 3. Execução em Cascata
			await this.runPipeline(pipeline, socket, async () => {
				await mod.default(socket, data);
			});
		} catch (err) {
			this.handleEventError(socket, event.name, err);
		}
	}

	/**
	 * Pipeline Onion para eventos
	 */
	private async runPipeline(
		middlewares: EventMiddleware[],
		socket: Socket,
		handler: () => Promise<void>,
	): Promise<void> {
		let index = -1;

		const dispatch = async (i: number): Promise<void> => {
			if (i <= index) return;
			index = i;

			if (i === middlewares.length) {
				return handler();
			}

			const middleware = middlewares[i];
			if (middleware) {
				await middleware(socket, () => dispatch(i + 1));
			}
		};

		await dispatch(0);
	}

	/**
	 * Central de tratamento de erros para Sockets
	 */
	private handleEventError(socket: Socket, eventName: string, err: any): void {
		const isProd = this.app.environment === "production";

		// Log interno (essencial, já que sockets não têm logs de acesso nativos como HTTP)
		console.error(
			`[Lithia Event Error] Event: ${eventName} | ID: ${socket.id}`,
			err,
		);

		// Notifica o cliente sobre o erro de forma padronizada
		socket.emit("error", {
			event: eventName,
			message: isProd ? "Internal Server Error" : err.message,
			timestamp: new Date().toISOString(),
			...(!isProd && { stack: err.stack }),
		});
	}
}
