import { PeerConnection } from "./models/PeerConnection";

export class IceCandidateManager {

    /**
     * Register local ICE callback.
     */
    public registerLocalCandidateHandler(
        peerConnection: PeerConnection,
        callback: (candidate: RTCIceCandidate) => void
    ): void {

        peerConnection
            .getConnection()
            .onicecandidate = (event) => {

                if (event.candidate) {

                    callback(event.candidate);

                }

            };

    }

    /**
     * Add remote ICE candidate.
     */
    public async addRemoteCandidate(
        peerConnection: PeerConnection,
        candidate: RTCIceCandidateInit
    ): Promise<void> {

        await peerConnection
            .getConnection()
            .addIceCandidate(

                new RTCIceCandidate(candidate)

            );

    }

}