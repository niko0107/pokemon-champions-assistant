import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // 開発時は /api/* を API サーバーへプロキシし CORS を回避する
      "/api": {
        target: process.env.VITE_PROXY_API_TARGET ?? "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
