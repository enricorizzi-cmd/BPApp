import js from "@eslint/js";
import globals from "globals";
import sonarjs from "eslint-plugin-sonarjs";

export default [
  {
    ignores: ["eslint.config.mjs"],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    plugins: {
      sonarjs,
    },
    rules: {
      complexity: ["warn", 10],
      "no-unused-vars": "off",
      "no-empty": "off",
      "no-prototype-builtins": "off",
    },
  },
];
