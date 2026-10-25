import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Reads PORT from .env so the proxy follows the API server. Only PORT is used.
  const apiPort = Number(loadEnv(mode, process.cwd(), "").PORT ?? 8787);
  return {
    root: "web",
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { "/api": `http://127.0.0.1:${apiPort}` },
    },
    build: {
      outDir: "../dist",
      emptyOutDir: true,
    },
  };
});
