/* ============================================================
   FDK · GVI (Global Velocity Index) — SINGLE SOURCE OF TRUTH
   ------------------------------------------------------------
   To update the website indicators, you ONLY edit this file:
     1. Change the numbers / arrows to match the daily infographic.
     2. Bump `meta.updated`.
     3. Commit & push — GitHub Pages redeploys automatically.

   No HTML, no CSS. The renderer (gvi.js) draws every table,
   badge, KPI and sparkline from the data below.

   FIELD GUIDE
     score   : GVI value on a 0–100 scale (one decimal).
     delta   : change vs. prior period (e.g. +0.2, 0, -0.3).
     trend   : "up" | "flat" | "down"  → colours the arrow.
     spark   : short array of recent scores → draws the sparkline.
     tag      : optional momentum label ("Accelerating", "Stable"…).
   ============================================================ */
window.GVI_DATA = {
  meta: {
    brand: "FDK Global Velocity Index",
    tagline: "The Velocity Edge · by FDK",
    scale: "0–100",
    updated: "2026-07-29",          // ← date shown as "Data as of …"
    source: "FDK Velocity Intelligence Platform"
  },

  /* -------- Header KPIs (the top strip) -------- */
  headline: {
    label: "Global Velocity Index",
    score: 107.3,
    delta: +0.2,
    deltaPct: "+0.19%",
    trend: "up",
    kpis: [
      { label: "Countries improving", value: "7",     trend: "up"   },
      { label: "Countries declining", value: "0",     trend: "flat" },
      { label: "Coverage",            value: "15",    sub: "across 5 pillars" },
      { label: "30-day trend",        value: "Accelerating", trend: "up" }
    ]
  },

  /* ============================================================
     DATASET 1 — COUNTRY RANKINGS (daily)
     Source infographic: "Global Country Rankings · Daily Scorecard"
     ============================================================ */
  countries: {
    title: "Country Rankings",
    cadence: "Daily",
    columns: ["Country", "GVI", "Δ (pts)", "Momentum"],
    rows: [
      { rank: 1,  flag: "🇺🇸", name: "United States",  score: 93.4, delta: +0.2, trend: "up",   tag: "Accelerating",              spark: [92.1,92.3,92.4,92.6,92.8,93.0,93.2,93.4] },
      { rank: 2,  flag: "🇨🇳", name: "China",          score: 91.0, delta: +0.1, trend: "up",   tag: "Accelerating strongly",     spark: [89.4,89.8,90.1,90.3,90.5,90.7,90.9,91.0] },
      { rank: 3,  flag: "🇰🇷", name: "South Korea",    score: 87.8, delta: +0.1, trend: "up",   tag: "Accelerating very strongly",spark: [86.2,86.6,87.0,87.2,87.4,87.5,87.7,87.8] },
      { rank: 4,  flag: "🇯🇵", name: "Japan",          score: 84.9, delta:  0.0, trend: "up",   tag: "Accelerating",              spark: [84.1,84.3,84.5,84.6,84.7,84.8,84.9,84.9] },
      { rank: 5,  flag: "🇩🇪", name: "Germany",        score: 82.8, delta:  0.0, trend: "up",   tag: "Improving",                 spark: [82.4,82.5,82.6,82.6,82.7,82.7,82.8,82.8] },
      { rank: 6,  flag: "🇬🇧", name: "United Kingdom", score: 82.1, delta:  0.0, trend: "up",   tag: "Accelerating moderately",   spark: [81.6,81.7,81.8,81.9,82.0,82.0,82.1,82.1] },
      { rank: 7,  flag: "🇫🇷", name: "France",         score: 81.6, delta:  0.0, trend: "up",   tag: "Accelerating strongly",     spark: [80.9,81.1,81.2,81.3,81.4,81.5,81.6,81.6] },
      { rank: 8,  flag: "🇨🇭", name: "Switzerland",    score: 80.7, delta:  0.0, trend: "flat", tag: "Stable-positive",           spark: [80.5,80.6,80.6,80.7,80.6,80.7,80.7,80.7] },
      { rank: 9,  flag: "🇳🇱", name: "Netherlands",    score: 80.1, delta:  0.0, trend: "flat", tag: "Stable",                    spark: [80.0,80.0,80.1,80.0,80.1,80.1,80.1,80.1] },
      { rank: 10, flag: "🇸🇪", name: "Sweden",         score: 78.9, delta:  0.0, trend: "up",   tag: "Accelerating moderately",   spark: [78.3,78.5,78.6,78.7,78.8,78.8,78.9,78.9] },
      { rank: 11, flag: "🇩🇰", name: "Denmark",        score: 77.8, delta:  0.0, trend: "flat", tag: "Stable-positive",           spark: [77.4,77.5,77.6,77.6,77.7,77.7,77.8,77.8] },
      { rank: 12, flag: "🇳🇴", name: "Norway",         score: 77.2, delta:  0.0, trend: "flat", tag: "Stable-positive",           spark: [76.9,77.0,77.0,77.1,77.1,77.2,77.2,77.2] },
      { rank: 13, flag: "🇪🇸", name: "Spain",          score: 74.6, delta:  0.0, trend: "up",   tag: "Improving",                 spark: [74.1,74.2,74.3,74.4,74.5,74.5,74.6,74.6] },
      { rank: 14, flag: "🇦🇹", name: "Austria",        score: 72.5, delta:  0.0, trend: "flat", tag: "Stable",                    spark: [72.3,72.3,72.4,72.4,72.5,72.5,72.5,72.5] },
      { rank: 15, flag: "🇮🇹", name: "Italy",          score: 71.8, delta:  0.0, trend: "up",   tag: "Improving slowly",          spark: [71.5,71.6,71.6,71.7,71.7,71.8,71.8,71.8] }
    ]
  },

  /* ============================================================
     DATASET 2 — GLOBAL CORPORATE RANKINGS (daily)
     Source infographic: "Global Corporate Rankings · Daily Scorecard"
     ============================================================ */
  corporates: {
    title: "Global Corporate Rankings",
    cadence: "Daily",
    average: { score: 62.7, delta: +0.2, trend: "up" },
    top: [
      { rank: 1,  name: "NVIDIA",           sector: "Semiconductors / AI",   score: 96.8, delta: +0.6, trend: "up" },
      { rank: 2,  name: "Microsoft",        sector: "Technology / Cloud",    score: 94.1, delta: +0.4, trend: "up" },
      { rank: 3,  name: "Apple",            sector: "Technology",            score: 92.6, delta: +0.3, trend: "up" },
      { rank: 4,  name: "Alphabet",         sector: "Technology / AI",       score: 90.0, delta: +0.3, trend: "up" },
      { rank: 5,  name: "Amazon",           sector: "Cloud / E-commerce",    score: 88.3, delta: +0.2, trend: "up" },
      { rank: 6,  name: "TSMC",             sector: "Semiconductors",        score: 87.4, delta: +0.4, trend: "up" },
      { rank: 7,  name: "Broadcom",         sector: "Semiconductors",        score: 86.2, delta: +0.5, trend: "up" },
      { rank: 8,  name: "Meta",             sector: "Social Media / AI",     score: 84.7, delta: +0.4, trend: "up" },
      { rank: 9,  name: "ASML",             sector: "Semiconductor Equip.",  score: 83.0, delta:  0.0, trend: "flat" },
      { rank: 10, name: "Tesla",            sector: "Automotive / Energy",   score: 82.5, delta: +0.1, trend: "up" },
      { rank: 11, name: "Berkshire Hathaway",sector: "Diversified",          score: 81.4, delta:  0.0, trend: "flat" },
      { rank: 12, name: "Eli Lilly",        sector: "Pharma / Biotech",      score: 80.3, delta: +0.2, trend: "up" },
      { rank: 13, name: "JPMorgan Chase",   sector: "Financials",            score: 79.1, delta:  0.0, trend: "flat" },
      { rank: 14, name: "Visa",             sector: "Payments Technology",   score: 78.5, delta: +0.1, trend: "up" },
      { rank: 15, name: "SAP",              sector: "Enterprise Software",   score: 77.3, delta: +0.2, trend: "up" }
    ],
    bottom: [
      { rank: 241, name: "China Evergrande Group",   sector: "Real Estate",       score: 18.0, delta: -0.2, trend: "down" },
      { rank: 242, name: "Country Garden Holdings",  sector: "Real Estate",       score: 19.2, delta: -0.2, trend: "down" },
      { rank: 243, name: "Evergrande Property Svcs", sector: "Real Estate Svcs",  score: 20.1, delta: -0.2, trend: "down" },
      { rank: 244, name: "Siemens Energy (legacy)",  sector: "Energy Equip.",     score: 21.5, delta: -0.1, trend: "down" },
      { rank: 245, name: "Credit Suisse Group (HL)", sector: "Financials",        score: 22.7, delta: -0.1, trend: "down" },
      { rank: 246, name: "PayPal Holdings",          sector: "Fintech",           score: 23.9, delta: -0.1, trend: "down" },
      { rank: 247, name: "WeWork Inc.",              sector: "Real Estate Svcs",  score: 24.8, delta: -0.2, trend: "down" },
      { rank: 248, name: "Bed Bath & Beyond (NOL)",  sector: "Retail",            score: 25.3, delta: -0.2, trend: "down" },
      { rank: 249, name: "3M Company",               sector: "Industrials",       score: 25.9, delta: -0.1, trend: "down" },
      { rank: 250, name: "AMC Entertainment",        sector: "Entertainment",     score: 26.4, delta: -0.1, trend: "down" }
    ],
    sectors: [
      { rank: 1, name: "Semiconductors",     score: 84.6, delta: +0.4, trend: "up" },
      { rank: 2, name: "Technology / Cloud", score: 73.8, delta: +0.3, trend: "up" },
      { rank: 3, name: "Pharma / Biotech",   score: 69.1, delta: +0.2, trend: "up" },
      { rank: 4, name: "Payments / Fintech", score: 66.2, delta: +0.2, trend: "up" },
      { rank: 5, name: "Aerospace & Defense",score: 64.1, delta: +0.1, trend: "up" }
    ]
  },

  /* ============================================================
     DATASET 3 — INDUSTRY RANKINGS (weekly)
     Source infographic: "Corporate Rankings by Industry"
     ============================================================ */
  industries: {
    title: "Rankings by Industry",
    cadence: "Weekly",
    average: { score: 71.2, delta: +0.5, trend: "up" },
    rows: [
      { rank: 1,  name: "Technology Hardware",   score: 83.6, delta: +1.1, trend: "up",   leader: "NVIDIA" },
      { rank: 2,  name: "Technology Software",   score: 81.2, delta: +0.7, trend: "up",   leader: "Microsoft" },
      { rank: 3,  name: "Pharmaceuticals",       score: 74.6, delta: +0.3, trend: "up",   leader: "Pfizer" },
      { rank: 4,  name: "Financial Services",    score: 72.8, delta: +0.2, trend: "up",   leader: "JPMorgan Chase & Co." },
      { rank: 5,  name: "Automotive",            score: 68.4, delta: +0.4, trend: "up",   leader: "Tesla" },
      { rank: 6,  name: "Energy",                score: 67.1, delta: +0.1, trend: "up",   leader: "Chevron" },
      { rank: 7,  name: "Industrials",           score: 66.8, delta: +0.3, trend: "up",   leader: "Siemens" },
      { rank: 8,  name: "Consumer & Retail",     score: 64.9, delta: +0.2, trend: "up",   leader: "Amazon" },
      { rank: 9,  name: "Telecommunications",    score: 62.3, delta: +0.2, trend: "up",   leader: "AT&T" },
      { rank: 10, name: "Real Estate",           score: 41.2, delta: -0.1, trend: "down", leader: "Prologis" }
    ]
  }
};
