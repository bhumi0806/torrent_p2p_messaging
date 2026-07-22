import { BootstrapClient } from "../bootstrap/bootstrapClient";

import { ApplicationContext } from "./ApplicationContext";
import { EventBus } from "./EventBus";
import { resolveBootstrapUrl } from "../bootstrap/bootstrapConfig";

export class BootstrapController {

    constructor(

        private readonly bootstrapClient: BootstrapClient,

        private readonly eventBus: EventBus,

        private readonly context: ApplicationContext

    ) {}

    /**
     * Connect to the bootstrap server.
     */
    public async connect(): Promise<void> {

        await this.bootstrapClient.connect(
            resolveBootstrapUrl()
        );

        this.eventBus.emit(

            "BOOTSTRAP_CONNECTED"

        );

    }

    /**
     * Disconnect from the bootstrap server.
     */
    public async disconnect(): Promise<void> {

        await this.bootstrapClient.disconnect();

        this.eventBus.emit(

            "BOOTSTRAP_DISCONNECTED"

        );

    }

    /**
     * Synchronize online peers.
     */
    public async synchronizePeers(): Promise<void> {

        const peers =

            (await this.bootstrapClient.getOnlinePeers()) as any[];

        this.context.setOnlinePeers(

            peers

        );

        this.eventBus.emit(

            "ONLINE_PEERS_UPDATED",

            peers

        );

    }

    /**
     * Register bootstrap events.
     */
    public register(): void {

        this.eventBus.on(

            "LOGIN_SUCCESS",

            async () => {

                await this.synchronizePeers();

            }

        );

        this.eventBus.on(

            "PEER_REGISTERED",

            async () => {

                await this.synchronizePeers();

            }

        );

        this.eventBus.on(

            "PEER_DISCONNECTED",

            async () => {

                await this.synchronizePeers();

            }

        );

        this.eventBus.on(

            "REFRESH_PEERS",

            async () => {

                await this.synchronizePeers();

            }

        );

    }

}