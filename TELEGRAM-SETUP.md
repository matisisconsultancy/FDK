# FDK EmpowerNet — Publicar por Telegram (paso a paso)

Francesco escribe a un **bot de Telegram** y en 1–2 minutos recibe, **en el mismo
chat**, el link de la nota ya publicada, listo para reenviar.

- ✅ **Gratis** y **oficial** (Bot API de Telegram).
- ✅ **Siempre activo**: ni el token ni el webhook caducan (a diferencia del
  sandbox de WhatsApp de Twilio, que había que re-activar cada 72 h).
- ✅ Acepta **texto** o **documentos** (`.docx`, `.pdf`, `.txt`).
- ✅ Convive con la **publicación manual** de siempre — no reemplaza nada.

```
FDK (Telegram) → bot → Apps Script → GitHub (drafts/) → Action (formato AI) → web
       ▲                                                                        │
       └──────────────── respuesta instantánea con el link ─────────────────────┘
```

---

## Paso 1 · Crear el bot en Telegram (2 min)

1. En Telegram, busca **@BotFather** y ábrelo.
2. Envía `/newbot`.
3. Pon un **nombre** (p. ej. `FDK EmpowerNet Publisher`).
4. Pon un **usuario** que termine en `bot` (p. ej. `fdk_publisher_bot`).
5. BotFather te devuelve un **TOKEN** parecido a
   `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`. **Cópialo** — es secreto.

> El token va a Apps Script (Script Properties), **nunca** a un chat.

---

## Paso 2 · Crear el proyecto de Apps Script (3 min)

1. Ve a **https://script.google.com** → **Nuevo proyecto**.
2. Borra el contenido y **pega** el archivo
   [`forms/telegram-publish-apps-script.gs`](forms/telegram-publish-apps-script.gs).
3. Panel izquierdo → **Servicios (＋)** → añade **Drive API** → versión **2**
   (necesario para leer Word/PDF). Guarda.

---

## Paso 3 · Guardar los tokens (1 min)

1. ⚙ **Configuración del proyecto** → baja a **Propiedades del script** →
   **Añadir propiedad del script**. Crea **dos**:
   - `GITHUB_TOKEN` = tu token fine-grained de GitHub (Contents: Read/Write en el repo).
   - `TELEGRAM_TOKEN` = el token del bot del Paso 1.
2. Guarda.

> Si ya tenías el proyecto de email, puedes reutilizar el mismo `GITHUB_TOKEN`.

---

## Paso 4 · Desplegar el web app (2 min)

1. Arriba a la derecha → **Implementar** → **Nueva implementación**.
2. Tipo → **Aplicación web**.
3. **Ejecutar como:** *Yo* · **Quién tiene acceso:** *Cualquier usuario*.
4. **Implementar** → autoriza los permisos (tu cuenta de Google).
5. Copia la **URL** que termina en `/exec` (no hace falta pegarla en ningún sitio;
   el bot se conecta solo en el paso siguiente).

---

## Paso 5 · Conectar el bot al web app (10 seg)

1. En el editor de Apps Script, en el selector de funciones elige **`setWebhook`**.
2. Pulsa **Ejecutar** una vez.
3. En **Registros** verás `"ok":true` → el bot ya está conectado.

> Si más adelante cambias el código y creas una **nueva implementación**, vuelve
> a ejecutar `setWebhook` una vez.

---

## Paso 6 · Autorizar a quién puede publicar (2 min)

1. En Telegram, abre tu bot (búscalo por el usuario que le pusiste) y pulsa
   **Iniciar** / envía `/id`.
2. El bot responde con tu **número de id** (p. ej. `123456789`).
3. Haz lo mismo desde el teléfono de **Francesco**.
4. En el código, en `CONFIG.ALLOWED_IDS`, pon esos números:
   ```js
   ALLOWED_IDS: [123456789, 987654321],
   ```
5. Guarda → **Implementar** → **Gestionar implementaciones** → editar (lápiz) →
   **Nueva versión** → **Implementar**. (No hace falta re-ejecutar `setWebhook`
   si la URL no cambia, pero no molesta hacerlo.)

> Deja `ALLOWED_IDS: []` **solo** para una prueba rápida (permite a cualquiera).
> En producción pon siempre los ids.

---

## Cómo publica Francesco (así de simple)

**Opción A — texto:** escribe al bot con el **título en la primera línea** y el
artículo debajo. Envía.

```
AI Is Growing. Jobs Are Not.
El mercado laboral se enfría mientras el capex en IA se dispara. Esta mañana...
```

**Opción B — documento:** adjunta el `.docx` / `.pdf` / `.txt` y pon el **título
en el pie (caption)** del archivo.

En ~1–2 min el bot responde en el mismo chat:

```
✅ Recibido: «AI Is Growing. Jobs Are Not.»
Se está publicando y estará online en 1–2 min:
https://fdkempowernet.com/ai-is-growing-jobs-are-not/
[ 🔗 Ver nota ]
```

Francesco **reenvía ese mensaje** a quien quiera. Listo.

---

## Notas

- **Formato bonito:** el cuerpo se estructura con IA (bloques `::`) igual que las
  notas manuales, **si** hay saldo en Anthropic (Billing). Sin saldo, la nota se
  publica igual pero en texto plano.
- **Publicación manual:** sigue funcionando exactamente como hasta ahora; Telegram
  es solo un atajo adicional.
- **Seguridad:** solo los ids en `ALLOWED_IDS` pueden publicar. Los tokens viven
  en Script Properties, nunca en un chat.
