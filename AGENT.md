# AGENT.md

## Propósito

Este archivo define las reglas obligatorias para cualquier cambio en el proyecto.
Su objetivo es mantener consistencia arquitectónica, calidad de código y coherencia visual.

---

# Jerarquía de referencia

Cuando exista información contradictoria:

1. AGENT.md
2. CHANGE-LOGS.md
3. PROJECT_STATE.md
4. Código existente
5. Comentarios históricos

La jerarquía superior prevalece.

---

# Principios generales

- Priorizar simplicidad sobre complejidad.
- Evitar crear nuevos patrones cuando ya exista uno.
- Mantener consistencia con la arquitectura actual.
- Realizar cambios mínimos necesarios.
- No refactorizar código no relacionado con la tarea.

---

# Arquitectura

## Obligatorio

- Respetar la separación de capas.
- UI no debe contener lógica de negocio.
- La lógica de negocio no debe depender de componentes visuales.
- El acceso a datos debe centralizarse.

## Prohibido

- Llamadas directas a API desde componentes visuales.
- Duplicación de lógica existente.
- Dependencias circulares.

---

# Convenciones de código

## Nombres

- Componentes: PascalCase.
- Variables: camelCase.
- Constantes globales: UPPER_SNAKE_CASE.
- Archivos: kebab-case.

Ejemplo:

UserProfile.tsx
user-service.ts
API_TIMEOUT

---

# Diseño UI/UX

## Consistencia visual

- Utilizar exclusivamente el sistema de diseño definido.
- Reutilizar componentes existentes antes de crear nuevos.
- Mantener espaciado uniforme.

## Accesibilidad

- Contraste mínimo AA.
- Navegación con teclado.
- Etiquetas accesibles en formularios.

---

# Gestión de estado

Antes de crear nuevo estado:

1. Verificar si ya existe.
2. Reutilizar stores existentes.
3. Evitar duplicidad de fuentes de verdad.

---

# Dependencias

Antes de instalar una librería:

- Verificar si existe una solución interna.
- Justificar el beneficio.
- Evaluar impacto en bundle size.

---

# Testing

Todo cambio debe:

- Mantener pruebas existentes.
- Agregar pruebas si introduce lógica nueva.
- No disminuir cobertura.

---

# Rendimiento

Evitar:

- Renderizados innecesarios.
- Peticiones duplicadas.
- Cálculos costosos en render.

Priorizar:

- Memoización cuando corresponda.
- Lazy loading.
- Caché.

---

# Seguridad

Nunca:

- Exponer secretos.
- Hardcodear credenciales.
- Registrar datos sensibles en logs.

---

# Proceso de cambios

Antes de modificar código:

1. Leer AGENT.md.
2. Revisar PROJECT_STATE.md.
3. Revisar CHANGE-LOGS.md.

Después de modificar código:

1. Actualizar CHANGE-LOGS.md.
2. Actualizar PROJECT_STATE.md si cambia la arquitectura.
3. Verificar compilación.
4. Ejecutar pruebas relevantes.

---

# Regla de cambios mínimos

Resolver exclusivamente el problema solicitado.

No:

- Refactorizar áreas no relacionadas.
- Renombrar archivos innecesariamente.
- Reestructurar carpetas sin justificación.

Preferir arreglos conservadores.

# Reglas para agentes de IA

- No asumir requisitos no especificados.
- No inventar comportamientos de negocio.
- Si existe incertidumbre, señalarla explícitamente.
- Basar decisiones en archivos del proyecto antes que en supuestos.
- Mantener compatibilidad hacia atrás.
- Priorizar cambios pequeños y verificables.
- Explicar riesgos antes de proponer cambios grandes.
