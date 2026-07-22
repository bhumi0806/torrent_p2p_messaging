import { PeerId } from "../identity/valueObjects/PeerID";

import { ReconnectionManager } from "../reconnection/ReconnectionManager";

import { ApplicationContext } from "./ApplicationContext";
import { EventBus } from "./EventBus";

export class ReconnectionController {

    constructor(

        private readonly reconnectionManager: ReconnectionManager,

        private readonly eventBus: EventBus,

        private readonly context: ApplicationContext

    ) {}

    /**
     * Start reconnection process.
     */
    public async reconnect(

        peerId: PeerId

    ): Promise<void> {

        const connection =

            this.context.getConnection(
                peerId
            );

        if (!connection) {

            throw new Error(
                "Peer connection not found."
            );

        }

        const restoredConnection =

            await this.reconnectionManager.reconnect(

                peerId,

                connection

            );

        this.context.addConnection(

            peerId,

            restoredConnection

        );

        this.eventBus.emit(

            "PEER_RECONNECTED",

            peerId

        );

    }

    /**
     * Cancel reconnection.
     */
    public cancel(

        peerId: PeerId

    ): void {

        this.reconnectionManager.cancel(

            peerId

        );

        this.eventBus.emit(

            "RECONNECTION_CANCELLED",

            peerId

        );

    }

    /**
     * Check reconnection state.
     */
    public checkState(

        peerId: PeerId

    ): void {

        const state =

            this.reconnectionManager.getState(

                peerId

            );

        this.eventBus.emit(

            "RECONNECTION_STATE",

            {

                peerId,

                state

            }

        );

    }

    /**
     * Register application events.
     */
    public register(): void {

        this.eventBus.on(

            "PEER_CONNECTION_LOST",

            async (peerId: PeerId) => {

                await this.reconnect(

                    peerId

                );

            }

        );

        this.eventBus.on(

            "RECONNECT_PEER",

            async (peerId: PeerId) => {

                await this.reconnect(

                    peerId

                );

            }

        );

        this.eventBus.on(

            "CANCEL_RECONNECTION",

            (peerId: PeerId) => {

                this.cancel(

                    peerId

                );

            }

        );

        this.eventBus.on(

            "CHECK_RECONNECTION_STATE",

            (peerId: PeerId) => {

                this.checkState(

                    peerId

                );

            }

        );

    }

}