import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wails from "@wailsio/runtime/plugins/vite";
import path from "path"
import tailwindcss from "@tailwindcss/vite"

const companionAPI =
  process.env.GOLDBUS_COMPANION_API?.trim() || "http://127.0.0.1:8765";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), wails("./bindings"), tailwindcss()],
  server: {
    host: "127.0.0.1",
    // When opening /companion.html on the Vite URL directly, forward API calls
    // to the Go companion listener (enable Phone companion in Settings first).
    proxy: {
      "/api": {
        target: companionAPI,
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        companion: path.resolve(__dirname, "companion.html"),
      },
    },
  },
});
