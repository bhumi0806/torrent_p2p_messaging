export function resolveBootstrapUrl(defaultUrl: string = "ws://localhost:8080"): string {
    if (typeof window === "undefined") {
        return defaultUrl;
    }

    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("bootstrapUrl")?.trim();

    if (fromQuery) {
        return fromQuery;
    }

    const fromGlobal = (window as Window & { __BOOTSTRAP_URL__?: string }).__BOOTSTRAP_URL__;

    if (fromGlobal) {
        return fromGlobal;
    }

    const envUrl = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_BOOTSTRAP_URL;

    if (envUrl) {
        return envUrl;
    }

    if (
        window.location.protocol === "https:" &&
        !isLocalHost(window.location.hostname)
    ) {
        return `${window.location.origin.replace(/^http/, "ws")}/bootstrap`;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.hostname || "localhost";

    return `${protocol}//${host}:8080`;
}

function isLocalHost(hostname: string): boolean {
    return (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "[::1]" ||
        hostname === "::1"
    );
}
