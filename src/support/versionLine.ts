/**
 * Línea de versión de Ajustes / Soporte y del diagnóstico.
 * Con canal: «Versión 1.0.0 (RC1) · build N». Sin canal (development): sin paréntesis.
 */
import type { Language } from "../i18n";
import { t } from "../i18n";
import { APP_VERSION } from "../constants/app";
import { readBuildLabel, readGitCommit, readReleaseChannel } from "./buildLabel";

export function formatVersionLine(input: {
  version: string;
  build: string;
  channel: string;
  lang?: Language;
}): string {
  const channel = input.channel.trim();
  if (channel) {
    return t("support.about.line", { version: input.version, channel, build: input.build }, input.lang);
  }
  return t("support.about.linePlain", { version: input.version, build: input.build }, input.lang);
}

/** Línea con la versión, el canal y la compilación de esta ejecución. */
export function currentVersionLine(lang?: Language): string {
  return formatVersionLine({
    version: APP_VERSION,
    build: readBuildLabel(),
    channel: readReleaseChannel(),
    lang,
  });
}

/** Pie de Ajustes: versión, compilación y commit si la build lo trae. Sin rayas. */
export function settingsFooterLine(lang?: Language): string {
  const version = APP_VERSION;
  const build = readBuildLabel();
  const commit = readGitCommit();
  if (commit) return t("settings.footerCommit", { version, build, commit: commit.slice(0, 7) }, lang);
  return t("settings.footer", { version, build }, lang);
}
