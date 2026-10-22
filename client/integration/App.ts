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
import { InviteManager, ParsedInvite } from "../invites/InviteManager";
import { FreenetEngine } from "../utils/FreenetEngine";


export class App {

    private readonly eventBus =
        new EventBus();
    private readonly context =
        new ApplicationContext();
    private activePeerId?: string;
    private verifiedInvite?: ParsedInvite;

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

                this.context,

                (metadata, file) => {
                    this.eventBus.emit(
                        "FILE_RECEIVED",
                        {
                            metadata,
                            file
                        }
                    );
                }

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
        this.setupInviteUI();
        this.setupChatUI();
        this.setupFileUI();
        this.setupApplicationLog();
        this.loginController.fillUsernameFromStorage();

        await this.restoreStoredSession();
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
            const debugDiv = document.getElementById("log") as HTMLPreElement;

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
                await this.eventBus.emit("CONNECT_TO_PEER", selectedPeerId);
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

    private setupInviteUI(): void {
        const inviteLink = document.getElementById("inviteLink") as HTMLInputElement;
        const publicFingerprint = document.getElementById("publicFingerprint") as HTMLInputElement;
        const incomingInvite = document.getElementById("incomingInvite") as HTMLInputElement;
        const copyInviteBtn = document.getElementById("copyInviteBtn") as HTMLButtonElement;
        const verifyInviteBtn = document.getElementById("verifyInviteBtn") as HTMLButtonElement;
        const connectInviteBtn = document.getElementById("connectInviteBtn") as HTMLButtonElement;
        const inviteQr = document.getElementById("inviteQr") as HTMLImageElement;
        const inviteStatus = document.getElementById("inviteStatus") as HTMLDivElement;

        if (
            !inviteLink ||
            !publicFingerprint ||
            !incomingInvite ||
            !copyInviteBtn ||
            !verifyInviteBtn ||
            !connectInviteBtn ||
            !inviteQr ||
            !inviteStatus
        ) {
            console.warn("Invite controls not found in HTML");
            return;
        }

        const setInviteStatus = (
            message: string,
            color: string = "#333"
        ) => {
            inviteStatus.textContent = message;
            inviteStatus.style.color = color;
        };

        const updateLocalInvite = async () => {
            const identity = this.context.getIdentity();

            if (!identity) {
                return;
            }

            const localInvite =
                await InviteManager.createInvite(identity.getPrivateIdentity());

            const localInviteLink =
                await InviteManager.createInviteLink(identity.getPrivateIdentity());

            inviteLink.value = localInviteLink;
            publicFingerprint.value = localInvite.fingerprint;
            inviteQr.src = InviteManager.createQrImageUrl(localInviteLink);
        };

        const incomingFromUrl =
            InviteManager.getInviteFromCurrentUrl();

        if (incomingFromUrl) {
            incomingInvite.value = incomingFromUrl;
        }

        copyInviteBtn.addEventListener("click", async () => {
            if (!inviteLink.value) {
                return;
            }

            await navigator.clipboard.writeText(inviteLink.value);
            setInviteStatus("Invite copied", "green");
        });

        verifyInviteBtn.addEventListener("click", async () => {
            try {
                this.verifiedInvite =
                    await InviteManager.parseInviteLink(incomingInvite.value);

                if (!this.verifiedInvite.verified) {
                    setInviteStatus("Invite verification failed", "red");
                    return;
                }

                setInviteStatus(
                    `Verified ${this.verifiedInvite.payload.username}: ${this.verifiedInvite.payload.fingerprint}`,
                    "green"
                );
            } catch (error) {
                this.verifiedInvite = undefined;
                setInviteStatus(
                    `Invalid invite: ${error instanceof Error ? error.message : String(error)}`,
                    "red"
                );
            }
        });

        connectInviteBtn.addEventListener("click", async () => {
            if (!this.verifiedInvite?.verified) {
                verifyInviteBtn.click();
            }

            if (!this.verifiedInvite?.verified) {
                return;
            }

            const peerId =
                this.verifiedInvite.payload.peerId;

            const peer =
                this.context
                    .getOnlinePeers()
                    .find(
                        (onlinePeer: any) =>
                            onlinePeer?.peerId === peerId
                    );

            if (!peer) {
                setInviteStatus("Invited peer is not online", "red");
                return;
            }

            if (peer.publicKey !== this.verifiedInvite.payload.publicKey) {
                setInviteStatus("Online peer key does not match invite", "red");
                return;
            }

            await this.eventBus.emit("CONNECT_TO_PEER", peerId);
            setInviteStatus("Connecting to invite peer", "green");
        });

        this.eventBus.on("LOGIN_SUCCESS", async () => {
            await updateLocalInvite();
        });
    }

    private setupChatUI(): void {
        const userList = document.getElementById("userList") as HTMLSelectElement;
        const sendBtn = document.getElementById("sendBtn") as HTMLButtonElement;
        const messageInput = document.getElementById("msg") as HTMLInputElement;
        const chatWindow = document.getElementById("chatWindow") as HTMLDivElement;
        const connectedPeers = document.getElementById("connectedPeers") as HTMLUListElement;
        const status = document.getElementById("status") as HTMLElement;

        if (!sendBtn || !messageInput || !chatWindow) {
            console.warn("Chat controls not found in HTML");
            return;
        }

        const appendMessage = (label: string, content: string) => {
            const row = document.createElement("div");
            row.textContent = `${label}: ${content}`;
            chatWindow.appendChild(row);
            chatWindow.scrollTop = chatWindow.scrollHeight;
        };

        const renderConnectedPeers = () => {
            if (!connectedPeers) {
                return;
            }

            connectedPeers.innerHTML = "";

            const connectedPeerIds = this.context.getOpenConnectedPeerIds();

            if (connectedPeerIds.length === 0) {
                return;
            }

            for (const peerId of connectedPeerIds) {
                const item = document.createElement("li");
                const button = document.createElement("button");
                button.textContent = peerId === this.activePeerId
                    ? `Active: ${peerId.substring(0, 12)}...`
                    : `${peerId.substring(0, 12)}...`;
                button.addEventListener("click", () => {
                    this.activePeerId = peerId;
                    renderConnectedPeers();
                });
                item.appendChild(button);
                connectedPeers.appendChild(item);
            }
        };

        sendBtn.addEventListener("click", async () => {
            const selectedPeerId = this.getActivePeerId();
            const content = messageInput.value.trim();

            if (!selectedPeerId) {
                alert("Please select a connected peer first");
                return;
            }

            if (!content) {
                return;
            }

            try {
                await this.eventBus.emit("SEND_MESSAGE", {
                    receiverId: selectedPeerId,
                    content
                });
                appendMessage("Me", content);
                messageInput.value = "";
            } catch (error) {
                console.error("Send failed:", error);
                alert(`Failed to send: ${error instanceof Error ? error.message : String(error)}`);
            }
        });

        messageInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                sendBtn.click();
            }
        });

        this.eventBus.on("PEER_CONNECTED", (peerId: any) => {
            this.activePeerId = peerId.toString();
            if (status) {
                status.textContent = "Connected";
            }
            console.log("Peer connected:", peerId.toString());
            renderConnectedPeers();
        });

        this.eventBus.on("PEER_DISCONNECTED", () => {
            if (status) {
                status.textContent = "Offline";
            }
            if (connectedPeers) {
                connectedPeers.innerHTML = "";
            }
            this.activePeerId = undefined;
        });

        this.eventBus.on("MESSAGE_RECEIVED", (payload: any) => {
            this.activePeerId = payload.senderId.toString();
            renderConnectedPeers();
            appendMessage("Peer", payload.plaintext ?? "");
        });
    }

    private setupFileUI(): void {
        const sendFileBtn = document.getElementById("sendFileBtn") as HTMLButtonElement;
        const fileInput = document.getElementById("fileInput") as HTMLInputElement;
        const fileProgress = document.getElementById("fileProgress") as HTMLProgressElement;
        const chatWindow = document.getElementById("chatWindow") as HTMLDivElement;

        if (!sendFileBtn || !fileInput || !fileProgress) {
            console.warn("File controls not found in HTML");
            return;
        }

        sendFileBtn.addEventListener("click", async () => {
            const receiverId = this.getActivePeerId();
            const file = fileInput.files?.[0];

            if (!receiverId) {
                alert("Connect to a peer first");
                return;
            }

            if (!file) {
                alert("Choose a file first");
                return;
            }

            try {
                const bytes = new Uint8Array(
                    await file.arrayBuffer()
                );

                fileProgress.value = 0;

                await this.eventBus.emit("SEND_FILE", {
                    receiverId,
                    fileName: file.name,
                    mimeType: file.type || "application/octet-stream",
                    fileBytes: bytes
                });
            } catch (error) {
                console.error("File send failed:", error);
                alert(`Failed to send file: ${error instanceof Error ? error.message : String(error)}`);
            }
        });

        this.eventBus.on("FILE_UPLOAD_PROGRESS", (payload: any) => {
            fileProgress.value = payload.progress ?? 0;
        });

        this.eventBus.on("FILE_SENT", () => {
            fileProgress.value = 100;
        });

        this.eventBus.on("FILE_RECEIVED", (payload: any) => {
            const blob = new Blob(
                [payload.file],
                {
                    type: payload.metadata.getMimeType()
                }
            );
            const url = URL.createObjectURL(blob);
            const row = document.createElement("div");
            const link = document.createElement("a");
            link.href = url;
            link.download = payload.metadata.getFileName();
            link.textContent = `Received file: ${payload.metadata.getFileName()}`;
            row.appendChild(link);
            chatWindow?.appendChild(row);
        });
    }

    private setupApplicationLog(): void {
        const log = document.getElementById("log") as HTMLPreElement;

        if (!log) {
            return;
        }

        const append = (message: string) => {
            const time = new Date().toLocaleTimeString();
            log.textContent += `[${time}] ${message}\n`;
            log.scrollTop = log.scrollHeight;
        };

        this.eventBus.on("LOGIN_SUCCESS", () => append("Logged in"));
        this.eventBus.on("ONLINE_PEERS_UPDATED", (peers: any[]) => append(`Online peers: ${peers.length}`));
        this.eventBus.on("PEER_CONNECTED", (peerId: any) => append(`Connected: ${peerId.toString()}`));
        this.eventBus.on("MESSAGE_RECEIVED", () => append("Message received"));
        this.eventBus.on("FILE_SENT", () => append("File sent"));
        this.eventBus.on("FILE_RECEIVED", (payload: any) => append(`File received: ${payload.metadata.getFileName()}`));
        this.eventBus.on("BOOTSTRAP_ERROR", (packet: any) => append(`Bootstrap error: ${JSON.stringify(packet.payload)}`));
    }

    private async restoreStoredSession(): Promise<void> {

        const errorDiv =
            document.getElementById("loginErrorMessage") as HTMLDivElement | null;

        try {
            await this.loginController.restoreStoredLogin();
        } catch (error) {
            console.warn("Stored login restore failed:", error);

            if (errorDiv) {
                errorDiv.textContent =
                    `Stored login restore failed: ${
                        error instanceof Error
                            ? error.message
                            : String(error)
                    }`;
                errorDiv.style.display = "block";
            }
        }

    }

    private getActivePeerId(): string | undefined {
        if (
            this.activePeerId &&
            this.context.getDataChannel(this.activePeerId)?.isOpen()
        ) {
            return this.activePeerId;
        }

        return this.context.getOpenConnectedPeerIds()[0];
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
