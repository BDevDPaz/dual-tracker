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
    // Sistema visual: espaciado, tipo y size={} salen de TOKENS / FONT / ICON.
    // El 0 está permitido. Ver docs/UI_SISTEMA_VISUAL.md y src/constants/uiLiterals.ts.
    files: ["app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}", "src/context/**/*.{ts,tsx}"],
    ignores: ["**/__tests__/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Property[key.name=/^(fontSize|lineHeight|padding|paddingHorizontal|paddingVertical|paddingTop|paddingBottom|paddingLeft|paddingRight|margin|marginHorizontal|marginVertical|marginTop|marginBottom|marginLeft|marginRight|gap|rowGap|columnGap|borderRadius|borderTopLeftRadius|borderTopRightRadius|borderBottomLeftRadius|borderBottomRightRadius)$/] > Literal[raw=/^-?(?:[1-9]\\d*(?:\\.\\d+)?|0\\.\\d+)$/]",
          message: "Usa TOKENS, FONT o ICON (docs/UI_SISTEMA_VISUAL.md). El 0 está permitido.",
        },
        {
          selector: "JSXAttribute[name.name='size'] > JSXExpressionContainer > Literal[raw=/^[1-9]\\d*$/]",
          message: "Usa ICON.* para el tamaño de un icono.",
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
