import oxlint from "eslint-plugin-oxlint";
import eslint from "@eslint/js";

export default [
  {
    ignores: [
      ".build/**",
      ".dist/**",
      ".schema-peer/**",
      "build/**",
      "coverage/**",
    ],
  },
  {
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
  eslint.configs.recommended,
  ...oxlint.configs["flat/all"],
];
