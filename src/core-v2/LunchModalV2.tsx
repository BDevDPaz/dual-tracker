// src/core-v2/LunchModalV2.tsx
// Modal de almuerzo - Notificación de mediodía + fallback al final del día
// Registra auditoría LUNCH_TAKEN / LUNCH_SKIPPED

import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { useTheme } from '@/context/ThemeContext';
import { Button, Card } from '@/components/ui';
import { createAuditLog } from './auditService';
import { Jornada } from './types';

const db = SQLite.openDatabaseSync('dualTrackerV2.db');

interface Props {
  visible: boolean;
  jornada: Jornada | null;
  mode: 'MIDDAY' | 'END_OF_DAY_FALLBACK'; // mediodía o si se le olvidó al cerrar
  onClose: () => void;
  onSaved: (taken: boolean) => void;
}

export function LunchModalV2({ visible, jornada, mode, onClose, onSaved }: Props) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);

  const saveLunch = async (taken: boolean) => {
    if (!jornada) return;
    setLoading(true);

    const now = new Date().toISOString();
    // Actualizar jornada
    const updatedJornada: Jornada = {
      ...jornada,
      lunch: { taken, at: now },
    };
    db.runSync('INSERT OR REPLACE INTO jornadas (id, date, data) VALUES (?, ?, ?)', [
      updatedJornada.id,
      updatedJornada.date,
      JSON.stringify(updatedJornada),
    ]);

    // Auditoría
    const auditType = taken ? 'LUNCH_TAKEN' : 'LUNCH_SKIPPED';
    const log = createAuditLog(auditType as any, jornada.id, taken ? 'Almuerzo tomado registrado' : 'Almuerzo no tomado');
    db.runSync('INSERT OR REPLACE INTO audit (id, jornadaId, data) VALUES (?, ?, ?)', [log.id, log.jornadaId, JSON.stringify(log)]);

    setLoading(false);
    onSaved(taken);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <Card style={[styles.card, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.text }]}>
            {mode === 'MIDDAY' ? '¿Vas a tomar tu hora de lonche?' : '¿Tomaste almuerzo hoy?'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {mode === 'MIDDAY'
              ? 'Regístralo para que tu reporte de horas quede auditable.'
              : 'No registramos almuerzo hoy. Confirma para cerrar la jornada correctamente.'}
          </Text>

          <View style={styles.actions}>
            <Button onPress={() => saveLunch(true)} disabled={loading} style={{ marginBottom: 12 }}>
              Sí, tomé / tomaré lonche
            </Button>
            <Button variant="secondary" onPress={() => saveLunch(false)} disabled={loading} style={{ marginBottom: 12 }}>
              No tomé lonche
            </Button>
            {mode === 'MIDDAY' && (
              <Button variant="ghost" onPress={onClose} disabled={loading}>
                Recordar más tarde
              </Button>
            )}
          </View>

          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Esto genera auditoría y descuenta o no tu hora de comida según tu configuración.
          </Text>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', padding: 16, backgroundColor: 'rgba(0,0,0,0.6)' },
  card: { borderRadius: 20, padding: 20 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  actions: { marginTop: 8 },
  hint: { fontSize: 11, marginTop: 12, textAlign: 'center' },
});
