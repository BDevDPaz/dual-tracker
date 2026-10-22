import React from "react";
import { Ionicons } from "@expo/vector-icons";
import type { ScreenStatus } from "../../core/contracts";
import { Banner } from "../ui/Banner";
import { EmptyState } from "../ui/EmptyState";
import { LoadingState } from "../ui/LoadingState";

/**
 * Estados de pantalla obligatorios (Producto §4): loading, empty, degraded,
 * conflict, ready. Este bloque pinta los cuatro no-ready de forma uniforme.
 * - loading / empty sustituyen el contenido.
 * - degraded / conflict son banners persistentes sobre el contenido.
 */
interface Props {
  status: ScreenStatus;
  message?: string;
  /** Segunda línea editorial del vacío. */
  emptyDescription?: string;
  onPress?: () => void;
  emptyIcon?: React.ComponentProps<typeof Ionicons>["name"];
}

export function ScreenStatusBanner({ status, message, emptyDescription, onPress, emptyIcon }: Props) {
  if (status === "ready") return null;
  if (status === "loading") return <LoadingState message={message} />;
  if (status === "empty") return <EmptyState title={message ?? ""} description={emptyDescription} icon={emptyIcon} />;
  return <Banner tone={status === "conflict" ? "danger" : "warning"} message={message ?? ""} onPress={onPress} />;
}
