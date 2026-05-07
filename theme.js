/* Ayla — Theme switcher (shared) */

const AYLA_THEME_KEY = "aylaTheme";
const DEFAULT_THEME = "theme-blush-pro";
const AYLA_THEME_CLASSES = [
  "theme-blush-pro",
  "theme-lavender-pro",
  "theme-peach-pro",
  "theme-moon-pro",
  "theme-berry-pro",
  "theme-midnight-pro",
];

const THEMES = [
  {
    id: "theme-blush-pro",
    name: "Blush Calm Pro",
    swatches: ["#d8a7af", "#f8f1f2", "#ffffff"],
  },
  {
    id: "theme-lavender-pro",
    name: "Lavender Soft Pro",
    swatches: ["#b8aee0", "#f3f1fa", "#ffffff"],
  },
  {
    id: "theme-peach-pro",
    name: "Peach Warm Pro",
    swatches: ["#e6b29a", "#fbf3ee", "#ffffff"],
  },
  {
    id: "theme-moon-pro",
    name: "Moonlight Neutral Pro",
    swatches: ["#d6d3d4", "#f4f2f3", "#ffffff"],
  },
  {
    id: "theme-berry-pro",
    name: "Berry Rose",
    swatches: ["#c78692", "#f7eff1", "#ffffff"],
  },
  {
    id: "theme-midnight-pro",
    name: "Midnight Calm",
    swatches: ["#1f1b1d", "#2a2426", "#d8a7af"],
  },
];

function applyAylaTheme(themeId, { persist = true } = {}) {
  const id = AYLA_THEME_CLASSES.includes(themeId) ? themeId : DEFAULT_THEME;

  // Keep existing body classes (e.g. page--no-scroll)
  for (const c of AYLA_THEME_CLASSES) document.body.classList.remove(c);
  document.body.classList.add(id);

  if (persist) localStorage.setItem(AYLA_THEME_KEY, id);

  const themeBtn = document.getElementById("themeBtn");
  if (themeBtn) {
    const isNight = id === "theme-midnight-pro";
    themeBtn.classList.toggle("is-night", isNight);
    themeBtn.setAttribute("aria-label", isNight ? "Choose light theme" : "Choose theme");
  }

  // Update UI selected state if present
  const list = document.getElementById("themeList");
  if (list) {
    list.querySelectorAll("[data-theme]").forEach((el) => {
      el.classList.toggle("is-selected", el.getAttribute("data-theme") === id);
      el.setAttribute("aria-checked", String(el.getAttribute("data-theme") === id));
    });
  }
}

function renderThemeList() {
  const list = document.getElementById("themeList");
  if (!list) return;
  list.innerHTML = "";

  const current = localStorage.getItem(AYLA_THEME_KEY) || DEFAULT_THEME;

  THEMES.forEach((t) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-option";
    btn.setAttribute("data-theme", t.id);
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", String(t.id === current));

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
    hint.textContent = t.id === DEFAULT_THEME ? "Default" : " ";

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

  applyAylaTheme(current, { persist: false });
}

function initAylaTheme() {
  const saved = localStorage.getItem(AYLA_THEME_KEY) || DEFAULT_THEME;
  applyAylaTheme(saved, { persist: false });
  renderThemeList();

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
      // Ensure fades are correct after open
      setTimeout(updateFade, 0);
    });
  }
}

initAylaTheme();

