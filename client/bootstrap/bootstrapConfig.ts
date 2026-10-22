// Look inside your client/bootstrap/bootstrapConfig.ts file:
export function resolveBootstrapUrl(): string {
    // 1. Check if the URL bar has a query parameter like ?server=wss://...
    const urlParams = new URLSearchParams(window.location.search);
    const parameterUrl = urlParams.get("server");
    
    if (parameterUrl) {
        return parameterUrl;
    }

    // 2. Fallback to an environment variable if defined in Vercel
    if ((window as any).env?.VITE_BOOTSTRAP_SERVER_URL) {
        return (window as any).env.VITE_BOOTSTRAP_SERVER_URL;
    }

    // 3. Last resort prompt so the UI doesn't crash if you forget the parameter
    const manualInput = prompt("Enter active Cloudflare Tunnel WebSocket URL (ws:// or wss://):");
    return manualInput || "ws://localhost:8080";
}
