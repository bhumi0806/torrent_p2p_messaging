import { IdentityManager } from "../identity/IdentityManager";

import { BootstrapClient } from "../bootstrap/bootstrapClient";
import { BootstrapEventHandler } from "../bootstrap/bootstrapEventHandler";

import { WebRTCManager } from "../webrtc/WebRTCManager";

import { EncryptionManager } from "../encryption/EncryptionManager";

import { MessagingManager } from "../messaging/MessagingManager";

import { FileTransferManager } from "../FileTransfer/FileTransferManager";

import { HeartbeatManager } from "../heartbeat/HeartbeatManager";

import { ReconnectionManager } from "../reconnection/ReconnectionManager";

import { LoginController } from "./LoginController";
import { BootstrapController } from "./BootstrapController";
import { PeerDiscoveryController } from "./PeerDiscoveryController";
import { ConnectionController } from "./ConnectionController";
import { ChatController } from "./ChatController";
import { FileController } from "./FileController";
import { HeartbeatController } from "./HeartbeatController";
import { ReconnectionController } from "./ReconnectionController";

import { ApplicationContext } from "./ApplicationContext";
import { EventBus } from "./EventBus";
import { resolveBootstrapUrl } from "../bootstrap/bootstrapConfig";

export class App {

    private readonly eventBus =
        new EventBus();
    private readonly context =
        new ApplicationContext();

    private readonly identityManager =
        new IdentityManager();

    private readonly bootstrapClient: BootstrapClient;

    private readonly webRTCManager =
        new WebRTCManager();

    private readonly encryptionManager =
        new EncryptionManager();

    private readonly messagingManager =
        new MessagingManager(

            this.encryptionManager,

            this.webRTCManager,

            this.context

        );

    private readonly fileTransferManager: FileTransferManager;

    private readonly heartbeatManager: HeartbeatManager;

    private readonly reconnectionManager: ReconnectionManager;

    private readonly loginController!: LoginController;

    private readonly bootstrapController!: BootstrapController;

    private readonly peerDiscoveryController!: PeerDiscoveryController;

    private readonly connectionController!: ConnectionController;

    private readonly chatController!: ChatController;

    private readonly fileController!: FileController;

    private readonly heartbeatController!: HeartbeatController;

    private readonly reconnectionController!: ReconnectionController;

    constructor() {
        // Initialize BootstrapClient with a handler that will be updated later
        const handler = new BootstrapEventHandler(
            (packet) => this.handlePeerList(packet),
            (packet) => this.handlePeerJoined(packet),
            (packet) => this.handlePeerLeft(packet),
            (packet) => this.handleOfferPacket(packet),
            (packet) => this.handleAnswerPacket(packet),
            (packet) => this.handleIcePacket(packet),
            (packet) => this.eventBus.emit("BOOTSTRAP_ERROR", packet)
        );

        this.bootstrapClient = new BootstrapClient(handler);
        this.fileTransferManager =

            new FileTransferManager(

                this.encryptionManager,

                this.webRTCManager,

                this.context

            );

        this.heartbeatManager =

            new HeartbeatManager(

                this.encryptionManager,

                this.webRTCManager,

                this.context

            );

        this.reconnectionManager =

            new ReconnectionManager(
                this.bootstrapClient,
                this.encryptionManager,
                this.webRTCManager,
                this.heartbeatManager
            );

        this.loginController =
            new LoginController(
                this.identityManager,
                this.bootstrapClient,
                this.eventBus,
                this.context
            );

        this.bootstrapController =

            new BootstrapController(

                this.bootstrapClient,

                this.eventBus,

                this.context

            );

        this.peerDiscoveryController =

            new PeerDiscoveryController(

                this.bootstrapClient,

                this.eventBus,

                this.context

            );

        this.connectionController =

            new ConnectionController(

                this.webRTCManager,

                this.bootstrapClient,

                this.encryptionManager,

                this.eventBus,

                this.context

            );

        this.chatController =

            new ChatController(

                this.messagingManager,

                this.eventBus,

                this.context

            );

        this.fileController =

            new FileController(

                this.fileTransferManager,

                this.eventBus,

                this.context

            );

        this.heartbeatController =

            new HeartbeatController(

                this.heartbeatManager,

                this.eventBus,

                this.context

            );

        this.reconnectionController =

            new ReconnectionController(

                this.reconnectionManager,

                this.eventBus,

                this.context

            );

    }

    /**
     * Handle PEER_LIST packet from bootstrap server.
     */
    private handlePeerList(packet: any): void {
        const peers = Array.isArray(packet.payload) ? packet.payload : [];
        console.log("PEER_LIST received:", peers);
        this.bootstrapClient.getState().setPeerList(peers);
        this.eventBus.emit("PEER_LIST", peers);
        this.eventBus.emit("ONLINE_PEERS_UPDATED", peers);
    }

    /**
     * Handle PEER_JOINED packet from bootstrap server.
     */
    private handlePeerJoined(packet: any): void {
        const peer = packet.payload as any;
        if (!peer || typeof peer.peerId !== "string") {
            console.warn("Invalid PEER_JOINED payload:", packet.payload);
            return;
        }
        this.bootstrapClient.getState().addPeer(peer);
        const peers = this.bootstrapClient.getState().getPeerList();
        this.eventBus.emit("PEER_JOINED", peer);
        this.eventBus.emit("ONLINE_PEERS_UPDATED", peers);
    }

    /**
     * Handle PEER_LEFT packet from bootstrap server.
     */
    private handlePeerLeft(packet: any): void {
        const peer = packet.payload as any;
        if (!peer || typeof peer.peerId !== "string") {
            console.warn("Invalid PEER_LEFT payload:", packet.payload);
            return;
        }
        this.bootstrapClient.getState().removePeer(peer.peerId);
        const peers = this.bootstrapClient.getState().getPeerList();
        this.eventBus.emit("PEER_LEFT", peer);
        this.eventBus.emit("ONLINE_PEERS_UPDATED", peers);
    }

    private handleOfferPacket(packet: any): void {
        const payload = packet.payload as any;
        const senderId = payload?.senderPeerId;
        const offer = payload?.payload;

        if (!senderId || !offer) {
            console.warn("Invalid OFFER payload:", payload);
            return;
        }

        this.eventBus.emit("WEBRTC_OFFER", { senderId, offer });
    }

    private handleAnswerPacket(packet: any): void {
        const payload = packet.payload as any;
        const senderId = payload?.senderPeerId;
        const answer = payload?.payload;

        if (!senderId || !answer) {
            console.warn("Invalid ANSWER payload:", payload);
            return;
        }

        this.eventBus.emit("WEBRTC_ANSWER", { senderId, answer });
    }

    private handleIcePacket(packet: any): void {
        const payload = packet.payload as any;
        const senderId = payload?.senderPeerId;
        const candidate = payload?.payload;

        if (!senderId || !candidate) {
            console.warn("Invalid ICE_CANDIDATE payload:", payload);
            return;
        }

        this.eventBus.emit("WEBRTC_ICE", { senderId, candidate });
    }

    /**
     * Start application.
     */
    public async start(): Promise<void> {

        this.registerEvents();
        this.setupLoginUI();
        this.setupPeerListUI();
    }

    /**
     * Setup login UI and event handlers.
     */
    private setupLoginUI(): void {
        const loginBtn = document.getElementById("loginBtn");
        loginBtn?.addEventListener("click", async () => {
            const errorDiv = document.getElementById("loginErrorMessage") as HTMLDivElement;
            const successDiv = document.getElementById("loginSuccessMessage") as HTMLDivElement;
            
            // Clear previous messages
            if (errorDiv) errorDiv.style.display = "none";
            if (successDiv) successDiv.style.display = "none";
            
            try {
                await this.eventBus.emit("LOGIN");
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.error("Login failed:", error);
                if (errorDiv) {
                    errorDiv.textContent = `❌ ${errorMsg}`;
                    errorDiv.style.display = "block";
                }
            }
        });

        // Listen for login success
        this.eventBus.on("LOGIN_SUCCESS", () => {
            const successDiv = document.getElementById("loginSuccessMessage") as HTMLDivElement;
            const errorDiv = document.getElementById("loginErrorMessage") as HTMLDivElement;
            if (errorDiv) errorDiv.style.display = "none";
            if (successDiv) {
                successDiv.textContent = "✓ Login successful!";
                successDiv.style.display = "block";
            }
        });
    }

    /**
     * Setup peer list UI and event handlers.
     */
    private setupPeerListUI(): void {
        const userList = document.getElementById("userList") as HTMLSelectElement;
        const connectBtn = document.getElementById("connectSelected") as HTMLButtonElement;
        const debugDiv = document.getElementById("applicationLog") as HTMLDivElement;

        if (!userList || !connectBtn) {
            console.warn("User list or connect button not found in HTML");
            return;
        }

        // Add debug logging
        const logMessage = (msg: string) => {
            console.log(msg);
            if (debugDiv) {
                debugDiv.innerHTML += msg + "<br>";
            }
        };

        // Update user list when peers are updated
        this.eventBus.on("PEER_LIST_UPDATED", (peers: any[]) => {
            logMessage("PEER_LIST_UPDATED event received with peers: " + JSON.stringify(peers));
            this.updateUserListUI(userList, peers);
        });

        // Also listen to ONLINE_PEERS_UPDATED from BootstrapController
        this.eventBus.on("ONLINE_PEERS_UPDATED", (peers: any[]) => {
            logMessage("ONLINE_PEERS_UPDATED event received with peers: " + JSON.stringify(peers));
            this.updateUserListUI(userList, peers);
        });

        // Handle connect button
        connectBtn.addEventListener("click", async () => {
            const selectedPeerId = userList.value;
            if (!selectedPeerId) {
                alert("Please select a peer to connect to");
                return;
            }

            try {
                this.eventBus.emit("CONNECT_TO_PEER", selectedPeerId);
            } catch (error) {
                console.error("Connection failed:", error);
                alert(`Failed to connect: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    }

    /**
     * Update the user list HTML element.
     */
    private updateUserListUI(userList: HTMLSelectElement, peers: any[]): void {
        const currentSelection = userList.value;
        userList.innerHTML = "";

        peers.forEach(peer => {
            const option = document.createElement("option");
            option.value = peer.peerId;
            option.textContent = `${peer.username} (${peer.peerId.substring(0, 8)}...)`;
            userList.appendChild(option);
        });

        // Restore selection if possible
        if (currentSelection && Array.from(userList.options).some(opt => opt.value === currentSelection)) {
            userList.value = currentSelection;
        }
    }
    

    /**
     * Register application events.
     */
    private registerEvents(): void {

        this.loginController.register();

        this.bootstrapController.register();

        this.peerDiscoveryController.register();

        this.connectionController.register();

        this.chatController.register();

        this.fileController.register();

        this.heartbeatController.register();

        this.reconnectionController.register();

    }

    /**
     * Shutdown application.
     */
    public async shutdown(): Promise<void> {

        await this.bootstrapController.disconnect();

        this.heartbeatController.stop();

        this.context.clear();

    }

}