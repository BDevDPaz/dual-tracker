// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const globals = require("globals");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "coverage/*"],
  },
  {
    // Propuesta de Producto §1 y §4: las rutas no importan servicios ni APIs nativas de datos.
    files: ["app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["expo-sqlite", "expo-location", "expo-print"],
          patterns: [{ group: ["**/src/services/*", "**/src/services/**"], message: "Usa useWorkTracker / selectores (Producto §1)." }],
        },
      ],
    },
  },
  {
    // Suite Jest (Propuesta de calidad): globals de Jest en specs, dobles y setup.
    // Los dobles de test/mocks se cablean con require() dentro de jest.mock (§6).
    files: ["**/__tests__/**/*.{ts,tsx}", "test/**/*.{ts,tsx}", "jest.config.ts"],
    languageOptions: { globals: { ...globals.jest, ...globals.node } },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "import/first": "off",
    },
  },
]);
