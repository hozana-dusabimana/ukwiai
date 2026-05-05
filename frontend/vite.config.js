import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        // Some browsers issue HTTP/2 to the dev server which gets downgraded
        // to HTTP/1.1 for the proxy hop. Be explicit about timeouts so we
        // never get a silent connection reset on a streamed file response.
        timeout: 60_000,
        proxyTimeout: 60_000,
        // Prevent the proxy from mangling streamed binary responses.
        ws: false,
        secure: false,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.js"],
  },
});
