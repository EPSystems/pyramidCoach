import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  // The rules engine is pure and deterministic (Section 4.2): no clock, no randomness, no I/O, no `any`.
  {
    files: ["lib/engine/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: "Pass `today` into the engine instead." },
        { object: "Math", property: "random", message: "The engine must be deterministic." },
      ],
      "no-restricted-syntax": ["error", { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: "No wall-clock time in the engine." }],
      "no-restricted-imports": ["error", { patterns: ["@supabase/*", "next/*", "react"] }],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "lib/db/database.types.ts",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
