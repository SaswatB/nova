import react from "@vitejs/plugin-react";
import { resolve } from "path";
import Unfonts from "unplugin-fonts/vite";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "styled-system": resolve("styled-system/"),
      "streamweave-core": resolve("../../packages/streamweave-core/src"),
    },
  },
  plugins: [react(), Unfonts({ fontsource: { families: ["Inter Variable"] } })],
});
