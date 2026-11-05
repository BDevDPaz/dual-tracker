// src/core-v2/PostWorkModalV2.tsx
// Se abre al tocar notificación GEOFENCE_EXIT o al salir del sitio
// Estado: WAITING_DECISION

import React from 'react';
import { Modal, View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { Button, Card } from '@/components/ui';
import { WorkSession } from './types';

interface Props {
  visible: boolean;
  lastSession: WorkSession | null;
  onSelectNewWork: () => void;
  onSelectEndDay: () => void;
  onClose: () => void;
}

export function PostWorkModalV2({ visible, lastSession, onSelectNewWork, onSelectEndDay, onClose }: Props) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <Card style={[styles.card, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.text }]}>Saliste del área de trabajo</Text>
          
          {lastSession ? (
            <View style={[styles.sessionBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sessionLabel, { color: colors.textMuted }]}>Sesión cerrada:</Text>
              <Text style={[styles.sessionText, { color: colors.text }]}>{lastSession.clientName}</Text>
              <Text style={[styles.sessionText, { color: colors.textMuted, fontSize: 12 }]}>{lastSession.addressInput}</Text>
              <Text style={[styles.sessionText, { color: colors.textMuted, fontSize: 12 }]}>
                Entrada: {new Date(lastSession.entryAt).toLocaleTimeString()} - Salida: {lastSession.exitAt ? new Date(lastSession.exitAt).toLocaleTimeString() : 'ahora'}
              </Text>
            </View>
          ) : null}

          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            ¿Qué deseas hacer ahora? Si vas a otro trabajo, el tiempo de viaje seguirá contando.
          </Text>

          <View style={styles.actions}>
            <Button onPress={onSelectNewWork} style={{ marginBottom: 12 }}>
              Otro sitio - Nuevo trabajo
            </Button>
            <Button variant="secondary" onPress={onSelectEndDay} style={{ marginBottom: 12 }}>
              Terminar jornada
            </Button>
            <Button variant="ghost" onPress={onClose}>
              Decidir después (15 min auto-cierre)
            </Button>
          </View>

          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Si ignoras esta notificación, cerraremos automáticamente en 15 min por inactividad.
          </Text>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', padding: 16, backgroundColor: 'rgba(0,0,0,0.6)' },
  card: { borderRadius: 20, padding: 20 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  sessionBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16 },
  sessionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  sessionText: { fontSize: 14, marginBottom: 2 },
  actions: { marginTop: 8 },
  hint: { fontSize: 11, marginTop: 12, textAlign: 'center' },
});
