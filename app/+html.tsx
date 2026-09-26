/**
 * app/+html.tsx — Shell web para export estático de Expo Router. No forma
 * parte del producto móvil; se declara para no romper el typecheck.
 */
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <title>Dual Tracker</title>
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: "body{background-color:#0A0A0C;}" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
