# FDK EmpowerNet · Avatar IA de Francesco (plan de desarrollo)

**Objetivo:** diversificar los formatos de FDK y llegar a nuevas audiencias con vídeo
corto en EN/ES/IT, sin que Francesco tenga que grabar cada pieza. El avatar se
presenta **siempre declarado como IA**. La autoridad sigue siendo Francesco; el
avatar multiplica su alcance.

```
Nota publicada → guion EN/ES/IT (scripts/avatar-script.mjs) → aprobación de Francesco
      → vídeo del avatar (HeyGen / Synthesia) → LinkedIn · YouTube Shorts (Metricool)
      → el vídeo se incrusta en la nota
```

| Fase | Qué | Duración | Estado |
|---|---|---|---|
| 0 · Definir | Decisiones, consentimiento, proveedor, grabación de entrenamiento | 1–2 semanas | **en curso** |
| 1 · Piloto manual | 2–3 vídeos/semana, guion generado y vídeo montado a mano | 4–6 semanas | guion listo (`scripts/avatar-script.mjs`) |
| 2 · Automatizar | Guion → vídeo → aprobación por Telegram → Metricool → web | 3–4 semanas | pendiente de resultados del piloto |
| 3 · Avatar conversacional | "Pregunte a la tesis" en la web, basado en las notas y el libro | por definir | idea |

---

## Fase 0 · Decisiones que hay que cerrar

Marque cada casilla cuando esté decidida.

- [ ] **Objetivo principal del piloto:** alcance (seguidores, visualizaciones) **o**
      posicionamiento (solicitudes de Executive Briefing). Propuesta: posicionamiento,
      medido con el formulario de contacto.
- [ ] **Idioma de arranque:** propuesta ES + EN. El italiano se añade en la semana 3.
- [ ] **Canales:** propuesta LinkedIn (perfil de Francesco + página FDK) y YouTube Shorts.
- [ ] **Formato:** propuesta vertical 9:16, 60–90 s, subtítulos siempre activados.
- [ ] **Consentimiento por escrito de Francesco**, con:
      - temas permitidos: lo que ya está publicado en una nota de FDK, nada más;
      - temas vetados: recomendaciones de inversión, política partidista, opiniones
        sobre personas, cualquier cosa que no esté en una nota;
      - aprobación obligatoria: ningún vídeo sale sin el visto bueno de Francesco;
      - derecho a retirar el avatar y a borrar sus datos en cualquier momento.
- [ ] **Proveedor elegido** (ver la lista de comprobación más abajo).
- [ ] **Grabación de entrenamiento hecha** (ver más abajo).

### Elegir proveedor: comprobar antes de firmar

Los candidatos habituales son HeyGen y Synthesia para el vídeo, y ElevenLabs para la
voz. Precios y condiciones cambian a menudo: verifíquelos en el momento de contratar.

- [ ] La imagen y la voz clonadas **son propiedad de FDK/Francesco** y no se usan para
      entrenar otros modelos.
- [ ] Se pueden **borrar** el avatar y los datos de entrenamiento cuando se pida.
- [ ] Hay **verificación de identidad** para crear el clon. Nadie más puede clonar a
      Francesco desde la cuenta.
- [ ] Calidad en **español e italiano** (no solo inglés): pedir una demo en los tres.
- [ ] **API** disponible para la Fase 2 (generar vídeo desde un guion).
- [ ] Marca de agua o metadatos de contenido sintético (C2PA) si el proveedor los ofrece.

### Grabación de entrenamiento (de esto depende la calidad)

- 5–10 minutos de Francesco hablando a cámara, en el mismo sitio y con la misma ropa.
- Luz frontal suave, fondo neutro o de marca FDK (navy `#141a4e`).
- Micrófono de solapa o de condensador, sin eco. Mejor que la cámara si hay que elegir.
- Hablar con naturalidad, con pausas. Leer un texto de FDK, no improvisar.
- Grabar un fragmento en cada idioma que vaya a usarse.

---

## Guía editorial del avatar

- **Quién habla:** el avatar habla en primera persona, como Francesco, a CEOs, CSOs
  y consejos de administración.
- **Tono:** sereno, preciso, analítico. Seguro, sin exagerar. Frases cortas, escritas
  para el oído.
- **Contenido:** solo lo que dice una nota publicada. **Ninguna cifra, previsión o cita
  que no esté en la nota.** El script lo comprueba y avisa si aparece un número que no
  está en el texto original.
- **Conceptos FDK:** Velocity Capitalism, Structural Bifurcation, The Repricing, The
  Civic Platform y AI Supercycle se dicen en inglés en todos los idiomas.
- **Registro:** en español siempre *usted*; en italiano, registro formal.
- **Estructura (75 s):** gancho (≤15 palabras) → tres ideas: qué pasó, por qué
  importa al capital, qué cambia → la pregunta para el consejo → "lea la nota
  completa en fdkempowernet.com".
- **Transparencia, siempre:**
  - en pantalla: *"Avatar IA de Francesco De Leo Kaufmann · guion revisado por FDK
    EmpowerNet"*;
  - la misma línea al final del texto de cada publicación.

  Lo exige el art. 50 del AI Act europeo para contenido sintético que imita a una
  persona real, y además da confianza.
- **Lo que no hace el avatar:** responder comentarios, hablar en directo, opinar
  fuera de las notas, aparecer en piezas de lanzamiento del libro o en tesis
  principales. Esas las graba Francesco en persona.

---

## Fase 1 · Piloto: cómo se trabaja

### 1. Generar el guion de una nota

```bash
ANTHROPIC_API_KEY=… node scripts/avatar-script.mjs                      # la nota más reciente
ANTHROPIC_API_KEY=… node scripts/avatar-script.mjs the-five-percent-wall
node scripts/avatar-script.mjs the-five-percent-wall --dry-run           # ver la entrada, sin llamar a la API
node scripts/avatar-script.mjs the-five-percent-wall --seconds 60        # otra duración (45–120 s)
```

Escribe dos archivos en `data/avatar/scripts/`:

- `<slug>.md`: para leer y corregir. Incluye el guion en EN/ES/IT, los títulos en
  pantalla, el texto para LinkedIn con la línea de transparencia, los hashtags y la
  lista de datos usados.
- `<slug>.json`: lo mismo en formato máquina, para la Fase 2.

Arriba del `.md` aparecen avisos (**⚠ Check before recording**) si:

- un guion se sale de la duración;
- el español parece usar *tú*;
- aparece una cifra que no está en la nota.

### 2. Aprobar, grabar y publicar

1. Francesco lee el `.md`, corrige y aprueba.
2. Pegar el guion en el proveedor de avatar y generar el vídeo vertical con subtítulos.
3. Añadir en pantalla la línea de transparencia y los tres títulos.
4. Programar en LinkedIn y YouTube Shorts con Metricool, con el texto del `.md`.

### Calendario propuesto

- 2–3 vídeos por semana, el mismo día que la nota o al día siguiente.
- Durante el piloto, alternar el **avatar** con **Francesco grabado de verdad** para
  comparar los resultados.

### Qué medimos

| Métrica | Dónde | Para qué |
|---|---|---|
| Visualizaciones y % visto completo | LinkedIn / YouTube (Metricool) | ¿El formato engancha? |
| Seguidores nuevos | LinkedIn / YouTube | ¿Llegamos a audiencia nueva? |
| Clics a la nota | GA4 (UTM `utm_source=avatar`) | ¿El vídeo lleva a la web? |
| **Solicitudes de Executive Briefing** | Formulario de contacto | El indicador que importa |
| Comentarios negativos sobre el uso de IA | Lectura manual | Riesgo de confianza |

**Criterio para pasar a la Fase 2:** el avatar rinde al menos un 70 % de lo que rinde
Francesco grabado (en % visto completo y clics) y no hay reacción negativa relevante
por el uso de IA.

---

## Fase 2 · Automatización (diseño, pendiente del piloto)

1. Tras publicar una nota, `publish-drafts.yml` ejecuta `avatar-script.mjs` y guarda
   el guion.
2. El bot de Telegram (ver `TELEGRAM-SETUP.md`) envía el guion a Francesco con los
   botones **Aprobar** y **Corregir**.
3. Al aprobarlo, la API del proveedor genera los vídeos en EN/ES/IT.
4. Metricool programa la publicación en la mejor franja horaria de cada red.
5. El vídeo se incrusta en la página de la nota, con su línea de transparencia.

Secretos nuevos que hará falta añadir en GitHub: la clave de la API del proveedor de
avatar y la de Metricool si se automatiza la programación. **Nunca en el repositorio.**
