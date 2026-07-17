import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const portable = mode === "portable";

  return {
    base: portable
      ? "./"
      : process.env.STATIC_BASE ?? `/${process.env.GITHUB_PAGES_REPOSITORY ?? "linx-product-intelligence-public"}/`,
    plugins: [react()],
    build: {
      outDir: "dist-pages",
      emptyOutDir: true,
      cssCodeSplit: !portable,
      rolldownOptions: portable
        ? { output: { codeSplitting: false } }
        : undefined,
    },
  };
});
