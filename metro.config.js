const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.blockList = [
  // Generados y temporales
  /.*\/ReactAndroid\/.*/,
  /.*\/android\/.*/,
  /coverage\/.*/,
  /.*\.zip$/,
  /benchmarks\/.*/,

  // Tooling de dev/test: jamás se importa en el bundle de la app
  /node_modules\/@jest\/.*/,
  /node_modules\/jest\/.*/,
  /node_modules\/jest-[^/]+\/.*/,
  /node_modules\/@testing-library\/.*/,
  /node_modules\/ts-jest\/.*/,
  /node_modules\/@types\/.*/,
  /node_modules\/eslint\/.*/,
  /node_modules\/@eslint\/.*/,
  /node_modules\/eslint-plugin-[^/]+\/.*/,
  /node_modules\/knip\/.*/,
  /node_modules\/madge\/.*/,
  /node_modules\/tsx\/.*/,
  /node_modules\/esbuild\/.*/,
  /node_modules\/typescript\/.*/,
  /node_modules\/fast-check\/.*/,
  /node_modules\/react-test-renderer\/.*/,
];

module.exports = config;
