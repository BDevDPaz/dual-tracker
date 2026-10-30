import React from "react";
import { ScrollViewStyleReset } from "expo-router/html";

/**
 * app/+html.tsx — Shell HTML mínimo requerido por Expo Router para
 * `expo export --platform web`. Dual Tracker es una app móvil; este archivo
 * existe únicamente para que el export estático y el typecheck no se rompan
 * (Propuesta capa app §3.1). No forma parte del producto móvil.
 *
 * Sigue al pie de la letra la plantilla documentada por Expo Router.
 */
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        {/*
          Desactiva el bounce/scroll elástico del ScrollView raíz en web para
          que se comporte como una app nativa embebida, no como una página.
        */}
        <ScrollViewStyleReset />

        {/* Estilos globales mínimos para que el body ocupe toda la ventana. */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const responsiveBackground = `
body {
  background-color: #0A0A0C;
}`;
