import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        HTMLElement: "readonly",
        HTMLCanvasElement: "readonly",
        ResizeObserver: "readonly",
        MutationObserver: "readonly",
        MouseEvent: "readonly",
        KeyboardEvent: "readonly",
        Event: "readonly",
        Image: "readonly",
        // ES6 globals
        Atomics: "readonly",
        SharedArrayBuffer: "readonly",
        // Additional browser globals
        performance: "readonly",
        FileReader: "readonly",
        structuredClone: "readonly",
      },
    },
    rules: {
      semi: ["error", "always"],
      quotes: ["error", "double"],
      // Disable rules that TypeScript handles better
      "@typescript-eslint/no-unused-vars": "off", // TypeScript's noUnusedLocals handles this
    },
  },
);
