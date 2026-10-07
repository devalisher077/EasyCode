import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": process.env.EASYCODE_API_PROXY || "http://127.0.0.1:3001",
    },
    fs: {
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem}",
        "**/.git/**",
        "**/content/materials/**",
        "**/content/lessons/**",
        "**/server/**",
        "**/supabase/**",
      ],
    },
  },
  preview: {
    proxy: {
      "/api": process.env.EASYCODE_API_PROXY || "http://127.0.0.1:3001",
    },
  },
});
