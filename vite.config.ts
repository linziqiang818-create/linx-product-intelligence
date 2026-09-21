import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 纯前端 SPA 构建；开发时把 /api 代理到本地数据服务（node server/index.mjs，端口 3000）
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: false },
    },
  },
});
