import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { Lithia } from 'lithia/types';
import { Server as SocketIOServer } from 'socket.io';
import { isDevelopment } from '../lithia-context';
import { ErrorHandler } from './error-handler';
import { EventManager } from './events/runtime';
import { MiddlewareManager } from './middleware-manager';
import { _LithiaRequest } from './request';
import { RequestProcessor } from './request-processor';
import { _LithiaResponse } from './response';
import { RouterManager } from './routing/runtime';

/**
 * HttpServerManager manages HTTP server creation and request handling.
 * Coordinates between specialized services for request processing.
 */
export class HttpServerManager {
  private lithia: Lithia;
  private routerManager: RouterManager;
  private middlewareManager: MiddlewareManager;
  private errorHandler: ErrorHandler;
  private requestProcessor: RequestProcessor;
  private eventManager: EventManager;
  private io?: SocketIOServer;

  constructor(lithia: Lithia) {
    this.lithia = lithia;
    this.routerManager = new RouterManager(lithia);
    this.middlewareManager = new MiddlewareManager(lithia);
    this.errorHandler = new ErrorHandler();
    this.eventManager = new EventManager(lithia);
    this.requestProcessor = new RequestProcessor(
      lithia,
      this.routerManager,
      this.middlewareManager,
      () => this.io, // Pass a getter function to access io
    );
  }

  /**
   * Creates and configures an HTTP server with optional WebSocket support.
   * @returns {Server} Configured HTTP server
   */
  async createServer(): Promise<Server> {
    const server = createServer(
      async (httpReq: IncomingMessage, httpRes: ServerResponse) => {
        await this.handleRequest(
          new _LithiaRequest(httpReq, this.lithia),
          new _LithiaResponse(httpRes),
        );
      },
    );

    // Initialize WebSocket if events exist
    await this.initializeWebSocket(server);

    return server;
  }

  /**
   * Initializes Socket.IO server if WebSocket events are found.
   * @private
   * @param {Server} server - HTTP server instance
   */
  private async initializeWebSocket(server: Server): Promise<void> {
    try {
      const events = await this.eventManager.scanEvents(this.lithia);
      if (events.length > 0) {
        this.io = new SocketIOServer(server, {
          cors: {
            origin: this.lithia.options.cors?.origin || '*',
            methods: this.lithia.options.cors?.methods || ['GET', 'POST'],
            credentials: this.lithia.options.cors?.credentials ?? true,
          },
        });
        await this.eventManager.registerEvents(this.io);
      }
    } catch (error) {
      // Log error but don't fail server startup if events can't be loaded
      this.lithia.logger.warn(
        `Failed to initialize WebSocket: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Gets the Socket.IO server instance if initialized.
   * @returns {SocketIOServer | undefined} Socket.IO server or undefined
   */
  getSocketIOServer(): SocketIOServer | undefined {
    return this.io;
  }

  /**
   * Handles incoming HTTP requests.
   * Delegates to RequestProcessor for complete request processing.
   * @private
   * @param {_LithiaRequest} req - Request object
   * @param {_LithiaResponse} res - Response object
   */
  private async handleRequest(
    req: _LithiaRequest,
    res: _LithiaResponse,
  ): Promise<void> {
    try {
      await this.requestProcessor.processRequest(req, res);
    } catch (error) {
      this.errorHandler.handleError(error, res, isDevelopment());
    }
  }
}
