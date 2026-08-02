# 📧 Publicar por email — The Velocity Edge (siempre activo)

Manda un email con el artículo y se publica solo en la web, con su link. Un
disparador de Google revisa el correo cada 5 minutos **para siempre** — no hay
nada que reconectar ni que caduque. Al publicar, FDK recibe un email con el
**link + un botón "Compartir por WhatsApp"** listo para reenviar.

## Cómo funciona

```
FDK → email a la cuenta dedicada ──▶ Apps Script (cada 5 min, siempre activo)
                                        │ extrae el artículo (cuerpo / adjunto / Google Doc)
                                        │ sube un borrador a GitHub
                                        ▼
                             GitHub Action → IA lo maqueta → publica
                                        ▼
                    FDK recibe email: link + botón «Compartir por WhatsApp»
```

## 3 formas de mandar el artículo
- **Texto en el cuerpo** del email.
- **Adjunto**: Word `.docx`, `.pdf` o `.txt`.
- **Google Doc**: pega su enlace en el cuerpo.

El **asunto** es el **título** de la nota. Para publicar, el asunto debe empezar
por **`PUBLICAR`** y el email venir de una dirección autorizada.

Ejemplo:
```
Para:    (la cuenta dedicada, p. ej. publicar.fdk@gmail.com)
Asunto:  PUBLICAR The Capital Rotation Accelerates
Cuerpo:  (el artículo, o un adjunto, o el link de un Google Doc)
```

---

## Parte A · Elegir la cuenta de Google (2 min)
El script se ejecuta dentro de una cuenta de Google y **lee el correo de esa
misma cuenta**. FDK enviará los artículos a esa dirección.

- Recomendado: una cuenta dedicada (p. ej. `publicar.fdk@gmail.com`), o reusar
  una que ya uséis. **Anota cuál es** — es la dirección a la que FDK escribirá.

## Parte B · Token de GitHub (5 min)
Igual que antes (si aún lo tienes válido, reúsalo):
1. https://github.com/settings/personal-access-tokens/new
2. Nombre `fdk-email-publish` · Resource owner **matisisconsultancy** · Only select repos → **FDK**
3. Permissions → **Contents: Read and write** → **Generate token** → copia el valor.

## Parte C · Apps Script (10 min)
1. Con la cuenta de la Parte A, entra en **https://script.google.com → Nuevo proyecto**.
2. Borra el código de ejemplo y **pega todo** `forms/email-publish-apps-script.gs`.
   👉 https://github.com/matisisconsultancy/FDK/blob/claude/article-publication-automation-modpie/forms/email-publish-apps-script.gs  (botón **Copy raw file**)
3. **Activar el servicio de Drive** (para leer Word/PDF): en el editor, junto a
   **"Servicios"**, pulsa **➕** → busca **"Drive API"** → en **Versión** elige
   **2** → **Añadir**.
4. **Guardar el token:** ⚙ **Configuración del proyecto → Propiedades del script
   → Añadir** → `GITHUB_TOKEN` = el token de la Parte B → **Guardar**.
5. En el bloque `CONFIG` del código, ajusta:
   - `ALLOWED_SENDERS`: la(s) dirección(es) desde las que FDK enviará, p. ej.
     `["francesco@fdk...","matisisconsultancy@gmail.com"]`.
   - `NOTIFY_EMAIL`: dónde quieres recibir el aviso con el link + botón WhatsApp.
   - (Opcional) `GITHUB_BRANCH`: déjalo en la rama que sirve la web
     (`claude/eager-carson-vjorjg`).
6. **Guarda** 💾.

## Parte D · Dejarla ACTIVA SIEMPRE (1 min)
1. Arriba, en el desplegable de funciones, elige **`installTrigger`**.
2. Pulsa **▷ Ejecutar**. Acepta los permisos (Gmail, Drive, envío de correo, red).
3. En el registro verás: *"✅ Disparador instalado: processInbox cada 5 minutos"*.

A partir de aquí, el script revisa el correo **cada 5 minutos, para siempre**,
sin que tengas que hacer nada más. (Para pararlo algún día: ejecuta
`removeTrigger`.)

## Parte E · Probar
Manda un email **desde una dirección autorizada** a la cuenta dedicada:
```
Asunto:  PUBLICAR Prueba Email
Cuerpo:  Este es un artículo de prueba enviado por email. El capital rota hacia la productividad.
```
En ≤ 5 min: se publica la nota, y te llega a `NOTIFY_EMAIL` el correo con el
**link + botón «Compartir por WhatsApp»**. *(Si quieres probar al instante sin
esperar, ejecuta `processInbox` a mano desde el editor.)*

---

## Checklist
- [ ] Cuenta de Google elegida (a la que FDK escribirá)
- [ ] Token de GitHub (Contents: R/W en FDK) en `GITHUB_TOKEN` (Propiedades del script)
- [ ] Código pegado + **Drive API v2** añadido
- [ ] `ALLOWED_SENDERS` y `NOTIFY_EMAIL` puestos
- [ ] `installTrigger` ejecutado (permisos aceptados) → siempre activo
- [ ] Email de prueba → nota publicada + aviso con link recibido

## Notas
- **Maquetación con IA:** para que los artículos salgan con los bloques de estilo
  (datos, señales…) en vez de párrafos planos, hace falta fusionar la rama de
  trabajo a producción y que el repo tenga el secreto `ANTHROPIC_API_KEY`. Sin
  eso se publican igual, como texto limpio.
- **Aviso a la lista de contactos (fase 2b):** pon `NOTIFY_CONTACTS: true` y
  rellena `NOTIFY_CONTACTS_TO` con los emails. (Más adelante lo conectamos al CRM
  de Google Sheet o a Kit para no mantener la lista a mano.)
- **PDF escaneado / foto de texto:** se lee por OCR (idioma español). La calidad
  varía; si algo sale raro, envía el texto en el cuerpo o como Google Doc.
- **Guardarraíl:** solo se publica si el asunto empieza por `PUBLICAR` y el
  remitente está en `ALLOWED_SENDERS`. Nada más se toca.
