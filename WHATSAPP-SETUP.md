# 📲 Publicar por WhatsApp — The Velocity Edge

Manda un WhatsApp con el artículo y aparece publicado en la web con su link,
sin tocar nada más. Este documento es la guía paso a paso.

## Cómo funciona

```
FDK (WhatsApp) ──"PUBLICAR" + título + texto──▶ Twilio
       ▲                                          │ webhook
       │  respuesta con el link                   ▼
       └──────────────────────── Google Apps Script (/exec)
                                     │ crea drafts/…​.md y lo sube a GitHub
                                     ▼
                          GitHub Action «Publish drafts»
                          → la IA maqueta → publica en la web
                                     ▼
                     https://fdkempowernet.com/<slug>/  (1–2 min)
```

- FDK escribe/pega el artículo tal cual — **la IA lo maqueta sola**.
- El sistema responde **al instante** con el link definitivo (aunque la página
  tarde 1–2 min en estar online).
- **Nada se publica por accidente:** solo publican los números autorizados y solo
  si el mensaje empieza por la palabra clave (`PUBLICAR`).

Necesitas **3 cuentas** (dos gratis, una con coste mínimo en producción):
GitHub (ya la tienes), Google (Apps Script, gratis) y Twilio (WhatsApp).

---

## Parte A · Token de GitHub (5 min)

El script necesita permiso para subir el borrador al repositorio.

1. Entra en **https://github.com/settings/personal-access-tokens/new**
   (Settings → Developer settings → **Fine-grained tokens** → Generate new).
2. **Token name:** `fdk-whatsapp-publish`. **Expiration:** 1 año (o «No expiration»).
3. **Resource owner:** `matisisconsultancy`.
4. **Repository access → Only select repositories →** marca **`matisisconsultancy/FDK`**.
5. **Permissions → Repository permissions → Contents → Read and write.**
   (Deja el resto en «No access».)
6. **Generate token** y **copia el valor** (`github_pat_…`). Solo se muestra una vez.

> Guárdalo un momento, lo pegarás en la Parte B.

---

## Parte B · Google Apps Script (10 min)

1. Ve a **https://script.google.com → Nuevo proyecto**.
2. Borra el `myFunction` de ejemplo y **pega todo el contenido de
   `forms/whatsapp-publish-apps-script.gs`**.
3. Guarda el token de forma segura (recomendado):
   **⚙ Configuración del proyecto → Propiedades del script → Añadir propiedad**
   - Propiedad: `GITHUB_TOKEN`  ·  Valor: el token de la Parte A.
   (Alternativa rápida: pégalo directamente en `CONFIG.GITHUB_TOKEN`.)
4. En el bloque `CONFIG` del código, ajusta:
   - `ALLOWED_SENDERS`: el/los número(s) de FDK con prefijo de país, p. ej.
     `["+34600123123"]`. **Importante** para que nadie más pueda publicar.
   - `GITHUB_BRANCH`: déjalo en la rama que sirve la web (por defecto
     `claude/eager-carson-vjorjg`). Si la web se sirve desde otra rama, cámbialo.
   - `KEYWORD` (por defecto `PUBLICAR`) y `DEFAULT_SLOT` si quieres.
5. **Implementar → Nueva implementación → ⚙ → Aplicación web:**
   - **Ejecutar como:** Yo
   - **Quién tiene acceso:** **Cualquier usuario**
   - **Implementar**, acepta los permisos, y **copia la URL** que termina en `/exec`.
6. Comprueba: abre esa URL `/exec` en el navegador. Debes ver
   `{"ok":true,"service":"FDK WhatsApp publisher","ready":true}`.

> Cada vez que edites el `.gs`: **Implementar → Gestionar implementaciones →
> ✏️ → Versión: Nueva versión → Implementar.** La URL `/exec` no cambia.

---

## Parte C · Twilio WhatsApp (15 min)

Twilio conecta WhatsApp con nuestro script. Empieza **gratis** con el *sandbox*
para probarlo todo, y cuando estés listo conectas un número real.

### C.1 · Probar gratis con el Sandbox

1. Crea una cuenta en **https://www.twilio.com/try-twilio** (gratis, con saldo de prueba).
2. En la consola: **Messaging → Try it out → Send a WhatsApp message**.
3. Verás un número de sandbox y un código tipo `join <palabra>`. Desde el WhatsApp
   de FDK, **manda ese `join <palabra>`** al número del sandbox para vincularlo.
4. En **Sandbox settings**, en el campo **"When a message comes in"**:
   - Pega tu URL `/exec` de la Parte B.
   - Método: **HTTP POST**. Guarda.
5. **¡Prueba!** Desde el WhatsApp de FDK manda:
   ```
   PUBLICAR
   El Título Del Artículo
   Aquí va el texto del artículo, tal cual lo escribirías en el newsletter…
   ```
   Recibirás la respuesta con el link, y en 1–2 min la página estará online.

### C.2 · Pasar a producción (número real)

El sandbox exige el `join` cada 72 h y solo sirve para pruebas. Para uso real:

1. **Messaging → Senders → WhatsApp senders → Get started** y sigue el alta de un
   número propio de WhatsApp (requiere un **Meta Business Account** verificado).
2. Cuando el número esté aprobado, en su configuración pon la **misma URL `/exec`**
   en **"When a message comes in" (HTTP POST)**.
3. A partir de ahí, FDK publica escribiendo a ese número, sin `join`.

> **Coste orientativo:** número WhatsApp ~1–2 $/mes + una fracción de céntimo por
> mensaje. Para el volumen de un newsletter es prácticamente simbólico.

---

## El mensaje que manda FDK

```
PUBLICAR
El Título Del Artículo          ← primera línea = título (define el link)
                                ← (línea en blanco, opcional)
Primer párrafo del artículo…    ← el resto = cuerpo; la IA lo maqueta
Segundo párrafo…
```

- El **link** se genera del título: `El Título Del Artículo` →
  `https://fdkempowernet.com/el-titulo-del-articulo/`.
- No hace falta ningún formato: la IA estructura el texto en el estilo del sitio
  (lead, datos, señales, cierre). Si quieres control total, también puedes usar el
  formato determinista de `drafts/README.md`.

---

## Checklist

- [ ] Token de GitHub creado (Contents: Read/Write en `matisisconsultancy/FDK`)
- [ ] Apps Script pegado, `GITHUB_TOKEN` en Script Properties, `ALLOWED_SENDERS` puesto
- [ ] Implementado como Web app (Cualquier usuario), URL `/exec` copiada
- [ ] `/exec` devuelve `ready:true`
- [ ] Twilio sandbox vinculado y webhook = URL `/exec` (POST)
- [ ] Prueba enviada → link recibido → página online
- [ ] (Producción) número WhatsApp real dado de alta con el mismo webhook

## Requisitos del lado del repositorio

- El secret **`ANTHROPIC_API_KEY`** debe existir en el repo (Settings → Secrets →
  Actions) para que la IA maquete. Sin él, el artículo se publica igualmente pero
  como párrafos planos, sin los bloques de estilo.
- La Action **«Publish drafts»** debe estar activa en la rama de `GITHUB_BRANCH`.

## Notas y límites (v1)

- **Sin revisión previa:** publica directo (es lo que buscabas). El guardarraíl es
  la palabra clave + la lista de números autorizados.
- Si mandas dos artículos con el **mismo título el mismo día**, el segundo dará
  error de slug duplicado en la Action (la respuesta de WhatsApp ya habrá salido).
  Cambia una palabra del título para diferenciarlos.
- El **aviso automático a los contactos** (email/WhatsApp al publicar) es la
  **fase 2** — el mismo script puede lanzarlo cuando lo montemos.
