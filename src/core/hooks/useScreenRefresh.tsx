/**
 * Refresco de pantallas de datos.
 *  - useAutoRefresh: al ganar el foco relee SQLite (las tabs no se desmontan;
 *    volver a Historial/Reportes no remontaba la query). El primer plano lo
 *    cubre boot.onForeground, una sola vez para toda la app.
 *  - usePullToRefresh: RefreshControl con los tokens Luxury Glass Dark.
 *    `safeArea: "consumed"` cuando ScreenContainer ya aplicó el inset (offset 0).
 *    `safeArea: "edge"` en scroll a sangre (edge-to-edge): el spinner baja
 *    `insets.top` para no quedar bajo la barra de estado.
 */
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { RefreshControl, type RefreshControlProps } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TOKENS } from "../../constants/theme";
import { t, useLanguage } from "../../i18n";
import { refreshMirror } from "../../services/application/refreshMirror";
import { PermissionsHealthService } from "../../services/runtime/PermissionsHealthService";
import { useMotionPreference } from "../../components/ui/motion";

export function useAutoRefresh(): void {
  useFocusEffect(
    useCallback(() => {
      void refreshMirror();
    }, []),
  );
}

export function usePullToRefresh(options?: { safeArea?: "consumed" | "edge" }): {
  refreshing: boolean;
  refreshControl: ReactElement<RefreshControlProps>;
} {
  const language = useLanguage();
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  const insets = useSafeAreaInsets();
  const reduceMotion = useMotionPreference();
  const progressViewOffset = options?.safeArea === "edge" ? insets.top : 0;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void (async () => {
      try {
        await refreshMirror({ force: true });
        await PermissionsHealthService.refresh().catch(() => undefined);
      } finally {
        if (mounted.current) setRefreshing(false);
      }
    })();
  }, []);

  const refreshControl = (
    <RefreshControl
      testID="screen-refresh-control"
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={TOKENS.colors.primary}
      colors={[TOKENS.colors.primary]}
      progressBackgroundColor={TOKENS.colors.surface}
      progressViewOffset={progressViewOffset}
      title={reduceMotion ? undefined : t("a11y.refreshing", {}, language)}
      titleColor={TOKENS.colors.text.secondary}
      accessibilityLabel={t("a11y.refresh", {}, language)}
    />
  );

  return { refreshing, refreshControl };
}
