const BOOTSTRAP_URL_STORAGE_KEY = "bleep.bootstrapUrl";

function normalizeBootstrapUrl(value: string): string {
    const trimmedValue = value.trim();
    const withWebSocketProtocol = trimmedValue.startsWith("https://")
        ? `wss://${trimmedValue.slice("https://".length)}`
        : trimmedValue.startsWith("http://")
            ? `ws://${trimmedValue.slice("http://".length)}`
            : trimmedValue;
    const parsedUrl = new URL(withWebSocketProtocol);

    if (parsedUrl.protocol !== "ws:" && parsedUrl.protocol !== "wss:") {
        throw new Error("Bootstrap URL must use ws:// or wss://.");
    }

    return parsedUrl.toString();
}

export function resolveBootstrapUrl(): string {
    const urlParams = new URLSearchParams(window.location.search);
    const parameterUrl = urlParams.get("server");

    if (parameterUrl) {
        const bootstrapUrl = normalizeBootstrapUrl(parameterUrl);
        window.localStorage.setItem(
            BOOTSTRAP_URL_STORAGE_KEY,
            bootstrapUrl
        );
        return bootstrapUrl;
    }

    const env = (import.meta as ImportMeta & {
        env?: Record<string, string | undefined>;
    }).env;
    const environmentUrl =
        env?.VITE_BOOTSTRAP_SERVER_URL
        ?? env?.VITE_BOOTSTRAP_URL;

    if (environmentUrl) {
        return normalizeBootstrapUrl(environmentUrl);
    }

    const storedUrl = window.localStorage.getItem(BOOTSTRAP_URL_STORAGE_KEY);

    if (storedUrl) {
        return normalizeBootstrapUrl(storedUrl);
    }

    const manualInput = window.prompt(
        "Enter the bootstrap WebSocket URL (ws:// or wss://):"
    );
    const bootstrapUrl = manualInput?.trim()
        ? normalizeBootstrapUrl(manualInput)
        : "ws://localhost:8080";

    window.localStorage.setItem(
        BOOTSTRAP_URL_STORAGE_KEY,
        bootstrapUrl
    );

    return bootstrapUrl;
}
