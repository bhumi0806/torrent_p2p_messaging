import { defineConfig } from "vite";

export default defineConfig({
    // Bootstrap uses its own explicit WebSocket URL. Proxying the `/bootstrap`
    // path captures Vite's `/bootstrap/*.ts` module requests and returns 426.
});
