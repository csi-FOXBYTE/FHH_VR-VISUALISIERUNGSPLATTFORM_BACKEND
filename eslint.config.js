import oxlint from "eslint-plugin-oxlint";
import eslint from "@eslint/js";

export default [
  eslint.configs.recommended,
  ...oxlint.configs["flat/all"],
];
