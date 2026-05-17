/* Ayla — Cycle Details page (cycle-details.html) */

const LS = {
  users: "ayla_users_v1",
  loggedInUser: "loggedInUser",
  dataKey: (u) => `ayla_data_v1__${u}`,
};

const $$ = (sel, root = document) => root.querySelector(sel);
const $$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function safeJSONParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function requireSession() {
  const username = localStorage.getItem(LS.loggedInUser);
  if (!username) {
    window.location.href = "index.html";
    return null;
  }
  return String(username);
}

function logout() {
  localStorage.removeItem(LS.loggedInUser);
  window.location.href = "index.html";
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseISODate(s) {
  const [y, m, d] = String(s).split("-").map((x) => Number(x));
  const dt = new Date(y, m - 1, d);
  dt.setHours(12, 0, 0, 0);
  return dt;
}

function formatNiceDate(iso) {
  const d = parseISODate(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function emptyUserData() {
  return {
    periods: [],
    checkins: {},
    cyclePrefs: {
      cycleLength: 28,
      periodStartISO: null,
      periodDuration: 5,
    },
    onboardingComplete: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function loadUserData(username) {
  const key = LS.dataKey(username);
  const raw = localStorage.getItem(key);
  const data = raw ? safeJSONParse(raw, emptyUserData()) : emptyUserData();
  if (!data.periods) data.periods = [];
  if (!data.checkins) data.checkins = {};
  if (!data.cyclePrefs) data.cyclePrefs = { cycleLength: 28, periodStartISO: null, periodDuration: 5 };
  if (!data.cyclePrefs.cycleLength) data.cyclePrefs.cycleLength = 28;
  if (!data.cyclePrefs.periodDuration) data.cyclePrefs.periodDuration = 5;
  if (!("onboardingComplete" in data)) data.onboardingComplete = true;
  return data;
}

function saveUserData(username, data) {
  data.updatedAt = new Date().toISOString();
  localStorage.setItem(LS.dataKey(username), JSON.stringify(data));
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function daysBetweenISO(aISO, bISO) {
  const a = parseISODate(aISO);
  const b = parseISODate(bISO);
  return Math.round((b - a) / (24 * 3600 * 1000));
}

function phaseIcon(phase) {
  if (phase === "Period") return "🌙";
  if (phase === "Follicular") return "🌸";
  if (phase === "Ovulation") return "☀️";
  if (phase === "Luteal") return "🌾";
  return "🌿";
}

function dynamicTone(phase, todayCheckin) {
  if (todayCheckin?.pain === "High") return "A tender day. Warmth and rest can be deeply supportive.";
  if (todayCheckin?.energy === "Low") return "Your body may be asking for rest today. Go gently with yourself.";
  if (todayCheckin?.energy === "High") return "Energy is rising today. Begin softly — you don’t have to rush.";
  if (phase === "Period") return "Your body is asking for rest today. Warmth, softness, and slower plans.";
  if (phase === "Follicular") return "A rebuilding phase. You may feel more open to starting fresh.";
  if (phase === "Ovulation") return "A brighter phase. Hydrate and let your day feel light and flowing.";
  if (phase === "Luteal") return "A quieter rhythm may support you. Simplify and choose softer tasks.";
  return "A gentle place to understand your rhythm.";
}

function phaseAccentVar(phase) {
  if (phase === "Period") return "var(--phase-period)";
  if (phase === "Follicular") return "var(--phase-follicular)";
  if (phase === "Ovulation") return "var(--phase-ovulation)";
  if (phase === "Luteal") return "var(--phase-luteal)";
  return "var(--primary)";
}

function cycleInfoFromPrefs(prefs, todayISO) {
  const cycleLen = clamp(Number(prefs.cycleLength) || 28, 15, 60);
  const periodDur = clamp(Number(prefs.periodDuration) || 5, 2, 10);
  const startISO = prefs.periodStartISO || null;
  if (!startISO) return { cycleLen, periodDur, day: null, phase: null, startISO: null };

  const offset = daysBetweenISO(startISO, todayISO);
  const day = clamp(offset + 1, 1, Math.max(1, cycleLen));

  // Ovulation window centered around cycleLen - 14 (simple heuristic)
  const ovDay = clamp(cycleLen - 14 + 1, 1, cycleLen); // 1-indexed day number
  const ovuStart = clamp(ovDay - 1, 1, cycleLen);
  const ovuEnd = clamp(ovDay + 1, 1, cycleLen);

  let phase = "Luteal";
  if (day <= periodDur) phase = "Period";
  else if (day < ovuStart) phase = "Follicular";
  else if (day >= ovuStart && day <= ovuEnd) phase = "Ovulation";
  else phase = "Luteal";

  return { cycleLen, periodDur, day, phase, startISO };
}

function predictNextPeriod(startISO, cycleLen) {
  if (!startISO) return null;
  const d = parseISODate(startISO);
  d.setDate(d.getDate() + cycleLen);
  return toISODate(d);
}

function fertileWindowFromStart(startISO, cycleLen) {
  const next = predictNextPeriod(startISO, cycleLen);
  if (!next) return null;
  const ov = parseISODate(next);
  ov.setDate(ov.getDate() - 14);
  const start = new Date(ov);
  start.setDate(start.getDate() - 5);
  const end = new Date(ov);
  end.setDate(end.getDate() + 1);
  return { startISO: toISODate(start), endISO: toISODate(end), ovulationISO: toISODate(ov) };
}

function expectedEnergyRatio(day, cycleLen) {
  if (!day) return 0.5;
  const t = (day - 1) / Math.max(1, cycleLen - 1);
  const base = 0.55 + 0.12 * Math.sin((t - 0.15) * Math.PI * 2);
  const periodDip = Math.exp(-Math.pow((t - 0.08) / 0.10, 2)) * 0.22;
  const ovuBump = Math.exp(-Math.pow((t - 0.55) / 0.08, 2)) * 0.22;
  const lutealDrop = clamp((t - 0.72) / 0.28, 0, 1) * 0.18;
  return clamp(base - periodDip + ovuBump - lutealDrop, 0.18, 0.92);
}

function energyLabelFromRatio(r) {
  if (r >= 0.78) return "High";
  if (r >= 0.52) return "Medium";
  return "Low";
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

function svgEl(tag, attrs = {}) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, String(v)));
  return n;
}

function setSvg(el, childNodes) {
  if (!el) return;
  el.innerHTML = "";
  childNodes.forEach((n) => el.appendChild(n));
}

function renderRingLarge(svg, info) {
  if (!svg) return;
  const cx = 110;
  const cy = 110;
  const r = 78;
  const strokeW = 12;
  const gapDeg = 2.2;
  const startBase = -90;

  const cycleLen = info.cycleLen;
  const periodDur = info.periodDur ?? 5;
  const ovDay = clamp(cycleLen - 14 + 1, 1, cycleLen);
  const ovuStart = clamp(ovDay - 1, 1, cycleLen);
  const ovuEnd = clamp(ovDay + 1, 1, cycleLen);

  const segs = [
    { phase: "Period", a: 1, b: Math.min(periodDur, cycleLen) },
    { phase: "Follicular", a: Math.min(periodDur + 1, cycleLen), b: Math.max(1, ovuStart - 1) },
    { phase: "Ovulation", a: ovuStart, b: ovuEnd },
    { phase: "Luteal", a: Math.min(ovuEnd + 1, cycleLen), b: cycleLen },
  ].filter((s) => s.a <= s.b);

  const bg = svgEl("circle", {
    cx,
    cy,
    r,
    fill: "none",
    stroke: "rgba(239,127,168,.08)",
    "stroke-width": String(strokeW),
  });

  const paths = segs.map((s) => {
    const a0 = startBase + ((s.a - 1) / cycleLen) * 360 + gapDeg / 2;
    const a1 = startBase + (s.b / cycleLen) * 360 - gapDeg / 2;
    return svgEl("path", {
      d: arcPath(cx, cy, r, a0, a1),
      fill: "none",
      stroke: phaseAccentVar(s.phase),
      "stroke-width": String(strokeW),
      "stroke-linecap": "round",
      opacity: info.phase === s.phase ? "0.98" : "0.68",
    });
  });

  const dot = (() => {
    const day = info.day || 1;
    const ang = startBase + ((day - 1) / cycleLen) * 360;
    const pt = polarToCartesian(cx, cy, r, ang);
    return svgEl("circle", {
      cx: pt.x,
      cy: pt.y,
      r: "6.2",
      fill: phaseAccentVar(info.phase),
      stroke: "rgba(253,245,248,.92)",
      "stroke-width": "2.2",
      opacity: info.day ? "1" : "0.55",
    });
  })();

  setSvg(svg, [bg, ...paths, dot]);
}

function renderWaveLarge(svg, info, { onHover } = {}) {
  if (!svg) return;
  const W = 720;
  const H = 150;
  const padX = 22;
  const padY = 18;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;

  const cycleLen = info.cycleLen;
  const n = Math.max(40, Math.min(90, cycleLen));
  const points = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const d = 1 + Math.round(t * (cycleLen - 1));
    const rRatio = expectedEnergyRatio(d, cycleLen);
    const x = padX + t * innerW;
    const y = padY + (1 - rRatio) * innerH;
    points.push({ x, y, day: d, ratio: rRatio });
  }

  let dPath = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    dPath += ` Q ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}`;
  }
  dPath += ` T ${points[points.length - 1].x.toFixed(2)} ${points[points.length - 1].y.toFixed(2)}`;

  const base = svgEl("path", {
    d: `M ${padX} ${(H - padY).toFixed(2)} L ${(W - padX).toFixed(2)} ${(H - padY).toFixed(2)}`,
    fill: "none",
    stroke: "rgba(239,127,168,.09)",
    "stroke-width": "1.6",
  });

  const line = svgEl("path", {
    d: dPath,
    fill: "none",
    stroke: phaseAccentVar(info.phase),
    "stroke-width": "3.2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    opacity: "0.92",
  });

  const todayDot = (() => {
    const day = info.day || 1;
    const t = (day - 1) / Math.max(1, cycleLen - 1);
    const x = padX + t * innerW;
    const rRatio = expectedEnergyRatio(day, cycleLen);
    const y = padY + (1 - rRatio) * innerH;
    const c = svgEl("circle", {
      cx: x,
      cy: y,
      r: "6.2",
      fill: phaseAccentVar(info.phase),
      stroke: "rgba(253,245,248,.92)",
      "stroke-width": "2.2",
      opacity: info.day ? "1" : "0.55",
    });
    const title = svgEl("title");
    title.textContent = `Expected energy: ${energyLabelFromRatio(rRatio)}`;
    c.appendChild(title);
    return c;
  })();

  // Transparent hover layer for tooltip
  const hover = svgEl("rect", { x: "0", y: "0", width: String(W), height: String(H), fill: "transparent" });
  hover.style.cursor = "default";

  hover.addEventListener("mousemove", (e) => {
    if (typeof onHover !== "function") return;
    const rect = svg.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W / rect.width);
    const t = clamp((x - padX) / innerW, 0, 1);
    const day = 1 + Math.round(t * (cycleLen - 1));
    const ratio = expectedEnergyRatio(day, cycleLen);
    onHover({ day, ratio, clientX: e.clientX, clientY: e.clientY });
  });
  hover.addEventListener("mouseleave", () => {
    if (typeof onHover !== "function") return;
    onHover(null);
  });

  setSvg(svg, [base, line, todayDot, hover]);
}

function makeChips(root, options, { tone = "lav", onPick }) {
  root.innerHTML = "";
  options.forEach((label) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `chip ${tone === "rose" ? "is-rose" : ""}`;
    b.textContent = label;
    b.dataset.value = label;
    b.addEventListener("click", () => onPick(label));
    root.appendChild(b);
  });
}

function setChipOn(root, value) {
  $$$(".chip", root).forEach((c) => c.classList.toggle("is-on", c.dataset.value === value));
}

function debounce(fn, wait = 280) {
  let t = null;
  return (...args) => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), wait);
  };
}

const UI = {
  backBtn: $$("#backBtn"),
  logoutBtn: $$("#logoutBtn"),
  heroTitle: $$("#heroTitle"),
  heroTone: $$("#heroTone"),
  phaseIcon: $$("#phaseIcon"),
  ringDayLabel: $$("#ringDayLabel"),
  ringPhaseLabel: $$("#ringPhaseLabel"),

  cycleRingLg: $$("#cycleRingLg"),
  energyWaveLg: $$("#energyWaveLg"),
  energyChartWrap: $$("#energyChartWrap"),
  waveTooltip: $$("#waveTooltip"),

  cycleLengthInput: $$("#cycleLengthInput"),
  periodStartInput: $$("#periodStartInput"),
  periodDurationInput: $$("#periodDurationInput"),
  moodChipsLg: $$("#moodChipsLg"),
  energyChipsLg: $$("#energyChipsLg"),
  painChipsLg: $$("#painChipsLg"),
  saveState: $$("#saveState"),

  kvPhase: $$("#kvPhase"),
  kvEnergy: $$("#kvEnergy"),
  kvNextPeriod: $$("#kvNextPeriod"),
  kvFertile: $$("#kvFertile"),
};

const CHECKIN = {
  mood: ["Low", "Okay", "Good", "Bright"],
  energy: ["Low", "Medium", "High"],
  pain: ["None", "Low", "Medium", "High"],
};

const state = {
  user: null,
  data: null,
  model: {
    cycleLength: 28,
    periodStartISO: null,
    periodDuration: 5,
    mood: "Okay",
    energy: "Medium",
    pain: "Low",
  },
};

function updateSaveState(text) {
  if (!UI.saveState) return;
  UI.saveState.textContent = text;
}

function readInputsIntoModel() {
  const len = Number(UI.cycleLengthInput?.value);
  const dur = Number(UI.periodDurationInput?.value);
  state.model.cycleLength = clamp(Number.isFinite(len) && len ? len : 28, 15, 60);
  state.model.periodDuration = clamp(Number.isFinite(dur) && dur ? dur : 5, 2, 10);
  state.model.periodStartISO = UI.periodStartInput?.value ? String(UI.periodStartInput.value) : null;
}

function writeModelToInputs() {
  if (UI.cycleLengthInput) UI.cycleLengthInput.value = String(state.model.cycleLength || 28);
  if (UI.periodDurationInput) UI.periodDurationInput.value = String(state.model.periodDuration || 5);
  if (UI.periodStartInput) UI.periodStartInput.value = state.model.periodStartISO || "";
}

function saveModel() {
  if (!state.user || !state.data) return;

  // Save prefs
  state.data.cyclePrefs = {
    cycleLength: state.model.cycleLength,
    periodStartISO: state.model.periodStartISO,
    periodDuration: state.model.periodDuration,
  };

  // Save today's check-in snapshot (keeps app consistent)
  const todayISO = toISODate(new Date());
  state.data.checkins[todayISO] = {
    ...(state.data.checkins[todayISO] || {}),
    mood: state.model.mood,
    energy: state.model.energy,
    pain: state.model.pain,
  };

  saveUserData(state.user, state.data);
  updateSaveState("Saved locally.");
}

const saveModelDebounced = debounce(saveModel, 280);

function refreshAll() {
  readInputsIntoModel();

  const todayISO = toISODate(new Date());
  const todayCheckin = state.data?.checkins?.[todayISO] || null;
  const info = cycleInfoFromPrefs(state.model, todayISO);
  const energyRatio = expectedEnergyRatio(info.day || 1, info.cycleLen);
  const energyLabel = energyLabelFromRatio(energyRatio);

  if (UI.heroTitle) {
    UI.heroTitle.textContent = info.day ? `Day ${info.day} of ${info.cycleLen} · ${info.phase} Phase` : `Day — of ${info.cycleLen} · Add a start date`;
  }
  if (UI.phaseIcon) UI.phaseIcon.textContent = phaseIcon(info.phase);
  if (UI.heroTone) UI.heroTone.textContent = dynamicTone(info.phase, todayCheckin);

  if (UI.ringDayLabel) UI.ringDayLabel.textContent = info.day ? `Day ${info.day}` : "Day —";
  if (UI.ringPhaseLabel) UI.ringPhaseLabel.textContent = info.phase ? `${info.phase} phase` : "Add a period start date";

  renderRingLarge(UI.cycleRingLg, info);
  renderWaveLarge(UI.energyWaveLg, info, {
    onHover: (evt) => {
      const tt = UI.waveTooltip;
      const wrap = UI.energyChartWrap;
      if (!tt || !wrap) return;
      if (!evt) {
        tt.hidden = true;
        return;
      }
      const label = energyLabelFromRatio(evt.ratio);
      tt.textContent = `${label} energy today`;
      tt.hidden = false;

      const rect = wrap.getBoundingClientRect();
      const x = clamp(evt.clientX - rect.left, 12, rect.width - 12);
      const y = clamp(evt.clientY - rect.top, 12, rect.height - 12);
      tt.style.left = `${x}px`;
      tt.style.top = `${y}px`;
    },
  });

  if (UI.kvPhase) UI.kvPhase.textContent = info.phase || "—";
  if (UI.kvEnergy) UI.kvEnergy.textContent = info.day ? `${energyLabel}` : "—";

  const next = info.startISO ? predictNextPeriod(info.startISO, info.cycleLen) : null;
  if (UI.kvNextPeriod) UI.kvNextPeriod.textContent = next ? formatNiceDate(next) : "—";

  const fw = info.startISO ? fertileWindowFromStart(info.startISO, info.cycleLen) : null;
  if (UI.kvFertile) UI.kvFertile.textContent = fw ? `${formatNiceDate(fw.startISO)} → ${formatNiceDate(fw.endISO)}` : "—";

  // Visual phase borders
  $$$(".phase-mini").forEach((el) => {
    const ph = el.getAttribute("data-phase");
    el.style.borderColor = ph ? phaseAccentVar(ph) : "var(--line)";
    el.classList.toggle("is-current", Boolean(info.phase && ph === info.phase));
  });
}

function init() {
  const username = requireSession();
  if (!username) return;
  state.user = username;
  state.data = loadUserData(username);

  // Seed model from stored prefs + today's check-in (if any)
  const prefs = state.data.cyclePrefs || {};
  state.model.cycleLength = clamp(Number(prefs.cycleLength) || 28, 15, 60);
  state.model.periodDuration = clamp(Number(prefs.periodDuration) || 5, 2, 10);
  state.model.periodStartISO = prefs.periodStartISO || null;

  const todayISO = toISODate(new Date());
  const todayCheckin = state.data.checkins[todayISO] || null;
  state.model.mood = todayCheckin?.mood || "Okay";
  state.model.energy = todayCheckin?.energy || "Medium";
  state.model.pain = todayCheckin?.pain || "Low";

  writeModelToInputs();

  // Chips
  makeChips(UI.moodChipsLg, CHECKIN.mood, {
    onPick: (v) => {
      state.model.mood = v;
      setChipOn(UI.moodChipsLg, v);
      updateSaveState("Saving…");
      saveModelDebounced();
      refreshAll();
    },
  });
  makeChips(UI.energyChipsLg, CHECKIN.energy, {
    onPick: (v) => {
      state.model.energy = v;
      setChipOn(UI.energyChipsLg, v);
      updateSaveState("Saving…");
      saveModelDebounced();
      refreshAll();
    },
  });
  makeChips(UI.painChipsLg, CHECKIN.pain, {
    onPick: (v) => {
      state.model.pain = v;
      setChipOn(UI.painChipsLg, v);
      updateSaveState("Saving…");
      saveModelDebounced();
      refreshAll();
    },
  });

  setChipOn(UI.moodChipsLg, state.model.mood);
  setChipOn(UI.energyChipsLg, state.model.energy);
  setChipOn(UI.painChipsLg, state.model.pain);

  // Inputs
  const onInput = () => {
    readInputsIntoModel();
    updateSaveState("Saving…");
    saveModelDebounced();
    refreshAll();
  };
  UI.cycleLengthInput?.addEventListener("input", onInput);
  UI.periodStartInput?.addEventListener("input", onInput);
  UI.periodDurationInput?.addEventListener("input", onInput);

  // Nav
  UI.backBtn?.addEventListener("click", () => (window.location.href = "dashboard.html#home"));
  UI.logoutBtn?.addEventListener("click", logout);

  refreshAll();
  updateSaveState("Saved locally.");
}

init();

