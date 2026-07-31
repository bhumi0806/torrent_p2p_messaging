import { PeerId } from "../identity/valueObjects/PeerID";

import { HeartbeatManager } from "../heartbeat/HeartbeatManager";

import { ApplicationContext } from "./ApplicationContext";
import { EventBus } from "./EventBus";

export class HeartbeatController {

    constructor(

        private readonly heartbeatManager: HeartbeatManager,

        private readonly eventBus: EventBus,

        private readonly context: ApplicationContext

    ) {}

    /**
     * Start heartbeat for a connected peer.
     */
    public start(

        peerId: PeerId

    ): void {

        const connection =

            this.context.getConnection(
                peerId
            );

        if (!connection) {

            throw new Error(
                "Peer connection not found."
            );

        }

        this.heartbeatManager.start(

            connection,

            peerId

        );

    }

    /**
     * Receive heartbeat.
     */
    public receive(

        senderId: PeerId,

        encryptedHeartbeat: string

    ): void {

        this.heartbeatManager.receive(

            senderId,

            encryptedHeartbeat

        );

        this.eventBus.emit(

            "HEARTBEAT_RECEIVED",

            senderId

        );

    }

    /**
     * Stop heartbeat scheduler.
     */
    public stop(): void {

        this.heartbeatManager.stop();

    }

    /**
     * Check peer status.
     */
    public checkPeer(

        peerId: PeerId

    ): void {

        const status =

            this.heartbeatManager.getPeerStatus(

                peerId

            );

        this.eventBus.emit(

            "PEER_STATUS_CHANGED",

            {

                peerId,

                status

            }

        );

    }

    /**
     * Register events.
     */
    public register(): void {

        this.eventBus.on(

            "PEER_CONNECTED",

            () => {
                const heartbeatStatus = document.getElementById("heartbeatStatus");
                if (heartbeatStatus) {
                    heartbeatStatus.textContent = "Disabled";
                }
            }

        );

        this.eventBus.on(

            "HEARTBEAT_PACKET",

            (payload: {

                senderId: PeerId;

                encryptedHeartbeat: string;

            }) => {

                this.receive(

                    payload.senderId,

                    payload.encryptedHeartbeat

                );

            }

        );

        this.eventBus.on(

            "CHECK_PEER_STATUS",

            (peerId: PeerId) => {

                this.checkPeer(

                    peerId

                );

            }

        );

        this.eventBus.on(

            "PEER_DISCONNECTED",

            () => {

                this.stop();

            }

        );

    }

}
