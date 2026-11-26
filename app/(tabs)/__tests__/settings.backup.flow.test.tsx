/** Ajustes · Copia de seguridad: crear, revisar y restaurar (solo en Ajustes), con el estado real. */
import React from "react";
import * as FileSystem from "expo-file-system";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { BackupSection } from "../../../src/components/blocks";
import { ToastProvider } from "../../../src/context/ToastContext";
import { Store, StoreActions } from "../../../src/core/store";
import { t } from "../../../src/i18n";
import { exportAppBackup } from "../../../src/services/application/useCases";
import { PersistenceService } from "../../../src/services/persistence/PersistenceService";
import { SettingsService } from "../../../src/services/persistence/SettingsService";
import { mustDispatch, seedWorld, startAndArrive } from "../../../test/helpers";
import { HOUR } from "../../../test/fixtures/session.fixture";
import { time } from "../../../test/time";

const PASS = "contraseña-larga-1";
const fs = FileSystem as unknown as { __pickQueue: unknown[]; File: new (uri: string) => unknown };

async function hydrate(): Promise<void> {
  const snapshot = await PersistenceService.loadSnapshot();
  StoreActions.hydrated({
    sessions: snapshot.sessions,
    sites: snapshot.sites,
    packs: snapshot.packs,
    sharedPackIds: [],
    settings: await SettingsService.load(),
    osKillDetected: false,
    hasPin: false,
    pinOrigin: "UNSET",
    nowMs: time.now(),
  });
}

async function closedDay(): Promise<void> {
  const { siteA } = await seedWorld();
  await startAndArrive(siteA);
  time.travel(8 * HOUR);
  await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
}

function renderSection() {
  return render(
    <ToastProvider>
      <BackupSection />
    </ToastProvider>,
  );
}

describe("Ajustes · copia de seguridad", () => {
  test("crear: el botón espera dos contraseñas iguales y la fecha real aparece tras compartir", async () => {
    await closedDay();
    await hydrate();
    renderSection();
    expect(await screen.findByText(t("settings.backup.never"))).toBeTruthy();
    const create = screen.getByTestId("backup-create");
    fireEvent.changeText(screen.getByTestId("backup-pass"), PASS);
    fireEvent.changeText(screen.getByTestId("backup-pass-repeat"), "otra-cosa-1");
    expect(screen.getByText(t("settings.backup.mismatch"))).toBeTruthy();
    expect(create.props.accessibilityState?.disabled).toBe(true);
    fireEvent.changeText(screen.getByTestId("backup-pass-repeat"), PASS);
    await act(async () => {
      fireEvent.press(screen.getByTestId("backup-create"));
    });
    // TP-8: compartir no confirma el destino; se pregunta antes de anotar la copia.
    expect(await screen.findByText(t("settings.backup.savedTitle"))).toBeTruthy();
    expect(screen.getByTestId("backup-last").props.children).toBe(t("settings.backup.never"));
    await act(async () => {
      fireEvent.press(screen.getByText(t("settings.backup.savedYes")));
    });
    await waitFor(() => expect(screen.getByTestId("backup-last").props.children).toMatch(/^Última copia creada: /));
    expect((await PersistenceService.getKv<{ atMs: number }>("backup.last_created"))?.atMs).toBe(time.now());
    expect(Store.getState().feedback.pending.some((f) => f.code === "BACKUP_CREATED")).toBe(true);
  });

  test("TP-8: si la copia no se guardó, «Última copia» no cambia", async () => {
    await closedDay();
    await hydrate();
    renderSection();
    expect(await screen.findByText(t("settings.backup.never"))).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("backup-pass"), PASS);
    fireEvent.changeText(screen.getByTestId("backup-pass-repeat"), PASS);
    await act(async () => {
      fireEvent.press(screen.getByTestId("backup-create"));
    });
    expect(await screen.findByText(t("settings.backup.savedTitle"))).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText(t("settings.backup.savedNo")));
    });
    await waitFor(() => expect(screen.queryByText(t("settings.backup.savedTitle"))).toBeNull());
    expect(screen.getByTestId("backup-last").props.children).toBe(t("settings.backup.never"));
    expect(await PersistenceService.getKv("backup.last_created")).toBeNull();
    expect(Store.getState().feedback.pending.some((f) => f.code === "BACKUP_CREATED")).toBe(false);
  });

  test("con jornada abierta se explica por qué no se puede y no se crea", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    await hydrate();
    renderSection();
    expect(screen.getByTestId("backup-open-session")).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("backup-pass"), PASS);
    fireEvent.changeText(screen.getByTestId("backup-pass-repeat"), PASS);
    expect(screen.getByTestId("backup-create").props.accessibilityState?.disabled).toBe(true);
  });

  test("restaurar: revisar muestra el resumen y solo tras confirmar se reemplaza", async () => {
    await closedDay();
    const exported = await exportAppBackup(PASS);
    expect(exported.ok).toBe(true);
    await hydrate();
    renderSection();
    fs.__pickQueue.push(new fs.File((exported.ok && exported.data!.uri) as string));
    fireEvent.changeText(screen.getByTestId("backup-restore-pass"), PASS);
    await act(async () => {
      fireEvent.press(screen.getByTestId("backup-pick"));
    });
    expect(await screen.findByTestId("backup-preview")).toBeTruthy();
    expect(screen.getByText(t("settings.backup.chainOk"))).toBeTruthy();
    const ledgerBefore = (await PersistenceService.listLedger()).length;
    fireEvent.press(screen.getByTestId("backup-restore"));
    expect(screen.getByText(t("settings.backup.confirmBody"))).toBeTruthy();
    // Todavía no se tocó nada.
    expect((await PersistenceService.listLedger()).length).toBe(ledgerBefore);
    await act(async () => {
      fireEvent.press(screen.getByText(t("settings.backup.confirm")));
    });
    await waitFor(async () => expect((await PersistenceService.listLedger()).at(-1)?.intent).toBe("BACKUP_RESTORED"));
    await waitFor(() => expect(screen.queryByTestId("backup-preview")).toBeNull());
    expect(Store.getState().feedback.pending.some((f) => f.code === "BACKUP_RESTORED")).toBe(true);
  });
});
