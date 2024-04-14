import { defineConfig, defineGlobalStyles } from "@pandacss/dev";

const colors = {
  // Primary
  indigo: {
    50: "#E0E8F9",
    100: "#BED0F7",
    200: "#98AEEB",
    300: "#7B93DB",
    400: "#647ACB",
    500: "#4C63B6",
    600: "#4055A8",
    700: "#35469C",
    800: "#2D3A8C",
    900: "#19216C",
  },
  // Neutrals
  "cool-grey": {
    50: "#F5F7FA",
    100: "#E4E7EB",
    200: "#CBD2D9",
    300: "#9AA5B1",
    400: "#7B8794",
    500: "#616E7C",
    600: "#52606D",
    700: "#3E4C59",
    800: "#323F4B",
    900: "#1F2933",
  },
  // Supporting
  "light-blue-vivid": {
    50: "#E3F8FF",
    100: "#B3ECFF",
    200: "#81DEFD",
    300: "#5ED0FA",
    400: "#40C3F7",
    500: "#2BB0ED",
    600: "#1992D4",
    700: "#127FBF",
    800: "#0B69A3",
    900: "#035388",
  },
  "red-vivid": {
    50: "#FFE3E3",
    100: "#FFBDBD",
    200: "#FF9B9B",
    300: "#F86A6A",
    400: "#EF4E4E",
    500: "#E12D39",
    600: "#CF1124",
    700: "#AB091E",
    800: "#8A041A",
    900: "#610316",
  },
  "yellow-vivid": {
    50: "#FFFBEA",
    100: "#FFF3C4",
    200: "#FCE588",
    300: "#FADB5F",
    400: "#F7C948",
    500: "#F0B429",
    600: "#DE911D",
    700: "#CB6E17",
    800: "#B44D12",
    900: "#8D2B0B",
  },
  teal: {
    50: "#EFFCF6",
    100: "#C6F7E2",
    200: "#8EEDC7",
    300: "#65D6AD",
    400: "#3EBD93",
    500: "#27AB83",
    600: "#199473",
    700: "#147D64",
    800: "#0C6B58",
    900: "#014D40",
  },
};

export default defineConfig({
  preflight: true,
  include: ["./src/**/*.{js,jsx,ts,tsx}"],
  outdir: "styled-system",
  strictTokens: true,
  strictPropertyValues: true,
  presets: [],
  theme: {
    tokens: {
      colors: {
        background: {
          primary: { value: colors["cool-grey"][900] },
          secondary: { value: colors["cool-grey"][800] },
          tertiary: { value: colors["cool-grey"][700] },
        },
        text: {
          primary: { value: colors["cool-grey"][50] },
          secondary: { value: colors["cool-grey"][200] },
          tertiary: { value: colors["cool-grey"][400] },
        },
        accent: {
          primary: { value: colors["indigo"][400] },
          secondary: { value: colors["teal"][400] },
          tertiary: { value: colors["light-blue-vivid"][400] },
        },
        status: {
          success: { value: colors["teal"][500] },
          warning: { value: colors["yellow-vivid"][500] },
          error: { value: colors["red-vivid"][500] },
          info: { value: colors["light-blue-vivid"][500] },
        },
        border: {
          primary: { value: colors["cool-grey"][700] },
          secondary: { value: colors["cool-grey"][600] },
        },
        interactive: {
          primary: { value: colors["indigo"][500] },
          secondary: { value: colors["indigo"][600] },
          tertiary: { value: colors["indigo"][700] },
        },
        hover: {
          primary: { value: colors["indigo"][300] },
          secondary: { value: colors["teal"][300] },
        },
        focus: {
          primary: { value: colors["indigo"][200] },
          secondary: { value: colors["teal"][200] },
        },
        disabled: {
          background: { value: colors["cool-grey"][800] },
          text: { value: colors["cool-grey"][500] },
        },
        overlay: {
          background: { value: "rgba(31, 41, 51, 0.8)" }, // colors["cool-grey"][900] with 80% opacity
        },
        shadow: {
          primary: { value: "rgba(0, 0, 0, 0.2)" },
          secondary: { value: "rgba(0, 0, 0, 0.1)" },
        },
      },
    },
  },
  globalCss: defineGlobalStyles({
    "html, body": {
      minHeight: "100vh",
      color: "{colors.text.primary}",
      backgroundColor: "{colors.background.primary}",
    },
  }),
});
