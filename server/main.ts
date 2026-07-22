import { BootstrapServer } from "./bootstrap/bootstrapServer";

async function main(): Promise<void> {

    try {

        const server = new BootstrapServer();

        server.start();

        process.on(
            "SIGINT",
            () => {

                console.log("\nShutting down Bootstrap Server...");

                server.stop();

                process.exit(0);

            }
        );

        process.on(
            "SIGTERM",
            () => {

                console.log("\nShutting down Bootstrap Server...");

                server.stop();

                process.exit(0);

            }
        );

    }

    catch (error) {

        console.error(
            "Failed to start Bootstrap Server:",
            error
        );

        process.exit(1);

    }

}

main();