// Tareas de TaskManager en el ámbito global, antes de que Expo Router cargue React.
// defineTask tiene que existir cuando el SO despierta el bundle sin UI.
require("./src/services/runtime/tasks/headless");
require("expo-router/entry");
