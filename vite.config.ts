import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { output: { manualChunks: { terminal: ["@xterm/xterm", "@xterm/addon-fit"] } } } },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:4188",
      "/terminal": { target: "ws://127.0.0.1:4188", ws: true },
      "/events": { target: "ws://127.0.0.1:4188", ws: true },
    },
  },
});
