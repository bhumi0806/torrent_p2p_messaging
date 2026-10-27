import { startServer } from "./index";

async function main(): Promise<void> {

    try {

        startServer();

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
