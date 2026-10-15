import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: ["**/dist/**", "**/dist-electron/**", "**/node_modules/**", "**/release/**", "**/output/**", ".superpowers/**"]
  },
  js.configs.recommended,
  {
    files: ["scripts/**/*.mjs", "website/**/*.mjs", "public/boot-theme.js"],
    rules: { "no-redeclare": ["error", { builtinGlobals: false }] },
    languageOptions: {
      globals: {
        Buffer: "readonly",
        Image: "readonly",
        console: "readonly",
        document: "readonly",
        window: "readonly",
        URLSearchParams: "readonly",
        location: "readonly",
        localStorage: "readonly",
        navigator: "readonly",
        getComputedStyle: "readonly",
        fetch: "readonly",
        performance: "readonly",
        AbortSignal: "readonly",
        process: "readonly",
        setTimeout: "readonly"
      }
    }
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      }
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "react-hooks": reactHooks
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "no-undef": "off"
    }
  }
];
