# Marca

El dueño eligió dos conceptos de `propuestas`:

- **A · Pin-Reloj** — icono de la app (iOS, Android adaptativo, monocromo de Android 13, splash y favicon).
- **D · Llegada confirmada** — icono pequeño de notificación (blanco sobre transparente, tintado `#C5A059`) y símbolo en la interfaz (En sitio, llegada y check-in automático).

Los SVG de `assets/brand/A` y `assets/brand/D` son la fuente. Los PNG de `assets/images` los consume `app.json`.

## Regenerar

```bash
python3 -m pip install resvg-py pillow
python3 scripts/brand/build.py
```

`build.py` vuelve a escribir los SVG y estos PNG:

| Archivo | Uso |
| --- | --- |
| `icon.png` | 1024, icono iOS y `expo.icon` |
| `adaptive-icon.png` | primer plano adaptativo, fondo `#050505` |
| `adaptive-monochrome.png` | icono temático de Android 13 (blanco) |
| `splash.png` | marca A centrada sobre `#050505` (1284) |
| `favicon.png` | 48, web |
| `notification-icon.png` | 96, blanco con alfa; el plugin lo tiñe `#C5A059` |

No hay splash claro. `userInterfaceStyle` está fijado en `dark`, así que el splash del sistema no sigue la paleta clara de `theme.ts`. Los componentes `PinClockMark` y `ArrivalMark` sí leen el tema activo.
