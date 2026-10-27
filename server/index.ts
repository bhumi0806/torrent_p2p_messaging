import WebSocket from "ws";
import { BootstrapServer } from "./bootstrap/bootstrapServer";
import { ServerConfig } from "./bootstrap/config/ServerConfig";

/** Start the signaling service; BootstrapServer owns the WebSocket lifecycle. */
export function startServer(): BootstrapServer {
    const server = new BootstrapServer();
    server.start();
    const wss = server.getWebSocketServer();
    const heartbeat = setInterval(
        () => {
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) client.ping();
            });
        },
        ServerConfig.CLIENT_PING_INTERVAL_MS
    );
    heartbeat.unref();

    const shutdown = () => {
        clearInterval(heartbeat);
        server.stop();
        process.exit(0);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);

    return server;
}
