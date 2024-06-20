import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  server: { port: 5177 },
  plugins: [react()],
  build: { emptyOutDir: true },
});
