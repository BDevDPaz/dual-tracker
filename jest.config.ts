/**
 * Jest — cuarta puerta de Dual Tracker (Propuesta de calidad "Integración de Jest").
 * Se prueba la AUTORIDAD (dominio, aplicación, evidencia, persistencia,
 * runtime con dobles), no el JSX de app/. Ver README → "Pruebas".
 */
import type { Config } from "jest";

// Reloj en UTC para todos los workers (setup.ts fija además la época).
process.env.TZ = "UTC";

const config: Config = {
  preset: "jest-expo",
  roots: ["<rootDir>/src", "<rootDir>/test"],
  testMatch: ["**/__tests__/**/*.test.ts?(x)"],
  setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
  // Sin alias @/ en tsconfig: imports relativos como el árbol actual.
  // transformIgnorePatterns: el de jest-expo + @noble (ESM puro, spec v1.3 §8).
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|@noble/.*|react-native-svg))",
    "/node_modules/react-native-reanimated/plugin/",
  ],
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: [
    "src/services/**/*.{ts,tsx}",
    "src/core/**/*.{ts,tsx}",
    "src/utils/**/*.{ts,tsx}",
    "!src/**/__tests__/**",
    "!src/services/evidence/reportTemplates.ts",
    "!src/**/index.ts",
  ],
  coverageDirectory: "<rootDir>/coverage",
  coverageReporters: ["text-summary", "text", "lcov"],
  // Umbral inicial suave (§5): 60 % statements en domain + evidence.
  // Subir a 80 cuando WP-1 y WP-5 estén cerrados. Sin umbral global el día uno.
  coverageThreshold: {
    global: {},
    "./src/services/domain/": { statements: 60 },
    "./src/services/evidence/": { statements: 60 },
  },
};

export default config;
