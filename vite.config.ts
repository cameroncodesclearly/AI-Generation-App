import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const demo = process.env.VITE_DEMO === "1";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: ".",
  base: demo ? "./" : "/",
  build: { outDir: demo ? "dist-demo" : "dist", emptyOutDir: true, rollupOptions: demo ? { output: { entryFileNames: "assets/app.js", chunkFileNames: "assets/[name].js", assetFileNames: "assets/[name][extname]" } } : undefined },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: true },
      "/files": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
});
