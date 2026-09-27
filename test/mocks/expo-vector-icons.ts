/**
 * Doble de @expo/vector-icons: los iconos son fuentes nativas (expo-font /
 * expo-asset). En pruebas se renderiza un <Text> con el nombre del icono.
 */
import React from "react";
import { Text } from "react-native";

type IconProps = { name: string; size?: number; color?: string; testID?: string };
function makeIcon(family: string) {
  const Icon = ({ name, testID }: IconProps) => React.createElement(Text, { testID: testID ?? `icon-${family}-${name}` }, name);
  Icon.displayName = family;
  return Icon;
}
export const Ionicons = makeIcon("Ionicons");
export const MaterialIcons = makeIcon("MaterialIcons");
export const MaterialCommunityIcons = makeIcon("MaterialCommunityIcons");
export const Feather = makeIcon("Feather");
export const FontAwesome = makeIcon("FontAwesome");
