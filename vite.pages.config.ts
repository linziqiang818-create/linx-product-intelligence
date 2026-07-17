import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.STATIC_BASE ?? `/${process.env.GITHUB_PAGES_REPOSITORY ?? "linx-product-intelligence-public"}/`,
  plugins: [react()],
  build: {
    outDir: "dist-pages",
    emptyOutDir: true,
  },
});
