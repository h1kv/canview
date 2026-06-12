import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { UserConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    watch: {
      ignored: ["**/workspace/**", "**/vercel-workspaces/**"]
    }
  }
} satisfies UserConfig);