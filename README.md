# FDK · Landing moderna y dinámica

Reinterpretación moderna del sitio **fdkempowernet.com**: una comunidad colaborativa
donde el conocimiento financiero, de innovación y estrategia está al alcance de todos.

Construido como sitio estático (sin dependencias ni build) para que cargue rápido y
sea fácil de desplegar en cualquier hosting (GitHub Pages, Netlify, Vercel, etc.).

## ✨ Características

- **Diseño moderno** con modo oscuro, gradientes vivos y tipografía Sora/Inter.
- **Fondo animado** (blobs aurora + grid) con parallax sutil al hacer scroll.
- **Animaciones dinámicas**: revelado al hacer scroll (IntersectionObserver),
  contadores animados de estadísticas, barra de progreso de lectura.
- **Navbar inteligente** que cambia al hacer scroll + menú hamburguesa en móvil.
- **Secciones**: Hero, Comunidad/Valores, Servicios (Comunidad, Comunicación,
  Aprendizaje, Consultoría), Proceso, Testimonios, CTA con formulario y Footer.
- **Totalmente responsive** y accesible (respeta `prefers-reduced-motion`).
- **Formulario de contacto** con validación en el front (listo para conectar a un
  endpoint real).

## 📁 Estructura

```
index.html    →  Marcado y contenido
styles.css    →  Estilos, animaciones y responsive
script.js     →  Interacciones (scroll, contadores, menú, formulario)
```

## 🚀 Uso

Abre `index.html` en el navegador, o sirve la carpeta:

```bash
python3 -m http.server 8000
# luego abre http://localhost:8000
```

## 🔌 Conectar el formulario

En `script.js`, dentro del handler de `#joinForm`, reemplaza el bloque
`setTimeout(...)` por un `fetch()` a tu endpoint (por ejemplo Formspree, un
Worker, o tu API).

## 🎨 Personalización

Los colores de marca están como variables CSS en `:root` (`styles.css`):
`--brand`, `--brand-2`, `--brand-3` y el gradiente `--grad`.
