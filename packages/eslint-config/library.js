const { resolve, join } = require("path");

const project = resolve(process.cwd(), "tsconfig.json");

/** @type {import("eslint").Linter.Config} */
module.exports = {
  parser: "@typescript-eslint/parser",
  extends: ["eslint:recommended", "eslint-config-turbo"],
  plugins: [
    "@typescript-eslint/eslint-plugin",
    "only-warn",
    "simple-import-sort",
    "react-hooks",
  ],
  rules: {
    "simple-import-sort/imports": [
      "error",
      {
        groups: [
          ["reflect-metadata", "core-js", "polyfill"],
          ["^react", "^@?\\w"],
          ["^@repo/"],
          ["^\\u0000"],
          [
            "^\\.\\.(?!/?$)",
            "^\\.\\./?$",
            "^\\./(?=.*/)(?!/?$)",
            "^\\.(?!/?$)",
            "^\\./?$",
            "^.+\\.s?css$",
          ],
        ],
      },
    ],
    "@typescript-eslint/interface-name-prefix": "off",
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/no-non-null-asserted-optional-chain": "off",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/ban-types": [
      "error",
      { types: { "{}": false }, extendDefaults: true },
    ],
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    "no-undef": "off",
    "no-redeclare": "off",
  },
  settings: { "import/resolver": { typescript: { project } } },
  ignorePatterns: [
    // Ignore dotfiles
    ".*.js",
    "node_modules/",
    "dist/",
  ],
  overrides: [
    {
      files: ["**/*.ts", "**/*.tsx"],
      parserOptions: {
        project: [
          join(__dirname, "../../tsconfig.eslint.json"),
          "./packages/*/tsconfig.json",
        ],
      },
      rules: {
        "@typescript-eslint/no-floating-promises": "warn",
        "@typescript-eslint/explicit-member-accessibility": ["error"],
      },
    },
    {
      files: ["**/*.js"],
      rules: {
        "@typescript-eslint/no-var-requires": "off",
      },
    },
  ],
};
