# IMPLEMENTATION_PLAN — Triviunsada

Plan de inicialización a partir de `requerimientos.rtf` (SRS, aplicación estilo Mentimeter, MVP 100% cliente).

**Estado:** Fases 0, 1, 2 y 3, la plantilla UNSAdA y el acceso oculto a `/config` están implementados.

**Alcance de la primera aprobación:** Fase 0 (esqueleto ejecutable). Las fases 1–3 se implementan solo con un "Proceder" explícito por fase.

---

## 1. Arquitectura y flujo de datos

### Decisiones

| Tema | Decisión |
| --- | --- |
| Stack | Next.js (App Router) + React + TypeScript estricto |
| Estilos | Tailwind CSS |
| Persistencia | `localStorage`, esquema versionado. Repositorio intercambiable si más adelante hace falta IndexedDB |
| Tiempo real | PeerJS en el navegador. El host es el único dueño del estado de la partida |
| Export estático | `output: 'export'` para Vercel, Netlify o GitHub Pages |
| Validación de JSON | Zod |
| Tests de dominio | Vitest sobre funciones puras (puntaje, validación, importación) |
| Idioma de UI | Español |

### Tensión PeerJS vs. “sin APIs externas”

El SRS pide a la vez PeerJS (RNF-02) y cero APIs externas (RNF-03). WebRTC necesita un broker de señalización para el handshake. En el MVP se usa el broker público de PeerJS (`0.peerjs.com`) **solo para descubrir pares**. No hay backend propio, ni base de datos, ni API de la app. Preguntas, puntajes y ranking viven en el navegador del host.

Si el broker público no está disponible, la sala no se puede abrir. No se agrega un PeerServer propio en esta fase.

### Modelo de contenido

```ts
type Career = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type AnswerOption = {
  id: string;
  text: string;
};

type Question = {
  id: string;
  careerId: string;
  text: string;
  timeLimitSeconds: number; // entero > 0
  options: AnswerOption[];  // 2 a 6
  correctOptionId: string;  // debe pertenecer a options
};

type QuestionBank = {
  version: 1;
  careers: Career[];
  questions: Question[];
};
```

Exportación JSON: el banco completo más `exportedAt`. La importación reemplaza el banco local tras validar el esquema. Si el JSON es inválido, no se escribe nada.

### Dónde vive cada dato

- El banco está en el `localStorage` del navegador que administra y, en modo competitivo, hospeda.
- El modo individual lee ese mismo banco.
- Los jugadores no reciben el banco. El host envía el enunciado, las opciones y el tiempo. El `correctOptionId` sale del host recién en el evento de revelado.

### Puntaje (RF-03.4)

Solo en modo competitivo. Respuesta incorrecta o fuera de tiempo: 0. Respuesta correcta:

```
puntos = round(500 + 500 * (segundosRestantes / tiempoLimite))
```

Rango de una respuesta correcta: 500 a 1000. El modo individual no usa velocidad: cuenta aciertos sobre el total y lista cada pregunta como correcta o incorrecta.

### Rutas estáticas

Con `output: 'export'` no hay rutas dinámicas desconocidas en build. Toda la navegación es estática y el id de carrera o el PIN viajan en query o en estado de cliente.

| Ruta | Rol |
| --- | --- |
| `/` | Inicio: individual, crear sala, unirse, backoffice |
| `/admin` | Carreras y preguntas |
| `/play` | Test individual |
| `/host` | Crear sala, lobby, control de preguntas, ranking |
| `/join` | PIN + nickname y vista de jugador |

### Protocolo peer-to-peer

El id de PeerJS del host es `triviunsada-` + PIN de 6 dígitos. Si el id ya está tomado en el broker, se genera otro PIN.

El host mantiene la máquina de estados `idle → lobby → question → reveal → (question | ended)`.

Mensajes host → jugador:

- `lobby:update` — lista de nicknames conectados
- `question:start` — pregunta sin respuesta correcta, índice, total, `startedAt`, tiempo límite
- `question:reveal` — opción correcta, puntos de la ronda, ranking
- `game:ended` — ranking final

Mensajes jugador → host:

- `player:join` — nickname
- `player:answer` — id de pregunta, id de opción, timestamp

El host ignora respuestas duplicadas, de preguntas que no están activas, o llegadas después del cierre. Al cerrar el tiempo, quien no respondió queda en 0.

### Flujo competitivo

1. En el mismo navegador del banco, el host elige carrera y abre sala.
2. Cada jugador se conecta con PIN y nickname. El host actualiza el lobby.
3. El host lanza la pregunta. Todos ven el mismo temporizador anclado a `startedAt` del host.
4. El host cierra, calcula puntos y proyecta el ranking.
5. Repite hasta la última pregunta y cierra la partida.

### Flujo individual

1. El usuario elige una carrera que tenga al menos una pregunta.
2. Responde en orden, con el tiempo límite de cada pregunta. Si vence el tiempo, esa pregunta cuenta como incorrecta.
3. Al terminar ve puntaje (aciertos/total) y el desglose.

---

## 2. Archivos de la Fase 0

Se crean con `create-next-app` (TypeScript, App Router, Tailwind, ESLint, sin `src` dir alternativo: se usa `src/`).

```
next.config.ts                  output: 'export', images.unoptimized, trailingSlash
package.json                    peerjs, zod, vitest
src/app/layout.tsx
src/app/page.tsx
src/app/admin/page.tsx
src/app/play/page.tsx
src/app/host/page.tsx
src/app/join/page.tsx
src/domain/types.ts
src/domain/scoring.ts
src/domain/scoring.test.ts
src/domain/bank-schema.ts
src/domain/bank-schema.test.ts
src/persistence/bank-repository.ts
src/multiplayer/protocol.ts
src/multiplayer/pin.ts
README.md                       cómo instalar, desarrollar y exportar
```

La Fase 0 deja pantallas de marcador de posición navegables, tipos, validación, puntaje y repositorio. No incluye todavía los formularios de CRUD, el test jugable ni la sesión PeerJS.

### Fases posteriores (no entran en la primera ejecución)

**Fase 1 — RF-01.** CRUD de carreras y preguntas, límites 2–6 opciones, una correcta, importar/exportar JSON. El plan de acción está en la sección 5.

**Fase 2 — RF-02.** Selección de carrera, pregunta a pregunta con temporizador, resultado y desglose. El plan de acción está en la sección 6.

**Fase 3 — RF-03.** Sesión host/jugador con PeerJS, lobby, control de flujo, puntaje por velocidad y ranking. UI de jugador pensada para móvil; UI de host pensada para proyector (tipografía grande, ranking legible a distancia).

---

## 3. Impactos

Proyecto nuevo: no hay comportamiento previo que romper.

Restricciones que el código debe respetar desde el día uno:

- Sin Route Handlers, sin Server Actions que dependan de un servidor, sin base de datos.
- PeerJS solo se importa en cliente (`'use client'` y carga dinámica) para no romper el pre-render del export estático.
- El contenido es por navegador. Otro dispositivo no ve el banco salvo que importe el JSON o se una a una sala hospedada en el navegador que tiene el banco.
- El broker público de PeerJS es dependencia externa de señalización, no de datos de la aplicación.

---

## 4. Criterios de aceptación y pruebas

### Fase 0

- `npm run dev` abre el inicio y se puede navegar a `/admin`, `/play`, `/host` y `/join`.
- `npm run build` genera un export estático sin errores.
- `npm test` cubre el puntaje (correcta rápida, correcta lenta, incorrecta) y el esquema del banco (opciones de menos, opciones de más, correcta inexistente, JSON de importación válido e inválido).

### Fase 1

- Crear, editar y borrar una carrera.
- Crear una pregunta con tiempo, entre 2 y 6 opciones y una correcta. Rechazar casos fuera de rango.
- Recargar el navegador y ver los mismos datos.
- Exportar JSON, borrar el banco, importar ese JSON y recuperar carreras y preguntas.
- Un JSON mal formado no pisa el banco.

### Fase 2

- Elegir carrera y responder todas sus preguntas.
- Al finalizar, ver aciertos, errores y el desglose por pregunta.
- Una carrera sin preguntas no se puede jugar.

### Fase 3

- El host obtiene un PIN y ve en el lobby cada nickname que entra.
- El jugador no ve la opción correcta antes del revelado.
- Dos navegadores: respuesta correcta más rápida suma más que una correcta más lenta; una incorrecta suma 0.
- El host proyecta el ranking tras cada pregunta y al cerrar la partida.
- Vista de jugador usable en un viewport móvil; vista de host legible en un viewport ancho.

### Verificación manual prevista

- Fase 0: `npm test`, `npm run build` y recorrido de rutas en el navegador.
- Fases 2 y 3: el mismo recorrido, más dos clientes (host y jugador) cuando exista la sala.

---

## 5. Fase 1 — Plan de acción del backoffice

Cubre RF-01: carreras, preguntas del banco e importación/exportación JSON. No incluye el modo individual ni la sala competitiva.

`/admin` sigue siendo una ruta estática. La carrera elegida viaja en `?careerId=`. No se agregan rutas dinámicas.

### Arquitectura y flujo de datos

Las mutaciones son funciones puras sobre `QuestionBank`. La pantalla carga el banco, aplica una función y guarda el resultado con el repositorio que ya existe. No hay bus de eventos: el estado de React es el banco ya actualizado.

```txt
formulario
  -> comando (crea, edita o borra)
  -> QuestionBank nuevo
  -> bankRepository.save
  -> localStorage["triviunsada.question-bank"]
```

Comandos previstos en `src/domain/bank-commands.ts`:

- `createCareer(bank, name, now)`
- `updateCareer(bank, id, name, now)`
- `deleteCareer(bank, id)` — también borra las preguntas de esa carrera
- `createQuestion(bank, input, now)`
- `updateQuestion(bank, input, now)`
- `deleteQuestion(bank, id)`

Cada comando devuelve `{ ok: true, bank }` o `{ ok: false, error }` en español. No escribe en `localStorage`. Los ids nuevos salen de `crypto.randomUUID()`.

Reglas de una pregunta, además de las que ya valida Zod:

- Texto obligatorio.
- Tiempo límite entero, mayor a 0. El formulario propone 20 segundos.
- Entre 2 y 6 opciones, con texto cada una.
- Exactamente una opción correcta, y tiene que ser una de las cargadas.
- Límites de texto: carrera 80 caracteres, pregunta 280, opción 400.

Importar y exportar siguen en el repositorio. Exportar agrega `exportedAt` y descarga `triviunsada-banco.json`. Importar reemplaza el banco completo solo si el JSON pasa `parseExportedBank`. Si no pasa, el banco actual queda igual y la pantalla muestra el error.

Hoy `load()` convierte un `localStorage` corrupto en un banco vacío. En esta fase, si hay un valor guardado y no se puede leer, la pantalla muestra el error y no ofrece guardar encima hasta que la persona confirme vaciar el banco. Así un dato dañado no se pisa en silencio.

### Pantalla

`/admin` queda como página de servidor y monta un único componente de cliente, `AdminPanel`. Ese componente es el único que toca `localStorage`.

La pantalla tiene tres zonas:

1. **Carreras.** Lista, alta, edición y baja. Elegir una carrera actualiza `?careerId=`. Si no hay carreras, se muestra el estado vacío.
2. **Preguntas de la carrera elegida.** Lista con enunciado, tiempo y cantidad de opciones. Alta, edición y baja. El formulario arranca con dos opciones, permite sumar hasta seis y no deja bajar de dos. La opción correcta se elige con un control de radio.
3. **Archivo.** Botones para descargar el JSON y para elegir un archivo. Antes de importar, la pantalla pide confirmación porque el archivo reemplaza todo el banco.

Borrar una carrera o una pregunta también pide confirmación en la propia pantalla, no con `window.confirm`.

`/play`, `/host` y `/join` no cambian en esta fase. Siguen leyendo el mismo banco cuando se implementen.

### Archivos

Se crean:

- `src/domain/bank-commands.ts`
- `src/domain/bank-commands.test.ts`
- `src/persistence/bank-repository.test.ts`
- `src/app/admin/admin-panel.tsx`

Se modifican:

- `src/app/admin/page.tsx` — deja el texto de marcador y monta el panel
- `src/persistence/bank-repository.ts` — distingue “no hay banco” de “el banco guardado no se puede leer”

No se tocan el protocolo PeerJS, el puntaje ni las otras rutas.

### Impacto

El contenido sigue siendo de este navegador. Otro dispositivo solo lo ve si importa el JSON. La clave de `localStorage` no cambia. Un banco exportado en esta fase tiene que poder reimportarse con el esquema `version: 1` que ya existe.

### Criterios de aceptación

- Crear, renombrar y borrar una carrera. Al borrar, desaparecen sus preguntas y quedan las de las demás carreras.
- Crear y editar una pregunta con tiempo, entre 2 y 6 opciones y una correcta. El formulario no deja guardar fuera de esas reglas.
- Recargar `/admin` y ver las mismas carreras y preguntas.
- Exportar el JSON, borrar el contenido, importar ese archivo y recuperar carreras y preguntas.
- Un JSON mal formado muestra el error y no reemplaza el banco.
- Un valor corrupto ya presente en `localStorage` no se pisa al abrir la pantalla.
- `npm test` cubre los comandos y el caso de importación que no escribe si el JSON es inválido.
- `npm run build` sigue generando el export estático.
- Recorrido manual en el navegador: alta, edición, baja, recarga, exportar, importar un archivo válido y rechazar uno inválido. También el estado vacío y el ancho de teléfono.

---

## 6. Fase 2 — Plan de acción del modo individual

Cubre RF-02. La persona elige una carrera y responde sus preguntas sola, en este navegador. No incluye la sala competitiva ni cambios al backoffice.

`/play` sigue siendo una ruta estática. La carrera elegida viaja en `?careerId=`. El intento no se guarda: recargar la página vuelve a la pantalla de inicio del test y el temporizador no sigue corriendo en segundo plano.

### Arquitectura y flujo de datos

El juego es una función pura sobre el intento. La pantalla solo lee el banco con `createBrowserBankRepository().load()` y no lo escribe. El store del backoffice no se mueve.

```txt
banco en localStorage
  -> preguntas de la carrera, en el orden guardado
  -> intento en memoria
  -> respuesta o tiempo vencido
  -> intento actualizado
  -> al terminar, aciertos / total y desglose
```

Funciones previstas en `src/domain/attempt.ts`:

- `questionsForCareer(bank, careerId)` — preguntas de esa carrera, en el orden del banco.
- `startAttempt(bank, careerId)` — arma el intento, o devuelve error si la carrera no existe o no tiene preguntas.
- `answerAttempt(attempt, question, optionId)` — registra la opción. Si la pregunta ya fue respondida o no es la actual, no cambia el intento.
- `timeoutAttempt(attempt, question)` — la marca incorrecta y sin opción elegida. Tampoco cambia un intento que ya avanzó.
- `summarizeAttempt(questions, attempt)` — devuelve aciertos, total y una fila por pregunta.

La pregunta actual es la primera que todavía no tiene respuesta. El puntaje individual no usa la fórmula de velocidad: una respuesta correcta suma 1 y una incorrecta o vencida suma 0.

Durante la pregunta, la pantalla recibe el enunciado, las opciones y el tiempo, sin `correctOptionId`. Para eso se reutiliza `toPublicQuestion`. El id correcto solo entra al armar el desglose final.

El temporizador se ancla a un `startedAt` de la pregunta. Los segundos que quedan son `tiempoLimite - segundos transcurridos`, nunca negativos. Si la pestaña vuelve y el plazo ya pasó, esa pregunta cuenta como vencida.

### Pantalla

`/play` queda como página de servidor y monta `PlayPanel`, el único componente de cliente de esta fase. Hay tres momentos, todos en la misma ruta:

1. **Elegir carrera.** Lista las carreras del banco. Las que no tienen preguntas se ven y no se pueden empezar. Si el banco no se puede leer, se muestra el error y un enlace al backoffice, sin iniciar el test.
2. **Pregunta.** Enunciado, opciones con botones grandes y el tiempo que falta. La primera opción elegida cierra la pregunta y pasa a la siguiente. Si el tiempo llega a 0 antes, pasa igual y esa respuesta queda incorrecta. No se muestra cuál era la correcta.
3. **Resultado.** Aciertos sobre el total y el desglose: enunciado, si fue correcta, qué eligió (o “Sin respuesta”) y cuál era la opción correcta. Desde ahí se puede volver a jugar la misma carrera o elegir otra.

Elegir una carrera pone `?careerId=` y muestra “Empezar”. El temporizador arranca recién con ese botón, no al abrir la dirección.

La vista es de una columna, con opciones fáciles de tocar en el teléfono. `/admin`, `/host` y `/join` no cambian.

### Archivos

Se crean:

- `src/domain/attempt.ts`
- `src/domain/attempt.test.ts`
- `src/app/play/play-panel.tsx`

Se modifica:

- `src/app/play/page.tsx` — deja el texto de marcador y monta el panel

No se tocan los comandos del banco, el repositorio, el puntaje competitivo ni el protocolo de la sala, salvo la lectura de `toPublicQuestion`.

### Impacto

El intento no entra en `localStorage`. Otro dispositivo sigue sin ver el banco. Una carrera sin preguntas no se puede jugar. El export estático no agrega rutas nuevas.

### Criterios de aceptación

- Con el banco vacío, o con una carrera sin preguntas, no se puede empezar el test.
- Elegir una carrera con preguntas, responderlas en orden y ver aciertos, errores y el desglose de cada una.
- Una respuesta correcta suma uno. Una incorrecta suma cero. No se usa el puntaje por velocidad.
- Si se vence el tiempo, esa pregunta queda incorrecta y sin opción elegida, y el juego sigue.
- La opción correcta no aparece mientras la pregunta está abierta.
- Recargar a mitad del test vuelve al inicio de `/play`, sin un resultado a medias.
- `npm test` cubre el inicio rechazado, la respuesta correcta, la incorrecta, el tiempo vencido, la respuesta duplicada y el resumen.
- `npm run build` sigue generando el export estático.
- Recorrido manual en el navegador, también en ancho de teléfono: carrera no jugable, una respuesta correcta, una incorrecta, una vencida por tiempo y el desglose final.

---

## 7. Plantilla UNSAdA — precarga opcional

Convierte `Juego de preguntas.docx` en un banco JSON y lo ofrece en el backoffice como una carga opcional. La carga manual, el importar archivo y el exportar siguen igual. Nada se precarga solo.

### Qué hay en el Word

Cuatro áreas, 50 preguntas cada una, tres opciones (A, B, C) y una marcada con ✅:

| Carrera en el banco | Preguntas |
| --- | --- |
| Ciencias Agropecuarias | 50 |
| Informática y Tecnología | 50 |
| Gestión Ambiental | 50 |
| Tecnicatura Universitaria en Mantenimiento Industrial | 50 |

Los colores del título (verde, rojo, azul, naranja) no entran al banco: el modelo no tiene color. Los textos de cierre (“¡GANASTE!”, “¡Esta vez no se pudo!”, la invitación a inscribirse) tampoco: no son preguntas.

El enunciado más largo tiene 168 caracteres, dentro del límite de 280. Cuarenta opciones superan los 120 caracteres actuales; la más larga tiene 191. Para poder guardarlas y editarlas después, el límite de cada opción pasa de 120 a 400. Carrera y enunciado no cambian.

El Word no trae tiempo por pregunta. Cada una queda en 20 segundos, el mismo valor que ya usa el formulario.

### Arquitectura y flujo de datos

El JSON es un `ExportedQuestionBank` versión 1, el mismo formato que “Descargar JSON”. Vive en el repo y se importa en el cliente. No hay fetch ni archivo suelto en `public`.

```txt
botón "Cargar plantilla UNSAdA"
  -> el JSON ya validado entra al mismo pendiente de confirmación que un archivo
  -> "Reemplazar banco" llama a importBank
  -> localStorage queda con las 4 carreras y las 200 preguntas
```

Cancelar no escribe nada. Un banco armado a mano no se pisa sin esa confirmación. Si el banco guardado no se puede leer, el botón sigue disponible, igual que importar un archivo.

Los ids son estables (`carrera-agropecuarias`, `agropecuarias-01`, `agropecuarias-01-a`) para que volver a cargar la plantilla no genere ids nuevos.

### Archivos

Se crea:

- `src/content/unsada-bank.json`
- `src/content/unsada-bank.test.ts` — el JSON pasa `parseExportedBank`: 4 carreras, 50 preguntas, 3 opciones, una correcta, textos dentro de los límites

Se modifica:

- `src/app/admin/admin-panel.tsx` — botón en Archivo, reutiliza la confirmación de reemplazo. `maxLength` de la opción pasa a 400
- `src/domain/bank-commands.ts` — el tope de la opción pasa a 400 y el mensaje de error lo dice

No se toca el modo individual, el repositorio ni el protocolo de la sala.

### Impacto

Reemplazar el banco borra las carreras y preguntas de este navegador, igual que importar un JSON. El límite nuevo solo afloja la validación del formulario: una opción de hasta 400 caracteres se puede guardar. El export estático no suma rutas.

### Criterios de aceptación

- En Archivo aparece “Cargar plantilla UNSAdA” junto a descargar e importar.
- Confirmar deja las cuatro carreras y 200 preguntas, jugables en `/play`.
- Cancelar deja el banco como estaba.
- Crear y editar a mano sigue funcionando si no se usa la plantilla.
- `npm test` incluye el JSON de la plantilla. `npm run build` sigue exportando estático.
- Recorrido en el navegador: banco manual, confirmar la plantilla, ver una carrera en `/play`, y cancelar una segunda carga sin perder los datos.

---

## 8. Fase 3 — Plan de acción de la sala competitiva

Cubre RF-03. El navegador que tiene el banco abre una sala. Los demás entran con PIN y nickname, responden en el teléfono y el host proyecta el ranking. No cambia el backoffice, la plantilla ni el modo individual.

### Arquitectura y flujo de datos

La partida es una máquina de estados pura. PeerJS solo transporta los mensajes que ya define `protocol.ts`. El host es el único que conoce `correctOptionId` y el único que suma puntos.

```txt
banco local
  -> el host elige carrera y abre PeerJS con id triviunsada- + PIN
  -> cada jugador se conecta y manda player:join
  -> lobby
  -> question:start (sin la correcta, con startedAt del host)
  -> player:answer
  -> al cerrar, el host calcula puntos y manda question:reveal
  -> repite o manda game:ended
```

Estados del host: `idle → lobby → question → reveal → (question | ended)`.

El puntaje usa `scoreCompetitiveAnswer`: correcta entre 500 y 1000 según los segundos que quedaban, incorrecta o sin respuesta en 0. El host mide el tiempo con su reloj al recibir el mensaje. El `answeredAt` del jugador viaja en el protocolo y no define el puntaje, así nadie adelanta el reloj. Una respuesta repetida, de otra pregunta o llegada después del cierre se ignora.

Si el id del PIN ya está tomado (`unavailable-id`), se genera otro PIN y se reintenta. PeerJS se carga con `import("peerjs")` dentro del cliente, recién al abrir o al entrar. El broker público solo señala la conexión.

Quien se desconecta durante la partida conserva los puntos ya sumados y queda en 0 en las preguntas que no alcance a responder. Recargar el host cierra la sala. Recargar el jugador lo saca. No hay reconexión.

### Pantallas

`/host` y `/join` siguen siendo rutas estáticas. Cada una es una página de servidor que monta un panel de cliente.

**Host, pensada para proyector.** Tipografía grande, PIN en dos grupos de tres dígitos, ranking legible de lejos.

1. **Elegir carrera.** Misma regla que el modo individual: se ven todas, las que no tienen preguntas no se pueden abrir. Banco vacío o ilegible: mensaje y enlace al backoffice.
2. **Lobby.** PIN, lista de nicknames y “Empezar”. Sin jugadores, el botón no arranca la partida.
3. **Pregunta.** Enunciado, opciones sin marcar la correcta, segundos que faltan y cuántos ya respondieron. “Cerrar pregunta” revela antes. Al llegar a 0, revela sola.
4. **Revelado.** Opción correcta, puntos de la ronda y ranking. “Siguiente” o, en la última, “Cerrar partida”.
5. **Final.** Ranking acumulado y “Nueva sala”.

**Jugador, pensada para el teléfono.** Una columna, opciones con botones altos.

1. **Entrar.** PIN de 6 dígitos y nickname. El nickname se recorta, admite de 1 a 24 caracteres y no se repite en la sala (sin distinguir mayúsculas).
2. **Espera.** Ve el lobby hasta que el host lanza la pregunta. Si el PIN no existe, el nickname está tomado o la partida ya empezó, ve el error y no entra.
3. **Pregunta.** Mismas opciones, sin la correcta. La primera elección se envía y queda bloqueada.
4. **Revelado.** Si sumó puntos, cuál era la correcta y el ranking. Espera la siguiente.
5. **Final.** Ranking. Si se corta el host, “Se cortó la sala.”

El protocolo suma un mensaje de host a jugador: `join:rejected`, con el texto del error. El resto de los mensajes no cambia.

### Archivos

Se crean:

- `src/multiplayer/session.ts` — unirse, abrir pregunta, anotar respuesta, revelar y cerrar. Orden del ranking: puntos de mayor a menor y, si empatan, nickname.
- `src/multiplayer/session.test.ts` — nickname repetido, partida ya empezada, correcta rápida contra lenta, incorrecta en 0, duplicada ignorada, cierre por tiempo, ranking.
- `src/app/host/host-panel.tsx`
- `src/app/join/join-panel.tsx`

Se modifican:

- `src/app/host/page.tsx` y `src/app/join/page.tsx` — dejan el texto de marcador y montan el panel.
- `src/multiplayer/protocol.ts` — agrega `join:rejected`.

No se tocan el banco, la plantilla, el puntaje individual ni `/play` y `/admin`.

### Impacto

La sala depende de que `0.peerjs.com` responda. Si no responde, la pantalla dice que no se pudo abrir o encontrar la sala y no inventa un PIN local. Otro teléfono no ve el banco: solo lo que el host envía en cada pregunta. El export estático no agrega rutas.

### Criterios de aceptación

- El host muestra un PIN de 6 dígitos y, en el lobby, cada nickname que entra.
- Sin jugadores no se puede empezar. Una carrera sin preguntas no abre sala.
- El jugador no ve cuál es la correcta hasta el revelado.
- Una correcta más rápida suma más que una correcta más lenta. Una incorrecta o vencida suma 0.
- El host proyecta el ranking después de cada pregunta y al cerrar.
- `npm test` cubre la máquina de estados sin red. `npm run build` sigue exportando estático.
- Recorrido manual con dos clientes: host en ancho de proyector y jugador en ancho de teléfono. Si el broker no está disponible, se registra el error y no se simula la sala.

---

## 9. Acceso oculto — `/config`

El backoffice deja de estar en el inicio y en `/admin`. Pasa a `/config` y, antes del panel, pide usuario y contraseña. El banco, la plantilla, el modo individual y la sala no cambian.

Es una traba de interfaz en el navegador, no una autenticación de servidor. La aplicación sigue siendo estática: quien lea el JavaScript puede ver los datos. Sirve para que la pantalla no quede a la vista.

### Arquitectura y flujo de datos

```txt
/config
  -> formulario
  -> usuario y contraseña coinciden
  -> sessionStorage marca la pestaña
  -> se muestra el panel actual
```

Los datos son exactamente `unsada` y `123789Sada!`, sin recortar ni ignorar mayúsculas. Si no coinciden, el mensaje es «Usuario o contraseña incorrectos.» y el panel no aparece.

La marca queda en `sessionStorage` con la clave `triviunsada.config-access`. Recargar `/config` en la misma pestaña no vuelve a pedir los datos. Cerrar la pestaña sí. **Salir** borra la marca y vuelve al formulario. No se guarda la contraseña.

`/admin` se elimina. No hay redirección: esa dirección deja de existir.

### Pantalla

El inicio muestra solo modo individual, crear sala y unirse. `/play` y `/host` dejan de ofrecer «Ir al backoffice»; el texto de banco vacío o ilegible se mantiene.

En `/config`, antes de entrar, el título es «Configuración» y el formulario tiene usuario, contraseña y **Entrar**. Después se ve el panel de siempre, con **Salir**.

### Archivos

Se crean:

- `src/config/access.ts` — compara usuario y contraseña
- `src/config/access.test.ts`
- `src/app/config/config-gate.tsx` — formulario o panel

Se mueven:

- `src/app/admin/page.tsx` → `src/app/config/page.tsx`
- `src/app/admin/admin-panel.tsx` → `src/app/config/admin-panel.tsx`

Se modifican:

- `src/app/page.tsx` — quita la entrada del backoffice
- `src/app/play/play-panel.tsx` y `src/app/host/host-panel.tsx` — quitan el enlace

No se toca el banco, el puntaje ni la sala.

### Impacto

Quien tenía guardado `/admin` encuentra la página inexistente. El banco en `localStorage` sigue donde está. El export estático reemplaza la ruta `/admin` por `/config`.

### Criterios de aceptación

- El inicio no menciona el backoffice.
- `/admin` no existe.
- En `/config`, un dato mal escrito no muestra carreras ni preguntas.
- `unsada` / `123789Sada!` abre el panel. Recargar la pestaña lo deja abierto. **Salir** vuelve al formulario.
- Crear una carrera después de entrar sigue guardándose como ahora.
- `npm test` cubre la comparación. `npm run build` sigue exportando estático.
