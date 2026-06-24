/* ============================================================
   FDK · Modern dynamic landing — interactions
   ============================================================ */
(function () {
  "use strict";

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  /* ---- Current year ---- */
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---- Navbar scrolled state + scroll progress ---- */
  const nav = $("#nav");
  const progress = $("#scrollProgress");

  const onScroll = () => {
    const y = window.scrollY || document.documentElement.scrollTop;
    if (nav) nav.classList.toggle("scrolled", y > 24);

    if (progress) {
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docH > 0 ? (y / docH) * 100 : 0;
      progress.style.width = pct + "%";
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---- Mobile menu ---- */
  const toggle = $("#navToggle");
  const links = $("#navLinks");
  if (toggle && links) {
    const closeMenu = () => {
      links.classList.remove("open");
      toggle.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    };
    toggle.addEventListener("click", () => {
      const open = links.classList.toggle("open");
      toggle.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
    });
    $$("a", links).forEach((a) => a.addEventListener("click", closeMenu));
  }

  /* ---- Reveal on scroll ---- */
  const revealEls = $$(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) {
            // small stagger for siblings
            setTimeout(() => entry.target.classList.add("in"), (i % 4) * 80);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("in"));
  }

  /* ---- Animated stat counters ---- */
  const statsWrap = $("#stats");
  const animateCount = (el) => {
    const target = parseFloat(el.dataset.count || "0");
    const suffix = el.dataset.suffix || "";
    const duration = 1500;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      el.textContent = Math.round(target * eased) + suffix;
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = target + suffix;
    };
    requestAnimationFrame(step);
  };

  if (statsWrap) {
    if ("IntersectionObserver" in window) {
      const statIO = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            $$(".stat__num", statsWrap).forEach(animateCount);
            statIO.disconnect();
          }
        },
        { threshold: 0.4 }
      );
      statIO.observe(statsWrap);
    } else {
      $$(".stat__num", statsWrap).forEach(animateCount);
    }
  }

  /* ---- Subtle parallax on background blobs ---- */
  const blobs = $$(".blob");
  if (blobs.length && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    let ticking = false;
    window.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          const y = window.scrollY;
          blobs.forEach((b, i) => {
            const speed = (i + 1) * 0.04;
            b.style.transform = `translateY(${y * speed}px)`;
          });
          ticking = false;
        });
      },
      { passive: true }
    );
  }

  /* ---- Contact form (front-end only) ---- */
  const form = $("#joinForm");
  const status = $("#formStatus");
  if (form && status) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("#name").value.trim();
      const email = $("#email").value.trim();
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

      status.className = "form__status";

      if (!name || !email) {
        status.textContent = "Por favor completa tu nombre y correo.";
        status.classList.add("err");
        return;
      }
      if (!emailOk) {
        status.textContent = "Ese correo no parece válido. Revísalo, por favor.";
        status.classList.add("err");
        return;
      }

      const btn = $("button[type=submit]", form);
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Enviando...";

      // Simulated submission — replace with real endpoint when available.
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = original;
        form.reset();
        status.textContent = `¡Gracias, ${name}! Hemos recibido tu solicitud. Te contactaremos pronto.`;
        status.classList.add("ok");
      }, 900);
    });
  }
})();
