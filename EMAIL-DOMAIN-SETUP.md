# 📮 Correo profesional @fdkempowernet.com — setup completo (GoDaddy + Google Workspace + Kit)

Objetivo: correos `@fdkempowernet.com` profesionales, que **no caigan en spam**
(libros, newsletter, avisos), y que el buzón de publicación pueda correr la
automatización (Apps Script). DNS en **GoDaddy**.

> ⚠️ **No toques los registros del sitio web.** El sitio (GitHub Pages) usa los
> registros **A** del dominio raíz (`185.199.108.153`, `.109`, `.110`, `.111`) y
> el **CNAME** de `www`. **Déjalos como están.** Todo lo de correo (MX, TXT,
> DKIM) es aparte y no interfiere con la web.

---

## Direcciones que vamos a tener

| Dirección | Tipo | Uso |
|---|---|---|
| `admin@fdkempowernet.com` (o `francesco@`) | **usuario** (de pago) | Cuenta principal · corre el Apps Script |
| `publicar@fdkempowernet.com` | **alias** (gratis) | Recibir artículos a publicar |
| `hello@fdkempowernet.com` | **alias** (gratis) | Contacto / leads del formulario |
| `newsletter@fdkempowernet.com` | **alias** (gratis) | "De:" de newsletter y libros (Kit) |

Con **un solo usuario de pago** (~6 $/mes) y el resto como **alias** que caen en
la misma bandeja, cubrimos todo. El Apps Script corre bajo el usuario principal
y filtra los emails de publicación por asunto (`PUBLISH`) y remitente.

---

## FASE 1 · Alta de Google Workspace + verificar el dominio

1. Ve a **https://workspace.google.com** → **"Empezar"**.
2. Datos del negocio: nombre `FDK EmpowerNet`, nº de empleados (el más pequeño), país.
3. Cuando pregunte el dominio: **"Sí, tengo uno"** → escribe **`fdkempowernet.com`**.
4. Crea el usuario principal, p. ej. **`admin@fdkempowernet.com`** (o `francesco@`).
5. Elige plan (Business Starter ~6 $/mes; hay prueba de 14 días).
6. Google te pedirá **verificar la propiedad del dominio**: te dará un registro
   **TXT** tipo `google-site-verification=xxxxxxxx`. **Cópialo** — lo pegas en GoDaddy (Fase 2).

## FASE 2 · GoDaddy — registros de correo

Entra en **https://dcc.godaddy.com** → tu dominio **fdkempowernet.com** →
**DNS → Registros DNS** (Manage DNS). Añade:

**a) Verificación (TXT)** — el que te dio Google en la Fase 1:
```
Tipo: TXT   ·   Nombre: @   ·   Valor: google-site-verification=xxxxxxxx   ·   TTL: 1 hora
```

**b) Enrutamiento de correo (MX)** — para que el correo llegue a Google:
```
Tipo: MX   ·   Nombre: @   ·   Valor: smtp.google.com   ·   Prioridad: 1   ·   TTL: 1 hora
```
> Si GoDaddy ya trae MX antiguos (p. ej. de "Professional Email"), **bórralos**
> y deja solo este. (Alternativa clásica de Google, por si tu panel no acepta el
> anterior: 5 registros `aspmx.l.google.com` (1), `alt1…`/`alt2.aspmx.l.google.com`
> (5), `alt3…`/`alt4.aspmx.l.google.com` (10).)

Vuelve a Google y pulsa **"Verificar" / "Activar Gmail"**. Puede tardar unos minutos.

## FASE 3 · Crear los alias

En **https://admin.google.com** (con el usuario admin):
1. **Directorio → Usuarios** → abre tu usuario `admin@`.
2. **"Añadir alias" / "Correos electrónicos alternativos"** → añade:
   `publicar@fdkempowernet.com`, `hello@fdkempowernet.com`, `newsletter@fdkempowernet.com`.
3. Guarda. Todos caen en la bandeja del usuario principal (gratis).

## FASE 4 · Anti-spam (autenticar el envío de Google)

Esto hace que tus correos salgan verificados y **no caigan en spam**.

**a) SPF (TXT)** en GoDaddy:
```
Tipo: TXT   ·   Nombre: @   ·   Valor: v=spf1 include:_spf.google.com ~all
```
> Solo puede haber **un** registro SPF. Si ya existe uno, edítalo para incluir
> `include:_spf.google.com`.

**b) DKIM (Google)** — en **admin.google.com**:
1. **Apps → Google Workspace → Gmail → Autenticar correo electrónico**.
2. Dominio `fdkempowernet.com` → **"Generar registro nuevo"** (2048 bits).
3. Copia el **nombre de host** (`google._domainkey`) y el **valor TXT** largo.
4. En GoDaddy añade:
   ```
   Tipo: TXT   ·   Nombre: google._domainkey   ·   Valor: (el valor largo v=DKIM1; k=rsa; p=…)
   ```
5. Vuelve a Google y pulsa **"Iniciar autenticación"**.

**c) DMARC (TXT)** en GoDaddy:
```
Tipo: TXT   ·   Nombre: _dmarc   ·   Valor: v=DMARC1; p=none; rua=mailto:admin@fdkempowernet.com; adkim=s; aspf=s
```
> Empezamos con `p=none` (solo monitoriza). Más adelante se puede endurecer a
> `p=quarantine`.

## FASE 5 · Libros y newsletter (Kit / ConvertKit) sin spam

Los libros los envía **Kit**, así que hay que **autenticar el dominio también en Kit**:
1. En Kit: **Settings → Email → Sending domain / "Authenticate your domain"**.
2. Pon `fdkempowernet.com` y usa un "De:" como `newsletter@fdkempowernet.com`.
3. Kit te dará **varios registros CNAME** (propios de tu cuenta) → añádelos en GoDaddy tal cual:
   ```
   Tipo: CNAME   ·   Nombre: (el que indique Kit)   ·   Valor: (el que indique Kit)
   ```
4. En Kit pulsa **"Verify"**. Cuando quede verde, los libros salen desde tu
   dominio autenticado → bandeja de entrada, no spam.

## FASE 6 · Conectar la automatización de publicación

1. Inicia sesión en **https://script.google.com con `admin@fdkempowernet.com`**.
2. Sigue **EMAIL-SETUP.md** (crear proyecto, pegar el código, Drive API v2, token,
   `installTrigger`).
3. En el `CONFIG` del script pon:
   ```js
   ALLOWED_SENDERS: ["francesco@fdkempowernet.com", "…"],  // desde donde escribe FDK
   NOTIFY_EMAIL: "admin@fdkempowernet.com",
   ```
4. FDK publicará enviando a **`publicar@fdkempowernet.com`** con asunto `PUBLISH <título>`.

---

## Checklist
- [ ] Workspace dado de alta, dominio `fdkempowernet.com` verificado (TXT)
- [ ] MX `smtp.google.com` en GoDaddy (MX viejos borrados)
- [ ] Alias `publicar@`, `hello@`, `newsletter@` creados
- [ ] SPF + DKIM (Google) + DMARC añadidos y autenticados
- [ ] Dominio autenticado en Kit (CNAMEs) → libros sin spam
- [ ] Apps Script bajo `admin@fdkempowernet.com` + `installTrigger` corriendo
- [ ] **Registros A/CNAME del sitio web intactos** (GitHub Pages)

## Notas
- La propagación DNS puede tardar de minutos a unas horas.
- Comprueba entregabilidad enviando un correo a **https://www.mail-tester.com**
  (te da una puntuación de spam y qué falta).
