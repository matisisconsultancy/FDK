/* ============================================================
   FDK EmpowerNet · Visual rebuild — interactions
   Dependency-free: cursor ring, animated hero canvas,
   masked reveals, parallax, sticky storytelling, scroll
   highlight, magnetic buttons, book sample + excerpt.
   ============================================================ */
(function () {
  "use strict";

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const lerp = (a, b, n) => a + (b - a) * n;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  const yEl = $("#year");
  if (yEl) yEl.textContent = new Date().getFullYear();

  /* ---------- Split text into masked words / block ---------- */
  function splitText(el) {
    const nodes = Array.from(el.childNodes);
    el.textContent = "";
    let i = 0;
    nodes.forEach((node) => {
      if (node.nodeType === 3) {
        node.textContent.split(/(\s+)/).forEach((p) => {
          if (p === "") return;
          if (/^\s+$/.test(p)) { el.appendChild(document.createTextNode(" ")); return; }
          el.appendChild(makeWord(p, i++));
        });
      } else {
        const w = document.createElement("span");
        w.className = "r-word";
        const inner = document.createElement("span");
        inner.className = "r-word__in";
        inner.style.transitionDelay = i * 0.035 + "s";
        inner.appendChild(node);
        w.appendChild(inner);
        el.appendChild(w);
        i++;
      }
    });
  }
  function makeWord(text, i) {
    const w = document.createElement("span");
    w.className = "r-word";
    const inner = document.createElement("span");
    inner.className = "r-word__in";
    inner.style.transitionDelay = i * 0.035 + "s";
    inner.textContent = text;
    w.appendChild(inner);
    return w;
  }
  function splitBlock(el) {
    const inner = document.createElement("span");
    inner.className = "r-block__in";
    while (el.firstChild) inner.appendChild(el.firstChild);
    el.classList.add("r-block");
    el.appendChild(inner);
  }
  if (!reduceMotion) {
    $$("[data-reveal-text]").forEach(splitText);
    $$("[data-reveal-block]").forEach(splitBlock);
  }

  /* ---------- Scroll reveal ---------- */
  let revealIO = null;
  if ("IntersectionObserver" in window && !reduceMotion) {
    revealIO = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); revealIO.unobserve(e.target); } });
    }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });
  }
  // Observe reveal targets (works for static and dynamically-injected nodes).
  const revealObserve = (els) => els.forEach((el) => { if (revealIO) revealIO.observe(el); else el.classList.add("in"); });
  revealObserve($$("[data-reveal-text], [data-reveal-block], .reveal-up, .reveal-img").filter((el) => !el.closest(".hero")));

  /* ---------- The Velocity Edge: data-driven entries (posts.js) ---------- */
  const POSTS = (window.FDK_POSTS || []).slice();
  const lcardHTML = (p) => `
    <a href="${p.url}" class="lcard reveal-up" data-cursor>
      <div class="lcard__media"><img src="${p.image}" alt="" loading="lazy" onerror="this.closest('.lcard__media').classList.add('img--fail')"/></div>
      <span class="lcard__tag">${p.tag}</span>
      <h3>${p.title}</h3>
      <p>${p.excerpt}</p>
      <span class="lcard__more">Read note →</span>
    </a>`;
  const currentPage = (location.pathname.split("/").pop() || "index.html");

  // Home teaser cards — show the latest 3 entries.
  const homeGrid = $(".library .library__grid");
  if (homeGrid && POSTS.length) {
    homeGrid.innerHTML = POSTS.slice(0, 3).map(lcardHTML).join("");
    revealObserve($$(".lcard", homeGrid));
  }

  // Article footer gallery — every other entry, so readers can hop across notes.
  const moreGrid = $("#artMoreGrid");
  if (moreGrid) {
    const others = POSTS.filter((p) => p.url !== currentPage).slice(0, 3);
    const sec = moreGrid.closest(".art-more");
    if (others.length) {
      moreGrid.className = "library__grid art-more__grid" + (others.length <= 2 ? " jgrid--pair" : "");
      moreGrid.innerHTML = others.map(lcardHTML).join("");
      revealObserve($$(".lcard", moreGrid));
    } else if (sec) {
      sec.hidden = true;
    }
  }

  /* ---------- Preloader ---------- */
  const loader = $("#loader");
  const countEl = $("#loaderCount");
  const barEl = $("#loaderBar");
  function revealHero() {
    $$(".hero [data-reveal-text], .hero [data-reveal-block], .hero .reveal-up").forEach((el) => el.classList.add("in"));
  }
  if (loader && !reduceMotion) {
    document.body.classList.add("loading");
    let p = 0;
    const tick = () => {
      p += Math.max(1, (100 - p) * 0.06);
      if (p >= 100) p = 100;
      if (countEl) countEl.textContent = Math.round(p);
      if (barEl) barEl.style.width = p + "%";
      if (p < 100) requestAnimationFrame(tick);
      else setTimeout(() => { loader.classList.add("done"); document.body.classList.remove("loading"); revealHero(); }, 350);
    };
    requestAnimationFrame(tick);
  } else {
    if (loader) loader.remove();
    revealHero();
  }

  /* ---------- Navbar + progress ---------- */
  const nav = $("#nav");
  const progress = $("#scrollProgress");
  const navLinksEl = $("#navLinks");
  let lastY = window.scrollY || 0;
  const onScroll = () => {
    const sy = window.scrollY || document.documentElement.scrollTop;
    if (nav) {
      nav.classList.toggle("scrolled", sy > 40);
      // hide on scroll down, reveal on scroll up (keep visible near top / when menu open)
      const menuOpen = navLinksEl && navLinksEl.classList.contains("open");
      if (sy > 160 && sy > lastY + 4 && !menuOpen) nav.classList.add("nav--hidden");
      else if (sy < lastY - 4 || sy <= 160) nav.classList.remove("nav--hidden");
    }
    if (progress) {
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = (docH > 0 ? (sy / docH) * 100 : 0) + "%";
    }
    lastY = sy;
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const toggle = $("#navToggle");
  const links = $("#navLinks");
  if (toggle && links) {
    const close = () => { links.classList.remove("open"); toggle.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); };
    toggle.addEventListener("click", () => {
      const open = links.classList.toggle("open");
      toggle.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
    });
    $$("a", links).forEach((a) => a.addEventListener("click", close));
  }

  /* ---------- Cursor ring (native cursor stays) ---------- */
  const ring = $("#cursorRing");
  if (ring && finePointer && !reduceMotion) {
    let rx = innerWidth / 2, ry = innerHeight / 2, tx = rx, ty = ry;
    window.addEventListener("mousemove", (e) => { tx = e.clientX; ty = e.clientY; }, { passive: true });
    const render = () => {
      rx = lerp(rx, tx, 0.16); ry = lerp(ry, ty, 0.16);
      ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
    const hoverSel = "a, button, [data-cursor], input, select, textarea, .magnetic";
    document.addEventListener("mouseover", (e) => { if (e.target.closest(hoverSel)) ring.classList.add("is-hover"); });
    document.addEventListener("mouseout", (e) => { if (e.target.closest(hoverSel)) ring.classList.remove("is-hover"); });
    window.addEventListener("mousedown", () => ring.classList.add("is-down"));
    window.addEventListener("mouseup", () => ring.classList.remove("is-down"));
  }

  /* ---------- Hero canvas: flowing signal field ---------- */
  const canvas = $("#heroCanvas");
  if (canvas && !reduceMotion) {
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, running = true;
    const mouse = { x: 0.7, y: 0.4 };
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    const host = canvas.parentElement;
    host.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - r.left) / r.width;
      mouse.y = (e.clientY - r.top) / r.height;
    }, { passive: true });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((es) => { running = es[0].isIntersecting; }, { threshold: 0 }).observe(canvas);
    }
    const N = 22;
    let t = 0;
    const draw = () => {
      if (running && w && h) {
        t += 0.006;
        ctx.clearRect(0, 0, w, h);
        for (let i = 0; i < N; i++) {
          const p = i / (N - 1);
          const baseY = h * (0.1 + p * 0.82);
          const amp = (22 + 46 * Math.sin(p * Math.PI));
          ctx.beginPath();
          for (let x = 0; x <= w; x += 8) {
            const nx = x / w;
            const wave =
              Math.sin(nx * 6 + t * 1.4 + i * 0.4) * amp * 0.5 +
              Math.sin(nx * 3 - t + i * 0.22) * amp * 0.5;
            const my = (mouse.y - 0.5) * 50 * Math.sin(nx * Math.PI);
            const y = baseY + wave + my;
            x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.strokeStyle = `rgba(46,224,106,${0.05 + 0.11 * Math.sin(p * Math.PI)})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  /* ---------- Thesis hero: interactive dot grid ---------- */
  const tcanvas = $("#theroCanvas");
  if (tcanvas && !reduceMotion) {
    const tctx = tcanvas.getContext("2d");
    const host = tcanvas.parentElement;
    let w = 0, h = 0, gap = 36, dots = [], running = true;
    const radius = 170;
    const mouse = { x: -9999, y: -9999, active: false };
    const build = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = tcanvas.clientWidth; h = tcanvas.clientHeight;
      tcanvas.width = w * dpr; tcanvas.height = h * dpr;
      tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gap = Math.max(30, Math.min(42, w / 16));
      const cols = Math.ceil(w / gap) + 1, rows = Math.ceil(h / gap) + 1;
      dots = [];
      for (let yy = 0; yy < rows; yy++)
        for (let xx = 0; xx < cols; xx++)
          dots.push({ ox: xx * gap, oy: yy * gap, x: xx * gap, y: yy * gap, l: 0 });
    };
    build();
    window.addEventListener("resize", build);
    host.addEventListener("mousemove", (e) => {
      const r = tcanvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.active = true;
    }, { passive: true });
    host.addEventListener("mouseleave", () => { mouse.active = false; mouse.x = -9999; mouse.y = -9999; });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((es) => { running = es[0].isIntersecting; }, { threshold: 0 }).observe(tcanvas);
    }
    let t = 0;
    const draw = () => {
      if (running && w && h) {
        t += 0.018;
        tctx.clearRect(0, 0, w, h);
        if (mouse.active) {
          const grd = tctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, radius);
          grd.addColorStop(0, "rgba(46,224,106,0.14)");
          grd.addColorStop(1, "rgba(46,224,106,0)");
          tctx.fillStyle = grd; tctx.fillRect(0, 0, w, h);
        }
        for (const d of dots) {
          const dx = d.ox - mouse.x, dy = d.oy - mouse.y;
          const dist = Math.hypot(dx, dy);
          const infl = mouse.active ? Math.max(0, 1 - dist / radius) : 0;
          const idle = 0.06 + 0.05 * Math.sin(d.ox * 0.012 + d.oy * 0.014 + t);
          const target = Math.max(idle, infl);
          d.l += (target - d.l) * 0.12;
          const push = infl * infl * 22;
          const ang = Math.atan2(dy, dx);
          const tx = d.ox + Math.cos(ang) * push;
          const ty = d.oy + Math.sin(ang) * push;
          d.x += (tx - d.x) * 0.15; d.y += (ty - d.y) * 0.15;
          const size = 1 + d.l * 2.6;
          tctx.beginPath();
          tctx.arc(d.x, d.y, size, 0, Math.PI * 2);
          if (d.l > 0.25) tctx.fillStyle = `rgba(46,224,106,${0.2 + d.l * 0.75})`;
          else tctx.fillStyle = `rgba(170,185,230,${0.05 + d.l * 0.5})`;
          tctx.fill();
        }
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  /* ---------- Parallax ---------- */
  const parallaxImgs = $$("[data-parallax-img]");
  let ticking = false;
  const parallax = () => {
    const vh = window.innerHeight;
    parallaxImgs.forEach((img) => {
      const fig = img.parentElement;
      const r = fig.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      const prog = (r.top + r.height / 2 - vh / 2) / vh;
      img.style.transform = `translate3d(0, ${(prog * -7).toFixed(2)}%, 0)`;
    });
    ticking = false;
  };
  if (!reduceMotion && parallaxImgs.length) {
    window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(parallax); } }, { passive: true });
    parallax();
  }

  /* ---------- Sticky concepts ---------- */
  const conceptItems = $$(".concept");
  const conceptImgs = $$(".cmedia__img");
  const bigNum = $("#cBigNum");
  if (conceptItems.length) {
    let active = -1;
    const update = () => {
      const mid = window.innerHeight * 0.5;
      let best = 0, bestDist = Infinity;
      conceptItems.forEach((item, i) => {
        const r = item.getBoundingClientRect();
        const dist = Math.abs(r.top + r.height / 2 - mid);
        if (dist < bestDist) { bestDist = dist; best = i; }
      });
      if (best !== active) {
        active = best;
        conceptItems.forEach((it, i) => it.classList.toggle("is-active", i === active));
        conceptImgs.forEach((im, i) => im.classList.toggle("is-active", i === active));
        if (bigNum) bigNum.textContent = String(active + 1).padStart(2, "0");
      }
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  /* ---------- Statement word highlight ---------- */
  const stmt = $("[data-highlight]");
  if (stmt && !reduceMotion) {
    const words = stmt.textContent.trim().split(/\s+/);
    stmt.textContent = "";
    const spans = words.map((wd) => {
      const s = document.createElement("span");
      s.className = "hl";
      s.textContent = wd + " ";
      stmt.appendChild(s);
      return s;
    });
    const onStmt = () => {
      const r = stmt.getBoundingClientRect();
      const vh = window.innerHeight;
      const start = vh * 0.85, end = vh * 0.25;
      const prog = clamp((start - r.top) / (start - end + r.height), 0, 1);
      const lit = Math.round(prog * spans.length);
      spans.forEach((s, i) => s.classList.toggle("on", i < lit));
    };
    window.addEventListener("scroll", onStmt, { passive: true });
    window.addEventListener("resize", onStmt);
    onStmt();
  }

  /* ---------- Back to top ---------- */
  const toTop = $("#toTop");
  if (toTop) {
    toTop.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    });
  }

  /* ---------- Interactive thesis cards (tap / keyboard reveal) ---------- */
  $$(".tcard").forEach((card) => {
    card.addEventListener("click", () => card.classList.toggle("is-open"));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); card.classList.toggle("is-open"); }
    });
  });

  /* ---------- Book: excerpt toggle ---------- */
  const exToggle = $("#excerptToggle");
  const exMore = $("#excerptMore");
  if (exToggle && exMore) {
    exToggle.addEventListener("click", () => {
      const open = exMore.hasAttribute("hidden");
      if (open) { exMore.removeAttribute("hidden"); exToggle.textContent = "Read less ↑"; }
      else { exMore.setAttribute("hidden", ""); exToggle.textContent = "Read more ↓"; }
    });
  }

  /* ---------- Book: download a sample ---------- */
  const BOOK_SAMPLES = {
    "The Rise of Velocity": [
      "EXECUTIVE SUMMARY — The Bottom Line",
      "",
      "We are witnessing the emergence of Velocity Capitalism — a new",
      "economic paradigm where speed, not scale, determines competitive",
      "advantage. The convergence of accelerated computing and generative",
      "AI is creating a structural divide between organisations operating",
      "at machine speed and those constrained by human-paced decisions.",
      "",
      "At 3:47 a.m. Pacific Time on January 20, 2025, something",
      "unprecedented happened in the AI industry. DeepSeek, a Chinese",
      "startup virtually unknown outside specialist circles, released an",
      "open-source model that matched OpenAI's GPT-4 performance. The",
      "shocking part wasn't the capability — it was the cost. While OpenAI",
      "had spent over $100 million training GPT-4, DeepSeek achieved",
      "comparable results for under $6 million.",
      "",
      "Within 48 hours, DeepSeek's app topped Apple's App Store. Within a",
      "week, it triggered $1 trillion in market-value destruction across",
      "U.S. tech giants. The comfortable assumptions of Silicon Valley —",
      "that AI dominance required massive capital, that computational",
      "supremacy guaranteed market control, that moats could be built with",
      "money — evaporated overnight.",
      "",
      "This wasn't just a technical disruption. It was a velocity",
      "disruption. In the industrial age, advantage came from accumulating",
      "assets — factories, patents, market share. In the age of AI,",
      "success belongs not to those who accumulate the most, but to those",
      "who learn, adapt, and redeploy the fastest.",
    ],
    "The Age of Intelligent Motion": [
      "PROLOGUE — Enter the Age of Intelligent Motion",
      "",
      "At 6:12 a.m., the first high-speed train leaves the depot.",
      "It is still dark. The city is waking up. The timetable has no margin",
      "for philosophy. Thousands of passengers will depend on this train",
      "arriving exactly when it should — not early, not late.",
      "",
      "Sensors stream data continuously. Energy flows are monitored in real",
      "time. Minor anomalies — wheel friction, temperature variance, signal",
      "noise — are detected before they become problems. Decisions are made",
      "in milliseconds, not minutes. All of them are constrained by physics,",
      "safety, and trust.",
      "",
      "For more than a decade, artificial intelligence lived comfortably in",
      "the cloud — centralised, elastic, and distant. That architecture",
      "worked — until intelligence had to move.",
      "",
      "At 300 kilometres per hour, a high-speed train covers eighty-three",
      "metres every second. A 300-millisecond cloud round trip would mean",
      "twenty-five metres of ungoverned motion. In mobility systems, that is",
      "not a technical inconvenience. It is an unacceptable risk.",
      "",
      "This is where the cloud stopped being sufficient. Intelligence had to",
      "leave the cloud and embed itself where decisions happen — inside",
      "vehicles, depots, substations, intersections and control rooms. It had",
      "to sense locally, decide instantly, and learn continuously. In short,",
      "intelligence had to become operational.",
    ],
    "The European Pivot": [
      "PROLOGUE — From Stagnation to the Velocity Age",
      "",
      "Periods of sustained European outperformance in capital markets have rarely",
      "coincided with moments of obvious technological superiority. They have emerged,",
      "more often, when the continent reorganised its financial architecture around a",
      "new mechanism of power.",
      "",
      "The railway boom of the nineteenth century did not enrich London because British",
      "engineers were brilliant, but because the London Stock Exchange developed the",
      "long-duration investment instruments that turned locomotives into a continental",
      "asset class. The electrification between the wars did not lift Berlin and Milan",
      "because of their physicists' superiority, but because municipal balance sheets,",
      "regional banks and industrial conglomerates organised themselves into funding",
      "structures equal to the scale of the technology.",
      "",
      "Every transition of this nature shares a pattern — technology arrives, capital",
      "lags behind, and the societies that close that gap fastest define the economic",
      "order that follows. Europe is today in the early stage of another such transition,",
      "and it is falling behind.",
      "",
      "The problem this poses for Europe is not technological. It is financial.",
      "",
      "This book's answer: Europe already holds the right asset, without having",
      "recognised it as a strategic instrument — high-speed rail. Not as a transport",
      "service, nor a climate or regional-development policy, but as the only physical",
      "backbone of continental scale on which to finance, deploy and govern a",
      "continental AI platform.",
    ],
  };

  function downloadSample(btn) {
    const title = (btn && btn.dataset.title) || "The European Pivot";
    const sub = (btn && btn.dataset.sub) || "How Europe Will Finance the Industrial Age of AI";
    const body = BOOK_SAMPLES[title] || [
      "Speed has replaced scale.",
      "",
      "For a century, competitive advantage was a function of size. The firm with the",
      "most assets, the widest distribution and the deepest balance sheet could outlast",
      "and outspend its rivals. Scale was the moat. That logic is now inverting.",
      "",
      "In an economy where intelligence compounds with every interaction, the decisive",
      "variable is no longer how much a company owns — it is how quickly it learns.",
    ];
    const text = [
      title.toUpperCase(),
      sub,
      "Francesco de Leo Kaufmann — FDK EmpowerNet",
      "",
      "— SAMPLE —",
      "",
      ...body,
      "",
      "— End of sample —",
      "Buy the full book: info@fdkempowernet.com",
    ].join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") + "-sample.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  ["#downloadSample", "#downloadSample2"].forEach((sel) => {
    const btn = $(sel);
    if (btn) btn.addEventListener("click", () => downloadSample(btn));
  });

  /* ---------- Intelligence Library: live greeting + day/night mode ---------- */
  // Page theme follows the clock by default (day = light, night = dark);
  // the filter buttons can force it (Day → light, Night → dark, All → auto).
  let journalManualTheme = null; // null = follow clock; "light" | "dark" = forced
  const applyJournalTheme = (light) => document.body.classList.toggle("theme-light", light);
  const isDaytime = () => { const h = new Date().getHours(); return h >= 5 && h < 18; };
  // Map a publish hour to a time-of-day phase that tints the card background.
  const phaseOf = (h) => {
    if (h >= 5 && h < 9) return { key: "dawn", dark: false };
    if (h >= 9 && h < 17) return { key: "day", dark: false };
    if (h >= 17 && h < 20) return { key: "dusk", dark: true };
    if (h >= 2 && h < 5) return { key: "late", dark: true };
    return { key: "night", dark: true }; // 20:00–02:00
  };
  const hourFromTime = (t) => { const m = String(t || "").match(/(\d{1,2})/); return m ? parseInt(m[1], 10) : 12; };
  const jGreeting = $("#jGreeting");
  const jClock = $("#jClock");
  const journalHero = $(".journal-hero");
  if (jGreeting || jClock || journalHero) {
    // Render the journal from the shared entry list: newest = featured, rest = grid.
    const renderJournal = () => {
      if (!POSTS.length) return;
      const featured = $("#jFeatured");
      if (featured) {
        const p = POSTS[0];
        const ph = phaseOf(hourFromTime(p.time));
        const dn = ph.dark ? "night" : "day";
        const cat = p.tag.includes("·") ? p.tag.split("·").slice(1).join("·").trim() : p.tag;
        featured.href = p.url;
        featured.dataset.phase = ph.key;
        featured.className = `jfeatured jfeatured--${dn} reveal-up`;
        featured.innerHTML = `
          <span class="jfeatured__stars" aria-hidden="true"></span>
          <div class="jfeatured__body">
            <div class="jcard__top">
              <span class="jtype jtype--${dn}"><span class="jic jic--${ph.dark ? "moon" : "sun"}" aria-hidden="true"></span> ${p.tag}</span>
              <span class="jtime">${p.date}</span>
            </div>
            <h2 class="jfeatured__title">${p.title}</h2>
            <p class="jfeatured__excerpt">${p.excerpt}</p>
            <div class="jcard__foot"><span class="jtags">${cat}</span><span class="jread">${p.read} →</span></div>
          </div>`;
      }
      const grid = $("#journalGrid");
      if (grid) {
        const rest = POSTS.slice(1);
        grid.className = "jgrid" + (rest.length <= 2 ? " jgrid--pair" : "");
        grid.innerHTML = rest.map((p) => {
          const ph = phaseOf(hourFromTime(p.time));
          const dn = ph.dark ? "night" : "day";
          return `<a class="jpost jpost--${dn} reveal-up" data-type="${p.kind}" data-phase="${ph.key}" href="${p.url}" data-cursor>
            <div class="jpost__media"><img src="${p.image}" alt="" loading="lazy" onerror="this.closest('.jpost__media').classList.add('img--fail')"><span class="jpost__badge"><span class="jic jic--${ph.dark ? "moon" : "sun"}"></span> ${p.time} · ${p.slot}</span></div>
            <span class="jpost__tag">${p.tag}</span>
            <h3>${p.title}</h3>
            <p>${p.excerpt}</p>
            <span class="jpost__more">Read note →</span>
          </a>`;
        }).join("");
      }
      const countEl = $("#jCount");
      if (countEl) countEl.textContent = String(POSTS.length);
      revealObserve($$("#jFeatured, #journalGrid .jpost"));
    };
    renderJournal();

    const updateClock = () => {
      const d = new Date();
      const hr = d.getHours();
      let g = "Good evening", mode = "night";
      if (hr >= 5 && hr < 12) { g = "Good morning"; mode = "day"; }
      else if (hr >= 12 && hr < 18) { g = "Good afternoon"; mode = "day"; }
      else if (hr >= 18 && hr < 22) { g = "Good evening"; mode = "night"; }
      else { g = "Working late"; mode = "night"; }
      if (jGreeting) jGreeting.textContent = g;
      if (jClock) jClock.textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (journalHero) journalHero.dataset.mode = mode;
      if (journalManualTheme === null) applyJournalTheme(mode === "day");
    };
    updateClock();
    setInterval(updateClock, 30000);
  }

  /* ---------- Intelligence Library: day/night filter ---------- */
  const jfilter = $(".jfilter");
  if (jfilter) {
    const btns = $$(".jfilter__btn", jfilter);
    const entries = $$(".jpost");
    const countEl = $("#jCount");
    const emptyEl = $("#journalEmpty");
    btns.forEach((b) => b.addEventListener("click", () => {
      btns.forEach((x) => x.classList.remove("is-active"));
      b.classList.add("is-active");
      const f = b.dataset.filter;
      let shown = 0;
      entries.forEach((e) => {
        const match = f === "all" || e.dataset.type === f;
        e.classList.toggle("is-hidden", !match);
        if (match) shown++;
      });
      if (countEl) countEl.textContent = String(shown);
      if (emptyEl) emptyEl.hidden = shown > 0;
      // Day → force light, Night → force dark, All notes → follow the clock
      if (f === "day") { journalManualTheme = "light"; applyJournalTheme(true); }
      else if (f === "night") { journalManualTheme = "dark"; applyJournalTheme(false); }
      else { journalManualTheme = null; applyJournalTheme(isDaytime()); }
    }));
  }

  /* ---------- Article: signal accordions ---------- */
  $$(".signal").forEach((item) => {
    const head = item.querySelector(".signal__head");
    if (!head) return;
    head.addEventListener("click", () => {
      const open = item.classList.toggle("is-open");
      head.setAttribute("aria-expanded", String(open));
    });
  });

  /* ---------- Article: animated stat counters ---------- */
  const counters = $$("[data-count]");
  if (counters.length) {
    const fmt = (n) => Math.round(n).toLocaleString("en-US");
    const render = (el, val) => { el.textContent = (el.dataset.prefix || "") + fmt(val) + (el.dataset.suffix || ""); };
    const run = (el) => {
      const target = parseFloat(el.dataset.count);
      if (reduceMotion) { render(el, target); return; }
      const dur = 1200; let start = null;
      const step = (t) => {
        if (start === null) start = t;
        const p = Math.min(1, (t - start) / dur);
        render(el, target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if ("IntersectionObserver" in window) {
      const io2 = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) { run(e.target); io2.unobserve(e.target); } });
      }, { threshold: 0.4 });
      counters.forEach((el) => io2.observe(el));
    } else {
      counters.forEach(run);
    }
  }

  /* ---------- Subscribe form (front-end only) ---------- */
  const subForm = $("#subForm");
  const subStatus = $("#subStatus");
  if (subForm && subStatus) {
    subForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = $("#subEmail").value.trim();
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      subStatus.className = "form__status";
      if (!ok) { subStatus.textContent = "Please enter a valid email."; subStatus.classList.add("err"); return; }
      subForm.reset();
      subStatus.textContent = "Subscribed — the day and night notes are on their way.";
      subStatus.classList.add("ok");
    });
  }

  /* ---------- Contact form ---------- */
  const form = $("#briefingForm");
  const status = $("#formStatus");
  if (form && status) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("#name").value.trim();
      const email = $("#email").value.trim();
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      status.className = "form__status";
      if (!name || !email) { status.textContent = "Please enter your name and work email."; status.classList.add("err"); return; }
      if (!emailOk) { status.textContent = "That email doesn't look valid. Please check it."; status.classList.add("err"); return; }
      const btn = $("button[type=submit]", form);
      const original = btn.textContent;
      btn.disabled = true; btn.textContent = "Sending...";
      setTimeout(() => {
        btn.disabled = false; btn.textContent = original; form.reset();
        status.textContent = `Thank you, ${name}. We've received your request and will be in touch shortly.`;
        status.classList.add("ok");
      }, 900);
    });
  }
})();
