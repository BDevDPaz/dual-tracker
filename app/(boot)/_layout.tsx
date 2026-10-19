/** (boot)/_layout.tsx — Stack de arranque: sin header, fondo obsidian, sin back gesture. */
import { Stack } from "expo-router";
import { TOKENS } from "../../src/constants/theme";

export default function BootLayout() {
  return <Stack screenOptions={{ headerShown: false, gestureEnabled: false, freezeOnBlur: false, contentStyle: { backgroundColor: TOKENS.colors.background } }} />;
}
