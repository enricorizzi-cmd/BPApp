import js from "@eslint/js";
import globals from "globals";
import sonarjs from "eslint-plugin-sonarjs";

export default [
  {
    ignores: [
      "eslint.config.mjs",
      "lib/**",
      "push-sw.js",
      "vite.config.js",
      "src/postSaleBanners.js",
      "main.js",
      "dist/**",
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    plugins: {
      sonarjs,
    },
    rules: {
      complexity: ["warn", 10],
    },
  },
];
