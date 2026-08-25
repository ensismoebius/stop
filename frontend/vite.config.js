import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // 0.0.0.0 para que os celulares da sala alcancem o dev server (spec 37).
    host: true,
    port: 5173,
    proxy: {
      // Sem changeOrigin: o Host original (IP do hotspot:5173, do ponto de
      // vista do celular) chega intacto ao backend. Com changeOrigin, o
      // proxy reescreve o Host para "localhost:3000" antes de repassar a
      // requisicao — o backend usa esse header para montar o link/QR Code
      // de entrada (roomController.js), entao o QR acabava sempre apontando
      // para "localhost", que o celular nao alcança.
      "/api": { target: "http://localhost:3000" },
      "/socket.io": { target: "http://localhost:3000", ws: true },
    },
  },
  preview: { host: true, port: 4173 },
  build: { outDir: "dist", sourcemap: false },
});
