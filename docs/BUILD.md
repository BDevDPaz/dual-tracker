# Builds con EAS — instalar Dual Tracker en un Android y un iPhone reales

Esta guía explica cómo compilar la app con **EAS Build** (en los servidores de Expo) para instalarla en equipos reales y ejecutar la matriz de dispositivo D1–D15 ([PRUEBAS_DISPOSITIVO.md](PRUEBAS_DISPOSITIVO.md)). La compilación ocurre en la nube: desde Termux solo se lanza el comando y se descarga el resultado.

## Resumen

| Perfil | Para qué | Android | iOS | Variante |
| --- | --- | --- | --- | --- |
| `development` | Desarrollo diario con `expo-dev-client` (recarga en caliente, geocerca y segundo plano reales) | APK debug, instalación interna | Ad hoc (equipos registrados) | App real |
| `preview` | **Pruebas D1–D10 y D12–D15**: build de release (Hermes) | APK release para instalar a mano | Ad hoc (equipos registrados) | App real |
| `preview-simulator` | Humo rápido en el simulador de iOS (Mac con Xcode) | — (no usar) | `.app` para simulador | App real |
| `preview-d11` | **Solo D11**: llavero forzado a fallar | APK release | Ad hoc | `com.bdevdpaz.dualtracker.d11`, «Dual Tracker D11» |
| `production` | Tiendas (Play / App Store) | AAB (`app-bundle`) | Store | App real |

Atajos de `package.json` (usan `npx eas-cli@latest`, así que no hace falta instalar nada en el proyecto):

```bash
npm run build:android:dev       # perfil development, Android
npm run build:android:preview   # perfil preview, Android (APK)
npm run build:ios:preview       # perfil preview, iOS (ad hoc)
npm run build:android:d11       # perfil preview-d11, Android (APK)
npm run build:ios:d11           # perfil preview-d11, iOS (ad hoc)
```

## Identificadores y versiones

- **Paquete Android / bundle iOS** (app real): `com.bdevdpaz.dualtracker` (ya estaban en `app.json` y no se tocan).
- **Variante D11**: `com.bdevdpaz.dualtracker.d11`, nombre «Dual Tracker D11», esquema `dualtracker-d11`.
- **Versión visible**: `version` de `app.json` (hoy `0.1.0`). Se sube a mano al publicar.
- **Número de build** (`versionCode` en Android, `buildNumber` en iOS): lo lleva EAS en el servidor (`"appVersionSource": "remote"` en `eas.json`).
  - Por qué remoto y no local: la config es dinámica (`app.config.ts`) y EAS no puede reescribir un número local dentro de ella; con el remoto, `autoIncrement` funciona sin commits extra por cada build y sin conflictos entre Termux y otro equipo.
  - **`autoIncrement: true`** en `preview`, `preview-d11` y `production`. Cada APK o build de iOS de esos perfiles sale con un número distinto, así que Android no trata el APK nuevo como la misma compilación que el anterior. `preview-simulator` lo hereda de `preview` (`extends`). `development` no lo incrementa.
  - El contador es el remoto del proyecto EAS (mismo `versionCode` / `buildNumber` para la app real). La variante D11 tiene otro identificador (`com.bdevdpaz.dualtracker.d11`) pero también pide incremento, así que cada APK de D11 queda distinguido.
  - Si el primer build pregunta con qué número empezar, usa `1` (no hay builds previos en tiendas).
  - Para consultarlo o fijarlo: `npx eas-cli@latest build:version:get` / `build:version:set`.
- **`runtimeVersion`**: no se define porque la app **no usa `expo-updates`** (no hay actualizaciones OTA). Si algún día se añade, habrá que instalar `expo-updates`, fijar `runtimeVersion` (p. ej. `{ "policy": "appVersion" }`) y un `channel` por perfil.
- **`owner`**: `bdevdpaz` (en `app.json`). Tiene que coincidir con el usuario u organización de Expo con el que hagas `eas login`; si tu usuario de Expo es otro, cambia `owner` antes de `eas init`.

## Configuración única (una sola vez)

1. **Node ≥ 20.19.4** (lo pide React Native 0.81). En Termux: `pkg install nodejs-lts git` y comprueba con `node -v`.
2. **eas-cli**: no es dependencia del proyecto. Úsalo con `npx eas-cli@latest …` (lo que hacen los scripts) o instálalo global con `npm install -g eas-cli`. `eas.json` exige `>= 24.11.0`.
3. **Cuenta de Expo** (gratis): créala en <https://expo.dev/signup> y entra:
   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest whoami
   ```
4. **Vincular el proyecto**:
   ```bash
   npx eas-cli@latest init
   ```
   Crea el proyecto `@bdevdpaz/dual-tracker` en expo.dev y escribe `extra.eas.projectId` en `app.json` (`app.config.ts` lo hereda). **Haz commit de ese cambio**: el `projectId` no es secreto.
   Ya está hecho: `projectId` `d3fb0bb9-4964-403a-8801-b8761ad127b4`. Si `eas init` (u otro comando que reescriba la config) falla con `Error reading Expo config at …/app.config.ts: Unexpected token '{'`, es el `@expo/config` que trae eas-cli, que en Node 20 no sabe evaluar `app.config.ts`; ejecútalo con Node ≥ 22.12. `eas build` no se ve afectado porque lee la config con el `expo` del proyecto.
5. EAS sube el proyecto desde git: haz commit antes de compilar para que el build corresponda a un commit concreto (anótalo en la columna «Build» de la matriz).

No hay secretos en el repositorio. Los keystores de Android, certificados y perfiles de iOS los genera y guarda EAS en su servidor (`npx eas-cli@latest credentials` para verlos o descargarlos). `.gitignore` ya excluye `*.jks`, `*.p8`, `*.p12`, `*.key` y `*.mobileprovision`.

## Android: build de prueba (APK) e instalación

1. Lanza el build:
   ```bash
   npm run build:android:preview
   ```
   La primera vez pregunta si genera un **keystore** nuevo: responde que sí. EAS lo guarda y lo reutiliza siempre para este paquete, así que cada APK nuevo se instala **encima** del anterior conservando los datos.
2. Al terminar, la terminal muestra un enlace (y un QR) a la página del build en expo.dev.
3. En el teléfono, abre ese enlace, pulsa **Install** / descarga el `.apk` y ábrelo.
4. Android pedirá permitir **«Instalar apps desconocidas»** para el navegador o el gestor de archivos: actívalo solo para esa app.
5. Abre «Dual Tracker» y concede ubicación (incluida «Permitir todo el tiempo»), notificaciones y la exclusión de optimización de batería.

Con un emulador o un equipo por USB también sirve `npx eas-cli@latest build:run -p android --latest`.

**D13 (actualización desde 8df2b9a)**: el APK viejo y el nuevo deben estar firmados con el **mismo** keystore. Compila 8df2b9a también con EAS: crea una rama desde ese commit, copia `eas.json`, haz commit y lanza `eas build --profile preview --platform android`. Como el paquete es el mismo (`com.bdevdpaz.dualtracker`), EAS usa el mismo keystore. Después instala el build de `main` encima sin desinstalar.

## iOS: qué hace falta

- **Apple Developer Program de pago** (99 USD/año). Con un Apple ID gratuito EAS no puede firmar builds ad hoc.
- **Registrar el iPhone** (una vez por equipo):
  ```bash
  npx eas-cli@latest device:create
  ```
  Genera un enlace/QR; ábrelo en el iPhone con Safari e instala el perfil que registra su UDID en tu cuenta de Apple.
- **Compilar**:
  ```bash
  npm run build:ios:preview
  ```
  EAS te pide entrar con tu Apple ID la primera vez y crea el certificado de distribución y el perfil ad hoc con los equipos registrados. Si registras un iPhone **después**, vuelve a compilar (EAS ofrece regenerar el perfil) o el nuevo equipo no podrá instalarlo.
- **Instalar**: abre en el iPhone el enlace del build e instala. En iOS 16 o superior activa **Ajustes → Privacidad y seguridad → Modo de desarrollador** y reinicia.
- **Simulador** (sin cuenta de pago, necesita un Mac con Xcode):
  ```bash
  npx eas-cli@latest build --profile preview-simulator --platform ios
  npx eas-cli@latest build:run -p ios --latest
  ```
  Sirve para humo visual, **no** para la matriz: el simulador no reproduce el llavero con el equipo bloqueado, reinicios ni respaldos (D4, D5, D9, D10).

## Build de D11 (llavero forzado a fallar)

```bash
npm run build:android:d11
npm run build:ios:d11      # requiere lo mismo que iOS preview
```

- El perfil `preview-d11` extiende `preview` y fija `APP_VARIANT=d11` y `EXPO_PUBLIC_DT_FORCE_KEYSTORE_FAILURE=1`.
- Se instala **al lado** de la app real: icono con el nombre «Dual Tracker D11» y paquete/bundle `com.bdevdpaz.dualtracker.d11`. Tiene su propia base de datos y nunca toca los datos de la app real.
- La primera vez EAS pedirá generar un keystore propio (Android) y un App ID + perfil ad hoc propios (iOS) para el identificador `.d11`: acéptalo.
- Para extraer su base en Android usa el paquete de la variante: `adb exec-out run-as com.bdevdpaz.dualtracker.d11 cat files/SQLite/dual_tracker_v1.db > dt-d11.db` (con build *debuggable* o emulador, igual que en la matriz).
- Al terminar D11, desinstala «Dual Tracker D11».

**Doble cerrojo para que la bandera no llegue nunca a la app real:**

1. **Al compilar** (`app.config.ts`): si `EXPO_PUBLIC_DT_FORCE_KEYSTORE_FAILURE` tiene cualquier valor sin `APP_VARIANT=d11`, o `APP_VARIANT` tiene un valor desconocido, la evaluación de la config falla y no hay build, ni `expo start`, ni prebuild. También falla `APP_VARIANT=d11` sin la bandera.
2. **Al ejecutar** (`src/services/persistence/keyStore.ts`): el fallo forzado solo actúa si además la config embebida es la variante d11 (`extra.appVariant === "d11"`). En la app real la bandera se ignora.

La prueba `src/core/__tests__/buildConfig.test.ts` comprueba en cada `npm test` que `development`, `preview` y `production` no fijan la bandera, que solo `preview-d11` la fija y siempre con `APP_VARIANT=d11`, y que `app.config.ts` la rechaza fuera de esa variante.

Para revisar la config de cada variante sin compilar:

```bash
npx expo config --type public                                                        # app real
APP_VARIANT=d11 EXPO_PUBLIC_DT_FORCE_KEYSTORE_FAILURE=1 npx expo config --type public  # D11
```

## Development build (desarrollo diario)

```bash
npm run build:android:dev
```

Instala el APK como en preview y luego, en el equipo de desarrollo:

```bash
npx expo start            # abre en modo dev client (ya no en Expo Go)
npx expo start --go       # si alguna vez quieres Expo Go
```

`expo-dev-client` va como dependencia porque `developmentClient: true` lo necesita para el lanzador y el menú de desarrollo. En builds de release (`preview`, `preview-d11`, `production`) no aparece. **No sirve para D1–D15**: la matriz exige build de release con Hermes.

## Producción (más adelante)

```bash
npx eas-cli@latest build --profile production --platform android   # AAB para Google Play
npx eas-cli@latest build --profile production --platform ios       # App Store / TestFlight
```

`submit.production` en `eas.json` es solo un marcador. Para `eas submit` harán falta credenciales (cuenta de servicio de Google Play, clave de la API de App Store Connect) que se cargan en EAS (`npx eas-cli@latest credentials` o expo.dev) y **nunca** en el repositorio.

## Problemas frecuentes

- **«An Expo user account is required»**: falta `eas login` (o `EXPO_TOKEN` en CI).
- **«EXPO_PUBLIC_DT_FORCE_KEYSTORE_FAILURE solo se admite con APP_VARIANT=d11»**: tienes la bandera en el entorno (shell, `.env*`, variables de entorno de EAS) fuera del perfil `preview-d11`. Quítala.
- **«App no instalada» al actualizar en Android**: el APK está firmado con otro keystore (otra cuenta de Expo o un build local). Desinstala o compila con las mismas credenciales de EAS.
- **El iPhone no instala el build**: no estaba registrado cuando se generó el perfil ad hoc. Ejecuta `device:create` y vuelve a compilar.
