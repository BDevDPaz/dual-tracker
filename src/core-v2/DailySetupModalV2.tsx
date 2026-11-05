// src/core-v2/DailySetupModalV2.tsx
// Modal V1.0.0 final - Valida coordenadas reales, nunca usa 0,0
// Conectado a useActiveSessionV2

import React, { useState } from 'react';
import { Modal, View, Text, TextInput, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import * as Location from 'expo-location';
import { useTheme } from '@/context/ThemeContext'; // tu ThemeContext existente
import { Button, Card } from '@/components/ui'; // tus componentes base

interface Props {
  visible: boolean;
  mode: 'FIRST_WORK' | 'NEW_WORK'; // primer trabajo del día o otro sitio
  onClose: () => void;
  onSave: (address: string, clientName: string, coords: { lat: number; lng: number }, notes?: string) => Promise<void>;
}

export function DailySetupModalV2({ visible, mode, onClose, onSave }: Props) {
  const { colors } = useTheme();
  const [address, setAddress] = useState('');
  const [clientName, setClientName] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const validateAndGeocode = async (): Promise<{ lat: number; lng: number } | null> => {
    if (!address.trim()) {
      setError('La dirección es obligatoria');
      return null;
    }
    if (!clientName.trim()) {
      setError('El nombre del cliente es obligatorio');
      return null;
    }

    try {
      // 1. Intento geocoding online
      const geocoded = await Location.geocodeAsync(address).catch(() => []);
      if (geocoded.length > 0 && geocoded[0].latitude && geocoded[0].longitude) {
        return { lat: geocoded[0].latitude, lng: geocoded[0].longitude };
      }

      // 2. Fallback: GPS actual
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
        if (pos) {
          return { lat: pos.coords.latitude, lng: pos.coords.longitude };
        }
      }

      // 3. Si todo falla -> NO usar 0,0, bloquear
      return null;
    } catch (e) {
      return null;
    }
  };

  const handleSave = async () => {
    setError('');
    setLoading(true);
    const coords = await validateAndGeocode();
    setLoading(false);

    if (!coords) {
      setError('No pudimos validar la dirección. Verifica que tengas internet o GPS activo. No se armó geocerca.');
      return;
    }

    // Validación final: nunca 0,0
    if (Math.abs(coords.lat) < 0.0001 && Math.abs(coords.lng) < 0.0001) {
      setError('Coordenadas inválidas (0,0). No se puede crear geocerca.');
      return;
    }

    try {
      await onSave(address.trim(), clientName.trim(), coords, notes.trim());
      // Limpiar y cerrar
      setAddress('');
      setClientName('');
      setNotes('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al guardar');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
        <Card style={[styles.card, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.text }]}>
            {mode === 'FIRST_WORK' ? '¿A dónde vas a trabajar hoy?' : 'Nuevo destino'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {mode === 'FIRST_WORK'
              ? 'Activa la geocerca. La jornada inicia sola al llegar (150m).'
              : 'Se cerrará la sesión anterior y se armará nueva geocerca. El viaje cuenta como trabajo.'}
          </Text>

          <Text style={[styles.label, { color: colors.text }]}>Dirección del trabajo *</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
            placeholder="Ej. Av Reforma 222, CDMX"
            placeholderTextColor={colors.textMuted}
            value={address}
            onChangeText={setAddress}
          />

          <Text style={[styles.label, { color: colors.text }]}>Nombre del cliente *</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
            placeholder="Ej. Bodega Central"
            placeholderTextColor={colors.textMuted}
            value={clientName}
            onChangeText={setClientName}
          />

          <Text style={[styles.label, { color: colors.text }]}>Notas (opcional)</Text>
          <TextInput
            style={[styles.input, styles.notes, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
            placeholder="Instrucciones, piso, etc."
            placeholderTextColor={colors.textMuted}
            value={notes}
            onChangeText={setNotes}
            multiline
          />

          {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}

          <View style={styles.actions}>
            <Button variant="ghost" onPress={onClose} disabled={loading} style={{ flex: 1 }}>
              Cancelar
            </Button>
            <View style={{ width: 12 }} />
            <Button onPress={handleSave} disabled={loading} style={{ flex: 1 }}>
              {loading ? <ActivityIndicator color="#fff" /> : 'Guardar y Activar'}
            </Button>
          </View>

          <Text style={[styles.hint, { color: colors.textMuted }]}>
            No creamos sesión todavía. Solo armamos geocerca. El check-in es automático al llegar.
          </Text>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', padding: 16 },
  card: { borderRadius: 20, padding: 20 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 6 },
  subtitle: { fontSize: 13, marginBottom: 16, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15 },
  notes: { height: 70, textAlignVertical: 'top' },
  error: { marginTop: 12, fontSize: 13, fontWeight: '600' },
  actions: { flexDirection: 'row', marginTop: 20 },
  hint: { fontSize: 11, marginTop: 12, textAlign: 'center' },
});
