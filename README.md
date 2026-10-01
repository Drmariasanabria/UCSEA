# MAR-ESP SIM UC · v10 — Real Communication Lab

Simulador inmersivo de comunicación marítima en inglés (IMO SMCP) para **Inglés Técnico Marítimo II** (Universidad de Cantabria).
Proyecto de innovación docente. Funciona como web estática (GitHub Pages) con Firebase como backend en tiempo real.

## Qué incluye

| Módulo | Para qué sirve |
|---|---|
| **Real Communication Lab** (núcleo) | Sesión en directo con código de embarque. Cada estudiante elige **titulación** (Náutica, Marina, Marítima, Gestión) y **puesto** (30 roles: OOW, Capitán, Jefe de máquinas, ETO, VTS, MRCC, práctico, consignatario, ingeniero naval, inspector PSC…). Cada puesto tiene su consola: radar ARPA (CPA/TCPA, EBL/VRM, blancos sin AIS), gobierno y telégrafo, cámara de máquinas con alarmas, plano del buque, imagen VTS/MRCC, documentación de oficina. Radio VHF multicanal con **PTT por voz** (reconocimiento en-GB), marcadores SMCP, frases, diario de navegación y **análisis lingüístico en vivo** antes de transmitir. |
| **Alarmas y eventos** | 29 eventos (aproximación excesiva, niebla, remolque sin AIS, apagón, incendio, hombre al agua, vía de agua, corrimiento de carga, derrame en bunkering, piratería, PSC…) con alarma sonora propia y **tareas específicas para cada rol**. El docente los dispara, programa en cronograma o activa **eventos aleatorios**; el alumnado también puede notificar eventos. |
| **Consola docente** | Roster con estado y progreso, feed en directo con filtros, **hablar como cualquier estación**, radar maestro (arrastrar/añadir/editar buques, AIS on/off), meteorología, visibilidad, mar, GNSS, planta, **variables del ejercicio**, instrucciones y **estructuras obligatorias** (24 detectables), IA (automática / borrador + aprobación / manual), mensajes privados, **ver como estudiante**, rúbrica alineada con MCER / STCW, exportaciones. |
| **Estaciones con IA que siempre responden** | Cadena: Claude (Cloud Function opcional) → Gemini (Firebase AI Logic) → **motor SMCP local** (detección de intención, extracción de datos, verificación de colación, datos reales del radar y de los eventos). Sin claves en el navegador. |
| **Debriefing / caja negra (VDR)** | Reproducción de la sesión (radar + comunicaciones + alarmas) con línea de tiempo, momentos clave, **tiempos de reacción** por persona y alarma, mapa de estructuras usadas, resumen por participante. |
| **Exportaciones** | PDF, Word (.docx), HTML, Markdown, CSV y JSON reimportable (VDR) — sesión completa o por estudiante; envío al portafolio. |
| **Portafolio** | Evidencias de Lab, misiones, glosario, evaluaciones y reflexiones; gráficas de progreso; exportable (PDF/Word/MD/JSON); el docente comenta y consulta cualquier portafolio. |
| **Glosario colaborativo** | Lista, tarjetas y **grafo dinámico tipo Obsidian** (zoom, arrastre, grafo local, enlaces implícitos). Importa JSON/CSV/notas `.md`/bóvedas `.zip`; exporta JSON, CSV, Markdown, **bóveda de Obsidian** y Anki. 120 términos semilla del material de clase. |
| **Misiones ITM II** | 5 misiones de ~15 min tipo simulador: *Fog at the Pilot Station*, *Bunker Watch*, *Dark Tow in the Lane*, *List to Starboard*, *Call the Place* (escucha con interferencias, radio con reparación, decisiones con tiempo, radar, *claim court*, cronologías, localización en el plano…). |
| **Investigación** | Cuestionario PRE/POST con consentimiento, analíticas de clase y exportaciones **seudonimizadas** (CSV) para evaluar el impacto del proyecto. |

## Funciones avanzadas del Lab (innovación docente)

- **Índice de seguridad del buque**: puntuación de equipo (0–100) visible para toda la tripulación; baja si las alarmas no se reconocen o nadie responde por radio a tiempo, y sube con la calidad del procedimiento SMCP. Convierte la comunicación en responsabilidad compartida.
- **Relevo de guardia**: un clic rota a cada estudiante al siguiente puesto de su titulación y lanza el evento de relevo con briefing obligatorio (posición, tráfico, incidencias, órdenes): todos viven varias perspectivas profesionales.
- **Historias encadenadas**: secuencias reproducibles (escalada en niebla, noche oscura en el DST, cascada técnica, día de puerto, temporal) para que todos los grupos afronten lo mismo en el mismo minuto: comparabilidad para investigación.
- **Modo proyector** (`#/bridge/<id>`): radar grande, radio en directo, alarmas, tripulación e índice de seguridad para la pantalla del aula.
- **Evaluación entre iguales**: al terminar, cada estudiante valora a un compañero (claridad, procedimiento, precisión + comentario); llega de forma anónima y queda en el informe.
- **Fluidez oral**: palabras por minuto y confianza del reconocimiento de voz en cada transmisión por PTT.
- **Glosario en contexto**: los términos del glosario colaborativo se resaltan en los mensajes con su traducción.
- **Mensajes privados del docente, vista de estudiante, rúbrica, tiempos de reacción y caja negra reproducible**.

## Probarlo ya (sin configurar nada)

Abre `index.html?mode=demo` (o pulsa «Probar demo»). En modo demostración todo se guarda en el navegador y **las pestañas se sincronizan**: abre una pestaña como *Docente* y otra como *Estudiante* para ver una sesión en directo completa.

Servidor local: `npx http-server . -p 8080` → http://localhost:8080/?mode=demo

## Puesta en marcha con Firebase (proyecto `maritime-comms`)

1. **Authentication** → Sign-in method: activar *Correo/contraseña* y *Google*. Añadir el dominio de GitHub Pages en *Authorized domains*.
2. **Firestore** → crear el documento `config/instructors` con el campo `emails` (array de strings) con los correos del profesorado. Esas cuentas reciben el rol docente; el resto es estudiante.
3. **Firestore → Reglas**: copiar y publicar `firestore.rules` (o `firebase deploy --only firestore:rules`).
4. **IA sin claves en el navegador**: Firebase console → **AI Logic** → *Get started* → *Gemini Developer API* (plan gratuito). En la consola docente → pestaña IA → «Probar respuesta del VTS».
5. *(Opcional, Claude)*: `cd functions && npm install`, `firebase functions:secrets:set ANTHROPIC_API_KEY`, `firebase deploy --only functions`, y pegar la URL de `npcReply` en la pestaña IA. La clave vive en Secret Manager; la función solo responde a usuarios autenticados del proyecto.

Si Firebase no responde, la app pasa automáticamente al modo demo y avisa.

## Arquitectura

- Sin paso de compilación: módulos ES servidos tal cual (GitHub Pages). Firebase modular v12 desde el CDN oficial `gstatic` mediante `import()` dinámico.
- `src/backend/` — misma interfaz para `local.js` (localStorage + BroadcastChannel) y `firebase.js` (Auth + Firestore).
- `src/sim/` — cinemática determinista compartida (todos los clientes calculan las mismas posiciones a partir de anclas), radar en canvas, director de eventos (aleatorios y cronograma).
- `src/ai/` — analizador lingüístico explicable, motor SMCP local, cadena de proveedores.
- `src/lab/` — controlador de sesión en tiempo real y componentes de consola.
- `src/views/` — pantallas. `src/export/` — informes, DOCX, ZIP, glosario.
- Firestore: `profiles`, `labs/{id}` (+ `crew`, `comms`, `events`, `track`), `glossaryTerms`, `portfolios/{uid}/entries`, `missionRuns`, `config`.

## Pruebas

`npm test` — 21 pruebas de la lógica (analizador, motor de diálogo, cinemática y CPA, eventos y tareas por rol, misiones, parser de localizaciones, glosario, ZIP).

## Notas de honestidad pedagógica

Los indicadores automáticos (estructuras, precisión SMCP, tiempos de reacción) son reglas explicables que **apoyan** la evaluación docente; no la sustituyen ni prueban por sí solos un efecto de aprendizaje. Los barcos, personas y empresas de los escenarios y misiones son ficticios; los casos reales (MAIB 29/2014, 6/2016) solo inspiran situaciones.

La carpeta antigua (`assets/`, `itm2-missions/`, `simulator3d/`, `audio/`, `tests/`) pertenece a la v9 y ya no se usa.
