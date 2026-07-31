type RuntimeWindow = Window & {
    __ICE_SERVERS__?: RTCIceServer[];
    __ICE_TRANSPORT_POLICY__?: RTCIceTransportPolicy;
};

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
    {
        urls: [
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302",
            "stun:stun2.l.google.com:19302"
        ]
    },
    {
        urls: [
            "turn:openrelay.metered.ca:80",
            "turn:openrelay.metered.ca:443",
            "turn:openrelay.metered.ca:5349"
        ],
        username: "openrelayproject",
        credential: "openrelayproject"
    }
];

function parseIceServers(rawValue: string | null | undefined): RTCIceServer[] | undefined {
    if (!rawValue) {
        return undefined;
    }

    try {
        const parsed = JSON.parse(rawValue) as unknown;

        if (!Array.isArray(parsed)) {
            return undefined;
        }

        return parsed.filter((server): server is RTCIceServer => {
            if (!server || typeof server !== "object") {
                return false;
            }

            const urls = (server as RTCIceServer).urls;

            return typeof urls === "string"
                || Array.isArray(urls);
        });
    } catch {
        return undefined;
    }
}

function parseIceTransportPolicy(
    rawValue: string | null | undefined
): RTCIceTransportPolicy | undefined {
    if (rawValue === "all" || rawValue === "relay") {
        return rawValue;
    }

    return undefined;
}

export function resolveWebRTCConfiguration(): RTCConfiguration {
    if (typeof window === "undefined") {
        return {
            iceServers: DEFAULT_ICE_SERVERS,
            iceCandidatePoolSize: 0
        };
    }

    const runtimeWindow = window as RuntimeWindow;
    const params = new URLSearchParams(window.location.search);
    const env = (import.meta as ImportMeta & {
        env?: Record<string, string | undefined>;
    }).env;

    const iceServers =
        parseIceServers(params.get("iceServers"))
        ?? runtimeWindow.__ICE_SERVERS__
        ?? parseIceServers(env?.VITE_ICE_SERVERS_JSON)
        ?? DEFAULT_ICE_SERVERS;

    const iceTransportPolicy =
        parseIceTransportPolicy(params.get("iceTransportPolicy"))
        ?? runtimeWindow.__ICE_TRANSPORT_POLICY__
        ?? parseIceTransportPolicy(env?.VITE_ICE_TRANSPORT_POLICY);

    return {
        iceServers,
        iceTransportPolicy,
        iceCandidatePoolSize: 0
    };
}
