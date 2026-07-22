import { PeerId } from "../identity/valueObjects/PeerID";

import { EncryptionManager } from "../encryption/EncryptionManager";

import { WebRTCManager } from "../webrtc/WebRTCManager";
import { PeerConnection } from "../webrtc/models/PeerConnection";

import { HeartbeatScheduler } from "./HeartbeatScheduler";
import { HeartbeatSender } from "./HeartbeatSender";
import { HeartbeatReceiver } from "./HeartbeatReceiver";
import { HeartbeatMonitor } from "./HeartbeatMonitor";

import { PeerStatus } from "./types/PeerStatus";
import { ApplicationContext } from "../integration/ApplicationContext";

export class HeartbeatManager {

    private readonly scheduler =
        new HeartbeatScheduler();

    private readonly monitor =
        new HeartbeatMonitor();

    private readonly sender: HeartbeatSender;

    private readonly receiver: HeartbeatReceiver;

    constructor(

        encryptionManager: EncryptionManager,

        webRTCManager: WebRTCManager,

        context: ApplicationContext,

    ) {

        this.sender =

            new HeartbeatSender(

                encryptionManager,

                webRTCManager,

                context

            );

        this.receiver =

            new HeartbeatReceiver(

                encryptionManager,

                this.monitor

            );

    }

    /**
     * Start heartbeat scheduler.
     */
    public start(

        connection: PeerConnection,

        remotePeerId: PeerId

    ): void {

        this.scheduler.start(

            () => {

                this.sender.send(

                    connection,

                    remotePeerId

                );

                this.monitor.refreshStatuses();

            }

        );

    }

    /**
     * Stop heartbeat scheduler.
     */
    public stop(): void {

        this.scheduler.stop();

    }

    /**
     * Receive heartbeat.
     */
    public receive(

        senderId: PeerId,

        encryptedHeartbeat: string

    ): void {

        this.receiver.receive(

            senderId,

            encryptedHeartbeat

        );

    }

    /**
     * Get peer status.
     */
    public getPeerStatus(

        peerId: PeerId

    ): PeerStatus {

        return this.monitor.getStatus(

            peerId

        );

    }

    /**
     * Check whether peer is alive.
     */
    public isPeerAlive(

        peerId: PeerId

    ): boolean {

        return this.monitor.isAlive(

            peerId

        );

    }

    /**
     * Remove peer.
     */
    public removePeer(

        peerId: PeerId

    ): void {

        this.monitor.removePeer(

            peerId

        );

    }

    /**
     * Check if heartbeat scheduler is running.
     */
    public isRunning(): boolean {

        return this.scheduler.isRunning();

    }

}