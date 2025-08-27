// eslint.config.js
import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module" },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-constant-condition": "off",
    },
    ignores: ["node_modules/", "dist/", "**/*.d.ts"],
  },
];
