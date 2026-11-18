import { createServer } from "node:http";
import { startServer } from "./index";

const bootstrap = startServer();
const health = createServer((request, response) => {
    if (request.url === "/health") {
        response.writeHead(200, { "content-type": "text/plain" });
        response.end("ok");
        return;
    }
    response.writeHead(404);
    response.end();
});
health.listen(8081, "127.0.0.1");

function shutdown(): void {
    // `WebSocketServer.close()` stops accepting new peers but leaves existing
    // sockets alive. Terminate those clients so Playwright can reap this server.
    for (const client of bootstrap.getWebSocketServer().clients) client.terminate();
    health.close();
    bootstrap.stop();
    // Bound teardown even if a socket/server close callback fails to fire.
    setTimeout(() => process.exit(0), 750);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
