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
  // Loosen complexity thresholds for a couple of high-traffic modules
  {
    files: ["server.js"],
    rules: {
      complexity: ["warn", 24],
    },
  },
  {
    files: ["jobs/reminders.js"],
    rules: {
      complexity: ["warn", 20],
    },
  },
  // Reduce noise: tailor complexity thresholds for specific files
  {
    files: ["lib/storage-pg.js"],
    rules: {
      complexity: ["warn", 16],
    },
  },
  {
    files: ["routes/appointments.js"],
    rules: {
      complexity: ["warn", 36],
    },
  },
  {
    files: ["routes/push.js"],
    rules: {
      complexity: ["warn", 12],
    },
  },
];
