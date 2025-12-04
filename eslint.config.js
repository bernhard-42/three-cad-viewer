import js from "@eslint/js";
import babelParser from "@babel/eslint-parser";
import prettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  prettier,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2018,
      sourceType: "module",
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
      },
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
    },
  },
];
