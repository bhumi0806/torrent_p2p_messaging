import { PeerId } from "../identity/valueObjects/PeerID";

import { BootstrapClient } from "../bootstrap/bootstrapClient";

import { IdentityManager } from "../identity/IdentityManager";

import { EncryptionManager } from "../encryption/EncryptionManager";

import { WebRTCManager } from "../webrtc/WebRTCManager";
import { PeerConnection } from "../webrtc/models/PeerConnection";

import { HeartbeatManager } from "../heartbeat/HeartbeatManager";

import { RetryPolicy } from "./RetryPolicy";
import { ReconnectionScheduler } from "./ReconnectionScheduler";
import { ConnectionRestorer } from "./ConnectionRestore";
import { SessionRestorer } from "./SessionRestore";

import { ReconnectionState } from "./models/ReconnectionState";
import { ReconnectionStatus } from "./types/ReconnectionStatus";
import { ApplicationContext } from "../integration/ApplicationContext";

export class ReconnectionManager {

    private readonly retryPolicy =
        new RetryPolicy();

    private readonly scheduler =
        new ReconnectionScheduler();

    private readonly connectionRestorer: ConnectionRestorer;

    private readonly sessionRestorer: SessionRestorer;

    private readonly states =
        new Map<string, ReconnectionState>();

    constructor(
        private readonly bootstrapClient: BootstrapClient,
        private readonly encryptionManager: EncryptionManager,
        private readonly webRTCManager: WebRTCManager,
        private readonly heartbeatManager: HeartbeatManager
    ) {

        this.connectionRestorer =
            new ConnectionRestorer(

                this.webRTCManager

            );

        this.sessionRestorer =
            new SessionRestorer(

                this.encryptionManager

            );

    }

    /**
     * Start reconnection.
     */
    public async reconnect(

        peerId: PeerId,

        oldConnection: PeerConnection

    ): Promise<PeerConnection> {

        let state =
            this.states.get(
                peerId.toString()
            );

        if (!state) {

            state =
                new ReconnectionState(

                    peerId,

                    ReconnectionStatus.IDLE,

                    0,

                    0,

                    5,

                    1000,

                    30000

                );

            this.states.set(

                peerId.toString(),

                state

            );

        }

        if (

            !this.heartbeatManager
                .getPeerStatus(peerId)

        ) {

            throw new Error(

                "Peer status unknown."

            );

        }

        while (

            state.canRetry()

        ) {

            try {

                state.setStatus(

                    ReconnectionStatus.RECONNECTING

                );

                const delay =

                    this.retryPolicy
                        .nextDelay(

                            state.getRetryCount()

                        );

                await this.scheduler.wait(

                    delay

                );

                const connection =

                    await this.connectionRestorer
                        .restore(

                            peerId,

                            oldConnection

                        );

                state.setStatus(

                    ReconnectionStatus.REKEYING

                );

                await this.sessionRestorer
                    .restore(

                        peerId

                    );

                state.setStatus(

                    ReconnectionStatus.CONNECTED

                );

                state.resetRetryCount();

                return connection;

            }

            catch(error) {

                state.incrementRetryCount();
                console.error(error);

            }

        }

        state.setStatus(

            ReconnectionStatus.MAX_RETRIES_EXCEEDED

        );

        throw new Error(

            "Maximum reconnection attempts exceeded."

        );

    }

    /**
     * Cancel reconnection.
     */
    public cancel(
        peerId: PeerId
    ): void {

        const state =

            this.states.get(
                peerId.toString()
            );

        if (!state) {

            return;

        }

        state.setStatus(

            ReconnectionStatus.CANCELLED

        );

    }

    /**
     * Get reconnection state.
     */
    public getState(
        peerId: PeerId
    ): ReconnectionState | undefined {

        return this.states.get(
            peerId.toString()
        );

    }

}