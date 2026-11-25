# PROJECT_STATE.md

> **Propósito:** Fotografía objetiva y actualizada del estado real de la aplicación. No registrar funciones como completadas si no han sido verificadas.

---

## 1. Resumen General
- **Aplicación:** [Nombre de la app]
- **Versión / Hito actual:** [Ej. v1.2.0 — Módulo de reportes]
- **Última actualización:** [AAAA-MM-DD]
- **Estado general:** [En diseño / En desarrollo / En pruebas / Estable]
- **Fuente de reglas:** Ver `AGENT.md` | **Historial de entregas:** Ver `CHANGELOG.md`

---

## 2. Estado de Diseño (UI / UX)
*Seguimiento de pantallas, flujos y adherencia al sistema visual.*

| Pantalla / Flujo | Wireframe | Mockup | Implementado en UI | Estados cubiertos (Normal / Carga / Vacío / Error) | Notas / Observaciones |
| :--- | :---: | :---: | :---: | :---: | :--- |
| [Ej. Inicio / Dashboard] | [x] | [x] | [x] | [x] / [x] / [x] / [ ] | Falta ajustar estado de error de red |
| [Ej. Formulario de registro] | [x] | [x] | [ ] | [ ] / [ ] / [ ] / [ ] | Pendiente de pasar a código |
| [Ej. Historial / Listado] | [x] | [ ] | [ ] | [ ] / [ ] / [ ] / [ ] | En revisión de distribución |

- **Sistema de diseño / Tokens:** [Confirmado / En ajuste — especificar qué falta]
- **Pendientes visuales abiertos:** [Lista breve de ajustes de layout, contraste, tipografía o espaciado]

---

## 3. Estado de Funciones y Lógica
*Inventario real de módulos, persistencia e integraciones.*

### Completado y verificado
- **[Módulo / Función 1]:** [Qué hace exactamente y cómo se confirmó que funciona]
- **[Módulo / Función 2]:** [Qué hace exactamente y cómo se confirmó que funciona]

### En progreso
- **[Módulo / Función 3]:** [Qué está hecho] — *Falta:* [Qué queda exactamente para cerrarlo]

### No iniciado / Planificado
- **[Módulo / Función 4]:** [Descripción breve del alcance]

---

## 4. Estado de Pruebas y Calidad
*Evidencia verificable del funcionamiento actual.*

- **Compilación / Build:** [Pasa sin errores / Falla en X]
- **Pruebas automatizadas (Unit / Integración):** [Ej. X de Y pasando, o "No configuradas aún"]
- **Pruebas manuales en dispositivo / entorno:**
  - [x] Flujo principal probado sin bloqueos
  - [ ] Validación de entradas inválidas y límites
  - [ ] Comportamiento offline / recuperación ante fallos
- **Errores conocidos (Bugs abiertos):**
  1. `[Severidad: Alta/Media/Baja]` — [Descripción concreta del fallo y dónde ocurre]

---

## 5. Pendientes Priorizados (Próximos Pasos)
*Ordenados por prioridad e impacto para el siguiente bloque de trabajo.*

1. **[Prioridad 1 — Crítico]:** [Tarea concreta + criterio para darla por terminada]
2. **[Prioridad 2 — Importante]:** [Tarea concreta + criterio para darla por terminada]
3. **[Prioridad 3 — Mejora]:** [Tarea concreta + criterio para darla por terminada]

---

## 6. Bloqueos y Decisiones Pendientes de Confirmación
*Puntos donde no se debe asumir comportamiento sin confirmación o revisión explícita.*

- **Bloqueos técnicos:** [Ej. Falta definir esquema de tabla X o revisar archivo Y]
- **Decisiones por confirmar:** [Ej. Confirmar regla de cálculo en caso límite Z antes de implementar]
