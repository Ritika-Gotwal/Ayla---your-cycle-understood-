/* Ayla — Deep pink wellness theme */

const AYLA_THEME_KEY = "aylaTheme";
const DEFAULT_THEME = "theme-sakura-bloom";

/** Legacy / prior theme ids → Sakura presets */
const LEGACY_THEME_MAP = {
  "theme-blush-pro": "theme-sakura-bloom",
  "theme-lavender-pro": "theme-sakura-bloom",
  "theme-peach-pro": "theme-sakura-bloom",
  "theme-moon-pro": "theme-sakura-bloom",
  "theme-berry-pro": "theme-sakura-bloom",
  "theme-midnight-pro": "theme-sakura-bloom",
  "theme-ayla-veil": "theme-sakura-bloom",
  "theme-ayla-bloom": "theme-sakura-petal",
};

const AYLA_THEME_CLASSES = ["theme-sakura-bloom", "theme-sakura-petal"];

const THEMES = [
  {
    id: "theme-sakura-bloom",
    name: "Deep Pink",
    swatches: ["#7A0026", "#D9A7B8", "#F5E8EE"],
  },
  {
    id: "theme-sakura-petal",
    name: "Bright Bloom",
    swatches: ["#7A0026", "#C45A6A", "#FFEAEC"],
  },
];

function applyAylaTheme(themeId, { persist = true } = {}) {
  const mapped = LEGACY_THEME_MAP[themeId] || themeId;
  const id = AYLA_THEME_CLASSES.includes(mapped) ? mapped : DEFAULT_THEME;

  for (const c of AYLA_THEME_CLASSES) document.body.classList.remove(c);
  document.body.classList.add(id);

  if (persist) localStorage.setItem(AYLA_THEME_KEY, id);

  const themeBtn = document.getElementById("themeBtn");
  if (themeBtn) {
    themeBtn.classList.remove("is-night");
    themeBtn.setAttribute("aria-label", "Choose appearance");
  }

  renderThemeList();
}

function renderThemeList() {
  const list = document.getElementById("themeList");
  if (!list) return;

  list.innerHTML = "";

  const raw = localStorage.getItem(AYLA_THEME_KEY) || DEFAULT_THEME;
  const current = LEGACY_THEME_MAP[raw] || raw;
  const activeId = AYLA_THEME_CLASSES.includes(current) ? current : DEFAULT_THEME;

  THEMES.forEach((t) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-option";
    btn.setAttribute("data-theme", t.id);
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", String(t.id === activeId));

    const left = document.createElement("div");
    left.className = "theme-option__left";

    const dots = document.createElement("div");
    dots.className = "theme-dots";
    t.swatches.forEach((c) => {
      const d = document.createElement("span");
      d.className = "theme-dot";
      d.style.background = c;
      dots.appendChild(d);
    });

    const meta = document.createElement("div");
    meta.className = "theme-option__meta";
    const name = document.createElement("div");
    name.className = "theme-option__name";
    name.textContent = t.name;
    const hint = document.createElement("div");
    hint.className = "micro subtle";
    hint.textContent = t.id === DEFAULT_THEME ? "Default" : "Airy cards";

    meta.appendChild(name);
    meta.appendChild(hint);

    left.appendChild(dots);
    left.appendChild(meta);

    const check = document.createElement("div");
    check.className = "theme-option__check";
    check.textContent = "✓";

    btn.appendChild(left);
    btn.appendChild(check);

    btn.addEventListener("click", () => applyAylaTheme(t.id));
    list.appendChild(btn);
  });
}

function initAylaTheme() {
  const raw = localStorage.getItem(AYLA_THEME_KEY) || DEFAULT_THEME;
  const normalized = LEGACY_THEME_MAP[raw] || raw;
  const effective = AYLA_THEME_CLASSES.includes(normalized) ? normalized : DEFAULT_THEME;

  if (effective !== raw) {
    localStorage.setItem(AYLA_THEME_KEY, effective);
  }

  applyAylaTheme(effective, { persist: false });

  const themeBtn = document.getElementById("themeBtn");
  const themeModal = document.getElementById("themeModal");
  const themeScroll = document.getElementById("themeScroll");

  function updateFade() {
    if (!themeScroll) return;
    const atTop = themeScroll.scrollTop <= 1;
    const atBottom = themeScroll.scrollTop + themeScroll.clientHeight >= themeScroll.scrollHeight - 1;
    themeScroll.classList.toggle("is-not-top", !atTop);
    themeScroll.classList.toggle("is-not-bottom", !atBottom);
  }

  themeScroll?.addEventListener("scroll", updateFade);
  updateFade();

  if (themeBtn && themeModal) {
    themeBtn.addEventListener("click", () => {
      if (typeof themeModal.showModal === "function") themeModal.showModal();
      else themeModal.setAttribute("open", "open");
      setTimeout(updateFade, 0);
    });
  }
}

initAylaTheme();
