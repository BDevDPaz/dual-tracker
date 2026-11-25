# AGENT.md

## 1. Propósito y Alcance
- **Proyecto:** [Nombre de la aplicación o sistema]
- **Objetivo actual:** [Versión o hito en curso]
- **Fuera de alcance:** [Funciones o mejoras explícitamente excluidas por ahora]

## 2. Arquitectura y Convenciones Técnicas
- **Stack principal:** [Lenguaje, framework, base de datos, estado, build]
- **Estructura de carpetas:** [Rutas clave de pantallas, componentes, lógica, datos y pruebas]
- **Convenciones:** [Tipado estricto, nomenclatura, manejo de errores y persistencia]

## 3. Reglas de Diseño e Interfaz (UI / UX)
- **Fuente de verdad visual:** [Wireframes, mockups, sistema de diseño o tokens vigentes]
- **Estados obligatorios:** Toda pantalla interactiva debe contemplar estado normal, carga, vacío y error.
- **Consistencia:** Reutilizar componentes y tokens existentes antes de crear duplicados.

## 4. Reglas de Trabajo y Auditoría
- **Cero suposiciones:** No asumir requisitos, esquemas o comportamientos no confirmados; inspeccionar archivos o pedir confirmación explícita cuando falte certeza.
- **Alcance acotado:** Modificar únicamente los archivos necesarios para la tarea solicitada.
- **Cambios sensibles:** Solicitar confirmación previa antes de alterar esquemas de datos, reglas de negocio o configuraciones críticas.
- **Definition of Done (DoD):** Un cambio solo se considera terminado cuando compila/ejecuta sin errores, cubre los estados requeridos y queda verificado (prueba automatizada o revisión manual documentada).

## 5. Sincronización de Documentación (`PROJECT_STATE.md` y `CHANGELOG.md`)
1. **Trabajo en curso (`PROJECT_STATE.md`):** Registrar aquí tareas activas, avance de diseño/funciones, pruebas y errores abiertos. Nunca marcar como verificado sin evidencia.
2. **Cierre de tarea (`PROJECT_STATE.md` -> `CHANGELOG.md`):** Al verificar un cambio, mover su resumen a `[Unreleased]` en `CHANGELOG.md` y actualizar o depurar el ítem en `PROJECT_STATE.md`.
3. **Cierre de versión (`vX.Y.Z`):** Agrupar `[Unreleased]` bajo la nueva versión con fecha y **Métricas y Verificación de Entrega**; limpiar de `PROJECT_STATE.md` los ítems ya cerrados.
4. **Verdad en el código:** Si hay diferencia entre el código/archivos reales y `PROJECT_STATE.md`, prevalece la evidencia del código y se actualiza `PROJECT_STATE.md` de inmediato.
