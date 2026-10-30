# Dual Tracker — Guía de Estilos Visual 2.0
### Obsidian & Porcelain · Dark Mode + Light Mode · ES/EN

> Sistema completamente nuevo. Mantiene la identidad `#0D0D0D` + `#D4AF37` de `app.json`
> pero la eleva a un sistema dual real, accesible y bilingüe.
> Basado en la arquitectura de la **Guía de Comandos Esenciales y Especializados** y
> en la estructura real de `DualTracker_ServiceLayer`.

---

## 1. Filosofía

**Luxury utilitario.** No es un dashboard genérico: es una herramienta de campo que debe
leerse bajo el sol y en la noche, con guantes, con prisa.

- **Dark = Obsidian:** turno nocturno, ahorro de batería, foco operativo.
- **Light = Porcelain:** turno diurno, lectura bajo sol, reportes imprimibles.
- El dorado es señal, no decoración: solo para acción primaria, estado activo y marca.

## 2. Color

### Primitivos de marca
| Token | Valor | Uso |
|-------|-------|-----|
| `BRAND.gold` | `#D4AF37` | Acento dark, iconos, tab activa |
| `BRAND.goldDeep` | `#B8962E` | Pressed en dark |
| `BRAND.goldInk` | `#8F6E0B` | Primario en light (contraste AA) |
| `BRAND.obsidian` | `#0D0D0D` | Fondo dark |
| `BRAND.porcelain` | `#F9F8F4` | Fondo light |

### Semánticos
Ambos modos exponen el mismo API: `tokens.colors.background`, `surface`, `surfaceElevated`,
`primary`, `border`, `text.primary/secondary/muted/inverse`, `status.*`, `statusSoft.*`, `overlay`.

**Regla:** nunca uses el hexadecimal directo en componentes. Usa `useTheme().tokens`.

Contraste:
- Dark: texto `#FFFFFF` sobre `#0D0D0D` = 21:1
- Light: texto `#141412` sobre `#F9F8F4` = 15.8:1
- Primario light `#8F6E0B` sobre blanco = 4.6:1 (AA)

## 3. Tipografía

Fuente: **Montserrat** (`@expo-google-fonts/montserrat` ya en `package.json`).

| Estilo | Tamaño / Peso | Uso |
|--------|---------------|-----|
| h1 | 30 / 800 | Título de pantalla, hero operativo |
| h2 | 22 / 700 | Título de modal, sección |
| h3 | 17 / 600 | Título de card |
| bodyStrong | 15 / 600 | Dato destacado |
| body | 15 / 400 | Párrafo |
| caption | 13 / 500 | Secundario |
| label | 11 / 700 + tracking 0.8 | Eyebrow, pills, tabs |

Siempre `fontFamily` desde `FONT_FAMILY`. No usar `fontWeight` numérico suelto.

## 4. Espaciado, radios, sombras

Espaciado base 4pt: `4, 8, 12, 16, 24, 32, 48, 64`.
`screenPadding: 20`, `sectionGap: 28`, `cardPadding: 16`, `minTouchTarget: 44`.

Radios: `sm 8` (chips), `md 12` (inputs, botones), `lg 16` (cards), `xl 24` (modales),
`round 9999` (pills).

Sombras: en dark son negras profundas; en light son cálidas `rgba(58,47,11,*)` para
no ensuciar el porcelain.

## 5. Componentes (blueprints)

### Button — `src/components/ui/Button.tsx`
Variantes: `primary | secondary | danger | ghost | success`. Tamaños `sm 40 / md 56 / lg 64`.
- primary: `bg primary`, texto `text.inverse`. En light el texto es blanco, en dark es obsidian.
- secondary: borde `border`, texto `text.primary`.
- Haptics + scale `0.97` en press. `isLoading` reemplaza label por spinner.
- Nunca poner dos `primary` juntos en un modal.

### Card — `src/components/ui/Card.tsx`
Variantes: `elevated` (default, borde sutil + sombra), `surface`, `outline`.
Padding `16`, radius `16`. En light siempre blanca con sombra cálida.

### Input — `src/components/ui/Input.tsx`
Altura 56, radius 12, fondo `backgroundSoft`, borde `border`. Focus: borde `primary`.
Label arriba en `FONT.label`, helper/error abajo en `caption`.

### StatusPill — `src/components/ui/StatusPill.tsx`
Mapeo ES/EN vía `i18n`:
- `ACTIVE_WORK` → ACTIVO / ACTIVE → `successSoft`
- `pending` → ESPERANDO LLEGADA / AWAITING ARRIVAL → `infoSoft`
- `warning` → EN TRÁNSITO / IN TRANSIT → `warningSoft`
- `CLOSED` → FUERA DE SERVICIO / OFF DUTY → `surface`

Texto siempre uppercase, 11px.

### ModalShell — `src/components/ui/ModalShell.tsx`
Bottom-sheet. Tono → color/icono:
`neutral=gold`, `success=verde`, `warning=ámbar`, `danger=rojo`, `info=azul`.
Header: icono 44px con fondo `tone 20%` + título h2 + X.
Footer: máximo 2 botones.

Modales del sistema:
1. **DailySetupModal** (`neutral`) — INICIAR JORNADA / START SHIFT. Inputs dirección, cliente, notas.
2. **ExitDetectionModal** (`warning`) — ¿Terminaste o vas a otro sitio?
3. **LunchModal** (`info`) — ¿TOMASTE ALMUERZO? / DID YOU TAKE LUNCH?
4. **AddNoteModal** (`neutral`)
5. **EditSessionModal** (`neutral`)
6. **DeleteSessionModal** (`danger`) — ELIMINAR / DELETE.

### PageHeader, ScreenContainer, Section, EmptyState, OperationalHeroCard, SessionTimeline
- `ScreenContainer`: `background`, padding 20, maxWidth 480 centrado en web.
- `PageHeader`: eyebrow `label` + h1 + acción opcional.
- `OperationalHeroCard`: hero de Hoy. Fondo `surfaceElevated`, borde `primarySoft` cuando hay geocerca activa.
- `SessionTimeline`: línea vertical con dots de estado.

## 6. Pantallas (blueprints)

### (tabs)/index — Hoy
```
[PageHeader: Hoy / Today + StatusPill]
[OperationalHeroCard: ubicación actual, destino, hint geocerca activa]
[Acciones: INICIAR JORNADA / TERMINAR JORNADA]
[DailySummaryBlock: HORAS / GANANCIA EST.]
```
Estado vacío → `EmptyState` con CTA.

### (tabs)/history — Historial
Lista de `Card` + `SessionTimeline` resumida. Columnas: Fecha, Ubicación, Entrada, Salida.

### (tabs)/reports — Reportes
`DocumentPreviewWidget` + Card "Listo para Generar" + botones DESCARGAR PDF / ENVIAR POR EMAIL.

### (tabs)/settings — Ajustes
Secciones GENERAL / ZONA ADMIN. Inputs: nombre, tarifa, idioma, radio.

### sites/index, sites/new, sites/[id]
Registro de sitios. `new` reutiliza los inputs de DailySetupModal pero en pantalla completa.

### session/[id], session/[id]/trace
Detalle + traza GPS. `IntegrityBadge` visible siempre.

### (onboarding)/welcome → disclosure → permissions → profile
Fondo `background`, ilustración dorada sutil, un solo CTA `primary` por paso.

## 7. Internacionalización

Todo string visible viene de `src/utils/i18n.ts`. Claves en snake_case.
Nunca hardcodear "GUARDAR" / "SAVE". Ejemplo:

```ts
t("btn_clock_out") // TERMINAR JORNADA / CLOCK OUT
t("lunch_title")   // ¿TOMASTE ALMUERZO? / DID YOU TAKE LUNCH?
```

## 8. ThemeContext nuevo

```tsx
// src/context/ThemeContext.tsx
const { tokens, mode, toggleMode, setMode } = useTheme();
// mode: "dark" | "light", tokens: TOKENS_DARK | TOKENS_LIGHT
// Lee Appearance + AsyncStorage "dualtracker-theme-mode"
```

Migración:
1. Reemplazar `src/constants/theme.ts` por la versión 2.0 de este paquete.
2. Actualizar `ThemeContext` al nuevo con modo dual.
3. En componentes, cambiar `PALETTE.xxx` → `tokens.colors.*`.

## 9. Checklist de implementación

- [ ] Montserrat cargada en `_layout` con `expo-font`
- [ ] `userInterfaceStyle: "automatic"` ya está en app.json
- [ ] Probar Hoy en ambos modos bajo sol y noche
- [ ] Validar contraste de `primary` en light con texto blanco
- [ ] Revisar modales: solo un primary por footer
