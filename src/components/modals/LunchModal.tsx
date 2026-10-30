import React, { useState, useEffect, useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { ModalShell } from "../ui/ModalShell";
import { ICONS } from "../../constants/icons";
import { FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";

interface LunchModalProps {
  visible: boolean;
  onCancel: () => void;
  onConfirm: (minutes: number) => void;
}

export function LunchModal({ visible, onCancel, onConfirm }: LunchModalProps) {
  const { tokens } = useTheme();
  const [selected, setSelected] = useState(30);
  useEffect(() => {
    if (visible) setSelected(30);
  }, [visible]);
  const options = [0, 30, 45, 60];

  const styles = useMemo(
    () =>
      StyleSheet.create({
        optionsRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          gap: tokens.spacing.sm,
        },
        optionPill: {
          flex: 1,
          paddingVertical: tokens.spacing.md,
          alignItems: "center",
          borderRadius: tokens.radius.md,
          borderWidth: 1,
        },
        optionPillActive: { backgroundColor: tokens.colors.primarySoft },
        optionText: { ...FONT.bodyStrong, fontSize: 14 },
      }),
    [tokens],
  );

  return (
    <ModalShell
      visible={visible}
      title="Tiempo de descanso"
      description="Selecciona el tiempo que se descontará de la jornada."
      icon={ICONS.domain.lunch}
      onClose={onCancel}
      primaryAction={{ label: "Confirmar", onPress: () => onConfirm(selected) }}
      secondaryAction={{ label: "Omitir", onPress: onCancel }}
    >
      <View style={styles.optionsRow}>
        {options.map((min) => (
          <Pressable
            key={min}
            onPress={() => setSelected(min)}
            style={[
              styles.optionPill,
              { backgroundColor: tokens.colors.surface, borderColor: tokens.colors.border },
              selected === min && [styles.optionPillActive, { borderColor: tokens.colors.primary }],
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === min }}
            accessibilityLabel={`${min} minutos`}
          >
            <Text
              style={[
                styles.optionText,
                { color: tokens.colors.text.secondary },
                selected === min && { color: tokens.colors.primary },
              ]}
            >
              {min} min
            </Text>
          </Pressable>
        ))}
      </View>
    </ModalShell>
  );
}
