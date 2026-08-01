import { defineConfig } from "vite";

export default defineConfig({
    server: {
        proxy: {
            "/bootstrap": {
                target: "ws://localhost:8080",
                ws: true
            }
        }
    }
});
