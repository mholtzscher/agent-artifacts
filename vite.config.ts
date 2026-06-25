import path from "node:path";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [],
  test: {
    setupFiles: [path.join(import.meta.dirname, "setupTests.ts")],
    include: ["./test/**/*.test.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@template/basic/test": path.join(import.meta.dirname, "test"),
      "@template/basic": path.join(import.meta.dirname, "src"),
    },
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    printWidth: 120,
  },
  lint: {
    plugins: ["typescript", "unicorn", "oxc", "vitest", "import"],
    categories: {
      correctness: "error",
    },
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    env: {
      builtin: true,
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
  },
});
