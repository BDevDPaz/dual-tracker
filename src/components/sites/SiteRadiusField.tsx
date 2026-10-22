import React from "react";
import { Input } from "../ui/Input";
import { t } from "../../i18n";
import { parseSiteRadius } from "../../utils/siteRadius";

type InputProps = React.ComponentProps<typeof Input>;

/** Radio en metros: teclado numérico y error en línea si no es mayor que 0. */
export function SiteRadiusField({ value, onChangeText, ...rest }: InputProps) {
  const text = typeof value === "string" ? value : "";
  const invalid = parseSiteRadius(text) === null;
  return (
    <Input
      {...rest}
      label={rest.label ?? t("sites.radius")}
      keyboardType="numeric"
      value={value}
      onChangeText={onChangeText}
      error={rest.error ?? (invalid ? t("sites.radiusInvalid") : undefined)}
    />
  );
}
