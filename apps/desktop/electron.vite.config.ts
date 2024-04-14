import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { resolve } from "path";
import Unfonts from "unplugin-fonts/vite";

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
        "styled-system": resolve("styled-system/"),
      },
    },
    plugins: [react(), Unfonts({ fontsource: { families: ["Inter Variable"] } })],
  },
});
