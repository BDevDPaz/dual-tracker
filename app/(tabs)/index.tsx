// app/(tabs)/index.tsx - Hoy V1.0.0 con core-v2 limpio
// Reemplaza tu index.tsx viejo de 400 líneas. Este tiene 150 líneas y solo 3 modales.
// Estados: IDLE -> GEOFENCE_ARMED -> ACTIVE_SESSION -> WAITING_DECISION -> DAY_FINISHED

import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import {
  PageHeader,
  ScreenScroll,
  SAFE_EDGES,
  Button,
  Card,
  OperationalHeroCard,
  DailySummaryBlock,
  SessionTimeline,
  EmptyState,
} from "../../src/components/ui";
import { TOKENS } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";
import { useActiveSessionV2 } from "../../src/core-v2/useActiveSessionV2";
import { DailySetupModalV2 } from "../../src/core-v2/DailySetupModalV2";
import { PostWorkModalV2 } from "../../src/core-v2/PostWorkModalV2";
import { LunchModalV2 } from "../../src/core-v2/LunchModalV2";
import { getPendingModal, clearPendingModal, getPendingGeofenceEvents, clearPendingEvents } from "../../src/core-v2/bootWiringV2";
import { formatDuration } from "../../src/utils/dateUtils";

export default function TodayScreenV2() {
  const router = useRouter();
  const { colors } = useTheme();
  const {
    isReady,
    workState,
    jornada,
    activeSession,
    saveDailySetup,
    saveNewWorkSetup,
    selectNewWork,
    selectEndDay,
    onGeofenceEnter,
    onGeofenceExit,
  } = useActiveSessionV2();

  const [showSetupFirst, setShowSetupFirst] = useState(false);
  const [showSetupNew, setShowSetupNew] = useState(false);
  const [showPostWork, setShowPostWork] = useState(false);
  const [showLunch, setShowLunch] = useState(false);
  const [lunchMode, setLunchMode] = useState<'MIDDAY' | 'END_OF_DAY_FALLBACK'>('MIDDAY');

  // Procesar eventos que pasaron con app cerrada
  useEffect(() => {
    if (!isReady) return;
    const pendings = getPendingGeofenceEvents();
    pendings.forEach(e => {
      if (e.type === 'GEOFENCE_ENTRY') onGeofenceEnter();
      if (e.type === 'GEOFENCE_EXIT') {
        onGeofenceExit();
        setShowPostWork(true);
      }
    });
    if (pendings.length > 0) clearPendingEvents();

    const modal = getPendingModal();
    if (modal === 'POST_WORK') setShowPostWork(true);
    else if (modal === 'DAILY_SETUP') setShowSetupFirst(true);
    else if (modal === 'LUNCH') {
      setLunchMode('MIDDAY');
      setShowLunch(true);
    }
    if (modal) clearPendingModal();
  }, [isReady]);

  // Cuando cambia a WAITING_DECISION, abre PostWork automáticamente
  useEffect(() => {
    if (workState === 'WAITING_DECISION') setShowPostWork(true);
  }, [workState]);

  if (!isReady) {
    return (
      <ScreenScroll edges={SAFE_EDGES.tab}>
        <PageHeader title="Hoy" subtitle="Cargando..." />
      </ScreenScroll>
    );
  }

  const totalMinutes = jornada?.sessions.reduce((acc, s) => {
    const start = new Date(s.entryAt).getTime();
    const end = s.exitAt ? new Date(s.exitAt).getTime() : Date.now();
    return acc + (end - start) / 60000;
  }, 0) || 0;

  return (
    <ScreenScroll
      edges={SAFE_EDGES.tab}
      footer={
        workState === 'IDLE' || workState === 'DAY_FINISHED' ? (
          <Button onPress={() => setShowSetupFirst(true)}>Configurar primer destino</Button>
        ) : workState === 'ACTIVE_SESSION' ? (
          <Button variant="secondary" onPress={() => setShowPostWork(true)}>Simular salida (test)</Button>
        ) : null
      }
    >
      <PageHeader
        title="Hoy"
        subtitle={
          workState === 'IDLE' ? 'Sin jornada'
          : workState === 'GEOFENCE_ARMED' ? 'En camino - geocerca 150m activa'
          : workState === 'ACTIVE_SESSION' ? `Activo en ${activeSession?.clientName || 'sitio'}`
          : workState === 'WAITING_DECISION' ? 'Saliste - esperando decisión'
          : 'Jornada terminada'
        }
      />

      {/* Estado IDLE */}
      {workState === 'IDLE' && (
        <EmptyState
          title="No hay jornada activa"
          description="Toca configurar destino. Armamos geocerca 150m. La jornada inicia sola al llegar."
          action={{ label: 'Configurar primer destino', onPress: () => setShowSetupFirst(true) }}
        />
      )}

      {/* GEOFENCE_ARMED */}
      {workState === 'GEOFENCE_ARMED' && jornada && (
        <Card style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
          <Text style={[styles.label, { color: colors.textMuted }]}>GEOCERCA ARMADA</Text>
          <Text style={[styles.value, { color: colors.text }]}>{jornada.sessions[0]?.addressInput || 'Destino configurado'}</Text>
          <Text style={[styles.hint, { color: colors.textMuted }]}>Radio 150m. Te notificaremos al llegar para auto check-in. No creamos sesión todavía.</Text>
        </Card>
      )}

      {/* ACTIVE_SESSION */}
      {workState === 'ACTIVE_SESSION' && activeSession && (
        <>
          <OperationalHeroCard
            title={activeSession.clientName}
            subtitle={activeSession.addressInput}
            status="active"
          />
          <DailySummaryBlock
            minutes={Math.floor(totalMinutes)}
            sessions={jornada?.sessions.length || 0}
          />
          <Card style={{ backgroundColor: colors.surface }}>
            <Text style={{ color: colors.text }}>Entrada: {new Date(activeSession.entryAt).toLocaleTimeString()}</Text>
            <Text style={{ color: colors.textMuted, marginTop: 8 }}>Cronómetro corriendo. Sal del radio 150m para disparar salida.</Text>
          </Card>
          <Pressable onPress={() => { setLunchMode('MIDDAY'); setShowLunch(true); }} style={styles.linkBtn}>
            <Text style={{ color: colors.primary }}>Registrar almuerzo</Text>
          </Pressable>
        </>
      )}

      {/* WAITING_DECISION */}
      {workState === 'WAITING_DECISION' && (
        <Card style={{ backgroundColor: colors.surface }}>
          <Text style={[styles.value, { color: colors.text }]}>Saliste del área</Text>
          <Text style={[styles.hint, { color: colors.textMuted }]}>Elige qué hacer. Si ignoras 15 min, cerramos automáticamente.</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
            <Button onPress={() => { setShowPostWork(false); setShowSetupNew(true); selectNewWork(); }} style={{ flex: 1 }}>Otro sitio</Button>
            <Button variant="secondary" onPress={async () => { setShowPostWork(false); await selectEndDay(); }} style={{ flex: 1 }}>Terminar</Button>
          </View>
        </Card>
      )}

      {/* DAY_FINISHED */}
      {workState === 'DAY_FINISHED' && jornada && (
        <>
          <Card style={{ backgroundColor: colors.surface }}>
            <Text style={[styles.value, { color: colors.text }]}>Jornada terminada</Text>
            <Text style={[styles.hint, { color: colors.textMuted }]}>Total: {formatDuration(totalMinutes)} en {jornada.sessions.length} sesiones</Text>
            {jornada.lunch ? (
              <Text style={{ color: colors.textMuted, marginTop: 8 }}>Almuerzo: {jornada.lunch.taken ? 'Sí' : 'No'} a las {new Date(jornada.lunch.at).toLocaleTimeString()}</Text>
            ) : null}
          </Card>
          <SessionTimeline sessions={jornada.sessions as any} />
        </>
      )}

      {/* Timeline siempre si hay sesiones */}
      {jornada && jornada.sessions.length > 0 && workState !== 'DAY_FINISHED' && (
        <SessionTimeline sessions={jornada.sessions as any} />
      )}

      {/* Modales V2 */}
      <DailySetupModalV2
        visible={showSetupFirst}
        mode="FIRST_WORK"
        onClose={() => setShowSetupFirst(false)}
        onSave={saveDailySetup}
      />
      <DailySetupModalV2
        visible={showSetupNew}
        mode="NEW_WORK"
        onClose={() => setShowSetupNew(false)}
        onSave={saveNewWorkSetup}
      />
      <PostWorkModalV2
        visible={showPostWork}
        lastSession={activeSession}
        onSelectNewWork={() => {
          setShowPostWork(false);
          setShowSetupNew(true);
          selectNewWork();
        }}
        onSelectEndDay={async () => {
          setShowPostWork(false);
          if (!jornada?.lunch) {
            setLunchMode('END_OF_DAY_FALLBACK');
            setShowLunch(true);
          } else {
            await selectEndDay();
          }
        }}
        onClose={() => setShowPostWork(false)}
      />
      <LunchModalV2
        visible={showLunch}
        jornada={jornada}
        mode={lunchMode}
        onClose={() => setShowLunch(false)}
        onSaved={async (taken) => {
          if (lunchMode === 'END_OF_DAY_FALLBACK') {
            await selectEndDay();
          }
        }}
      />
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  value: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  hint: { fontSize: 13, lineHeight: 18 },
  linkBtn: { alignSelf: 'center', padding: 12 },
});
