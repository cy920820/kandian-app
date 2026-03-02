import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath, URL } from "node:url";

const host = process.env.TAURI_DEV_HOST || "127.0.0.1";

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  clearScreen: false,
  server: {
    host,
    port: 1420,
    strictPort: true,
    hmr: process.env.TAURI_DEV_HOST
      ? {
          protocol: "ws",
          host: process.env.TAURI_DEV_HOST,
          port: 1421
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"]
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true
  }
});
