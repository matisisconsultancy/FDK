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
  const revealTargets = $$("[data-reveal-text], [data-reveal-block], .reveal-up, .reveal-img")
    .filter((el) => !el.closest(".hero")); // hero revealed by preloader
  if ("IntersectionObserver" in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });
    revealTargets.forEach((el) => io.observe(el));
  } else {
    revealTargets.forEach((el) => el.classList.add("in"));
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
  const onScroll = () => {
    const sy = window.scrollY || document.documentElement.scrollTop;
    if (nav) nav.classList.toggle("scrolled", sy > 40);
    if (progress) {
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = (docH > 0 ? (sy / docH) * 100 : 0) + "%";
    }
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

  /* ---------- Magnetic ---------- */
  if (finePointer && !reduceMotion) {
    $$(".magnetic").forEach((el) => {
      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        const mx = e.clientX - (r.left + r.width / 2);
        const my = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${mx * 0.12}px, ${my * 0.12}px)`;
      });
      el.addEventListener("mouseleave", () => { el.style.transform = ""; });
    });
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
  function downloadSample() {
    const text = [
      "VELOCITY CAPITALISM",
      "How Artificial Intelligence Rewrites Competitive Advantage",
      "Francesco de Leo Kaufmann — FDK EmpowerNet",
      "",
      "— SAMPLE / OPENING CHAPTER —",
      "",
      "Speed has replaced scale.",
      "",
      "For a century, competitive advantage was a function of size. The firm with the",
      "most assets, the widest distribution and the deepest balance sheet could outlast",
      "and outspend its rivals. Scale was the moat. That logic is now inverting.",
      "",
      "In an economy where intelligence compounds with every interaction, the decisive",
      "variable is no longer how much a company owns — it is how quickly it learns. The",
      "organisations that will lead the next decade are not those with the most assets.",
      "They are those with the fastest learning cycles. Every board still optimising for",
      "quarterly planning is, quietly, operating on the wrong clock.",
      "",
      "This is not a story about technology adoption. AI initiatives are multiplying across",
      "every large European corporate; strategic theses are not. The gap between the two is",
      "where this book lives.",
      "",
      "— End of sample —",
      "Buy the full book: info@fdkempowernet.com",
    ].join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Velocity-Capitalism-sample.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  ["#downloadSample", "#downloadSample2"].forEach((sel) => {
    const btn = $(sel);
    if (btn) btn.addEventListener("click", downloadSample);
  });

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
