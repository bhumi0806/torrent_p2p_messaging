import { PeerId } from "../identity/valueObjects/PeerID";

export interface CandidatePairDiagnostic {
    readonly localCandidateType?: string;
    readonly remoteCandidateType?: string;
    readonly protocol?: string;
    readonly relayProtocol?: string;
    readonly state?: string;
}

export interface WebRTCDiagnosticSnapshot {
    readonly peerId: string;
    readonly signalingState: RTCSignalingState;
    readonly iceGatheringState: RTCIceGatheringState;
    readonly iceConnectionState: RTCIceConnectionState;
    readonly connectionState: RTCPeerConnectionState;
    readonly dataChannelState?: RTCDataChannelState;
    readonly connectedForMs?: number;
    readonly selectedCandidatePair?: CandidatePairDiagnostic;
}

export interface WebRTCConnectionAttemptMetadata {
    readonly attemptId: string;
    readonly initiatorPeerId: string;
    readonly targetPeerId: string;
}

/** Logs connection lifecycle and candidate types without addresses or payload data. */
export class WebRTCDiagnostics {
    private static readonly ESTABLISHMENT_TIMEOUT_MS = 30_000;
    private readonly startedAt = new WeakMap<RTCPeerConnection, number>();
    private readonly connectedAt = new WeakMap<RTCPeerConnection, number>();
    private readonly tracked = new WeakSet<RTCPeerConnection>();
    private readonly trackedChannels = new WeakSet<RTCDataChannel>();
    private readonly timeoutTimers = new WeakMap<RTCPeerConnection, number>();
    private readonly attempts = new WeakMap<RTCPeerConnection, WebRTCConnectionAttemptMetadata>();

    public trackPeerConnection(
        peerId: PeerId,
        peerConnection: RTCPeerConnection,
        attempt?: WebRTCConnectionAttemptMetadata
    ): void {
        if (this.tracked.has(peerConnection)) return;
        this.tracked.add(peerConnection);
        if (attempt) this.attempts.set(peerConnection, attempt);
        this.startedAt.set(peerConnection, performance.now());
        const timeoutTimer = window.setTimeout(() => {
            if (peerConnection.connectionState !== "connected") {
                this.log(peerId, "connection-establishment-timeout", peerConnection, undefined, {
                    timeoutMs: WebRTCDiagnostics.ESTABLISHMENT_TIMEOUT_MS
                });
            }
        }, WebRTCDiagnostics.ESTABLISHMENT_TIMEOUT_MS);
        this.timeoutTimers.set(peerConnection, timeoutTimer);
        const report = (event: string, extra: Record<string, unknown> = {}) => {
            this.log(peerId, event, peerConnection, undefined, extra);
        };

        peerConnection.addEventListener("icegatheringstatechange", () => {
            report("ice-gathering-state");
        });
        peerConnection.addEventListener("iceconnectionstatechange", () => {
            report("ice-connection-state");
            if (peerConnection.iceConnectionState === "connected" ||
                peerConnection.iceConnectionState === "completed") {
                void this.reportSelectedPair(peerId, peerConnection);
            }
        });
        peerConnection.addEventListener("connectionstatechange", () => {
            if (peerConnection.connectionState === "connected" && !this.connectedAt.has(peerConnection)) {
                this.connectedAt.set(peerConnection, performance.now());
            }
            if (peerConnection.connectionState === "connected" || peerConnection.connectionState === "failed" ||
                peerConnection.connectionState === "closed") {
                window.clearTimeout(this.timeoutTimers.get(peerConnection));
            }
            report("peer-connection-state");
            if (peerConnection.connectionState === "connected") {
                void this.reportSelectedPair(peerId, peerConnection);
            }
        });
        peerConnection.addEventListener("icecandidate", event => {
            const candidate = (event as RTCPeerConnectionIceEvent).candidate;
            if (candidate) {
                report("local-candidate", {
                    candidateType: candidate.type,
                    protocol: candidate.protocol,
                    relayProtocol: (candidate as RTCIceCandidate & { relayProtocol?: string }).relayProtocol
                });
            } else {
                report("ice-candidates-gathered");
            }
        });
        peerConnection.addEventListener("icecandidateerror", event => {
            const candidateError = event as RTCPeerConnectionIceErrorEvent;
            report("ice-candidate-error", { errorCode: candidateError.errorCode });
        });
        report("peer-connection-created");
    }

    public trackDataChannel(
        peerId: PeerId,
        peerConnection: RTCPeerConnection,
        channel: RTCDataChannel
    ): void {
        if (this.trackedChannels.has(channel)) return;
        this.trackedChannels.add(channel);
        const report = (event: string, extra: Record<string, unknown> = {}) => {
            this.log(peerId, event, peerConnection, channel, extra);
        };
        channel.addEventListener("open", () => {
            report("data-channel-open", {
                establishmentMs: Math.round(performance.now() - (this.startedAt.get(peerConnection) ?? performance.now()))
            });
            void this.reportSelectedPair(peerId, peerConnection);
        });
        channel.addEventListener("close", () => report("data-channel-close"));
        channel.addEventListener("error", () => report("data-channel-error"));
    }

    public async snapshot(
        peerId: PeerId,
        peerConnection: RTCPeerConnection,
        channel?: RTCDataChannel
    ): Promise<WebRTCDiagnosticSnapshot> {
        return {
            peerId: peerId.toString(),
            signalingState: peerConnection.signalingState,
            iceGatheringState: peerConnection.iceGatheringState,
            iceConnectionState: peerConnection.iceConnectionState,
            connectionState: peerConnection.connectionState,
            dataChannelState: channel?.readyState,
            connectedForMs: this.connectedAt.has(peerConnection)
                ? Math.round(performance.now() - this.connectedAt.get(peerConnection)!)
                : undefined,
            selectedCandidatePair: await this.readSelectedPair(peerConnection)
        };
    }

    private async reportSelectedPair(peerId: PeerId, peerConnection: RTCPeerConnection): Promise<void> {
        try {
            this.log(peerId, "selected-candidate-pair", peerConnection, undefined, {
                candidatePair: await this.readSelectedPair(peerConnection)
            });
        } catch {
            this.log(peerId, "candidate-pair-stats-unavailable", peerConnection);
        }
    }

    private async readSelectedPair(peerConnection: RTCPeerConnection): Promise<CandidatePairDiagnostic | undefined> {
        const stats = await peerConnection.getStats();
        const reports: Array<Record<string, any>> = [];
        stats.forEach(report => reports.push(report as unknown as Record<string, any>));
        const reportsById = new Map(reports.map(report => [report.id, report]));
        const transport = reports.find(report => report.type === "transport" && report.selectedCandidatePairId);
        const pair = (transport && reportsById.get(transport.selectedCandidatePairId))
            ?? reports.find(report => report.type === "candidate-pair" && report.state === "succeeded" &&
                (report.selected === true || report.nominated === true));
        if (!pair) return undefined;
        const local = reportsById.get(pair.localCandidateId);
        const remote = reportsById.get(pair.remoteCandidateId);
        return {
            localCandidateType: local?.candidateType,
            remoteCandidateType: remote?.candidateType,
            protocol: pair.protocol ?? local?.protocol ?? remote?.protocol,
            relayProtocol: local?.relayProtocol ?? remote?.relayProtocol,
            state: pair.state
        };
    }

    private log(
        peerId: PeerId,
        event: string,
        peerConnection: RTCPeerConnection,
        channel?: RTCDataChannel,
        extra: Record<string, unknown> = {}
    ): void {
        const startedAt = this.startedAt.get(peerConnection);
        console.info("[WebRTC diagnostics]", {
            event,
            peerId: `${peerId.toString().slice(0, 12)}…`,
            attemptId: this.attempts.get(peerConnection)?.attemptId,
            initiatorPeerId: this.attempts.get(peerConnection)?.initiatorPeerId.slice(0, 12),
            targetPeerId: this.attempts.get(peerConnection)?.targetPeerId.slice(0, 12),
            elapsedMs: startedAt === undefined ? undefined : Math.round(performance.now() - startedAt),
            signalingState: peerConnection.signalingState,
            iceGatheringState: peerConnection.iceGatheringState,
            iceConnectionState: peerConnection.iceConnectionState,
            connectionState: peerConnection.connectionState,
            dataChannelState: channel?.readyState,
            ...extra
        });
    }
}
