// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
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
]);
