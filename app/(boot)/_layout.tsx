/** (boot)/_layout.tsx — Stack de arranque: sin header, fondo obsidian, sin back gesture. */
import { Stack } from "expo-router";
import { useTheme } from "../../src/context/ThemeContext";

export default function BootLayout() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, gestureEnabled: false, freezeOnBlur: false, contentStyle: { backgroundColor: colors.background } }} />;
}
