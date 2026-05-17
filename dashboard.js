/* Ayla — Dashboard app (dashboard.html) */

const LS = {
  users: "ayla_users_v1",
  loggedInUser: "loggedInUser",
  dataKey: (u) => `ayla_data_v1__${u}`,
  sidebarCollapsed: "sidebarCollapsed",
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

function normalizeEmail(s) {
  return String(s || "").trim().toLowerCase();
}

function usernameKey(username) {
  return String(username || "").trim().toLowerCase();
}

function userKey(u) {
  if (!u) return "";
  if (typeof u.email === "string" && u.email.trim()) return normalizeEmail(u.email);
  return usernameKey(u.username);
}

function storageSessionKey(u) {
  if (!u) return "";
  if (typeof u.username === "string" && u.username.trim()) return String(u.username);
  return userKey(u);
}

function loadUsers() {
  const raw = localStorage.getItem(LS.users);
  const parsed = safeJSONParse(raw || "[]", []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (u) =>
        u &&
        (typeof u.username === "string" || typeof u.email === "string") &&
        (typeof u.password === "string" || typeof u.passwordHash === "string")
    )
    .map((u) => ({
      fullName: typeof u.fullName === "string" ? u.fullName : undefined,
      username: typeof u.username === "string" ? String(u.username) : "",
      email: typeof u.email === "string" && u.email.trim() ? normalizeEmail(u.email) : "",
      password: typeof u.password === "string" ? String(u.password) : undefined,
      passwordHash: typeof u.passwordHash === "string" ? String(u.passwordHash) : undefined,
      passwordSalt: typeof u.passwordSalt === "string" ? String(u.passwordSalt) : undefined,
    }));
}

function saveUsers(users) {
  localStorage.setItem(LS.users, JSON.stringify(users));
}

function findUser(users, sessionKey) {
  const sk = String(sessionKey || "").trim();
  if (!sk) return null;
  const direct = users.find((u) => storageSessionKey(u) === sk);
  if (direct) return direct;
  const nk = normalizeEmail(sk);
  return users.find((u) => normalizeEmail(u.email || "") === nk) || null;
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

function formatMonthDay(iso) {
  if (!iso) return "—";
  const d = parseISODate(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function emptyUserData() {
  return {
    periods: [], // { startISO, endISO, flow }
    checkins: {}, // iso -> { mood, energy, pain, notes }
    cyclePrefs: {
      cycleLength: 28,
      periodStartISO: null,
      periodDuration: 5,
    },
    /** First-time guided ritual; legacy data without the key is treated as complete in loadUserData. */
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
  if (!data.cyclePrefs) {
    data.cyclePrefs = { cycleLength: 28, periodStartISO: null, periodDuration: 5 };
  }
  if (!data.cyclePrefs.cycleLength) data.cyclePrefs.cycleLength = 28;
  if (!data.cyclePrefs.periodDuration) data.cyclePrefs.periodDuration = 5;
  if (!("onboardingComplete" in data)) data.onboardingComplete = true;
  return data;
}

function saveUserData(username, data) {
  data.updatedAt = new Date().toISOString();
  localStorage.setItem(LS.dataKey(username), JSON.stringify(data));
}

function normalizePeriod(p) {
  const start = parseISODate(p.startISO);
  const end = parseISODate(p.endISO);
  if (end < start) return null;
  const flow = p.flow || "medium";
  return { startISO: toISODate(start), endISO: toISODate(end), flow };
}

function sortPeriods(periods) {
  periods.sort((p1, p2) => p1.startISO.localeCompare(p2.startISO));
  return periods;
}

function lastPeriod(periods) {
  if (!periods.length) return null;
  const sorted = [...periods].sort((a, b) => a.startISO.localeCompare(b.startISO));
  return sorted[sorted.length - 1];
}

function cycleStarts(periods) {
  return [...periods].map((p) => p.startISO).sort((a, b) => a.localeCompare(b));
}

function averageCycleLength(periods) {
  const starts = cycleStarts(periods);
  if (starts.length < 2) return null;
  const diffs = [];
  for (let i = 1; i < starts.length; i++) {
    const prev = parseISODate(starts[i - 1]);
    const cur = parseISODate(starts[i]);
    const diff = Math.round((cur - prev) / (24 * 3600 * 1000));
    if (diff >= 15 && diff <= 60) diffs.push(diff);
  }
  if (!diffs.length) return null;
  return Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
}

function predictNextPeriodStart(periods) {
  const lp = lastPeriod(periods);
  if (!lp) return null;
  const avg = averageCycleLength(periods) ?? 28;
  const start = parseISODate(lp.startISO);
  start.setDate(start.getDate() + avg);
  return toISODate(start);
}

function fertileWindow(periods) {
  // Backwards compatible wrapper: fertile window for today (or neutral if insufficient data).
  return fertileWindowForISO(periods, toISODate(new Date()));
}

function phaseForDate(periods, iso) {
  return cycleForISO(periods, state.data?.cyclePrefs || null, iso);
}

function phaseIcon(phase) {
  if (phase === "Period") return "🌙";
  if (phase === "Follicular") return "🌸";
  if (phase === "Ovulation") return "☀️";
  if (phase === "Luteal") return "🌾";
  return "🌿";
}

function periodForStartISO(periods, startISO) {
  return (periods || []).find((p) => p.startISO === startISO) || null;
}

function cycleStartForISO(periods, iso, prefs) {
  const starts = cycleStarts(periods || []);
  const fromLogs = [...starts].reverse().find((s) => s <= iso) || null;
  if (fromLogs) return fromLogs;
  // Fallback to prefs only when logs are missing for the requested date.
  const prefStart = prefs?.periodStartISO ? String(prefs.periodStartISO) : null;
  if (prefStart && prefStart <= iso) return prefStart;
  return null;
}

function cycleLenForStart(periods, startISO, prefs) {
  if (!startISO) return null;
  const starts = cycleStarts(periods || []);
  const idx = starts.indexOf(startISO);
  const nextLoggedStart = idx >= 0 ? starts[idx + 1] || null : null;
  if (nextLoggedStart) {
    const diff = daysBetweenISO(startISO, nextLoggedStart);
    if (diff >= 15 && diff <= 60) return diff;
  }
  const prefLen = Number(prefs?.cycleLength);
  if (Number.isFinite(prefLen) && prefLen) return clamp(prefLen, 15, 60);
  const avg = averageCycleLength(periods || []);
  if (avg) return clamp(avg, 15, 60);
  // Not enough data to predict.
  return null;
}

/** Period bleed length for a cycle anchor (logged range, last log, or prefs). */
function periodDurationForAnchor(periods, prefs, startISO) {
  const logged = periodForStartISO(periods, startISO);
  if (logged) return clamp(daysBetweenISO(logged.startISO, logged.endISO) + 1, 2, 10);
  const lp = lastPeriod(periods || []);
  if (lp) return clamp(daysBetweenISO(lp.startISO, lp.endISO) + 1, 2, 10);
  return clamp(Number(prefs?.periodDuration) || 5, 2, 10);
}

/**
 * Resolve which cycle window contains `iso`, rolling forward across predicted cycles
 * when the date is past the current anchor length (so future months show all four phases).
 */
function effectiveCycleAnchor(periods, prefs, iso) {
  let startISO = cycleStartForISO(periods, iso, prefs);
  if (!startISO) return { startISO: null, cycleLen: null };

  let cycleLen = cycleLenForStart(periods, startISO, prefs);
  if (!cycleLen) return { startISO, cycleLen: null };

  const starts = cycleStarts(periods || []);
  for (let guard = 0; guard < 36; guard++) {
    const cycleEndISO = addDaysISO(startISO, cycleLen - 1);
    if (iso <= cycleEndISO) return { startISO, cycleLen };

    const nextLogged = starts.find((s) => s > startISO && s <= iso);
    if (nextLogged) {
      startISO = nextLogged;
      cycleLen = cycleLenForStart(periods, startISO, prefs) || cycleLen;
      continue;
    }

    startISO = addDaysISO(startISO, cycleLen);
    cycleLen = cycleLenForStart(periods, startISO, prefs) || cycleLen;
  }

  return { startISO, cycleLen };
}

function fertileWindowForISO(periods, iso) {
  const cyc = cycleForISO(periods, state.data?.cyclePrefs || null, iso);
  return cyc?.fertileWindow || null;
}

function gentlePhaseGuidance(phase) {
  if (phase === "Period") return "Your body may appreciate warmth, rest, and a slower rhythm today. Small comfort choices count.";
  if (phase === "Follicular") return "Energy may be beginning to rise. Choose one fresh intention and let it feel easy.";
  if (phase === "Ovulation") return "You may feel brighter or more outward. Hydrate, nourish well, and let connection feel gentle.";
  if (phase === "Luteal") return "Bandwidth can feel softer here. Steady meals, calmer pacing, and earlier rest may support you.";
  return "Ayla will offer gentler daily guidance as your cycle rhythm becomes clearer.";
}

/**
 * Single source of truth for cycle phase + fertility signals.
 * Returns null when there isn't enough data to make a deterministic call.
 */
function cycleForISO(periods, prefs, iso) {
  const ps = periods || [];
  const anchor = effectiveCycleAnchor(ps, prefs, iso);
  const startISO = anchor.startISO;
  if (!startISO) return null;

  const contained = ps.find((p) => iso >= p.startISO && iso <= p.endISO) || null;
  const periodDur = periodDurationForAnchor(ps, prefs, startISO);

  // If we're within a logged period range, phase is deterministic even without cycle length.
  if (contained) {
    return {
      phase: "Period",
      tone: gentlePhaseGuidance("Period"),
      startISO,
      cycleLen: anchor.cycleLen ?? cycleLenForStart(ps, startISO, prefs),
      periodDur,
      ovulationISO: null,
      fertileWindow: null,
      isFertile: false,
      isOvulation: false,
      isLoggedPeriod: true,
    };
  }

  const cycleLen = anchor.cycleLen;
  if (!cycleLen) return null; // strict: no predictions without enough data

  const day = clamp(daysBetweenISO(startISO, iso) + 1, 1, cycleLen);
  const ovDay = clamp(cycleLen - 14 + 1, 1, cycleLen);
  const ovuStart = clamp(ovDay - 1, 1, cycleLen);
  const ovuEnd = clamp(ovDay + 1, 1, cycleLen);

  let phase = "Luteal";
  if (day <= periodDur) phase = "Period";
  else if (day < ovuStart) phase = "Follicular";
  else if (day >= ovuStart && day <= ovuEnd) phase = "Ovulation";
  else phase = "Luteal";

  const ov = parseISODate(startISO);
  ov.setDate(ov.getDate() + (ovDay - 1));
  const ovISO = toISODate(ov);
  const fwStart = new Date(ov);
  fwStart.setDate(fwStart.getDate() - 5);
  const fwEnd = new Date(ov);
  fwEnd.setDate(fwEnd.getDate() + 1);
  const fertileWindow = { startISO: toISODate(fwStart), endISO: toISODate(fwEnd), ovulationISO: ovISO };

  const tone =
    phase === "Follicular"
      ? gentlePhaseGuidance("Follicular")
      : phase === "Ovulation"
        ? gentlePhaseGuidance("Ovulation")
        : phase === "Luteal"
          ? gentlePhaseGuidance("Luteal")
          : gentlePhaseGuidance("Period");

  return {
    phase,
    tone,
    startISO,
    cycleLen,
    periodDur,
    ovulationISO: ovISO,
    fertileWindow,
    isFertile: iso >= fertileWindow.startISO && iso <= fertileWindow.endISO,
    isOvulation: iso === ovISO,
    isLoggedPeriod: false,
  };
}

const CYCLE_PHASE_LABELS = {
  period: "Period",
  follicular: "Follicular",
  ovulation: "Ovulation",
  luteal: "Luteal",
};

/** Apply four-phase cycle map styling; phase meaning lives in the always-visible legend, not tooltips. */
function applyCyclePhaseVizToCell(btn, iso, periods, prefs, opts = {}) {
  const todayISO = opts.todayISO || toISODate(new Date());
  const cyc = cycleForISO(periods, prefs, iso);
  const phaseKey = cyc?.phase ? String(cyc.phase).toLowerCase() : null;

  btn.classList.remove("sig-period", "sig-fertile", "sig-ovu", "sig-pred");
  if (phaseKey) btn.dataset.phaseviz = phaseKey;
  else delete btn.dataset.phaseviz;

  btn.classList.toggle("sig-period", phaseKey === "period");
  btn.classList.toggle("sig-ovu", phaseKey === "ovulation");

  const tips = [];
  if (!opts.skipPhaseTips) {
    if (cyc?.isLoggedPeriod) tips.push("Period logged");
    else if (phaseKey === "period") tips.push("Predicted period");
    if (phaseKey && CYCLE_PHASE_LABELS[phaseKey]) tips.push(`${CYCLE_PHASE_LABELS[phaseKey]} phase`);
    if (cyc?.isOvulation) tips.push("Peak fertility day");
    if (iso === todayISO) tips.push("Today");
  }

  if (opts.includeCheckinTips) {
    const checkin = state.data?.checkins?.[iso] || null;
    if (checkin?.flowFeel) tips.push(`Flow: ${checkin.flowFeel}`);
    if (Array.isArray(checkin?.symptoms) && checkin.symptoms.length) {
      tips.push(`Symptoms: ${checkin.symptoms.slice(0, 3).join(", ")}`);
    }
    if (checkin?.notes) tips.push("Notes saved");
    if (checkin?.mood) tips.push(`Mood: ${checkin.mood}`);
    if (checkin?.energy) tips.push(`Energy: ${checkin.energy}`);
  }

  if (opts.passive) {
    btn.removeAttribute("title");
  } else if (tips.length) {
    btn.title = tips.join(" · ");
  } else {
    btn.removeAttribute("title");
  }

  return { cyc, phaseKey };
}

/** Homepage: one clear body read (headline — scannable, not a paragraph). */
function homePhaseInterpretationLine(phase, w) {
  if (w.symptoms?.includes("Cramps") && phase === "Period") {
    return "Your body is asking for ease — warmth and unhurried pacing help.";
  }
  if (w.symptoms?.includes("Fatigue")) {
    return "Your body wants a slower tempo — smaller asks, honest pauses.";
  }
  if (w.mood === "Anxious" || w.mood === "Emotional" || w.mood === "Irritated") {
    return "Your body is holding a lot — tiny comforts still register as care.";
  }
  if (w.energy === "High" && phase === "Follicular") {
    return "Your body is opening — energy can lift without forcing it.";
  }
  if (w.energy === "Low") {
    return "Your body prefers a softer edge — that still counts as motion.";
  }
  if (phase === "Period") {
    return "Your body is releasing and rebuilding.";
  }
  if (phase === "Follicular") {
    return "Your body is steadily renewing.";
  }
  if (phase === "Ovulation") {
    return "Your body is in a brighter, more radiant window.";
  }
  if (phase === "Luteal") {
    return "Your body is consolidating — steadiness over sprinting.";
  }
  return "Your rhythm is unfolding — log today and Ayla reads it with you.";
}

function homeDailyPick878(seed, mod) {
  let h = 2166136261 >>> 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return mod ? h % mod : 0;
}

function pickHomeLine(iso, key, list) {
  if (!list?.length) return "";
  return list[homeDailyPick878(`${iso}|${key}`, list.length)];
}

/** Practical first line — helpful, scannable, varies subtly by day. */
function homePredictMicroline(iso, info, w, cyc) {
  const phase = info.phase || cyc?.phase;
  const key = `${phase}|${w.energy}|${w.mood}|${(w.symptoms || []).join(",")}`;
  if (!info.day || !phase) {
    return pickHomeLine(iso, `setup|${key}`, [
      "Log your last period once — Ayla maps today, next, and what tends to help.",
      "Add a start date when you can — forecasts and daily prompts sharpen quickly.",
      "One logged bleed anchors the week — then guidance becomes specific, not generic.",
    ]);
  }
  if (w.energy === "Low") {
    return pickHomeLine(iso, `low|${phase}`, [
      "Energy may stay softer today — small wins still count.",
      "You might feel pulled toward slower pacing — that often matches this arc.",
      "If brightness feels far away, softer effort still builds trust with your body.",
    ]);
  }
  if (w.symptoms?.includes("Cramps")) {
    return pickHomeLine(iso, "cramps", [
      "Warmth and hydration often ease the heaviest moments.",
      "Heat against the lower belly and steady water help many bodies here.",
      "Cramps usually soften with gentle heat, magnesium-rich bites, and rest.",
    ]);
  }
  if (w.mood === "Anxious" || w.mood === "Emotional" || w.mood === "Irritated") {
    return pickHomeLine(iso, "mood-heavy", [
      "Gentle pacing and one honest pause can steady the day.",
      "Shorter focus blocks and softer transitions often help when feelings run high.",
      "You don’t have to fix the feeling — naming it is already a form of care.",
    ]);
  }
  if (phase === "Period") {
    return pickHomeLine(iso, "period", [
      "Hydration and warmth tend to land especially well right now.",
      "Iron-friendly snacks and warm liquids often support bleeding days.",
      "Your body is doing active work — lighter asks today are reasonable.",
    ]);
  }
  if (phase === "Follicular") {
    return pickHomeLine(iso, "follicular", [
      "Room often opens for steadier focus as the week unfolds.",
      "Many people feel a little more clarity here — you can lean in without forcing.",
      "Good window for gentle movement and steady hydration.",
    ]);
  }
  if (phase === "Ovulation") {
    return pickHomeLine(iso, "ovulation", [
      "Brighter vitality is common here — still land softly afterward.",
      "Hydration and full breaths often match this radiant window.",
      "Energy may feel more outward — balance with unhurried recovery later.",
    ]);
  }
  if (phase === "Luteal") {
    return pickHomeLine(iso, "luteal", [
      "Bandwidth may narrow — simpler plans can feel unexpectedly kind.",
      "Magnesium-rich snacks and steady carbs often support this phase.",
      "Rest reads as productive here — shorter lists are not a step backward.",
    ]);
  }
  return pickHomeLine(iso, "default", [
    "Tomorrow’s log refines what Ayla senses — one line is enough.",
    "A quick check-in tomorrow keeps the companion feeling personal.",
    "Your next log sharpens rhythm, not noise.",
  ]);
}

function homeActionMicroline(phase, w) {
  const ph = phase || null;
  const sym = (w.symptoms || []).slice().sort().join(",");
  if (w.symptoms?.includes("Cramps")) {
    return pickHomeLine(sym, "act-cramps", [
      "Try: ten slow breaths before your next transition.",
      "Try: a warm pack for eight minutes before screens.",
      "Try: magnesium-rich snack + one glass of water.",
    ]);
  }
  if (w.symptoms?.includes("Fatigue")) {
    return pickHomeLine(sym, "act-fatigue", [
      "Try: one real break before your longest block.",
      "Try: a five‑minute lie-down between tasks.",
      "Try: dimmer light for your next evening stretch.",
    ]);
  }
  if (ph === "Period") {
    return pickHomeLine(sym, "act-period", [
      "Try: one warm drink before midday.",
      "Try: iron-friendly snack with your next meal.",
      "Try: slower stairs — your pelvis is busy today.",
    ]);
  }
  if (ph === "Ovulation") {
    return pickHomeLine(sym, "act-ov", [
      "Try: two minutes of full breaths between screens.",
      "Try: a short walk before your hardest task.",
      "Try: extra water before coffee.",
    ]);
  }
  if (ph === "Luteal") {
    return pickHomeLine(sym, "act-lut", [
      "Try: one gentler boundary than yesterday.",
      "Try: complex carb with dinner tonight.",
      "Try: one less notification-heavy hour.",
    ]);
  }
  if (ph === "Follicular") {
    return pickHomeLine(sym, "act-fol", [
      "Try: a short stretch before your first focus block.",
      "Try: ten minutes of daylight early if you can.",
      "Try: one creative task before admin.",
    ]);
  }
  return pickHomeLine(sym, "act-gen", [
    "Try: a two‑minute walk between tasks.",
    "Try: shoulders down, jaw soft — twice today.",
    "Try: one glass of water before your next meeting.",
  ]);
}

function homePhaseKicker(info, phase) {
  if (!info?.day || !phase) return "Cycle · add your last period";
  return `DAY ${info.day} · ${String(phase).toUpperCase()}`;
}

function homeHeroHeadlineText(phase, w, info) {
  if (!info?.day || !phase) return "Your space, softly held";
  if (w.symptoms?.includes("Cramps")) return "Ease-first today";
  if (w.energy === "Low") return "Soft pacing suits you";
  if (phase === "Period") return "Gentle inward day";
  if (phase === "Follicular") {
    if (w.energy === "High") return "Rising vitality today";
    return "Steady energy today";
  }
  if (phase === "Ovulation") return "Bright window today";
  if (phase === "Luteal") return "Softer bandwidth today";
  return "You’re held right here";
}

function homeHeroInsightShort(phase, w) {
  if (!phase) return "One date unlocks your whole arc.";
  if (w.energy === "Low") return "Small wins still count.";
  if (w.symptoms?.includes("Cramps")) return "Warmth and slow sips help.";
  if (phase === "Period") return "Rest reads as productive.";
  if (phase === "Follicular") return "Good day for focus + hydration.";
  if (phase === "Ovulation") return "Hydrate; leave margin to soften.";
  if (phase === "Luteal") return "Lighter meals, kinder edges.";
  return "You’re doing enough.";
}

function homeGuidanceOneLiner(phase, w, info) {
  if (!info?.day || !phase) return "Log your last period once so today’s guidance can sharpen.";
  if (w.symptoms?.includes("Cramps")) return "Warmth, slow breaths, and steady water often help today.";
  if (w.energy === "Low") return "Keep asks light—recovery counts as progress.";
  if (phase === "Period") return "Prioritize rest, warmth, and hydration through today.";
  if (phase === "Follicular") return "Good day for focused work and light movement.";
  if (phase === "Ovulation") return "Enjoy the lift—balance with hydration and recovery later.";
  if (phase === "Luteal") return "Simplify plans and favor steady meals and earlier wind-down.";
  return "Stay soft with yourself—you’re exactly where you need to be.";
}

/** One whisper under Mood + Energy on Home (kept ultra short; deep copy lives elsewhere). */
function homeQuickPanelWhisper(phase, w, info) {
  if (!info?.day || !phase) return "One date keeps today clear.";
  if (w.symptoms?.includes("Cramps")) return "Warmth and slow sips help.";
  if (w.energy === "Low") return "Small steps still move the day.";
  if (phase === "Period") return "Rest is a valid plan.";
  if (phase === "Follicular") return "Focus work may feel easier today.";
  if (phase === "Ovulation") return "Hydrate between bright pushes.";
  if (phase === "Luteal") return "Simpler wins still count.";
  return "You’re doing plenty.";
}

function moodGlanceLabel(m) {
  const map = {
    Calm: "Calm",
    Energetic: "Energetic",
    Tired: "Tired",
    Emotional: "Emotional",
    Irritated: "Irritated",
    Happy: "Energetic",
    Anxious: "Irritated",
    Sensitive: "Sensitive",
  };
  return map[m] || m || "—";
}

function buildHomeGlanceSleep(phase, w) {
  if (w.symptoms?.includes("Fatigue")) return "Deep rest";
  if (w.energy === "Low") return "Heavy eyes";
  if (phase === "Luteal") return "Earlier wind-down";
  if (phase === "Ovulation") return "Steady nights";
  return "Balanced";
}

function buildHomeGlanceHydration(phase, w) {
  if (w.symptoms?.includes("Headache")) return "Sip often";
  if (phase === "Ovulation") return "Extra today";
  if (phase === "Period") return "Warm fluids";
  if (phase === "Luteal") return "Steady sips";
  return "Balanced";
}

function homeEmotionalWhisperLine(phase, w, info) {
  if (!info?.day || !phase) return "We’ll keep today gentle until you’re ready.";
  if (phase === "Period") return "Ease is the right pace.";
  if (phase === "Luteal") return "Softer rhythm — that’s normal.";
  if (phase === "Ovulation") return "A lighter window.";
  if (w.energy === "High" && phase === "Follicular") return "Your rhythm feels brighter today.";
  if (phase === "Follicular") return "A quiet lift in the background.";
  if (w.energy === "Low" || w.mood === "Tired") return "Softer energy still counts.";
  if (["Emotional", "Irritated", "Anxious"].includes(w.mood)) return "You’re allowed to feel this.";
  return "Steady and clear enough.";
}

function readWellnessModelForISO(iso) {
  const c = state.data?.checkins?.[iso] || {};
  const d = defaultWellnessModel();
  const symptoms = Array.isArray(c.symptoms) ? c.symptoms.filter(Boolean) : [];
  return {
    mood: normalizeMoodFromSaved(c.mood) || d.mood,
    energy: c.energy || d.energy,
    flowFeel: c.flowFeel || d.flowFeel,
    symptoms,
  };
}

function homeGlanceEnergyDelta(wToday, wYesterday, yIso) {
  if (!yIso || !state.data?.checkins?.[yIso]) return "—";
  if (!wYesterday || !wYesterday.energy) return "First log this week";
  const a = wellnessEnergyIndex(wToday.energy);
  const b = wellnessEnergyIndex(wYesterday.energy);
  if (a > b) return "↑ Higher than yesterday";
  if (a < b) return "↓ Softer than yesterday";
  return "→ Similar to yesterday";
}

const MOOD_RANK_HOME = { Tired: 1, Calm: 2, Emotional: 3, Irritated: 3, Energetic: 5 };

function homeGlanceMoodDelta(mToday, mYesterday, yIso) {
  if (!yIso || !state.data?.checkins?.[yIso]) return "—";
  if (!mYesterday) return "First log this week";
  const a = MOOD_RANK_HOME[normalizeMoodFromSaved(mToday)] ?? 2;
  const b = MOOD_RANK_HOME[normalizeMoodFromSaved(mYesterday)] ?? 2;
  if (a > b) return "↑ Brighter than yesterday";
  if (a < b) return "↓ Heavier than yesterday";
  return "→ Close to yesterday";
}

function homeGlanceSleepDelta(wToday, wYesterday, yIso) {
  if (!yIso || !state.data?.checkins?.[yIso]) return "—";
  if (!wYesterday) return "First log this week";
  const f = wToday.symptoms?.includes("Fatigue");
  const fy = wYesterday.symptoms?.includes("Fatigue");
  if (f && !fy) return "↓ More rest may help";
  if (!f && fy) return "↑ Recovery stabilizing";
  if (wToday.energy === "Low" && wYesterday.energy !== "Low") return "↓ Nights may ask more";
  if (wToday.energy === "High" && wYesterday.energy === "Low") return "↑ Sleep pressure easing";
  return "Recovery stable";
}

function homeGlanceHydrationDelta(wToday, wYesterday, yIso) {
  if (!yIso || !state.data?.checkins?.[yIso]) return "—";
  if (!wYesterday) return "First log this week";
  const h = wToday.symptoms?.includes("Headache");
  const hy = wYesterday.symptoms?.includes("Headache");
  if (h && !hy) return "↑ Fluids may matter more";
  if (!h && hy) return "↑ Tension easing vs yesterday";
  return "Steady rhythm";
}

function buildHomePriorityBullets(phase, w, cyc) {
  const first = homeActionMicroline(phase, w).replace(/^Try:\s*/i, "").trim();
  let second = "";
  if (cyc?.isFertile) second = "Notice your fertile window — your choices stay yours.";
  else if (phase === "Ovulation") second = "Best window for focused work — leave margin to soften.";
  else if (phase === "Follicular") second = "Gentle movement may feel especially good today.";
  else if (phase === "Luteal") second = "Steady meals + earlier wind-down support bandwidth.";
  else if (phase === "Period") second = "Hydrate consistently — warmth carries more weight.";
  else second = "Hydrate consistently — small supports add up.";
  const out = [first, second].filter(Boolean);
  return out.slice(0, 2);
}

function buildHomeHorizonLine(iso, phase, info, cyc) {
  const parts = [];
  const periods = state.data?.periods || [];
  const nextP = predictNextPeriodStart(periods);
  if (nextP && info?.day) {
    const d = daysBetweenISO(iso, nextP);
    if (d > 0 && d <= 50) parts.push(`Next period in ~${d} days`);
  }
  if (cyc?.ovulationISO && phase && phase !== "Ovulation" && phase !== "Period") {
    const dO = daysBetweenISO(iso, cyc.ovulationISO);
    if (dO > 0 && dO <= 18) parts.push(`Ovulation in ~${dO} days`);
  }
  if (!parts.length) {
    if (phase === "Follicular") parts.push("Energy often rises through this week.");
    else if (phase === "Luteal") parts.push("PMS window may approach — softer edges help.");
    else return "Log your last period for clearer “what’s next” timing.";
  }
  return parts.slice(0, 2).join(" · ");
}

function buildHomeDailyIntelLine(iso, phase, w) {
  const key = `${phase}|${w.energy}|${w.mood}`;
  return pickHomeLine(iso, `intel|${key}`, [
    "Mental clarity may improve today.",
    "Social energy may feel a touch higher.",
    "Cravings may creep in later — steady meals soften the swing.",
    "Your body may want more recovery margin today.",
    "Sensitivity may feel a little lower this week.",
    "Focus may feel sharper in short bursts — honor breaks.",
    "Your body may prefer lighter foods through the day.",
  ]);
}

function buildHomeBodySignalLine(iso, phase, w, info) {
  if (!info?.day || !phase) {
    return pickHomeLine(iso, "body-sig-setup", [
      "Focus may feel steadier once your rhythm is anchored.",
      "Your body may prefer gentler pacing until the arc is clear.",
    ]);
  }
  const key = `${phase}|${w.energy}|${(w.symptoms || []).join(",")}`;
  return pickHomeLine(iso, `body-sig|${key}`, [
    "Focus may feel sharper today.",
    "Your body may prefer lighter foods today.",
    "Social energy may feel a little higher.",
    "Stress sensitivity may feel lower with slower transitions.",
    "Your body may want warmth and honest pauses today.",
    "Bandwidth may reward shorter lists — that is still progress.",
  ]);
}

function phaseArcPreviewLabel(phaseKey) {
  const map = {
    Period: "Period — warmth, rest, and replenishment carry more weight.",
    Follicular: "Follicular — momentum often returns; build without forcing.",
    Ovulation: "Ovulation — outward energy peaks; hydrate and recover gently.",
    Luteal: "Luteal — steadier meals and softer pacing support the pre-bleed arc.",
  };
  return map[phaseKey] || "";
}

function postCheckinHomeLine(iso) {
  const periods = state.data?.periods || [];
  const checkins = state.data?.checkins || {};
  const ins = smartInsightsForDay(periods, checkins, iso);
  if (ins[0]) return ins[0].length > 118 ? `${ins[0].slice(0, 115)}…` : ins[0];
  const c = checkins[iso];
  const ph = phaseForDate(periods, iso)?.phase || currentPhaseToday();
  if (ph === "Follicular" && c?.energy === "High") return "Your focus often lifts in this phase — ride it without overfilling the day.";
  if (c?.energy === "Low") return "You’ve leaned toward softer energy lately — that pace is still intelligent.";
  if (["Emotional", "Irritated", "Tired"].includes(normalizeMoodFromSaved(c?.mood))) return "Mood shifts here are common — one small comfort still registers.";
  return "Each log teaches Ayla what feels true for you.";
}

function bindHomeOrbInteractionsOnce() {
  if (bindHomeOrbInteractionsOnce._done) return;
  bindHomeOrbInteractionsOnce._done = true;
  const canvas = wellnessCanvas;
  const wrap = canvas?.closest(".home-viz-wrap");
  const tip = document.getElementById("homeVizTooltip");
  if (!wrap || !canvas || !tip) return;

  const hideTip = () => {
    tip.hidden = true;
    tip.textContent = "";
    tip.classList.remove("is-rich", "is-orbit-tip");
  };

  const formatOrbHoverText = () => {
    const todayISO = toISODate(new Date());
    const tier = state.homeRhythmTier || "steady";
    const periods = state.data?.periods || [];
    const prefs = state.data?.cyclePrefs || null;
    const info = state.heroCycleInfo || getHeroCycleInfo(todayISO);
    const cyc = cycleForISO(periods, prefs, todayISO);
    const ph = info?.phase || cyc?.phase || null;
    if (tier === "cold" || !ph) {
      return "Today · rhythm not anchored yet\nLog when you’re ready — Ayla stays gentle.";
    }
    const day = info?.day;
    const cl = info?.cycleLen || cyc?.cycleLen;
    const line1 = `Today · ${ph}`;
    const line2 = day && cl ? `Day ${day} of ~${cl} in this cycle` : "Cycle length still soft — a few more logs help.";
    const conf = homePredictionIsLearning(todayISO)
      ? homeNextPeriodConfidenceLabel(todayISO) || "Forecasts stay soft while we learn."
      : "Forecasts steadier as your pattern repeats.";
    return `${line1}\n${line2}\n${conf}`;
  };

  const showRichTip = () => {
    tip.textContent = formatOrbHoverText();
    tip.classList.add("is-rich", "is-orbit-tip");
    tip.hidden = false;
  };

  canvas.addEventListener("pointerenter", showRichTip);
  canvas.addEventListener("pointerleave", hideTip);

  canvas.addEventListener("click", () => openHomeCycleExplainedFromOrb());
  canvas.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openHomeCycleExplainedFromOrb();
    }
  });
}

/** Signature “body weather” — one memorable line, not abstract poetry. */
function homeBodyWeatherLine(iso, phase, w, info) {
  if (!info?.day || !phase) {
    return pickHomeLine(iso, "weather-setup", [
      "Rhythm: waiting on a start date — then Ayla reads today like weather, not a chart.",
      "Body sky: quiet until you log a bleed — one date unlocks the arc.",
    ]);
  }
  const layer =
    phase === "Period"
      ? "release"
      : phase === "Follicular"
        ? "building"
        : phase === "Ovulation"
          ? "radiant"
          : "deepening";
  const energy =
    w.energy === "Low" ? "softer current" : w.energy === "High" ? "brighter charge" : "steady tide";
  const moodBit = ["Anxious", "Emotional", "Sensitive", "Irritated", "Tired"].includes(w.mood)
    ? " · inward tone"
    : w.mood === "Happy" || w.mood === "Energetic"
      ? " · open tone"
      : "";
  return `Rhythm today: ${layer} · ${energy}${moodBit}`;
}

function buildHomeMicroEnergyShort(info, w) {
  if (!info.day || !info.cycleLen) {
    const val = w.energy === "Low" ? "Soft" : w.energy === "High" ? "Bright" : "Balanced";
    return { value: val, hint: "Add period for arc" };
  }
  const rHero = expectedEnergyRatio(info.day, info.cycleLen);
  const pat = energyLabelFromRatio(rHero);
  const curve = pat === "High" ? "Soft rising" : pat === "Low" ? "Soft arc" : "Steady pulse";
  const val = w.energy === "Low" ? "Soft" : w.energy === "High" ? "Bright" : "Balanced";
  return { value: val, hint: curve };
}

function buildHomeMicroSupportShort(phase, w) {
  const ph = phase || "";
  if (w.symptoms?.includes("Cramps")) return { value: "Warmth + ease", hint: "Heat helps" };
  if (w.symptoms?.includes("Headache")) return { value: "Water + dim", hint: "Ease tension" };
  if (w.symptoms?.includes("Bloating")) return { value: "Light meals", hint: "Warm tea" };
  if (w.symptoms?.includes("Fatigue")) return { value: "Rest blocks", hint: "Real pauses" };
  if (ph === "Period") return { value: "Hydration + iron", hint: "Bleeding week" };
  if (ph === "Ovulation") return { value: "Hydration + protein", hint: "Radiant window" };
  if (ph === "Luteal") return { value: "Magnesium fuel", hint: "Steady bites" };
  if (ph === "Follicular") return { value: "Balanced fuel", hint: "Building week" };
  return { value: "Hydration", hint: "Small supports add up" };
}

function buildHomeMicroNextShort(iso, cyc) {
  const periods = state.data?.periods || [];
  const next = predictNextPeriodStart(periods);
  if (!next) return { value: "—", hint: "Log to forecast" };
  const d = daysBetweenISO(iso, next);
  if (d < 0) return { value: "—", hint: "Log new bleed" };
  const value = d === 0 ? "Soon" : d === 1 ? "~1d" : `~${d}d`;
  let hint = "Next period";
  if (cyc?.ovulationISO && cyc.phase && cyc.phase !== "Period") {
    const dOv = daysBetweenISO(iso, cyc.ovulationISO);
    if (dOv > 0 && dOv <= 4 && (cyc.phase === "Follicular" || cyc.phase === "Ovulation")) {
      hint = `Ovulation ~${dOv}d`;
    }
  }
  return { value, hint };
}

function buildHomeMicroEmotionalShort(w) {
  if (w.mood === "Happy") return { value: "Bright", hint: "Outward today" };
  if (["Anxious", "Emotional", "Sensitive"].includes(w.mood)) return { value: "More inward", hint: "Honor softness" };
  if (w.energy === "Low" && w.mood === "Calm") return { value: "Quiet calm", hint: "Low energy" };
  if (w.mood === "Calm") return { value: "Steady calm", hint: "Centered" };
  return { value: w.mood || "—", hint: "Today’s tone" };
}

function syncHomeOrbProgress(info) {
  const el = wellnessCanvas;
  if (!el) return;
  let t = 0.08;
  if (info?.day && info?.cycleLen) {
    t = Math.max(0.03, Math.min(1, (info.day - 0.5) / Math.max(1, info.cycleLen)));
  }
  el.style.setProperty("--cycle-progress", String(t));
  const cap = wellnessProgressCap;
  if (cap) {
    const deg = -90 + t * 360;
    cap.setAttribute("transform", `rotate(${deg} 140 140)`);
  }
}

function homeTimeBand() {
  const hr = new Date().getHours();
  if (hr >= 5 && hr < 12) return "morning";
  if (hr >= 12 && hr < 17) return "afternoon";
  if (hr >= 17 && hr < 21) return "evening";
  return "night";
}

function syncHomeAtmosphere(model) {
  const root = homeRoot;
  if (!root) return;
  root.dataset.timeband = homeTimeBand();
  root.dataset.phaseviz = wellnessPhaseSlugForViz();
  root.dataset.mood = wellnessSlug(model?.mood);
  root.dataset.energy = wellnessSlug(model?.energy);
}

function syncHomeSignature(model, phase) {
  const ph = phase || currentPhaseToday() || "";
  let sig = "steady";
  if (ph === "Ovulation" && model?.energy === "High") sig = "radiant";
  else if (ph === "Period") sig = "release";
  else if (model?.mood === "Tired" || model?.energy === "Low") sig = "rest";
  else if (["Anxious", "Emotional", "Sensitive", "Irritated"].includes(model?.mood)) sig = "inward";
  else if (ph === "Luteal") sig = "gather";
  else if (ph === "Follicular") sig = "open";
  if (homeRoot) homeRoot.dataset.signature = sig;
  if (wellnessCanvas) wellnessCanvas.dataset.signature = sig;
}

function syncWellnessPhaseLegend() {
  const leg = $$("#wellnessPhaseLegend");
  if (!leg) return;
  const slug = wellnessPhaseSlugForViz();
  $$$(".wellness-viz__legend-dot", leg).forEach((dot) => {
    dot.classList.toggle("is-current", dot.dataset.phaseviz === slug);
  });
}

function pulseWellnessCanvasReaction() {
  const el = wellnessCanvas;
  if (!el) return;
  el.classList.remove("is-reactive-pulse");
  void el.offsetWidth;
  el.classList.add("is-reactive-pulse");
  clearTimeout(el._pulseEndT);
  el._pulseEndT = setTimeout(() => el.classList.remove("is-reactive-pulse"), 1100);
}

function pulseHomeLogPanel() {
  const log = document.querySelector(".home-quicklog--panel .home-quicklog__dock") || document.querySelector(".home-quicklog__dock");
  if (!log) return;
  log.classList.remove("is-log-pulse");
  void log.offsetWidth;
  log.classList.add("is-log-pulse");
  clearTimeout(log._logPulseT);
  log._logPulseT = setTimeout(() => log.classList.remove("is-log-pulse"), 820);
}

function homeMFSupportLine(iso) {
  return pickHomeLine(iso, "mf-support", [
    "Let’s take care of you today 💗",
    "You deserve a soft pace today.",
    "Small kindnesses still count.",
    "We’re here for whatever today brings.",
  ]);
}

function energySnapshotLabel(e) {
  if (e === "High") return "Bright";
  if (e === "Low") return "Soft";
  return "Balanced";
}

function moodSnapshotFriendly(m) {
  const x = moodGlanceLabel(m);
  if (x === "Energetic") return "Bright";
  return x || "—";
}

function flowFeelLine(w) {
  const f = w.flowFeel || "Light";
  if (f === "Spotting") return "Spotting 💧";
  if (f === "Heavy") return "Heavier flow 💧";
  if (f === "Medium") return "Medium flow 💧";
  return "Light flow 💧";
}

function homeCycleHeroTitle(info, phase) {
  if (!info?.day || !phase) return "Your cycle";
  return `Day ${info.day} • ${phase}`;
}

function homeHeroTodaySentence(phase, w, info, rhythmTier) {
  if (rhythmTier === "learning") return "We'll learn gently over time.";
  if (!info?.day || !phase) return "One date unlocks your whole arc.";
  if (w.symptoms?.includes("Cramps")) return "Warmth and slow sips may help today.";
  if (w.energy === "Low") return "A softer rhythm still counts today.";
  if (phase === "Period" && info.day === 1) return "Your cycle started today. Take it gently.";
  if (phase === "Period") return "Rest reads as productive today.";
  if (phase === "Follicular") return "Today your energy may be returning.";
  if (phase === "Ovulation") return "A brighter window — hydrate between bright pushes.";
  if (phase === "Luteal") return "Softer bandwidth — small changes count.";
  return "You're doing enough today.";
}

function homeCycleHeroSub(phase, w, info, iso) {
  if (!info?.day || !phase) return "Add dates to see today clearly.";
  if (phase === "Period" && info.day === 1) return "";
  if (phase === "Period") return flowFeelLine(w);
  return homeHeroInsightShort(phase, w);
}

function homeCycleProgressPct(info, iso) {
  if (!info?.day || !info?.cycleLen) return 0.06;
  const today = iso || toISODate(new Date());
  if (info.phase === "Period" && info.day === 1 && dayHasPeriod(today)) {
    return Math.max(0.035, Math.min(0.12, 0.55 / Math.max(1, info.cycleLen)));
  }
  return Math.max(0.03, Math.min(1, (info.day - 0.5) / Math.max(1, info.cycleLen)));
}

function homeCycleDateLines(info, iso, periods) {
  const ps = periods || [];
  const inLog = ps.find((p) => iso >= p.startISO && iso <= p.endISO);
  const anchor = inLog?.startISO || info?.startISO;
  let startLine = "Log your period to anchor dates.";
  if (anchor) {
    if (inLog) startLine = `${formatMonthDay(inLog.startISO)} — Period started`;
    else startLine = `${formatMonthDay(anchor)} — Cycle reference`;
  }
  let nextISO = null;
  if (info?.startISO && info?.cycleLen) nextISO = predictNextFromCycleStart(info.startISO, info.cycleLen);
  if (!nextISO) nextISO = predictNextPeriodStart(ps);
  const nextLine = nextISO
    ? `Estimated next period: ${formatMonthDay(nextISO)}`
    : "Estimated next period — keep logging to narrow the window";
  return { startLine, nextLine };
}

function formatWaterGlassCount(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 0) return "—";
  if (x === 1) return "1 Cup";
  return `${Math.round(x)} Cups`;
}

function homeWaterVal(iso) {
  const c = state.data?.checkins?.[iso];
  if (c && typeof c.waterGlasses === "number") return formatWaterGlassCount(c.waterGlasses);
  if (dayHasPeriod(iso)) return "0 Cups";
  return "—";
}

function homeSymptomsSnapshot(iso) {
  const c = state.data?.checkins?.[iso];
  const sy = Array.isArray(c?.symptoms) ? c.symptoms.filter(Boolean) : [];
  if (!sy.length) return dayHasPeriod(iso) ? "None yet" : "—";
  if (sy.length === 1) return sy[0];
  return `${sy[0]} +${sy.length - 1}`;
}

function homeSleepSnapshot(iso, phase, w) {
  const c = state.data?.checkins?.[iso];
  if (c && typeof c.sleepMinutes === "number") {
    const h = Math.floor(c.sleepMinutes / 60);
    const m = Math.round(c.sleepMinutes % 60);
    let core = m ? `${h}h ${m}m` : `${h}h`;
    if (c.sleepQuality === "Restless") core += " · light";
    else if (c.sleepQuality === "Settled") core += " · settled";
    else if (c.sleepQuality === "Deep") core += " · deep";
    return core;
  }
  return buildHomeGlanceSleep(phase, w);
}

function bumpTodayWater() {
  if (!state.user || !state.data?.checkins) return;
  const iso = toISODate(new Date());
  const prev = state.data.checkins[iso] || {};
  const cur = Number(prev.waterGlasses);
  const next = Number.isFinite(cur) ? clamp(cur + 1, 0, 12) : 1;
  state.data.checkins[iso] = { ...prev, waterGlasses: next };
  saveUserData(state.user, state.data);
  showCalmToast(`Water · ${formatWaterGlassCount(next)}`);
  refreshAll();
}

function mergeTodayCheckin(patch) {
  if (!state.user || !state.data?.checkins) return;
  const iso = toISODate(new Date());
  const prev = state.data.checkins[iso] || {};
  state.data.checkins[iso] = { ...prev, ...patch };
  saveUserData(state.user, state.data);
  pulseHomeLogPanel();
  refreshAll();
}

function appendTodaySymptom(sym) {
  if (!state.user || !state.data?.checkins) return;
  const iso = toISODate(new Date());
  const prev = state.data.checkins[iso] || {};
  const s = new Set([...(Array.isArray(prev.symptoms) ? prev.symptoms.filter(Boolean) : []), sym]);
  state.data.checkins[iso] = { ...prev, symptoms: [...s] };
  saveUserData(state.user, state.data);
  showCalmToast("Noted gently.");
  refreshAll();
}

/** True when forecasts should stay humble (single log or irregular spacing). */
function homePredictionIsLearning(iso) {
  const periods = state.data?.periods || [];
  if (periods.length <= 1) return true;
  return averageCycleLength(periods) == null;
}

function homePredictionConfidenceLine(iso) {
  return homePredictionIsLearning(iso)
    ? "Forecasts: learning — still understanding your rhythm."
    : "Forecasts: steady — your logs support gentle estimates.";
}

/** Data confidence for adaptive home: cold = no anchor, learning = partial/stale, steady = in-cycle or enough pattern. */
function homeRhythmTier(iso) {
  const periods = state.data?.periods || [];
  const prefs = state.data?.cyclePrefs || {};

  if (dayHasPeriod(iso)) return "steady";

  const n = periods.length;
  if (n === 0 && !prefs.periodStartISO) return "cold";
  if (n === 0 && prefs.periodStartISO) return "learning";

  const lp = lastPeriod(periods);
  const daysSinceEnd = lp ? daysBetweenISO(lp.endISO, iso) : 999;
  if (n === 1 || daysSinceEnd > 55) return "learning";

  const avgLen = averageCycleLength(periods);
  if (n >= 2 && avgLen == null) return "learning";

  return "steady";
}

function buildPhaseLearnRhythmFooter(iso, tier, ph) {
  const periods = state.data?.periods || [];
  const n = periods.length;
  let conf = "Rhythm confidence: we’re still gathering signals.";
  if (tier === "steady" && n >= 2 && averageCycleLength(periods) && !homePredictionIsLearning(iso)) {
    conf = "Rhythm confidence: steady — your logs repeat a gentle spacing pattern.";
  } else if (tier === "learning") {
    conf = "Rhythm confidence: learning — forecasts stay soft until patterns repeat.";
  } else if (tier === "cold") {
    conf = "Rhythm confidence: not started — one gentle log unlocks your arc.";
  } else if (tier === "steady" && homePredictionIsLearning(iso)) {
    conf = "Rhythm confidence: learning — one log is a strong start; the next will sharpen timing.";
  }
  const next = predictNextPeriodStart(periods);
  let pred = "Next period: estimates appear as your history grows.";
  if (next) {
    const d = daysBetweenISO(iso, next);
    pred =
      d >= 0
        ? `Next period estimate: around ${formatNiceDate(next)} (~${d} days from today).`
        : `Next period estimate: around ${formatNiceDate(next)}.`;
  }
  const hormone =
    ph === "Period"
      ? "Hormone rhythm: estrogen and progesterone are often lower here — warmth and rest land well."
      : ph === "Follicular"
        ? "Hormone rhythm: estrogen often rises — curiosity and momentum can return gradually."
        : ph === "Ovulation"
          ? "Hormone rhythm: a bright window for many — balance outward energy with recovery."
          : "Hormone rhythm: progesterone may lead — steadier meals and earlier wind‑down often help.";
  return `${hormone}\n\n${conf}\n${pred}\n\nGentle guidance for reflection — not medical advice.`;
}

function openHomeCycleExplainedFromOrb() {
  const iso = toISODate(new Date());
  const tier = state.homeRhythmTier || "steady";
  const periods = state.data?.periods || [];
  const prefs = state.data?.cyclePrefs || null;
  const ph =
    (state.heroCycleInfo && state.heroCycleInfo.phase) ||
    cycleForISO(periods, prefs, iso)?.phase ||
    currentPhaseToday() ||
    "Period";
  openPhaseLearn(ph, buildPhaseLearnRhythmFooter(iso, tier, ph));
}

function homeUserHasPeriodLogs() {
  return (state.data?.periods || []).length > 0;
}

function homeHeroPrimarySupportCopy(phase) {
  if (!phase) return "";
  if (phase === "Period") return "How are you feeling today?";
  if (phase === "Follicular") return "Your energy may be returning.";
  if (phase === "Ovulation") return "Notice what feels strong.";
  if (phase === "Luteal") return "Small changes are worth noticing.";
  return "";
}

function homeNextPeriodConfidenceLabel(iso) {
  if (!homePredictionIsLearning(iso)) return "";
  return pickHomeLine(iso, "home-pred-conf", ["Learning confidence", "Still understanding your rhythm"]);
}

function buildHomeTodayCardContent(iso, phase, w, info, rhythmTier) {
  if (rhythmTier === "cold") {
    return {
      lead: "Start with how you feel today.",
      bullets: [
        { icon: "🌸", text: "No perfect memory needed" },
        { icon: "📝", text: "One gentle log is enough" },
      ],
    };
  }
  if (rhythmTier === "learning") {
    return {
      lead: "Your rhythm is taking shape.",
      bullets: [
        { icon: "🌷", text: "Keep logging at your pace" },
        { icon: "✨", text: "Forecasts stay soft for now" },
      ],
    };
  }
  const ph = phase || "Period";
  const leadByPhase = {
    Period: "Rest and warmth during Period phase",
    Follicular: "Energy returning during Follicular phase",
    Ovulation: "Bright window during Ovulation phase",
    Luteal: "Softer bandwidth during Luteal phase",
  };
  const bulletsByPhase = {
    Period: [
      { icon: "☀", text: "Warmth and hydration often help" },
      { icon: "💧", text: "Water supports recovery" },
      { icon: "🚶", text: "Gentle movement over pushing" },
    ],
    Follicular: [
      { icon: "☀", text: "Focus tasks may feel easier" },
      { icon: "💧", text: "Water supports energy" },
      { icon: "🚶", text: "Gentle movement can help" },
    ],
    Ovulation: [
      { icon: "☀", text: "Notice what feels strong" },
      { icon: "💧", text: "Hydrate between bright pushes" },
      { icon: "🚶", text: "Balance energy with recovery" },
    ],
    Luteal: [
      { icon: "☀", text: "Steadier meals can steady mood" },
      { icon: "💧", text: "Sips through the afternoon" },
      { icon: "🚶", text: "Earlier wind-down may help" },
    ],
  };
  if (w.symptoms?.includes("Cramps")) {
    return {
      lead: "Cramps noted — ease-first today.",
      bullets: [
        { icon: "☀", text: "Warmth and slow breaths help" },
        { icon: "💧", text: "Hydration through the day" },
        { icon: "🚶", text: "Keep plans lighter if you can" },
      ],
    };
  }
  if (w.energy === "Low") {
    return {
      lead: pickHomeLine(iso, "today-low", ["Softer energy today — pace is enough.", "A slower rhythm still counts."]),
      bullets: (bulletsByPhase[ph] || bulletsByPhase.Follicular).slice(0, 3),
    };
  }
  return {
    lead: leadByPhase[ph] || "Today in your cycle.",
    bullets: (bulletsByPhase[ph] || bulletsByPhase.Follicular).slice(0, 3),
  };
}

function renderHomeTodayCard(iso, phase, w, info, rhythmTier) {
  const card = $$("#homeTodayCard");
  const heading = $$("#homeTodayHeading");
  const leadEl = $$("#homeTodayLead");
  const listEl = $$("#homeTodayList");
  if (!card || !leadEl || !listEl) return;
  if (heading) {
    const titleEl = heading.querySelector(".home-guidance-panel__title") || heading;
    titleEl.textContent = "Today's guidance";
  }
  const { lead, bullets } = buildHomeTodayCardContent(iso, phase, w, info, rhythmTier);
  leadEl.textContent = lead;
  listEl.innerHTML = "";
  bullets.slice(0, 3).forEach(({ icon, text }) => {
    const li = document.createElement("li");
    li.className = "home-today-card__item";
    li.innerHTML = `<span class="home-today-card__bullet" aria-hidden="true">•</span><span class="home-today-card__text">${text}</span>`;
    listEl.appendChild(li);
  });
}

function renderHomeCycleTodayLines(iso, phase, w, info, rhythmTier) {
  const leadEl = $$("#homeCycleTodayLead");
  const subEl = $$("#homeCycleTodaySub");
  if (!leadEl) return;
  if (rhythmTier === "cold") {
    leadEl.hidden = true;
    leadEl.textContent = "";
    if (subEl) subEl.textContent = "";
    return;
  }
  const sentence = homeHeroTodaySentence(phase, w, info, rhythmTier);
  if (!sentence) {
    leadEl.hidden = true;
    leadEl.textContent = "";
  } else {
    leadEl.hidden = false;
    leadEl.textContent = sentence;
  }
  if (subEl) subEl.textContent = "";
}

function buildHomeTodayChanged(iso, w) {
  const yIso = addDaysISO(iso, -1);
  const yc = state.data?.checkins?.[yIso] || {};
  const tc = state.data?.checkins?.[iso] || {};
  const items = [];
  const energyRank = { Low: 1, Medium: 2, High: 3 };
  const yE = yc.energy;
  const tE = w.energy || tc.energy;
  if (yE && tE && energyRank[tE] > energyRank[yE]) items.push("Energy increasing");
  if (yE && tE && energyRank[tE] < energyRank[yE]) items.push("Energy softer");
  const flowRank = { none: 0, spotting: 1, light: 2, medium: 3, heavy: 4 };
  const yFlow = yc.flow || (dayHasPeriod(yIso) ? "medium" : "none");
  const tFlow = tc.flow || (dayHasPeriod(iso) ? "medium" : "none");
  if (flowRank[tFlow] < flowRank[yFlow] && flowRank[yFlow] > 0) items.push("Flow lighter");
  const ySy = Array.isArray(yc.symptoms) ? yc.symptoms.length : 0;
  const tSy = Array.isArray(tc.symptoms) ? tc.symptoms.length : w.symptoms?.length || 0;
  if (tSy < ySy && ySy > 0) items.push("Symptoms softer");
  const ySleep = yc.sleepMinutes;
  const tSleep = tc.sleepMinutes;
  if (typeof ySleep === "number" && typeof tSleep === "number" && tSleep > ySleep + 20) items.push("Sleep improved");
  const yWater = Number(yc.waterGlasses);
  const tWater = Number(tc.waterGlasses);
  if (Number.isFinite(yWater) && Number.isFinite(tWater) && tWater > yWater) items.push("Hydration up");
  return items.slice(0, 4);
}

function renderHomeTodayChanged(iso, w, rhythmTier) {
  const card = $$("#homeChangedCard");
  const list = $$("#homeChangedList");
  if (!card || !list) return;
  if (rhythmTier === "cold" || rhythmTier === "learning") {
    card.hidden = true;
    list.innerHTML = "";
    return;
  }
  const items = buildHomeTodayChanged(iso, w);
  if (!items.length) {
    card.hidden = true;
    list.innerHTML = "";
    return;
  }
  card.hidden = false;
  list.innerHTML = items
    .map((t) => {
      const down = /lighter|softer|softer/i.test(t);
      const arrow = down ? "↓" : "↑";
      return `<li><span class="home-changed-card__arrow" aria-hidden="true">${arrow}</span>${t}</li>`;
    })
    .join("");
}

function renderHomeHeroFuture(info, iso, periods, rhythmTier) {
  const wrap = $$("#homeHeroFuture");
  const startEl = $$("#homeCycleDateStart");
  const nextEl = $$("#homeCycleDateNext");
  const confEl = $$("#homeCycleConfLine");
  if (!wrap) return;
  if (rhythmTier === "cold") {
    wrap.hidden = true;
    if (startEl) startEl.textContent = "";
    if (nextEl) nextEl.textContent = "";
    if (confEl) confEl.hidden = true;
    return;
  }
  wrap.hidden = false;
  const { startLine, nextLine } = homeCycleDateLines(info, iso, periods);
  if (startEl) {
    const soft = startLine && !startLine.includes("anchor");
    startEl.textContent = soft ? startLine : "";
    startEl.hidden = !startEl.textContent;
  }
  if (nextEl) nextEl.textContent = nextLine.replace(/^Estimated next period:\s*/i, "").trim();
  const learning = homePredictionIsLearning(iso) || rhythmTier === "learning";
  if (confEl) {
    const confCopy = learning
      ? homeNextPeriodConfidenceLabel(iso) || "Still understanding your rhythm"
      : "";
    confEl.textContent = confCopy;
    confEl.hidden = !confCopy;
  }
}

function renderHomeEmptyState(rhythmTier) {
  const el = $$("#homeEmptyState");
  if (el) el.hidden = rhythmTier !== "cold";
}

function renderHomeHeroGlance(iso, w, rhythmTier) {
  const wrap = $$("#homeHeroGlance");
  const textEl = $$("#homeHeroGlanceText");
  if (!wrap || !textEl) return;
  if (rhythmTier === "cold") {
    wrap.hidden = true;
    textEl.textContent = "";
    return;
  }
  wrap.hidden = false;
  const tc = state.data?.checkins?.[iso] || {};
  const mood = w.mood || tc.mood;
  const hasMood = Boolean(mood);
  const hasFlow = Boolean(tc.flow) || dayHasPeriod(iso);
  const sy = Array.isArray(tc.symptoms) ? tc.symptoms.filter(Boolean) : [];
  if (rhythmTier === "learning") {
    textEl.textContent = "Keep logging — Ayla is learning your rhythm.";
    return;
  }
  if (hasMood && sy.length) {
    textEl.textContent = `Logged today · ${moodSnapshotFriendly(mood)} · ${sy[0]}${sy.length > 1 ? ` +${sy.length - 1}` : ""}`;
    return;
  }
  if (hasMood) {
    textEl.textContent = `Logged today · Mood: ${moodSnapshotFriendly(mood)}`;
    return;
  }
  if (hasFlow && dayHasPeriod(iso)) {
    textEl.textContent = "Period logged · Add how you feel when you're ready.";
    return;
  }
  textEl.textContent = "Not logged yet today — your next step is below.";
}

function renderHomeCycleMeta(iso, phase, w, info, rhythmTier, cyc) {
  const metaEl = $$("#homeCycleMeta");
  if (!metaEl) return;
  if (rhythmTier === "cold" || rhythmTier === "learning") {
    metaEl.hidden = true;
    metaEl.textContent = "";
    return;
  }
  if (phase === "Period" && info?.day) {
    const flowLine = flowFeelLine(w);
    if (flowLine) {
      metaEl.textContent = flowLine;
      metaEl.hidden = false;
      return;
    }
  }
  metaEl.hidden = true;
  metaEl.textContent = "";
}

function renderHomeOrbReadout(iso, phase, w, info, rhythmTier, cyc) {
  const phaseLine = $$("#homeOrbPhaseLine");
  const supportLine = $$("#homeOrbSupportLine");
  const dayLine = $$("#homeOrbDayLine");
  const confLine = $$("#homeOrbConfLine");
  const orbPanel = $$("#homeOrbPanel");
  const phaseSlug = phase ? String(phase).toLowerCase() : "unknown";
  if (orbPanel) orbPanel.dataset.phase = rhythmTier === "cold" ? "unknown" : phaseSlug;
  if (phaseLine) {
    phaseLine.textContent = "";
    phaseLine.hidden = true;
  }
  if (supportLine) {
    supportLine.hidden = true;
    supportLine.textContent = "";
  }
  if (dayLine) {
    dayLine.textContent = "";
    dayLine.hidden = true;
  }
  if (confLine) {
    confLine.textContent = "";
    confLine.hidden = true;
  }
}

function renderHomePhaseStrip(phase) {
  const strip = $$("#homeCyclePhaseStrip");
  if (!strip) return;
  const slug = phase ? String(phase).toLowerCase() : "";
  $$$("[data-strip-phase]", strip).forEach((el) => {
    const on = slug && el.getAttribute("data-strip-phase")?.toLowerCase() === slug;
    el.classList.toggle("is-current", Boolean(on));
    if (on) el.setAttribute("aria-current", "step");
    else el.removeAttribute("aria-current");
  });
  strip.querySelectorAll("[data-phase-icon]").forEach((el) => {
    const key = el.getAttribute("data-phase-icon");
    const iconName = HOME_PHASE_ICON_KEYS[key] || "cal_period";
    el.innerHTML = `<span class="home-panel-icon" aria-hidden="true">${aylaIcon(iconName)}</span>`;
  });
}

const HOME_PANEL_ICON_KEYS = {
  mood: "home_smile",
  energy: "home_zap",
  sleep: "home_moon",
  water: "home_droplets",
  symptoms: "home_heart_pulse",
  movement: "home_activity",
  flow: "home_droplet",
  more: "home_plus",
  notes: "home_notes",
  period: "cal_period",
};

function homePanelIconName(key) {
  return HOME_PANEL_ICON_KEYS[key] || "home_plus";
}

function homePanelIconHtml(key) {
  return `<span class="home-panel-icon" aria-hidden="true">${aylaIcon(homePanelIconName(key))}</span>`;
}

function paintHomeTodayMetricIcons() {
  document.querySelectorAll(".home-icon-wrap[data-home-icon]").forEach((el) => {
    const k = el.getAttribute("data-home-icon");
    if (!k) return;
    el.innerHTML = aylaIcon(homePanelIconName(k));
  });
}

const HOME_QUICK_LOG_LABELS = {
  mood: "Mood",
  water: "Water",
  symptoms: "Symptoms",
  movement: "Movement",
  flow: "Flow",
  more: "More",
  period: "Period",
  notes: "Notes",
};

const HOME_PHASE_ICON_KEYS = {
  period: "cal_period",
  follicular: "phase_follicular",
  ovulation: "phase_ovulation",
  luteal: "phase_luteal",
};

function renderAdaptiveHomeQuickLog(iso, phase, rhythmTier) {
  const row = $$("#homeQuickLogRow");
  if (!row) return;
  const picks = [];
  const add = (q) => picks.push({ q, lab: HOME_QUICK_LOG_LABELS[q] || q });

  if (rhythmTier === "cold" || rhythmTier === "learning") {
    add("period");
    add("mood");
    add("symptoms");
    add("water");
    add("notes");
    add("more");
  } else {
    add("mood");
    add("water");
    add("symptoms");
    add("movement");
    add("flow");
    add("more");
  }

  row.innerHTML = picks
    .map(
      ({ q, lab }) =>
        `<button type="button" class="home-quicklog__action" data-home-quick="${q}" data-home-quick-action="${q}"><span class="home-icon-wrap home-icon-wrap--${q}">${homePanelIconHtml(q)}</span><span class="home-quicklog__action-label">${lab}</span></button>`,
    )
    .join("");
}

function pulseHomeQuickChip(btn, action) {
  if (!btn) return;
  btn.classList.remove("is-action-tap");
  void btn.offsetWidth;
  btn.classList.add("is-action-tap");
  clearTimeout(btn._chipAnimT);
  btn._chipAnimT = setTimeout(() => btn.classList.remove("is-action-tap"), 220);
}

function renderHomeQuicklogPrimaryCta(iso, w, rhythmTier) {
  const btn = $$("#homeQuicklogPrimaryCta");
  if (!btn) return;
  const snap = homeSymptomsSnapshot(iso);
  const openSymptoms = snap === "—" || snap === "None yet" || snap === "Tap to log";
  const moodEmpty = !w?.mood || w.mood === "Unknown";
  if (openSymptoms || (rhythmTier !== "cold" && dayHasPeriod(iso))) {
    btn.textContent = "Log symptoms";
    btn.dataset.homeQuicklogCta = "symptoms";
  } else if (moodEmpty) {
    btn.textContent = "Update mood";
    btn.dataset.homeQuicklogCta = "mood";
  } else {
    btn.textContent = "Update today";
    btn.dataset.homeQuicklogCta = "today";
  }
}

function applySteadyHomeHeroCtas(iso, phase, w, info) {
  if (!homeHeroPrimaryBtn || !homeHeroSecondaryBtn) return;
  const hasLogs = homeUserHasPeriodLogs();
  const support = $$("#homeHeroCtaSupport");
  const setSupport = (t) => {
    if (!support) return;
    const s = (t || "").trim();
    if (!s) {
      support.hidden = true;
      support.textContent = "";
    } else {
      support.hidden = false;
      support.textContent = s;
    }
  };

  if (dayHasPeriod(iso) && phase === "Period") {
    homeHeroPrimaryBtn.textContent = "How are you feeling?";
    homeHeroPrimaryBtn.dataset.homeHeroCta = "mood";
    setSupport("");
    homeHeroSecondaryBtn.hidden = false;
    homeHeroSecondaryBtn.textContent = "Add note";
    homeHeroSecondaryBtn.dataset.homeHeroCta = "notes";
    return;
  }
  if (phase === "Ovulation") {
    homeHeroPrimaryBtn.textContent = "Capture energy";
    homeHeroPrimaryBtn.dataset.homeHeroCta = "energy";
    setSupport(homeHeroPrimarySupportCopy("Ovulation"));
    homeHeroSecondaryBtn.hidden = false;
    homeHeroSecondaryBtn.textContent = "Daily check-in";
    homeHeroSecondaryBtn.dataset.homeHeroCta = "checkin";
    return;
  }
  if (phase === "Luteal") {
    homeHeroPrimaryBtn.textContent = "Mood check";
    homeHeroPrimaryBtn.dataset.homeHeroCta = "mood";
    setSupport(homeHeroPrimarySupportCopy("Luteal"));
    homeHeroSecondaryBtn.hidden = false;
    homeHeroSecondaryBtn.textContent = "Add note";
    homeHeroSecondaryBtn.dataset.homeHeroCta = "notes";
    return;
  }
  if (phase === "Follicular") {
    homeHeroPrimaryBtn.textContent = "Energy check";
    homeHeroPrimaryBtn.dataset.homeHeroCta = "energy";
    setSupport(homeHeroPrimarySupportCopy("Follicular"));
    homeHeroSecondaryBtn.hidden = false;
    homeHeroSecondaryBtn.textContent = "Add note";
    homeHeroSecondaryBtn.dataset.homeHeroCta = "notes";
    return;
  }

  const tc = state.data?.checkins?.[iso] || {};
  const hasMoodLog = Boolean(tc.mood);
  setSupport("");
  if (!hasMoodLog) {
    homeHeroPrimaryBtn.textContent = "Daily check-in";
    homeHeroPrimaryBtn.dataset.homeHeroCta = "checkin";
    if (hasLogs) {
      homeHeroSecondaryBtn.hidden = false;
      homeHeroSecondaryBtn.textContent = "Add note";
      homeHeroSecondaryBtn.dataset.homeHeroCta = "notes";
    } else {
      homeHeroSecondaryBtn.hidden = false;
      homeHeroSecondaryBtn.textContent = "Log period";
      homeHeroSecondaryBtn.dataset.homeHeroCta = "adaptive";
    }
    return;
  }
  homeHeroPrimaryBtn.textContent = "Log today";
  homeHeroPrimaryBtn.dataset.homeHeroCta = "adaptive";
  if (hasLogs) {
    homeHeroSecondaryBtn.hidden = false;
    homeHeroSecondaryBtn.textContent = "Add note";
    homeHeroSecondaryBtn.dataset.homeHeroCta = "notes";
  } else {
    homeHeroSecondaryBtn.hidden = false;
    homeHeroSecondaryBtn.textContent = "Log period";
    homeHeroSecondaryBtn.dataset.homeHeroCta = "adaptive";
  }
}

/** Glance strip for the desktop left rail (phase + mood + energy; mirrors hero title when known). */
function homeLeftStatusLine(info, phase, w, tier) {
  const t = tier || homeRhythmTier(toISODate(new Date()));
  if (t === "cold") {
    return `Ayla · ${moodSnapshotFriendly(w.mood)} · ${energySnapshotLabel(w.energy)}`;
  }
  if (t === "learning") {
    return `Rhythm · learning · ${moodSnapshotFriendly(w.mood)} · ${energySnapshotLabel(w.energy)}`;
  }
  const core = !info?.day || !phase ? "Cycle · set dates" : homeCycleHeroTitle(info, phase);
  return `${core} · ${moodSnapshotFriendly(w.mood)} · ${energySnapshotLabel(w.energy)}`;
}


function renderHomeSurface() {
  const iso = toISODate(new Date());
  const info = state.heroCycleInfo || getHeroCycleInfo(iso);
  const w = readTodayWellnessModel();
  const periods = state.data?.periods || [];
  const prefs = state.data?.cyclePrefs || null;
  const cyc = cycleForISO(periods, prefs, iso);
  const phase = info.phase || cyc?.phase || null;
  const rhythmTier = homeRhythmTier(iso);
  state.homeRhythmTier = rhythmTier;
  if (homeRoot) homeRoot.dataset.rhythmTier = rhythmTier;

  const homeHeroCtaSupport = $$("#homeHeroCtaSupport");
  const homeCycleProgHeadEl = $$("#homeCycleProgHead");
  const homeCycleConfLine = $$("#homeCycleConfLine");
  const homeCyclePhaseStripEl = $$("#homeCyclePhaseStrip");

  const who = state.profile?.fullName;
  const firstName = who ? who.split(" ")[0] : "";
  if (homeMFGreet) homeMFGreet.textContent = firstName ? `Hello, ${firstName}` : "Hello";
  if (homeMFWhisper) homeMFWhisper.textContent = "";

  const notifyDots = [homeNotifyDot, $$("#topbarNotifyDot")].filter(Boolean);
  const showNotify = localStorage.getItem("ayla_notify_demo") !== "0";
  notifyDots.forEach((dot) => {
    dot.hidden = !showNotify;
  });

  if (rhythmTier === "cold") {
    if (homeCycleKicker) homeCycleKicker.textContent = "Current cycle";
    if (homeCyclePrimary) homeCyclePrimary.textContent = "Your rhythm";
    if (homeCycleSecondary) homeCycleSecondary.textContent = "You do not need perfect memory to begin.";
    if (homeCycleMetrics) homeCycleMetrics.hidden = true;
    if (homeHeroCtaRow) homeHeroCtaRow.hidden = true;
    if (homeHeroCtaSupport) {
      homeHeroCtaSupport.hidden = true;
      homeHeroCtaSupport.textContent = "";
    }
  } else if (rhythmTier === "learning") {
    if (homeCycleKicker) homeCycleKicker.textContent = "Rhythm";
    if (homeCyclePrimary) homeCyclePrimary.textContent = "We're rebuilding your rhythm.";
    if (homeCycleSecondary) homeCycleSecondary.textContent = "We'll learn gently over time.";
    if (homeCycleMetrics) homeCycleMetrics.hidden = false;
    if (homeHeroCtaRow) {
      homeHeroCtaRow.hidden = false;
      if (homeHeroPrimaryBtn) {
        homeHeroPrimaryBtn.textContent = "Continue tracking";
        homeHeroPrimaryBtn.dataset.homeHeroCta = "adaptive";
      }
      if (homeHeroSecondaryBtn) {
        homeHeroSecondaryBtn.hidden = true;
      }
    }
    if (homeHeroCtaSupport) {
      homeHeroCtaSupport.hidden = true;
      homeHeroCtaSupport.textContent = "";
    }
  } else {
    if (homeCycleCard && phase) homeCycleCard.dataset.phase = String(phase).toLowerCase();
    if (homeCycleKicker) homeCycleKicker.textContent = "Today";
    if (homeCyclePrimary) homeCyclePrimary.textContent = homeCycleHeroTitle(info, phase);
    if (homeCycleSecondary) homeCycleSecondary.textContent = homeCycleHeroSub(phase, w, info, iso);
    if (homeCycleMetrics) homeCycleMetrics.hidden = false;
    if (homeHeroCtaRow) {
      homeHeroCtaRow.hidden = false;
      applySteadyHomeHeroCtas(iso, phase, w, info);
    }
  }

  const pct = rhythmTier === "cold" ? 0.08 : homeCycleProgressPct(info, iso);
  if (homeCycleBar) homeCycleBar.setAttribute("aria-valuenow", String(Math.round(pct * 100)));
  if (homeCycleBarFill) homeCycleBarFill.style.width = `${Math.round(pct * 100)}%`;

  if (homeCycleProgHeadEl) {
    if (rhythmTier === "cold") {
      homeCycleProgHeadEl.textContent = "";
      homeCycleProgHeadEl.hidden = true;
    } else if (info?.day && (info.cycleLen || cyc?.cycleLen)) {
      const cl = Number(info.cycleLen || cyc?.cycleLen) || 28;
      const pct = Math.round(homeCycleProgressPct(info, iso) * 100);
      homeCycleProgHeadEl.textContent = `Day ${info.day} of ~${cl} · ${pct}% through this cycle`;
      homeCycleProgHeadEl.hidden = false;
    } else {
      homeCycleProgHeadEl.textContent = phase ? `${phase} · gentle timing` : "Cycle · gentle read";
      homeCycleProgHeadEl.hidden = false;
    }
  }

  if (homeCyclePhaseStripEl) {
    homeCyclePhaseStripEl.hidden = rhythmTier === "cold" || !phase;
  }
  renderHomePhaseStrip(phase);

  paintHomeTodayMetricIcons();
  renderAdaptiveHomeQuickLog(iso, phase, rhythmTier);
  const quickGuideLead = $$("#homeQuicklogGuideLead");
  const quickGuideSub = $$("#homeQuicklogGuideSub");
  if (quickGuideLead) {
    quickGuideLead.textContent =
      rhythmTier === "learning" ? "Keep logging gently" : "How are you feeling today?";
  }
  if (quickGuideSub) {
    quickGuideSub.textContent =
      rhythmTier === "learning"
        ? "Small updates teach Ayla what feels normal for you."
        : "Small updates help Ayla understand your rhythm.";
  }
  renderHomeTodayCard(iso, phase, w, info, rhythmTier);
  renderHomeCycleTodayLines(iso, phase, w, info, rhythmTier);
  renderHomeCycleMeta(iso, phase, w, info, rhythmTier, cyc);
  renderHomeHeroGlance(iso, w, rhythmTier);
  renderHomeOrbReadout(iso, phase, w, info, rhythmTier, cyc);
  renderHomeHeroFuture(info, iso, periods, rhythmTier);
  renderHomeEmptyState(rhythmTier);

  if (homeSnapMoodVal) homeSnapMoodVal.textContent = moodSnapshotFriendly(w.mood);
  if (homeSnapEnergyVal) homeSnapEnergyVal.textContent = energySnapshotLabel(w.energy);
  if (homeSnapWaterVal) homeSnapWaterVal.textContent = homeWaterVal(iso);
  if (homeSnapSleepVal) homeSnapSleepVal.textContent = homeSleepSnapshot(iso, phase, w);
  if (homeSnapSymptomsVal) homeSnapSymptomsVal.textContent = homeSymptomsSnapshot(iso);
  renderHomeQuicklogPrimaryCta(iso, w, rhythmTier);

  const periodDay1Fresh = dayHasPeriod(iso) && phase === "Period" && info?.day === 1 && !state.data.checkins?.[iso];
  if (periodDay1Fresh) {
    if (homeSnapMoodVal) homeSnapMoodVal.textContent = "Tap to update";
    if (homeSnapEnergyVal) homeSnapEnergyVal.textContent = "Unknown";
    if (homeSnapSleepVal) homeSnapSleepVal.textContent = "Tap to update";
  }

  if (homeLeftStatus) homeLeftStatus.textContent = homeLeftStatusLine(info, phase, w, rhythmTier);
  if (homeLeftGuide) {
    homeLeftGuide.textContent =
      rhythmTier === "cold"
        ? "No pressure — tap Log current period whenever it feels right."
        : rhythmTier === "learning"
          ? "We'll understand your rhythm together — keep logging at your pace."
          : `${homePredictMicroline(iso, info, w, cyc)}`
              .replace(/\s+/g, " ")
              .trim();
  }

  const infoForOrb =
    rhythmTier === "cold" ? { day: null, cycleLen: null } : rhythmTier === "learning" ? { ...info, day: info.day || 5, cycleLen: info.cycleLen || 28 } : info;
  syncHomeOrbProgress(infoForOrb);
  if (wellnessCanvas) {
    wellnessCanvas.dataset.fertile = rhythmTier === "steady" && cyc?.isFertile ? "1" : "0";
    wellnessCanvas.dataset.predictionConfidence =
      rhythmTier === "cold" ? "unknown" : homePredictionIsLearning(iso) ? "learning" : "steady";
  }
  syncHomeAtmosphere(w);
  syncHomeSignature(w, rhythmTier === "steady" && phase ? phase : null);
  bindHomeOrbInteractionsOnce();
  updateWellnessCanvas(w);
  if (wellnessCanvas && rhythmTier === "cold") {
    wellnessCanvas.dataset.phase = "unknown";
    if (wellnessVizPhaseLabel) wellnessVizPhaseLabel.textContent = "";
    if (wellnessCanvasEcho) wellnessCanvasEcho.textContent = "Hover for a gentle preview · tap to learn";
  } else if (wellnessCanvas && rhythmTier === "learning") {
    if (wellnessVizPhaseLabel) wellnessVizPhaseLabel.textContent = phase ? `${phase} · soft read` : "";
    if (wellnessCanvasEcho) {
      const phEcho = phase || "your cycle";
      wellnessCanvasEcho.textContent = `${phEcho} · still learning — tap for guidance`;
    }
  }
  syncWellnessPhaseLegend();
  if (wellnessCanvas) {
    wellnessCanvas.dataset.cycleDayMark =
      rhythmTier === "steady" && phase === "Period" && info?.day === 1 ? "1" : "0";
    const aria =
      rhythmTier === "cold"
        ? "Cycle rhythm preview. Tap to read gentle cycle guidance."
        : rhythmTier === "learning"
          ? "Cycle rhythm. Tap for phase guidance and rhythm notes."
          : `Cycle rhythm. Today around ${phase || "your phase"}. Tap for your cycle explained.`;
    wellnessCanvas.setAttribute("aria-label", aria);
  }

  const prevTier = state.prevHomeRhythmTier;
  if (prevTier != null && prevTier !== rhythmTier && homeRoot) {
    homeRoot.classList.add("home-root--rhythm-shift");
    clearTimeout(homeRoot._rhythmShiftT);
    homeRoot._rhythmShiftT = setTimeout(() => homeRoot.classList.remove("home-root--rhythm-shift"), 720);
  }
  if (prevTier != null && prevTier === "learning" && rhythmTier === "steady" && homeCycleCard) {
    homeCycleCard.classList.add("home-cycle-card--ack");
    clearTimeout(homeCycleCard._ackT);
    homeCycleCard._ackT = setTimeout(() => homeCycleCard.classList.remove("home-cycle-card--ack"), 1100);
  }
  state.prevHomeRhythmTier = rhythmTier;
}

function periodDays(period) {
  const a = parseISODate(period.startISO);
  const b = parseISODate(period.endISO);
  const days = [];
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) days.push(toISODate(d));
  return days;
}

function insightsFromData(periods, checkins) {
  const items = [];
  const sortedDates = Object.keys(checkins).sort((a, b) => a.localeCompare(b));
  if (sortedDates.length >= 5 && periods.length >= 1) {
    const lutealLows = [];
    const totalLuteal = [];
    for (const iso of sortedDates) {
      const ph = phaseForDate(periods, iso);
      if (!ph) continue;
      if (ph.phase === "Luteal") {
        totalLuteal.push(iso);
        if ((checkins[iso]?.mood || "") === "Low" || ["Emotional", "Anxious", "Sensitive", "Tired", "Irritated"].includes(checkins[iso]?.mood))
          lutealLows.push(iso);
      }
    }
    if (totalLuteal.length >= 3) {
      const pct = Math.round((lutealLows.length / totalLuteal.length) * 100);
      if (pct >= 45) items.push(`You often report a low mood in the luteal phase (${pct}% of luteal check‑ins).`);
    }
  }

  if (periods.length && Object.keys(checkins).length) {
    const periodSet = new Set(periods.flatMap(periodDays));
    const inPeriod = [];
    const outPeriod = [];
    for (const [iso, c] of Object.entries(checkins)) {
      if (!c?.pain) continue;
      const v = c.pain === "High" ? 3 : c.pain === "Medium" ? 2 : c.pain === "Low" ? 1.6 : 1;
      (periodSet.has(iso) ? inPeriod : outPeriod).push(v);
    }
    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    const a = avg(inPeriod);
    const b = avg(outPeriod);
    if (a && b && a - b >= 0.7) items.push("Pain is noticeably higher on your period days. Consider planning extra rest then.");
  }
  return items.slice(0, 4);
}

const PHASE_ORDER = ["Period", "Follicular", "Ovulation", "Luteal"];

const FOOD_GUIDANCE = {
  Period: {
    body: "Hormones dip and your body is rebuilding. Many women feel lower energy and more sensitive here.",
    eat: ["Iron-rich foods (spinach, lentils)", "Warm soups & stews", "Vitamin C (citrus, berries)", "Omega‑3s (walnuts, flax)", "Hydrating foods (cucumber, watermelon)"],
    why: "These support iron replenishment and gentle energy while your body recovers.",
    avoid: "Excess caffeine or very salty processed foods if they worsen cramps/bloating.",
  },
  Follicular: {
    body: "Estrogen rises and energy often feels steadier. For many women, this feels like a ‘build’ phase.",
    eat: ["Lean proteins (eggs, tofu)", "Colorful veggies", "Whole grains (oats, brown rice)", "Fermented foods (yogurt, kefir)", "Healthy fats (avocado, olive oil)"],
    why: "Balanced meals support stable energy and recovery as your momentum returns.",
    avoid: "Skipping meals—steady fuel helps you feel more even.",
  },
  Ovulation: {
    body: "Estrogen peaks and you may feel more social and energized. Many women also notice hydration matters more here.",
    eat: ["Protein + fiber meals", "Hydrating foods (or soups)", "Zinc (pumpkin seeds)", "Antioxidants (berries, leafy greens)"],
    why: "Helps support energy, hydration, and overall comfort during a higher-output window.",
    avoid: "Very heavy meals right before intense activity if you feel sluggish.",
  },
  Luteal: {
    body: "Progesterone rises. Cravings or lower bandwidth can show up; blood sugar swings feel stronger for some.",
    eat: ["Complex carbs (sweet potato)", "Magnesium (nuts, cacao)", "Calming teas (ginger, peppermint)", "Protein snacks (nuts, yogurt)", "Warm, grounding meals"],
    why: "Supports steadier mood/energy and can reduce ‘crash’ feelings before your period.",
    avoid: "Extra sugary snacks on an empty stomach—they can spike then drop energy.",
  },
};

const MOVE_GUIDANCE = {
  Period: {
    body: "Bleeding days often ask for warmth, rest, and a slower nervous system — movement can be tiny and still meaningful.",
    do: ["Restorative stretches", "Breath-led ease", "Legs‑up‑the‑wall", "Soft walking indoors"],
    why: "Gentle circulation and pelvic ease can comfort cramps without asking for performance.",
  },
  Follicular: {
    body: "Estrogen is climbing; many women feel a quiet return of curiosity — keep invitations light and joyful.",
    do: ["Slow flow yoga", "Pilates mobility", "Dance around the kitchen", "Spacious walks"],
    why: "Uplifting, low‑pressure movement can support mood and energy as your body opens again.",
  },
  Ovulation: {
    body: "A brighter window for some — expression in motion can feel natural; still let kindness lead.",
    do: ["Dynamic yoga", "Sculpting flow", "Cardio dance", "Full‑body energizing sequences"],
    why: "If you want more vitality today, fluid strength and dance‑like flows often feel aligned — finish softly.",
  },
  Luteal: {
    body: "Progesterone may invite slowing down; emotional steadiness and grounding often matter as much as the body.",
    do: ["Yin yoga", "Slower pilates", "Stretching", "Grounding walks"],
    why: "Calm pathways can ease PMS tenderness and help the nervous system feel held.",
  },
};

/* —— Movement: Ayla sanctuary — curated cycle‑wellness only (no external exercise databases) —— */

const MOVE_PREF_DEF = {
  lowEnergy: false,
  stressRelief: false,
  crampEase: false,
  quickReset: false,
  grounding: false,
  softStretch: false,
  emotionalRelease: false,
  recovery: false,
  confidenceBoost: false,
  nervousCalm: false,
};

/** Curated feminine movement — imagery is soft editorial wellness only (no anatomy / gym catalogs). */
const AYLA_MOVEMENT_SANCTUARY = [
  {
    id: "gentle-morning-stretch",
    title: "Gentle morning stretch",
    hint: "Restorative flow",
    phases: ["Period", "Luteal", "Follicular"],
    energyFit: "soft",
    emotional: "Welcomes the day without rushing your nervous system.",
    body: "Side‑body and hip openings that respect a tender lower belly.",
    supports: ["Cramp ease", "Emotional calm", "Circulation"],
    durationMin: 12,
    intensity: "Soft energy",
    image: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=900&q=80",
    ytQuery: "gentle morning yoga stretch women",
    keywords: "stretch morning soft yin calm",
  },
  {
    id: "cat-cow-pelvic-wave",
    title: "Cat‑cow pelvic wave",
    hint: "Breath‑linked mobility",
    phases: ["Period", "Follicular"],
    energyFit: "soft",
    emotional: "A rhythmic way to say hello to your spine and hips.",
    body: "Supports pelvic relaxation and lower‑back ease on heavy days.",
    supports: ["Pelvic ease", "Lower back release", "Breath"],
    durationMin: 8,
    intensity: "Soft energy",
    image: "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=900&q=80",
    ytQuery: "cat cow yoga gentle women",
    keywords: "pelvic spine mobility breath",
  },
  {
    id: "legs-up-wall",
    title: "Legs‑up‑the‑wall rest",
    hint: "Stillness ritual",
    phases: ["Period", "Luteal"],
    energyFit: "rest",
    emotional: "Lets gravity help you downshift when everything feels loud.",
    body: "Invites circulation back toward the core without effort.",
    supports: ["Cramp ease", "Nervous system calm", "Fatigue care"],
    durationMin: 10,
    intensity: "Restorative",
    image: "https://images.unsplash.com/photo-1599447331661-dfcccfb8aac4?auto=format&fit=crop&w=900&q=80",
    ytQuery: "legs up the wall restorative yoga women",
    keywords: "restorative wall yin rest period",
  },
  {
    id: "diaphragmatic-breath",
    title: "Slow diaphragmatic breath",
    hint: "Breath sanctuary",
    phases: ["Period", "Follicular", "Ovulation", "Luteal"],
    energyFit: "rest",
    emotional: "A few minutes of exhale‑led softness for anxious days.",
    body: "Down‑regulates tension you may carry in jaw, belly, and shoulders.",
    supports: ["Emotional grounding", "Headache ease", "PMS support"],
    durationMin: 6,
    intensity: "Restorative",
    image: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=900&q=80",
    ytQuery: "diaphragmatic breathing women gentle",
    keywords: "breath breathwork anxiety calm",
  },
  {
    id: "lower-back-bolster",
    title: "Lower‑back release on support",
    hint: "Supported rest",
    phases: ["Period", "Luteal"],
    energyFit: "soft",
    emotional: "Holds your lower back the way a warm palm might.",
    body: "Bolster or pillow under knees to ease sacral ache.",
    supports: ["Lower back release", "Cramp ease", "Rest"],
    durationMin: 14,
    intensity: "Soft energy",
    image: "https://images.unsplash.com/photo-1552196563-aec193cf0601?auto=format&fit=crop&w=900&q=80",
    ytQuery: "restorative yoga lower back women bolster",
    keywords: "back bolster period restorative",
  },
  {
    id: "mindful-indoor-walk",
    title: "Mindful indoor walk",
    hint: "Circulation ritual",
    phases: ["Period", "Follicular", "Luteal"],
    energyFit: "soft",
    emotional: "Proof that slow loops still count as beautiful movement.",
    body: "Light circulation for bloating or low mood without impact.",
    supports: ["Circulation", "Bloating ease", "Emotional clarity"],
    durationMin: 15,
    intensity: "Easy flow",
    image: "https://images.unsplash.com/photo-1545389338-f1a24046849e?auto=format&fit=crop&w=900&q=80",
    ytQuery: "mindful walking meditation women home",
    keywords: "walk mindful gentle indoors",
  },
  {
    id: "yin-hips-heart",
    title: "Yin for hips & heart space",
    hint: "Deep slow stretch",
    phases: ["Luteal", "Period"],
    energyFit: "soft",
    emotional: "Room for feelings that arrive with PMS — without fixing them.",
    body: "Long holds for hips and chest that soften protective tension.",
    supports: ["PMS emotional ease", "Hip openness", "Nervous system calm"],
    durationMin: 18,
    intensity: "Soft energy",
    image: "https://images.unsplash.com/photo-1607962833509-5cc7727d66d1?auto=format&fit=crop&w=900&q=80",
    ytQuery: "yin yoga hips women gentle",
    keywords: "yin pms hips stretch",
  },
  {
    id: "soft-pilates-flow",
    title: "Soft pilates standing flow",
    hint: "Feminine sculpt · light",
    phases: ["Follicular", "Ovulation"],
    energyFit: "moderate",
    emotional: "Tall, graceful shapes — strength whispered, not shouted.",
    body: "Glutes and core wake‑up without jumping or harsh load.",
    supports: ["Posture", "Gentle strength", "Energy lift"],
    durationMin: 16,
    intensity: "Moderate · kind",
    image: "https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=900&q=80",
    ytQuery: "gentle pilates standing flow women",
    keywords: "pilates sculpt feminine mobility",
  },
  {
    id: "dance-kitchen-flow",
    title: "Kitchen dance flow",
    hint: "Joyful micro cardio",
    phases: ["Follicular", "Ovulation"],
    energyFit: "uplifting",
    emotional: "Lets pleasure lead — not pace charts.",
    body: "Three songs of free movement to lift oxytocin and circulation.",
    supports: ["Mood lift", "Circulation", "Ovulation radiance"],
    durationMin: 12,
    intensity: "Bright · playful",
    image: "https://images.unsplash.com/photo-1524594152303-9fd13543fe6f?auto=format&fit=crop&w=900&q=80",
    ytQuery: "joyful dance at home women gentle cardio",
    keywords: "dance cardio joyful follicular ovulation",
  },
  {
    id: "dynamic-yoga-wave",
    title: "Dynamic yoga wave",
    hint: "Fluid strength",
    phases: ["Ovulation", "Follicular"],
    energyFit: "uplifting",
    emotional: "For days your body wants to move like water, not machinery.",
    body: "Sun salutations and standing waves — skip anything sharp.",
    supports: ["Energizing flow", "Lymph movement", "Hydration reminder"],
    durationMin: 20,
    intensity: "Bright · fluid",
    image: "https://images.unsplash.com/photo-1599901860904-17e06ed7393d?auto=format&fit=crop&w=900&q=80",
    ytQuery: "slow vinyasa yoga flow women",
    keywords: "vinyasa flow ovulation dynamic yoga",
  },
  {
    id: "sculpting-barre-soft",
    title: "Sculpting barre‑inspired flow",
    hint: "Low‑impact sculpt",
    phases: ["Ovulation", "Follicular"],
    energyFit: "moderate",
    emotional: "Small pulses that feel elegant, not punishing.",
    body: "Arms and legs with chair support — no jumping.",
    supports: ["Gentle strength", "Balance", "Confidence"],
    durationMin: 18,
    intensity: "Moderate · kind",
    image: "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=900&q=80",
    ytQuery: "barre workout gentle women no jumping",
    keywords: "barre sculpt ovulation feminine",
  },
  {
    id: "evening-grounding-stretch",
    title: "Grounding evening stretch",
    hint: "Wind‑down ritual",
    phases: ["Luteal", "Period"],
    energyFit: "soft",
    emotional: "Signals to your body that the day can soften now.",
    body: "Forward folds and side stretches to invite sleepier nerves.",
    supports: ["Sleep support", "PMS ease", "Nervous system calm"],
    durationMin: 14,
    intensity: "Soft energy",
    image: "https://images.unsplash.com/photo-1607962833509-5cc7727d66d1?auto=format&fit=crop&w=900&q=80",
    ytQuery: "evening stretch routine women wind down",
    keywords: "evening stretch luteal sleep calm",
  },
  {
    id: "pms-shoulder-release",
    title: "PMS shoulder & jaw release",
    hint: "Emotional regulation",
    phases: ["Luteal"],
    energyFit: "soft",
    emotional: "When emotions sit in the upper body, this is a tender reply.",
    body: "Neck rolls, shoulder circles, and soft jaw unclenching.",
    supports: ["PMS emotional ease", "Tension release", "Headache care"],
    durationMin: 9,
    intensity: "Soft energy",
    image: "https://images.unsplash.com/photo-1552196563-aec193cf0601?auto=format&fit=crop&w=900&q=80",
    ytQuery: "gentle neck shoulder stretch women",
    keywords: "pms shoulder neck emotional",
  },
  {
    id: "side-lying-twist",
    title: "Side‑lying restorative twist",
    hint: "Digestive ease",
    phases: ["Period", "Luteal"],
    energyFit: "soft",
    emotional: "A hug‑shaped twist for days that feel inward.",
    body: "Gentle rotation through mid‑back to support bloating and cramps.",
    supports: ["Bloating ease", "Cramp comfort", "Calm"],
    durationMin: 11,
    intensity: "Soft energy",
    image: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=900&q=80",
    ytQuery: "restorative twist yoga women gentle",
    keywords: "twist restorative bloating period",
  },
  {
    id: "circulation-wake",
    title: "Circulation wake‑up",
    hint: "Light energizing",
    phases: ["Follicular", "Ovulation"],
    energyFit: "uplifting",
    emotional: "Brightens the body without a single burpee.",
    body: "Wrist circles, ankle rolls, and big easy reaches toward the sky.",
    supports: ["Energy lift", "Lymph flow", "Ovulation glow"],
    durationMin: 8,
    intensity: "Easy flow",
    image: "https://images.unsplash.com/photo-1599901860904-17e06ed7393d?auto=format&fit=crop&w=900&q=80",
    ytQuery: "morning mobility wake up women gentle",
    keywords: "wake mobility energy follicular",
  },
  {
    id: "neck-cherish",
    title: "Seated neck cherish",
    hint: "Micro care",
    phases: ["Period", "Follicular", "Ovulation", "Luteal"],
    energyFit: "rest",
    emotional: "For screen‑heavy days or headache tenderness.",
    body: "Slow tilts and ear‑to‑shoulder slides with patient breath.",
    supports: ["Headache care", "Calm focus", "Softness"],
    durationMin: 7,
    intensity: "Restorative",
    image: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=900&q=80",
    ytQuery: "gentle neck stretches seated women",
    keywords: "neck headache stretch seated",
  },
  {
    id: "bloat-breath-walk",
    title: "Bloat‑ease breath & walk",
    hint: "Digestive kindness",
    phases: ["Luteal", "Period"],
    energyFit: "soft",
    emotional: "Pairs breath with movement so nothing feels forced.",
    body: "Five minutes of paced walking plus side‑waist breaths.",
    supports: ["Bloating ease", "Circulation", "Calm belly"],
    durationMin: 10,
    intensity: "Easy flow",
    image: "https://images.unsplash.com/photo-1545389338-f1a24046849e?auto=format&fit=crop&w=900&q=80",
    ytQuery: "gentle walk bloating relief women",
    keywords: "bloating walk breath luteal",
  },
  {
    id: "fatigue-nest",
    title: "Fatigue nest stretch",
    hint: "Bed‑adjacent ease",
    phases: ["Period", "Luteal", "Follicular"],
    energyFit: "rest",
    emotional: "Movement that meets you lying down — still sacred.",
    body: "Figure‑four on your back and gentle knee rocks.",
    supports: ["Fatigue care", "Hip release", "Rest"],
    durationMin: 9,
    intensity: "Restorative",
    image: "https://images.unsplash.com/photo-1599447331661-dfcccfb8aac4?auto=format&fit=crop&w=900&q=80",
    ytQuery: "bed yoga gentle stretches tired women",
    keywords: "fatigue rest gentle bed stretch",
  },
  {
    id: "ovulation-dance-cardio",
    title: "Ovulation dance cardio · soft impact",
    hint: "Expressive cardio",
    phases: ["Ovulation"],
    energyFit: "uplifting",
    emotional: "Celebrates brightness without gym culture noise.",
    body: "Low‑impact dance cardio — water nearby, finish with swaying cool‑down.",
    supports: ["Cardio joy", "Circulation", "Confidence"],
    durationMin: 16,
    intensity: "Bright · fluid",
    image: "https://images.unsplash.com/photo-1524594152303-9fd13543fe6f?auto=format&fit=crop&w=900&q=80",
    ytQuery: "low impact dance cardio women fun",
    keywords: "dance cardio ovulation energizing",
  },
  {
    id: "luteal-slow-pilates",
    title: "Luteal slow mat pilates",
    hint: "Grounded core",
    phases: ["Luteal"],
    energyFit: "soft",
    emotional: "Deep, patient work for when the world feels a bit loud.",
    body: "Side‑lying glute activation and breath‑matched ab work — no crunching rush.",
    supports: ["PMS steadiness", "Core kindness", "Nervous system calm"],
    durationMin: 17,
    intensity: "Soft energy",
    image: "https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=900&q=80",
    ytQuery: "slow pilates mat women gentle",
    keywords: "pilates luteal slow grounding",
  },
];

let moveSearchTimer = null;

function ensureMovePrefs() {
  if (!state.data) return { ...MOVE_PREF_DEF };
  const raw = { ...(state.data.movePrefs || {}) };
  const p = { ...MOVE_PREF_DEF, ...raw };
  Object.keys(p).forEach((k) => {
    if (!Object.prototype.hasOwnProperty.call(MOVE_PREF_DEF, k)) delete p[k];
  });
  state.data.movePrefs = p;
  if (raw.gentle) {
    p.softStretch = Boolean(p.softStretch || raw.gentle);
    p.recovery = Boolean(p.recovery || raw.gentle);
  }
  if (raw.yoga) p.softStretch = Boolean(p.softStretch || raw.yoga);
  if (raw.stretching) p.softStretch = true;
  if (raw.grounding) p.grounding = true;
  if (raw.recovery) p.recovery = true;
  if (raw.lowEnergy) p.lowEnergy = true;
  if (raw.quickSession) p.quickReset = Boolean(p.quickReset || raw.quickSession);
  if (raw.energizing) p.confidenceBoost = Boolean(p.confidenceBoost || raw.energizing);
  if (raw.outdoors) p.grounding = Boolean(p.grounding || raw.outdoors);
  return state.data.movePrefs;
}

function persistMovePrefs() {
  if (!state.user || !state.data) return;
  saveUserData(state.user, state.data);
}

function normalizeSanctuaryItem(row) {
  return {
    id: row.id,
    title: row.title,
    hint: row.hint,
    image: row.image || null,
    src: "ayla",
    exerciseId: null,
    emotional: row.emotional,
    body: row.body,
    supports: row.supports || [],
    durationMin: row.durationMin,
    intensity: row.intensity,
    ytQuery: row.ytQuery,
    phases: row.phases || [],
    energyFit: row.energyFit || "soft",
    keywords: row.keywords || "",
    description: row.body,
  };
}

function scoreSanctuaryItem(it, phase, w, prefs) {
  let s = 0;
  if (it.phases?.length && phase && it.phases.includes(phase)) s += 8;
  else if (it.phases?.length && phase) s -= 3;
  else s += 1;

  const fit = it.energyFit;
  if (w.energy === "Low") {
    if (fit === "soft" || fit === "rest") s += 6;
    if (fit === "uplifting") s -= 9;
  } else if (w.energy === "High") {
    if (fit === "uplifting" || fit === "moderate") s += 6;
    if (fit === "rest") s -= 1;
  } else {
    if (fit !== "uplifting") s += 2;
    else s += 1;
  }

  const blob = `${(it.supports || []).join(" ")} ${it.keywords || ""} ${it.title}`.toLowerCase();
  if (w.symptoms?.includes("Cramps") && /cramp|pelvic|ease|lower|belly|wall|restorative|yin/i.test(blob)) s += 7;
  if (w.symptoms?.includes("Fatigue") && /fatigue|rest|nest|calm|breath|still/i.test(blob)) s += 6;
  if (w.symptoms?.includes("Headache") && /headache|neck|jaw|shoulder|cherish/i.test(blob)) s += 6;
  if (w.symptoms?.includes("Bloating") && /bloat|digest|twist|walk/i.test(blob)) s += 5;

  if (["Emotional", "Irritated", "Tired"].includes(w.mood)) {
    if (/calm|breath|ground|emotional|nervous|pms|yin|restorative/i.test(blob)) s += 4;
  }

  if (prefs.lowEnergy) {
    if (fit === "soft" || fit === "rest") s += 4;
    if (fit === "uplifting") s -= 3;
  }
  if (prefs.crampEase) {
    if (/cramp|pelvic|ease|lower|belly|wall|restorative|yin|bloat|twist/i.test(blob)) s += 6;
  }
  if (prefs.stressRelief || prefs.nervousCalm) {
    if (/calm|breath|ground|emotional|nervous|pms|yin|restorative|evening|mindful|walk/i.test(blob)) s += 5;
  }
  if (prefs.quickReset && (it.durationMin || 99) <= 12) s += 3;
  if (prefs.grounding) {
    if (/ground|breath|evening|pms|mindful|walk|slow|mat/i.test(blob)) s += 3;
  }
  if (prefs.softStretch) {
    if (/stretch|yin|flow|neck|side|twist|restorative|pilates|mobil/i.test(blob)) s += 3;
  }
  if (prefs.emotionalRelease) {
    if (/yin|pms|emotional|heart|shoulder|jaw|breath/i.test(blob)) s += 4;
  }
  if (prefs.recovery) {
    if (fit === "soft" || fit === "rest") s += 2;
  }
  if (prefs.confidenceBoost && w.energy !== "Low") {
    if (fit === "uplifting" || fit === "moderate") s += 3;
  }

  if (phase === "Period" && fit === "uplifting") s -= 5;
  if (phase === "Luteal" && /pms|luteal|yin|evening|slow|bloat/i.test(blob)) s += 2;
  if (phase === "Ovulation" && fit === "uplifting") s += 2;
  if (phase === "Follicular" && (fit === "moderate" || fit === "uplifting")) s += 1;
  return s;
}

function dedupeMoveByTitle(items) {
  const out = [];
  const seen = new Set();
  items.forEach((it) => {
    const k = String(it.title || "")
      .trim()
      .toLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(it);
  });
  return out;
}

function selectSanctuaryMovements(phase, w, prefs) {
  const catalog = AYLA_MOVEMENT_SANCTUARY.map(normalizeSanctuaryItem);
  const scored = catalog.map((it) => ({ it, s: scoreSanctuaryItem(it, phase, w, prefs) }));
  scored.sort((a, b) => b.s - a.s);
  return scored.filter((x) => x.s > -6).slice(0, 16).map((x) => x.it);
}

function filterSanctuarySearch(items, term) {
  const t = String(term || "")
    .trim()
    .toLowerCase();
  if (t.length < 2) return items;
  return items.filter((it) => {
    const blob = `${it.title} ${it.hint} ${it.body || ""} ${it.emotional || ""} ${(it.supports || []).join(" ")} ${it.keywords || ""}`.toLowerCase();
    return blob.includes(t);
  });
}

function buildMoveLead(phase, w, fg) {
  const bits = [];
  if (phase) bits.push(`${phase} phase`);
  if (w.mood && w.mood !== "Calm") bits.push(`${w.mood.toLowerCase()} mood`);
  if (w.energy === "Low") bits.push("softer energy");
  if (w.energy === "High") bits.push("brighter energy");
  if (w.symptoms?.length) bits.push("signals you’ve already shared");
  if (!bits.length) {
    return fg?.body || "A feminine movement sanctuary — softness first, always optional intensity.";
  }
  return `Ayla is holding your ${bits.join(", ")} — ${fg?.why || "nothing here is about pushing harder."}`;
}

function buildMoveGreeting(phase, w) {
  if (w.symptoms?.includes("Cramps") || (phase === "Period" && w.energy === "Low")) {
    return "Your body may benefit from softness today.";
  }
  if (["Emotional", "Irritated", "Tired"].includes(w.mood)) {
    return "What kind of movement may help you feel a little more grounded?";
  }
  if (w.energy === "High" && phase === "Ovulation") {
    return "When energy feels bright, flow can be joyful — still finish gently.";
  }
  if (w.symptoms?.includes("Fatigue") || w.energy === "Low") {
    return "Gentle movement can help restore your rhythm.";
  }
  return "What kind of movement may support you today?";
}

const MOVE_INTENSITY_BANDS = [
  { id: "restorative", icon: "🌙", label: "Restorative", hint: "Stillness, breath, softness" },
  { id: "gentle", icon: "☁️", label: "Gentle", hint: "Slow fluid shapes" },
  { id: "energizing", icon: "✨", label: "Energizing", hint: "Light vitality without pressure" },
  { id: "stronger", icon: "🔥", label: "Stronger flow", hint: "Optional brightness — finish gently" },
];

function readTodayMovementContext() {
  const iso = toISODate(new Date());
  const w = readTodayWellnessModel();
  const pain = state.data?.checkins?.[iso]?.pain || "None";
  return { ...w, pain };
}

function inferMoveIntensityBand(phase, w) {
  const pain = w.pain || "None";
  if (w.symptoms?.includes("Fatigue") || w.energy === "Low") return "restorative";
  if (pain === "High" || pain === "Medium" || w.symptoms?.includes("Cramps") || phase === "Period") return "gentle";
  if (phase === "Ovulation" && w.energy === "High") return "stronger";
  if (phase === "Follicular" && w.energy === "High") return "energizing";
  if (phase === "Ovulation") return "energizing";
  if (phase === "Follicular") return "energizing";
  if (phase === "Luteal") return "gentle";
  if (phase === "Period") return "restorative";
  return "gentle";
}

function buildMoveIntensityHint(band, phase, w) {
  const iso = toISODate(new Date());
  return pickHomeLine(iso, `move-hint-${band}`, [
    band === "restorative"
      ? "Rest is productive here — let stillness count as movement."
      : band === "gentle"
        ? "Fluid, lower‑pressure shapes may feel more coherent than intensity."
        : band === "energizing"
          ? "Vitality can rise without urgency — keep water and pauses nearby."
          : "If you reach for a stronger flow, let softness bookend the session.",
    "Nothing here is about proving fitness — only supporting how you feel.",
    "Honor the version of you that shows up today, not yesterday’s peak.",
  ]);
}

function buildMoveBodyRead(iso, phase, w, fg) {
  const pain = w.pain || "None";
  const mood = w.mood;
  const en = w.energy;
  const lines = [];
  if (phase === "Follicular") {
    lines.push("Your follicular phase may support lighter energizing movement without urgency.");
  } else if (phase === "Luteal") {
    lines.push("Your luteal rhythm may prefer grounded, fluid movement over sharp intensity.");
  } else if (phase === "Ovulation") {
    lines.push("If outward energy feels available, joyful flow may land well — still keep edges soft.");
  } else if (phase === "Period") {
    lines.push("Bleeding days often favor warmth and slower nervous‑system pacing.");
  } else {
    lines.push(fg?.body || "Log your last period when you can — Ayla will align invitations to your arc.");
  }

  if (mood === "Tired" && en === "High") {
    lines.push("Tired mood with brighter energy can mean your body wants motion without pressure.");
  } else if (en === "Low") {
    lines.push("Softer energy today is a cue to weave recovery into every transition.");
  }
  if (pain === "High" || pain === "Medium") {
    lines.push("Discomfort suggests smaller ranges, patient breath, and fewer sharp transitions.");
  }
  if (w.symptoms?.includes("Cramps")) {
    lines.push("Heat‑friendly, breath‑led shapes often comfort a busy pelvis.");
  }
  return lines.slice(0, 3).join(" ");
}

function buildMoveBenefitList(phase, mw, fg, band) {
  const items = [];
  if (band === "restorative") items.push("Honest pauses between micro movements");
  if (band === "gentle" || band === "restorative") items.push("Fluid spinal and hip pathways");
  if (mw.energy === "Low") items.push("Sunlight and short walking loops if that feels kind");
  if (["Emotional", "Irritated", "Tired"].includes(mw.mood)) items.push("Nervous‑system regulation through slower pacing");
  if (phase === "Ovulation" && mw.energy === "High") items.push("Dance‑like shapes that stay low‑impact");
  (fg?.do || []).forEach((x) => items.push(x));
  const seen = new Set();
  const out = [];
  for (const t of items) {
    const s = String(t || "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out.slice(0, 4);
}

function buildMoveGoLighterList(phase, mw, band) {
  const items = [
    "Performance pressure or all‑or‑nothing pacing",
    "Comparing today’s body to your highest past days",
  ];
  if (band === "restorative" || band === "gentle") {
    items.push("High‑impact jumps while your system asks for softness");
    items.push("Long sessions without breath breaks");
  } else {
    items.push("Overexertion without hydration pauses");
  }
  if (phase === "Period" || mw.symptoms?.includes("Cramps")) {
    items.push("Ignoring cramp signals to push through");
  }
  return items.slice(0, 4);
}

function movePaceLabel(it) {
  const fit = it.energyFit || "soft";
  if (fit === "rest") return "Restorative pace";
  if (fit === "soft") return "Gentle pace";
  if (fit === "moderate") return "Fluid steady pace";
  if (fit === "uplifting") return "Bright playful pace";
  return "Steady pace";
}

function moveEmotionalEffectsFromItem(it) {
  const fx = new Set();
  const blob = `${(it.supports || []).join(" ")} ${it.emotional || ""}`.toLowerCase();
  if (/calm|rest|nervous|breath|sleep|ease/i.test(blob)) fx.add("Calming");
  if (/mood|lift|joy|confidence|circulation|bright|playful/i.test(blob)) fx.add("Uplifting");
  if (/ground|steady|wind|slow|mat/i.test(blob)) fx.add("Grounding");
  if (/emotional|pms|release|heart|shoulder|feel/i.test(blob)) fx.add("Emotionally releasing");
  if (fx.size === 0) fx.add("Nourishing");
  return [...fx].slice(0, 3);
}

function renderMoveBodyRead(iso, phase, w, fg) {
  if (!moveBodyRead) return;
  moveBodyRead.textContent = buildMoveBodyRead(iso, phase, w, fg);
}

function renderMoveIntensityScale(phase, w) {
  if (!moveIntensityScale) return;
  const band = inferMoveIntensityBand(phase, w);
  moveIntensityScale.innerHTML = "";
  MOVE_INTENSITY_BANDS.forEach((b) => {
    const d = document.createElement("div");
    d.className = "move-int-band" + (b.id === band ? " is-recommended" : "");
    d.dataset.band = b.id;
    d.innerHTML = `<span class="move-int-band__ic" aria-hidden="true">${b.icon}</span><span class="move-int-band__text"><span class="move-int-band__label">${b.label}</span><span class="move-int-band__hint">${b.hint}</span></span>`;
    moveIntensityScale.appendChild(d);
  });
  if (moveIntensityHint) moveIntensityHint.textContent = buildMoveIntensityHint(band, phase, w);
}

function renderMoveGuidanceCard(phase, mw, fg, band) {
  if (moveBenefitList) {
    moveBenefitList.innerHTML = "";
    buildMoveBenefitList(phase, mw, fg, band).forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      moveBenefitList.appendChild(li);
    });
  }
  if (moveLighterList) {
    moveLighterList.innerHTML = "";
    buildMoveGoLighterList(phase, mw, band).forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      moveLighterList.appendChild(li);
    });
  }
}

function buildMoveSupportTags(item, phase, w) {
  const tags = [];
  if (item.supports?.length) {
    item.supports.forEach((s) => tags.push(s));
  }
  if (item.phases?.length && phase) {
    const ok = item.phases.includes(phase);
    tags.push(ok ? `${phase}‑aligned` : "Explore gently");
  }
  if (w.symptoms?.includes("Cramps")) tags.push("Cramp‑wise care");
  if (w.symptoms?.includes("Fatigue")) tags.push("Low‑demand rhythm");
  if (["Emotional", "Irritated", "Tired"].includes(w.mood)) tags.push("Nervous system kindness");
  if (w.energy === "Low") tags.push("Soft effort");
  return [...new Set(tags)].filter(Boolean).slice(0, 6);
}

function inferMoveDurationMin(item, prefs) {
  if (item.durationMin) return item.durationMin;
  const name = `${item.title || ""}`.toLowerCase();
  if (prefs.quickReset) {
    if (name.includes("breath")) return 5;
    return 10;
  }
  if (/breath|neck|activation|warm/i.test(name)) return 6;
  if (/walk|mobil/i.test(name)) return 14;
  return 18;
}

function inferMoveIntensity(item, phase, w) {
  if (item.intensity) return item.intensity;
  if (w.energy === "Low" || w.symptoms?.includes("Fatigue")) return "Soft · easy";
  if (phase === "Period" || w.symptoms?.includes("Cramps")) return "Gentle";
  if (item.energyFit === "uplifting") return "Bright · optional";
  if (item.energyFit === "rest") return "Restorative";
  return "Easy · steady";
}

function youtubeSearchUrl(query) {
  const q = encodeURIComponent(String(query || "").trim());
  return `https://www.youtube.com/results?search_query=${q}`;
}

function moveSkeleton(count) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const d = document.createElement("div");
    d.className = "move-card move-card--skeleton";
    d.innerHTML =
      '<div class="move-card__media"></div><div class="move-card__body"><div class="move-card__sk-line"></div><div class="move-card__sk-line move-card__sk-line--short"></div></div>';
    frag.appendChild(d);
  }
  return frag;
}

function renderMovePrefsRow() {
  if (!movePrefsRow) return;
  const prefs = ensureMovePrefs();
  const defs = [
    { key: "lowEnergy", label: "Low energy" },
    { key: "stressRelief", label: "Stress relief" },
    { key: "crampEase", label: "Cramp ease" },
    { key: "quickReset", label: "Quick reset" },
    { key: "grounding", label: "Grounding" },
    { key: "softStretch", label: "Soft stretching" },
    { key: "emotionalRelease", label: "Emotional release" },
    { key: "recovery", label: "Recovery" },
    { key: "confidenceBoost", label: "Confidence boost" },
    { key: "nervousCalm", label: "Nervous system calm" },
  ];
  movePrefsRow.innerHTML = "";
  defs.forEach(({ key, label }) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "move-intent";
    b.dataset.pref = key;
    b.setAttribute("aria-pressed", prefs[key] ? "true" : "false");
    if (prefs[key]) b.classList.add("is-on");
    b.textContent = label;
    b.addEventListener("click", () => {
      const p = ensureMovePrefs();
      p[key] = !p[key];
      persistMovePrefs();
      renderMovePrefsRow();
      renderMovePage();
    });
    movePrefsRow.appendChild(b);
  });
}

function syncMoveVizFromWellness(phase, w) {
  if (!moveViz) return;
  const phSlug = phase ? String(phase).toLowerCase() : "unknown";
  moveViz.dataset.phase = phSlug;
  moveViz.dataset.energy = wellnessSlug(w.energy || "Medium");
  moveViz.dataset.mood = wellnessSlug(w.mood || "Calm");
  const fatigue = w.symptoms?.includes("Fatigue") ? "1" : "0";
  moveViz.dataset.fatigue = fatigue;
  const cramps = w.symptoms?.includes("Cramps") ? "1" : "0";
  moveViz.dataset.cramps = cramps;
}

function renderMoveVizCaption(phase, w) {
  if (!moveVizCaption) return;
  if (!phase) {
    moveVizCaption.textContent =
      "Log your period on the calendar when you can — Ayla will tune movement to your rhythm.";
    return;
  }
  const echo = buildWellnessEchoLine(w);
  moveVizCaption.textContent = `${phase} phase · ${echo}`;
}

function fillMoveFeatureMeta(item, phase, w, prefs) {
  if (!moveFeatureMeta) return;
  moveFeatureMeta.innerHTML = "";
  const dur = inferMoveDurationMin(item, prefs);
  const intensity = inferMoveIntensity(item, phase, w);
  const addLi = (label, val) => {
    const li = document.createElement("li");
    li.className = "move-feature-meta__item move-spotlight__meta-item";
    li.innerHTML = `<span class="move-feature-meta__k">${label}</span><span class="move-feature-meta__v">${val}</span>`;
    moveFeatureMeta.appendChild(li);
  };
  addLi("Session", `~${dur} min · ${intensity}`);
  const phaseLine =
    item.phases?.length && phase
      ? item.phases.includes(phase)
        ? `Kind for ${phase}`
        : `Explore gently · written for ${item.phases.join(", ")}`
      : "Cycle‑aware sanctuary";
  addLi("Phase kinship", phaseLine);
  addLi("Source", "Ayla sanctuary · editorial curation");

  const liLinks = document.createElement("li");
  liLinks.className = "move-feature-meta__item move-feature-meta__item--links move-spotlight__meta-item move-spotlight__meta-item--links";

  const ytQ = item.ytQuery || `${item.title} gentle women yoga`;
  const aYt = document.createElement("a");
  aYt.className = "move-feature__link move-spotlight__link";
  aYt.href = youtubeSearchUrl(ytQ);
  aYt.target = "_blank";
  aYt.rel = "noopener noreferrer";
  aYt.textContent = "Open a soft follow‑along search";

  liLinks.appendChild(aYt);
  moveFeatureMeta.appendChild(liLinks);
}

function fillMoveFeature(item, phase, w, prefs) {
  if (!item || !moveFeatureTitle) return;
  const fg = (phase && MOVE_GUIDANCE[phase]) || MOVE_GUIDANCE.Follicular;
  if (moveFeatureEyebrow) {
    moveFeatureEyebrow.textContent = "Your chosen session";
  }
  moveFeatureTitle.textContent = item.title;
  const emotional =
    item.emotional ||
    (item.description
      ? "A quiet match for how you’ve been feeling."
      : "Chosen to feel kind in the body — not like a test.");
  const bodyLine =
    item.body ||
    (item.description
      ? item.description
      : `${item.hint}. ${fg.why || "Listen for ease, and let intensity stay optional."}`);
  if (moveFeatureWhy) {
    moveFeatureWhy.innerHTML = "";
    const em = document.createElement("p");
    em.className = "move-spotlight__emotional";
    em.textContent = emotional;
    const bo = document.createElement("p");
    bo.className = "move-spotlight__bodyline";
    bo.textContent = bodyLine;
    moveFeatureWhy.appendChild(em);
    moveFeatureWhy.appendChild(bo);
  }
  if (moveFeatureMedia) {
    if (item.image) {
      moveFeatureMedia.style.backgroundImage = `url("${String(item.image).replace(/"/g, "")}")`;
      delete moveFeatureMedia.dataset.gradient;
    } else {
      moveFeatureMedia.style.backgroundImage = "none";
      moveFeatureMedia.dataset.gradient = "1";
    }
  }
  if (moveFeatureTags) {
    moveFeatureTags.innerHTML = "";
    moveEmotionalEffectsFromItem(item).forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      moveFeatureTags.appendChild(li);
    });
  }
  fillMoveFeatureMeta(item, phase, w, prefs);
}

function buildMoveCuratedSub(phase, w) {
  const iso = toISODate(new Date());
  if (!phase) return "Four gentle invitations — each optional, none about performance.";
  return pickHomeLine(iso, `move-curated-${phase}`, [
    "Each card shares why it may feel nourishing — less browsing, more clarity.",
    "A small set on purpose so your nervous system can rest too.",
  ]);
}

function renderMoveRail(items, phase, w, prefs) {
  if (!moveRail) return;
  moveRail.innerHTML = "";
  if (!items.length) {
    const p = document.createElement("p");
    p.className = "move-empty";
    p.textContent =
      "Nothing matched yet — soften an intention chip or try a gentler search. Ayla is still with you.";
    moveRail.appendChild(p);
    return;
  }
  items.forEach((it, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "move-card move-card--curated";
    btn.setAttribute("aria-label", `Open details for ${it.title}`);
    const media = document.createElement("span");
    media.className = "move-card__media";
    if (it.image) {
      media.style.backgroundImage = `url("${String(it.image).replace(/"/g, "")}")`;
      delete media.dataset.gradient;
    } else {
      media.style.backgroundImage = "none";
      media.dataset.gradient = "1";
    }
    const body = document.createElement("span");
    body.className = "move-card__body";
    const title = document.createElement("span");
    title.className = "move-card__title";
    title.textContent = it.title;
    const insight = document.createElement("p");
    insight.className = "move-card__insight";
    insight.textContent =
      it.body ||
      it.description ||
      `${it.hint} — supports how you may feel today without asking for proof.`;
    const effects = document.createElement("ul");
    effects.className = "move-card__effects";
    effects.setAttribute("aria-label", "Emotional tone");
    moveEmotionalEffectsFromItem(it).forEach((e) => {
      const li = document.createElement("li");
      li.textContent = e;
      effects.appendChild(li);
    });
    const meta = document.createElement("div");
    meta.className = "move-card__meta";
    const dur = inferMoveDurationMin(it, prefs);
    meta.textContent = `About ${dur} min · ${movePaceLabel(it)} · ${inferMoveIntensity(it, phase, w)}`;
    body.appendChild(title);
    body.appendChild(insight);
    body.appendChild(effects);
    body.appendChild(meta);
    btn.appendChild(media);
    btn.appendChild(body);
    btn.addEventListener("click", () => fillMoveFeature(it, phase, w, prefs));
    moveRail.appendChild(btn);
    if (idx === 0) fillMoveFeature(it, phase, w, prefs);
  });
}

function renderMovePage() {
  if (!moveRail || !moveGreeting) return;
  const iso = toISODate(new Date());
  const phase = currentPhaseToday();
  const fg = (phase && MOVE_GUIDANCE[phase]) || MOVE_GUIDANCE.Follicular;
  const mw = readTodayMovementContext();
  const prefs = ensureMovePrefs();

  moveGreeting.textContent = buildMoveGreeting(phase, mw);
  if (moveLead) moveLead.textContent = buildMoveLead(phase, mw, fg);
  renderMoveBodyRead(iso, phase, mw, fg);
  renderMoveIntensityScale(phase, mw);
  renderMoveGuidanceCard(phase, mw, fg, inferMoveIntensityBand(phase, mw));
  if (moveCuratedSub) moveCuratedSub.textContent = buildMoveCuratedSub(phase, mw);
  renderMovePrefsRow();
  syncMoveVizFromWellness(phase, mw);
  renderMoveVizCaption(phase, mw);

  moveRail.setAttribute("aria-busy", "true");
  moveRail.innerHTML = "";
  moveRail.appendChild(moveSkeleton(4));
  try {
    const items = selectSanctuaryMovements(phase, mw, prefs);
    const q = (moveSearch && moveSearch.value.trim()) || "";
    const filtered = q.length >= 2 ? filterSanctuarySearch(items, q) : items;
    const visible = q.length >= 2 ? filtered.slice(0, 8) : filtered.slice(0, 4);
    renderMoveRail(visible, phase, mw, prefs);
  } finally {
    moveRail.setAttribute("aria-busy", "false");
  }
}

function runMoveSearch(raw) {
  if (!moveRail) return;
  const q = String(raw || "").trim();
  if (q.length < 2) {
    renderMovePage();
    return;
  }
  const phase = currentPhaseToday();
  const mw = readTodayMovementContext();
  const prefs = ensureMovePrefs();

  moveRail.setAttribute("aria-busy", "true");
  moveRail.innerHTML = "";
  moveRail.appendChild(moveSkeleton(4));

  const base = selectSanctuaryMovements(phase, mw, prefs);
  const fromBase = filterSanctuarySearch(base, q);
  const full = AYLA_MOVEMENT_SANCTUARY.map(normalizeSanctuaryItem);
  const fromAll = filterSanctuarySearch(full, q);
  const merged = dedupeMoveByTitle([...fromBase, ...fromAll]);
  const scored = merged
    .map((it) => ({ it, s: scoreSanctuaryItem(it, phase, mw, prefs) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.it);
  renderMoveRail(scored.slice(0, 8), phase, mw, prefs);
  moveRail.setAttribute("aria-busy", "false");
}

function bindMovePageOnce() {
  const mvRoot = document.getElementById("view-movement");
  if (mvRoot && !mvRoot.dataset.parallaxBound) {
    mvRoot.dataset.parallaxBound = "1";
    mvRoot.addEventListener(
      "scroll",
      () => {
        const wrap = mvRoot.querySelector(".move-sanctuary__atmosphere");
        if (!wrap) return;
        wrap.style.setProperty("--move-parallax", `${Math.min(mvRoot.scrollTop * 0.12, 80)}px`);
      },
      { passive: true },
    );
  }
  if (!moveSearch || moveSearch.dataset.bound === "1") return;
  moveSearch.dataset.bound = "1";
  moveSearch.addEventListener("input", () => {
    clearTimeout(moveSearchTimer);
    const v = moveSearch.value;
    moveSearchTimer = setTimeout(() => runMoveSearch(v), 360);
  });
  moveSearch.addEventListener("search", () => runMoveSearch(moveSearch.value));
}

function currentPhaseToday() {
  const periods = state.data?.periods || [];
  const iso = toISODate(new Date());
  return phaseForDate(periods, iso)?.phase || null;
}

function updateScrollFade(el) {
  if (!el) return;
  const atTop = el.scrollTop <= 1;
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
  el.classList.toggle("is-not-top", !atTop);
  el.classList.toggle("is-not-bottom", !atBottom);
}

/* —— Nourishment page: TheMealDB + DummyJSON (no API keys) —— */
const MEALDB_API = "https://www.themealdb.com/api/json/v1/1/";
const DUMMYJSON_RECIPES = "https://dummyjson.com/recipes";

const NOURISH_PREF_DEF = {
  vegetarian: false,
  vegan: false,
  caffeineSensitive: false,
  comfortFood: false,
  quickMeals: false,
  hydrateFocus: false,
  dairyFree: false,
  highProtein: false,
};

let nourishSearchTimer = null;
let nourishAbort = null;

const NOURISH_INTENT_DEFS = [
  { key: "lowEnergy", label: "Low energy" },
  { key: "cravings", label: "Cravings" },
  { key: "bloating", label: "Bloating" },
  { key: "hydration", label: "Hydration" },
  { key: "comfort", label: "Comfort meals" },
  { key: "gentleDigestion", label: "Gentle digestion" },
  { key: "quick", label: "Quick meals" },
];

const NOURISH_FOCUS_DEFS = [
  { key: null, label: "Auto" },
  { key: "energy", label: "Energy" },
  { key: "cravings", label: "Cravings" },
  { key: "digestion", label: "Digestion" },
  { key: "hydration", label: "Hydration" },
];

function ensureNourishPrefs() {
  if (!state.data) return { ...NOURISH_PREF_DEF };
  state.data.nourishPrefs = { ...NOURISH_PREF_DEF, ...(state.data.nourishPrefs || {}) };
  return state.data.nourishPrefs;
}

function ensureNourishContext() {
  ensureNourishPrefs();
  if (!state.data) return;
  if (!Object.prototype.hasOwnProperty.call(state.data, "nourishIntent")) state.data.nourishIntent = null;
  if (!Object.prototype.hasOwnProperty.call(state.data, "nourishFocus")) state.data.nourishFocus = null;
}

function persistNourishSession() {
  if (!state.user || !state.data) return;
  saveUserData(state.user, state.data);
}

function persistNourishPrefs() {
  persistNourishSession();
}

function intentToFocusKey(intent) {
  const m = {
    lowEnergy: "energy",
    cravings: "cravings",
    bloating: "digestion",
    hydration: "hydration",
    comfort: "cravings",
    gentleDigestion: "digestion",
    quick: "energy",
  };
  return m[intent] || null;
}

function buildNourishHeroTitle(phase, w) {
  const ph = phase || "Follicular";
  const e = w.energy;
  if (ph === "Period") {
    if (e === "Low") return "Replenishing meals may feel kindest while your body rebuilds.";
    return "Warm, steady nourishment may support tenderness and renewal today.";
  }
  if (ph === "Follicular") {
    if (e === "High") return "Lighter, energizing plates may match your brighter vitality today.";
    return "Balanced meals may support steadier focus as your rhythm lifts.";
  }
  if (ph === "Ovulation") {
    return "Hydration-aware, protein-conscious meals may suit your outward energy today.";
  }
  return "Grounding meals with steady protein may smooth the days before your bleed.";
}

function buildNourishBodyInsight(phase, w, intent, fg) {
  if (intent === "lowEnergy") return "Protein + hydration may help stabilize your energy today.";
  if (intent === "cravings") return "Pairing snacks with protein may ease blood-sugar swings today.";
  if (intent === "bloating") return "Warm, simply cooked foods may feel gentler on digestion today.";
  if (intent === "hydration") return "Electrolytes and water-rich produce may support clearer focus today.";
  if (intent === "comfort") return "Familiar, warm textures may soothe your nervous system today.";
  if (intent === "gentleDigestion") return "Smaller, slower meals may reduce heaviness through the day.";
  if (intent === "quick") return "One-pan and assemble-fast options keep nourishment doable when time is tight.";
  const line = (fg?.why || "").trim();
  if (line) {
    const dot = line.indexOf(".");
    const one = dot >= 0 ? line.slice(0, dot + 1) : line;
    return one.length > 140 ? `${one.slice(0, 137)}…` : one;
  }
  return "Small, steady choices today can feel easier than a perfect plan.";
}

function buildNourishGoLighterItems(phase, w) {
  const items = [];
  const fg = FOOD_GUIDANCE[phase] || FOOD_GUIDANCE.Follicular;
  if (phase === "Period") {
    items.push("excess caffeine");
    items.push("high-sugar spikes on an empty stomach");
    items.push("dehydration");
  } else if (phase === "Follicular") {
    items.push("skipping meals when you’re busy");
    items.push("very heavy late-night plates");
    items.push("dehydration");
  } else if (phase === "Ovulation") {
    items.push("alcohol stacking");
    items.push("meals too heavy right before intense output");
    items.push("under-hydrating");
  } else {
    items.push("extra sugary snacks solo");
    items.push("long gaps without protein");
    items.push("excess caffeine");
  }
  if (w.symptoms?.includes("Bloating")) items.unshift("carbonated drinks");
  if (w.symptoms?.includes("Headache")) items.push("long caffeine-only mornings");
  const av = (fg?.avoid || "").toLowerCase();
  if (av.includes("caffeine")) items.push("caffeine late in the day");
  return [...new Set(items)].slice(0, 3);
}

function buildIntentQueryBoost(intent) {
  const map = {
    lowEnergy: ["lentil", "oat", "banana", "egg"],
    cravings: ["sweet potato", "yogurt", "nuts", "chocolate"],
    bloating: ["rice", "ginger", "soup", "Potato"],
    hydration: ["watermelon", "cucumber", "orange", "juice"],
    comfort: ["pasta", "soup", "Potato", "pie"],
    gentleDigestion: ["soup", "rice", "fish", "toast"],
    quick: ["sandwich", "salad", "pasta", "wrap"],
  };
  return map[intent] || [];
}

function buildFocusQueryBoost(focus, phase, w, prefs) {
  const veg = prefs.vegetarian || prefs.vegan;
  const vg = prefs.vegan;
  if (focus === "energy") {
    return vg ? ["quinoa", "tofu", "banana"] : veg ? ["egg", "oat", "lentil"] : ["salmon", "chicken", "steak"];
  }
  if (focus === "cravings") {
    return vg ? ["dark chocolate", "dates", "nuts"] : ["yogurt", "berries", "sweet potato"];
  }
  if (focus === "digestion") {
    return ["soup", "rice", "ginger", "fish"];
  }
  if (focus === "hydration") {
    return ["watermelon", "cucumber", "soup", "orange"];
  }
  return [];
}

function buildNourishQueries(phase, w, prefs, intent, storedFocus) {
  const q = [];
  const add = (s) => {
    const t = String(s || "").trim();
    if (t && !q.includes(t)) q.push(t);
  };
  buildIntentQueryBoost(intent).forEach(add);
  const mergedFocus = storedFocus ?? intentToFocusKey(intent);
  buildFocusQueryBoost(mergedFocus, phase, w, prefs).forEach(add);

  const veg = prefs.vegetarian || prefs.vegan;
  const vg = prefs.vegan;

  if (prefs.hydrateFocus) {
    add("orange");
    add("watermelon");
  }
  if (prefs.comfortFood) {
    add(vg ? "pasta" : veg ? "macaroni" : "chicken pie");
    add("Potato");
  }
  if (prefs.quickMeals) {
    add("sandwich");
    add("pasta");
  }
  if (prefs.highProtein) {
    add(vg ? "tofu" : "chicken");
    add("egg");
    add("salmon");
  }

  if (phase === "Period") {
    if (vg) {
      add("lentil");
      add("spinach");
      add("chickpea");
    } else if (veg) {
      add("lentil");
      add("spinach");
      add("soup");
    } else {
      add("beef");
      add("steak");
      add("spinach");
    }
    add("soup");
    if (w.symptoms?.includes("Cramps")) {
      add("ginger");
      add("salmon");
    }
    if (w.symptoms?.includes("Bloating")) add("rice");
    if (w.symptoms?.includes("Headache")) add("Potato");
    if (w.symptoms?.includes("Fatigue")) {
      add("pasta");
      add("oat");
    }
    if (w.flowFeel === "Heavy") {
      add("spinach");
      add("lentil");
    }
  } else if (phase === "Follicular") {
    add(vg ? "tofu" : veg ? "tofu" : "salmon");
    add("salad");
    add("avocado");
    if (!vg) add("egg");
  } else if (phase === "Ovulation") {
    add("tuna");
    add("salad");
    add(vg ? "chickpea" : "chicken");
    add("Broccoli");
  } else {
    add(vg ? "dark chocolate" : "chocolate");
    add("sweet potato");
    add(vg ? "coconut" : "yogurt");
    add("nuts");
  }

  if (w.energy === "Low") {
    add("banana");
    add(vg ? "rice" : "chicken");
  }
  if (w.energy === "High") {
    add("salad");
    add("Shrimp");
  }

  if (["Emotional", "Anxious", "Sensitive"].includes(w.mood)) {
    add("honey");
    if (!prefs.caffeineSensitive) add("tea");
  }
  if (prefs.caffeineSensitive) {
    add("lemon");
    add("herb");
  }

  return q.slice(0, 12);
}

function benefitLabelsForContext(intent, focus, phase) {
  const eff = focus || intentToFocusKey(intent);
  const pools = {
    energy: ["Protein support", "Supports steady energy", "Iron support", "Easy digestion"],
    cravings: ["Comfort nourishment", "Supports steady energy", "Easy digestion", "Protein support"],
    digestion: ["Easy digestion", "Comfort nourishment", "Hydration-friendly", "Supports steady energy"],
    hydration: ["Hydration-friendly", "Easy digestion", "Supports steady energy", "Protein support"],
  };
  if (eff && pools[eff]) return pools[eff];
  if (phase === "Period") return ["Iron support", "Comfort nourishment", "Hydration-friendly", "Protein support"];
  if (phase === "Ovulation") return ["Hydration-friendly", "Protein support", "Easy digestion", "Supports steady energy"];
  if (phase === "Luteal") return ["Supports steady energy", "Comfort nourishment", "Easy digestion", "Protein support"];
  return ["Supports steady energy", "Hydration-friendly", "Protein support", "Easy digestion"];
}

function normalizeMealDb(m) {
  if (!m?.idMeal) return null;
  return {
    id: `m-${m.idMeal}`,
    title: m.strMeal,
    image: m.strMealThumb,
    hint: m.strCategory || "Meal",
    src: "mealdb",
    raw: m,
    url: `https://www.themealdb.com/meal.php?i=${encodeURIComponent(m.idMeal)}`,
  };
}

function normalizeDummy(r) {
  if (!r?.id) return null;
  return {
    id: `d-${r.id}`,
    title: r.name,
    image: r.image,
    hint: (r.tags || []).slice(0, 2).join(" · ") || "Recipe",
    src: "dummyjson",
    raw: r,
    url: null,
  };
}

async function fetchMealDbSearch(term, signal) {
  const url = `${MEALDB_API}search.php?s=${encodeURIComponent(term)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const j = await res.json();
  return Array.isArray(j.meals) ? j.meals.map(normalizeMealDb).filter(Boolean) : [];
}

async function fetchDummySearch(term, signal) {
  const url = `${DUMMYJSON_RECIPES}/search?q=${encodeURIComponent(term)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const j = await res.json();
  const arr = Array.isArray(j.recipes) ? j.recipes : [];
  return arr.map(normalizeDummy).filter(Boolean);
}

async function gatherNourishMeals(queries, signal) {
  const out = [];
  const seen = new Set();
  const slice = queries.slice(0, 5);
  const tasks = slice.flatMap((q) => [
    fetchMealDbSearch(q, signal).then((rows) => rows.slice(0, 2)),
    fetchDummySearch(q, signal).then((rows) => rows.slice(0, 2)),
  ]);
  const chunks = await Promise.all(tasks);
  chunks.flat().forEach((m) => {
    const key = m.title.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(m);
  });
  return out.slice(0, 4);
}

function nourishSkeleton(count) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const d = document.createElement("div");
    d.className = "nourish-card nourish-card--skeleton";
    d.innerHTML =
      '<div class="nourish-card__media"></div><div class="nourish-card__body"><div class="nourish-card__sk-line"></div><div class="nourish-card__sk-line nourish-card__sk-line--short"></div><div class="nourish-card__sk-benefit"></div></div>';
    frag.appendChild(d);
  }
  return frag;
}

function renderNourishPhasePill(phase) {
  if (!nourishPhasePill) return;
  nourishPhasePill.textContent = phase ? `${phase} phase` : "Rhythm unknown";
}

function mountNourishIntentRowOnce() {
  if (!nourishIntentRow || nourishIntentRow.dataset.mounted === "1") return;
  nourishIntentRow.dataset.mounted = "1";
  nourishIntentRow.innerHTML = "";
  NOURISH_INTENT_DEFS.forEach(({ key, label }) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "nourish-intent-chip";
    b.dataset.intent = key;
    b.setAttribute("aria-pressed", "false");
    b.textContent = label;
    b.addEventListener("click", () => {
      if (!state.data) return;
      ensureNourishContext();
      const cur = state.data.nourishIntent;
      state.data.nourishIntent = cur === key ? null : key;
      if (state.data.nourishIntent) state.data.nourishFocus = intentToFocusKey(state.data.nourishIntent);
      else state.data.nourishFocus = null;
      persistNourishSession();
      syncNourishIntentChips();
      renderNourishPage();
    });
    nourishIntentRow.appendChild(b);
  });
}

function syncNourishIntentChips() {
  if (!nourishIntentRow) return;
  const cur = state.data?.nourishIntent;
  $$$(".nourish-intent-chip", nourishIntentRow).forEach((btn) => {
    const on = btn.dataset.intent === cur;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function mountNourishFocusRowOnce() {
  if (!nourishFocusRow || nourishFocusRow.dataset.mounted === "1") return;
  nourishFocusRow.dataset.mounted = "1";
  nourishFocusRow.innerHTML = "";
  NOURISH_FOCUS_DEFS.forEach(({ key, label }) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "nourish-focus-chip";
    b.dataset.focus = key === null ? "" : key;
    b.setAttribute("aria-pressed", "false");
    b.textContent = label;
    b.addEventListener("click", () => {
      if (!state.data) return;
      ensureNourishContext();
      const k = key === null ? null : key;
      state.data.nourishFocus = state.data.nourishFocus === k ? null : k;
      persistNourishSession();
      syncNourishFocusChips();
      renderNourishPage();
    });
    nourishFocusRow.appendChild(b);
  });
}

function syncNourishFocusChips() {
  if (!nourishFocusRow) return;
  const cur = state.data?.nourishFocus;
  $$$(".nourish-focus-chip", nourishFocusRow).forEach((btn) => {
    const k = btn.dataset.focus === "" ? null : btn.dataset.focus;
    const on = k === cur;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function renderNourishSecondaryPrefs() {
  if (!nourishSecondaryPrefs) return;
  const prefs = ensureNourishPrefs();
  const defs = [
    { key: "vegetarian", label: "Vegetarian" },
    { key: "vegan", label: "Vegan" },
    { key: "dairyFree", label: "Dairy-free" },
    { key: "caffeineSensitive", label: "Caffeine-sensitive" },
    { key: "highProtein", label: "High protein" },
    { key: "quickMeals", label: "Quick meals" },
    { key: "hydrateFocus", label: "Hydration focus" },
    { key: "comfortFood", label: "Comfort-forward" },
  ];
  nourishSecondaryPrefs.innerHTML = "";
  defs.forEach(({ key, label }) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "nourish-secondary-pref";
    b.dataset.pref = key;
    b.setAttribute("aria-pressed", prefs[key] ? "true" : "false");
    if (prefs[key]) b.classList.add("is-on");
    b.textContent = label;
    b.addEventListener("click", () => {
      const p = ensureNourishPrefs();
      p[key] = !p[key];
      if (key === "vegan" && p.vegan) p.vegetarian = true;
      persistNourishSession();
      renderNourishSecondaryPrefs();
      renderNourishPage();
    });
    nourishSecondaryPrefs.appendChild(b);
  });
}

function renderNourishAvoidList(phase, w) {
  if (!nourishAvoidList) return;
  const items = buildNourishGoLighterItems(phase, w);
  nourishAvoidList.innerHTML = items.map((t) => `<li>${String(t).replace(/</g, "")}</li>`).join("");
}

function renderNourishRail(meals, phase, w, intent, focus) {
  if (!nourishRail) return;
  nourishRail.innerHTML = "";
  const benefits = benefitLabelsForContext(intent, focus, phase);
  if (!meals.length) {
    const p = document.createElement("p");
    p.className = "nourish-empty";
    p.textContent =
      "No matches yet — check your connection, or try a gentler search. Your rhythm is still here.";
    nourishRail.appendChild(p);
    return;
  }
  meals.forEach((meal, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nourish-card";
    btn.setAttribute("aria-label", `${meal.title}. ${benefits[idx] || benefits[0]}`);
    const media = document.createElement("span");
    media.className = "nourish-card__media";
    if (meal.image) media.style.backgroundImage = `url("${String(meal.image).replace(/"/g, "")}")`;
    const body = document.createElement("span");
    body.className = "nourish-card__body";
    const title = document.createElement("span");
    title.className = "nourish-card__title";
    title.textContent = meal.title;
    const benefit = document.createElement("span");
    benefit.className = "nourish-card__benefit";
    benefit.textContent = benefits[idx] || benefits[0];
    body.appendChild(title);
    body.appendChild(benefit);
    btn.appendChild(media);
    btn.appendChild(body);
    btn.addEventListener("click", () => {
      if (meal.url) window.open(meal.url, "_blank", "noopener,noreferrer");
      else showCalmToast("This idea is for inspiration — no external recipe link for this match.");
    });
    nourishRail.appendChild(btn);
  });
}

async function renderNourishPage() {
  if (!nourishRail || !nourishGreeting) return;
  ensureNourishContext();
  const phase = currentPhaseToday() || "Follicular";
  const w = readTodayWellnessModel();
  const prefs = ensureNourishPrefs();
  const fg = FOOD_GUIDANCE[phase] || FOOD_GUIDANCE.Follicular;
  const intent = state.data?.nourishIntent ?? null;
  const storedFocus = state.data?.nourishFocus ?? null;
  const mergedFocus = storedFocus ?? intentToFocusKey(intent);

  nourishGreeting.textContent = buildNourishHeroTitle(phase, w);
  if (nourishInsight) nourishInsight.textContent = buildNourishBodyInsight(phase, w, intent, fg);
  renderNourishPhasePill(phase);
  renderNourishAvoidList(phase, w);
  syncNourishIntentChips();

  nourishRail.setAttribute("aria-busy", "true");
  nourishRail.innerHTML = "";
  nourishRail.appendChild(nourishSkeleton(4));

  if (nourishAbort) nourishAbort.abort();
  nourishAbort = new AbortController();
  const signal = nourishAbort.signal;

  const queries = buildNourishQueries(phase, w, prefs, intent, storedFocus);
  try {
    let meals = await gatherNourishMeals(queries, signal);
    if (!meals.length) {
      const res = await fetch(`${DUMMYJSON_RECIPES}?limit=8`, { signal });
      if (res.ok) {
        const j = await res.json();
        meals = (Array.isArray(j.recipes) ? j.recipes : []).map(normalizeDummy).filter(Boolean).slice(0, 4);
      }
    }
    renderNourishRail(meals.slice(0, 4), phase, w, intent, mergedFocus);
  } catch (e) {
    if (e.name === "AbortError") return;
    nourishRail.innerHTML =
      '<p class="nourish-empty">Something interrupted the connection. Your choices are saved — try again in a moment.</p>';
  } finally {
    nourishRail.setAttribute("aria-busy", "false");
  }
}

async function runNourishSearch(raw) {
  const q = String(raw || "").trim();
  if (!nourishRail) return;
  if (q.length < 2) {
    renderNourishPage();
    return;
  }
  ensureNourishContext();
  const phase = currentPhaseToday() || "Follicular";
  const w = readTodayWellnessModel();
  const intent = state.data?.nourishIntent ?? null;
  const storedFocus = state.data?.nourishFocus ?? null;
  const mergedFocus = storedFocus ?? intentToFocusKey(intent);

  nourishRail.setAttribute("aria-busy", "true");
  nourishRail.innerHTML = "";
  nourishRail.appendChild(nourishSkeleton(4));
  if (nourishAbort) nourishAbort.abort();
  nourishAbort = new AbortController();
  const signal = nourishAbort.signal;
  try {
    const a = await fetchMealDbSearch(q, signal);
    const b = await fetchDummySearch(q, signal);
    const merged = [];
    const seen = new Set();
    [...a, ...b].forEach((m) => {
      const k = m.title.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      merged.push(m);
    });
    renderNourishRail(merged.slice(0, 4), phase, w, intent, mergedFocus);
  } catch (e) {
    if (e.name === "AbortError") return;
    nourishRail.innerHTML = '<p class="nourish-empty">Search paused — try again softly.</p>';
  } finally {
    nourishRail.setAttribute("aria-busy", "false");
  }
}

function bindNourishPageOnce() {
  mountNourishIntentRowOnce();
  mountNourishFocusRowOnce();
  if (nourishSearch && nourishSearch.dataset.bound !== "1") {
    nourishSearch.dataset.bound = "1";
    nourishSearch.addEventListener("input", () => {
      clearTimeout(nourishSearchTimer);
      const v = nourishSearch.value;
      nourishSearchTimer = setTimeout(() => runNourishSearch(v), 400);
    });
    nourishSearch.addEventListener("search", () => runNourishSearch(nourishSearch.value));
  }
  if (nourishRefineOpenBtn && nourishRefineOpenBtn.dataset.bound !== "1") {
    nourishRefineOpenBtn.dataset.bound = "1";
    nourishRefineOpenBtn.addEventListener("click", () => {
      renderNourishSecondaryPrefs();
      syncNourishFocusChips();
      openModal(nourishRefineModal);
    });
  }
  if (closeNourishRefineBtn && closeNourishRefineBtn.dataset.bound !== "1") {
    closeNourishRefineBtn.dataset.bound = "1";
    closeNourishRefineBtn.addEventListener("click", () => closeModal(nourishRefineModal));
  }
  if (nourishRefineDoneBtn && nourishRefineDoneBtn.dataset.bound !== "1") {
    nourishRefineDoneBtn.dataset.bound = "1";
    nourishRefineDoneBtn.addEventListener("click", () => {
      closeModal(nourishRefineModal);
      renderNourishPage();
    });
  }
  if (nourishRefineModal && nourishRefineModal.dataset.bound !== "1") {
    nourishRefineModal.dataset.bound = "1";
    nourishRefineModal.addEventListener("click", (ev) => {
      if (ev.target === nourishRefineModal) closeModal(nourishRefineModal);
    });
  }
}

function refreshFoodView() {
  ensureNourishContext();
  bindNourishPageOnce();
  renderNourishPage();
}

function refreshMovementView() {
  ensureMovePrefs();
  bindMovePageOnce();
  renderMovePage();
}

// App state
const state = {
  user: null,
  profile: null,
  data: null,
  viewMonth: null,
  selectedISO: null,
  lastRoute: "home",
  /** Latest hero cycle info for energy wave hover (set in renderCycleIntel) */
  heroCycleInfo: null,
  /** Previous `homeRhythmTier` for transition micro-interactions */
  prevHomeRhythmTier: null,
};

// Elements — Home (mobile-first companion)
const homeMFGreet = $$("#homeMFGreet");
const homeMFWhisper = $$("#homeMFWhisper");
const homeLeftStatus = $$("#homeLeftStatus");
const homeLeftGuide = $$("#homeLeftGuide");
const homeNotifyBtn = $$("#homeNotifyBtn") || $$("#topbarNotifyBtn");
const homeNotifyDot = $$("#homeNotifyDot") || $$("#topbarNotifyDot");
const topbarProfileBtn = $$("#topbarProfileBtn");
const homeCycleCard = $$("#homeCycleCard");
const homeCycleKicker = $$("#homeCycleKicker");
const homeCyclePrimary = $$("#homeCyclePrimary");
const homeCycleSecondary = $$("#homeCycleSecondary");
const homeHeroCtaRow = $$("#homeHeroCtaRow");
const homeHeroPrimaryBtn = $$("#homeHeroPrimaryBtn");
const homeHeroSecondaryBtn = $$("#homeHeroSecondaryBtn");
const homeCycleMetrics = $$("#homeCycleMetrics");
const homeCycleBar = $$("#homeCycleBar");
const homeCycleBarFill = $$("#homeCycleBarFill");
const homeCycleDateStart = $$("#homeCycleDateStart");
const homeCycleDateNext = $$("#homeCycleDateNext");
const homeSidebar = $$("#homeSidebar");
const homeSidebarToggle = $$("#homeSidebarToggle");
const homeSidebarBackdrop = $$("#homeSidebarBackdrop");
const homeLayoutRef = $$(".home-layout--reference");
const homeMiniCal = $$("#homeMiniCal");
const homeMiniCalGrid = $$("#homeMiniCalGrid");
const homeMiniCalTitle = $$("#homeMiniCalTitle");
const homeMiniCalPrev = $$("#homeMiniCalPrev");
const homeMiniCalNext = $$("#homeMiniCalNext");
const homeSnapMoodVal = $$("#homeSnapMoodVal");
const homeSnapEnergyVal = $$("#homeSnapEnergyVal");
const homeSnapWaterVal = $$("#homeSnapWaterVal");
const homeSnapSleepVal = $$("#homeSnapSleepVal");
const homeSnapWaterBtn = $$("#homeSnapWaterBtn");
const homeSnapMoodBtn = $$("#homeSnapMoodBtn");
const homeSnapEnergyBtn = $$("#homeSnapEnergyBtn");
const homeSnapSleepBtn = $$("#homeSnapSleepBtn");
const homeSnapSymptomsBtn = $$("#homeSnapSymptomsBtn");
const homeSnapSymptomsVal = $$("#homeSnapSymptomsVal");
const homeSnapMoodSheet = $$("#homeSnapMoodSheet");
const homeSnapEnergySheet = $$("#homeSnapEnergySheet");
const homeSnapSleepSheet = $$("#homeSnapSleepSheet");
const homeWaterSheet = $$("#homeWaterSheet");
const homeSymptomsSheet = $$("#homeSymptomsSheet");
const homePeriodQuickSheet = $$("#homePeriodQuickSheet");
const homePeriodAdaptiveSheet = $$("#homePeriodAdaptiveSheet");
const homePeriodAdaptiveRoot = $$("#homePeriodAdaptiveRoot");
const homePeriodAdaptiveHeadline = $$("#homePeriodAdaptiveHeadline");
const homeSheetMoodRoot = $$("#homeSheetMoodRoot");
const homeSheetEnergyRoot = $$("#homeSheetEnergyRoot");
const homeSheetSleepHoursRoot = $$("#homeSheetSleepHoursRoot");
const homeSheetSleepFeelRoot = $$("#homeSheetSleepFeelRoot");
const homeSheetSymptomsRoot = $$("#homeSheetSymptomsRoot");
const homeSheetSymptomSearch = $$("#homeSheetSymptomSearch");
const homeSheetSymptomRecent = $$("#homeSheetSymptomRecent");
const homeSheetSymptomsSave = $$("#homeSheetSymptomsSave");
const homeSheetPeriodFlowRoot = $$("#homeSheetPeriodFlowRoot");
const homeSheetPeriodPainRoot = $$("#homeSheetPeriodPainRoot");
const homePeriodOpenFullBtn = $$("#homePeriodOpenFullBtn");
const homeWaterPlusBtn = $$("#homeWaterPlusBtn");
const homeWaterMinusBtn = $$("#homeWaterMinusBtn");
const homeRoot = $$("#homeRoot");
const mobileTabLog = $$("#mobileTabLog");
const mobileTabProfile = $$("#mobileTabProfile");
const heroCycleRing = $$("#heroCycleRing");
const heroRingDay = $$("#heroRingDay");
const heroDayPhaseLine = $$("#heroDayPhaseLine");
const homeEnergySubtitle = $$("#homeEnergySubtitle");
const homeEnergyBadge = $$("#homeEnergyBadge");
const homeCycleWhisper = $$("#homeCycleWhisper");
const heroEnergyWave = $$("#heroEnergyWave");
const energyPageWave = $$("#energyPageWave");
const heroWaveTooltip = $$("#heroWaveTooltip");
const energyPageWaveTooltip = $$("#energyPageWaveTooltip");
const heroEnergyChartWrap = $$("#heroEnergyChartWrap");
const energyPageChartWrap = $$("#energyPageChartWrap");
const heroCycleBtn = $$("#heroCycleBtn");
const dashboardShell = $$(".dashboard-shell");
const logoutBtn = $$("#logoutBtn");
const privacyModal = $$("#privacyModal");
const footerPrivacyBtn = $$("#footerPrivacyBtn");
const settingsModal = $$("#settingsModal");
const settingsThemeBtn = $$("#settingsThemeBtn");

const prevMonthBtn = $$("#prevMonthBtn");
const nextMonthBtn = $$("#nextMonthBtn");
const calTitle = $$("#calTitle");
const calendarGrid = $$("#calendarGrid");

const dayPanelEmpty = $$("#dayPanelEmpty");
const dayPanelContent = $$("#dayPanelContent");
const dayPanel = $$("#dayPanel");
const selectedDateLabel = $$("#selectedDateLabel");
const calTodayHeadline = $$("#calTodayHeadline");
const calTodayLead = $$("#calTodayLead");
const calTodayHorizon = $$("#calTodayHorizon");
const calTodayBodyFeel = $$("#calTodayBodyFeel");
const calTodaySupport = $$("#calTodaySupport");
const calPanelPhaseLine = $$("#calPanelPhaseLine");
const calPanelBodyFeel = $$("#calPanelBodyFeel");
const calPanelSupport = $$("#calPanelSupport");
const calPanelUpcoming = $$("#calPanelUpcoming");
const calPanelInsight = $$("#calPanelInsight");
const calPanelCheckinNarrative = $$("#calPanelCheckinNarrative");
const calOpenDayDetailsBtn = $$("#calOpenDayDetailsBtn");

// Calendar day-panel actions use `[data-cal-action]` (see init).

const insNextPeriod = $$("#insNextPeriod");
const insNextPeriodSub = $$("#insNextPeriodSub");
const insFertileWindow = $$("#insFertileWindow");
const insGuidance = $$("#insGuidance");
const insGuidanceSub = $$("#insGuidanceSub");
const insightList = $$("#insightList");

const energyPgNext = $$("#energyPgNext");
const energyPgNextSub = $$("#energyPgNextSub");
const energyPgFertile = $$("#energyPgFertile");
const energyPgGuidance = $$("#energyPgGuidance");
const energyPgGuidanceSub = $$("#energyPgGuidanceSub");
const energyInsightList = $$("#energyInsightList");

const wellnessCanvas = $$("#wellnessCanvas");
const wellnessCanvasEcho = $$("#wellnessCanvasEcho");
const wellnessVizPhaseLabel = $$("#wellnessVizPhaseLabel");
const wellnessProgressCap = $$("#wellnessProgressCap");
const homeCycleLengthInput = $$("#homeCycleLengthInput");
const homePeriodStartInput = $$("#homePeriodStartInput");
const homePeriodDurationInput = $$("#homePeriodDurationInput");
const homeKvPhase = $$("#homeKvPhase");
const homeKvEnergy = $$("#homeKvEnergy");
const homeKvNextPeriod = $$("#homeKvNextPeriod");
const homeKvFertile = $$("#homeKvFertile");
const homeCycleSaveState = $$("#homeCycleSaveState");
const heroEnergyBtn = $$("#heroEnergyBtn");

const checkinModal = $$("#checkinModal");
const checkinTitleDate = $$("#checkinTitleDate");
const closeCheckinBtn = $$("#closeCheckinBtn");
const moodChips = $$("#moodChips");
const energyChips = $$("#energyChips");
const painChips = $$("#painChips");
const checkinFlowChips = $$("#checkinFlowChips");
const checkinSymptomRow = $$("#checkinSymptomRow");
const notesEl = $$("#notes");
const deleteCheckinBtn = $$("#deleteCheckinBtn");
const saveCheckinBtn = $$("#saveCheckinBtn");

const periodModal = $$("#periodModal");
const periodStartEl = $$("#periodStart");
const periodEndEl = $$("#periodEnd");
const flowChips = $$("#flowChips");
const periodError = $$("#periodError");
const deletePeriodBtn = $$("#deletePeriodBtn");
const savePeriodBtn = $$("#savePeriodBtn");
const closePeriodBtn = $$("#closePeriodBtn");
const periodDiscardModal = $$("#periodDiscardModal");
const periodDiscardBtn = $$("#periodDiscardBtn");
const periodDiscardSaveBtn = $$("#periodDiscardSaveBtn");
const periodDiscardContinueBtn = $$("#periodDiscardContinueBtn");

/** Snapshot when period modal opens — used for dirty check on close. */
let periodModalInitial = null;

// Phase learn modal (educational popups from Phase notes)
const phaseLearnModal = $$("#phaseLearnModal");
const phaseLearnIcon = $$("#phaseLearnIcon");
const phaseLearnTitle = $$("#phaseLearnTitle");
const phaseLearnSubtitle = $$("#phaseLearnSubtitle");
const phaseLearnGrid = $$("#phaseLearnGrid");
const phaseLearnNote = $$("#phaseLearnNote");

// Day view modal
const dayModal = $$("#dayModal");
const dayModalDate = $$("#dayModalDate");
const dayModalSubtitle = $$("#dayModalSubtitle");
const dayModalPhase = $$("#dayModalPhase");
const dayModalEmotionLine = $$("#dayModalEmotionLine");
const daySummaryTitle = $$("#daySummaryTitle");
const dayMood = $$("#dayMood");
const dayEnergy = $$("#dayEnergy");
const dayPain = $$("#dayPain");
const dayNotes = $$("#dayNotes");
const dayNoData = $$("#dayNoData");
const dayActionCheckin = $$("#dayActionCheckin");
const dayActionPeriod = $$("#dayActionPeriod");
const dayEnergyFill = $$("#dayEnergyFill");
const dayPainFill = $$("#dayPainFill");
const dayMoodMini = $$("#dayMoodMini");
const dayEnergyLabel = $$("#dayEnergyLabel");
const dayPainLabel = $$("#dayPainLabel");
const dayNotesHint = $$("#dayNotesHint");
const daySmartInsights = $$("#daySmartInsights");
const daySmartInsightsEmpty = $$("#daySmartInsightsEmpty");
const dayInsightsPreview = $$("#dayInsightsPreview");
const dayCompareLine = $$("#dayCompareLine");
const dayComparePreview = $$("#dayComparePreview");
const dayGuidance = $$("#dayGuidance");
const dayInsightsDetails = $$("#dayInsightsDetails");
const dayCompareDetails = $$("#dayCompareDetails");
const dayGuidanceDetails = $$("#dayGuidanceDetails");
const dayDoneBtn = $$("#dayDoneBtn");

if (dayInsightsDetails) {
  dayInsightsDetails.addEventListener("toggle", () => {
    if (!dayInsightsDetails.open) return;
    requestAnimationFrame(() => {
      dayInsightsDetails.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });
}

const moveGreeting = $$("#moveGreeting");
const moveLead = $$("#moveLead");
const moveSearch = $$("#moveSearch");
const moveBodyRead = $$("#moveBodyRead");
const moveIntensityHint = $$("#moveIntensityHint");
const moveIntensityScale = $$("#moveIntensityScale");
const moveBenefitList = $$("#moveBenefitList");
const moveLighterList = $$("#moveLighterList");
const moveCuratedSub = $$("#moveCuratedSub");
const movePrefsRow = $$("#movePrefsRow");
const moveRail = $$("#moveRail");
const moveFeatureEyebrow = $$("#moveFeatureEyebrow");
const moveFeatureTitle = $$("#moveFeatureTitle");
const moveFeatureWhy = $$("#moveFeatureWhy");
const moveFeatureMeta = $$("#moveFeatureMeta");
const moveFeatureTags = $$("#moveFeatureTags");
const moveFeatureMedia = $$("#moveFeatureMedia");
const nourishGreeting = $$("#nourishGreeting");
const nourishInsight = $$("#nourishInsight");
const nourishSearch = $$("#nourishSearch");
const nourishIntentRow = $$("#nourishIntentRow");
const nourishPhasePill = $$("#nourishPhasePill");
const nourishAvoidList = $$("#nourishAvoidList");
const nourishRail = $$("#nourishRail");
const nourishRefineOpenBtn = $$("#nourishRefineOpenBtn");
const nourishRefineModal = $$("#nourishRefineModal");
const closeNourishRefineBtn = $$("#closeNourishRefineBtn");
const nourishRefineDoneBtn = $$("#nourishRefineDoneBtn");
const nourishFocusRow = $$("#nourishFocusRow");
const nourishSecondaryPrefs = $$("#nourishSecondaryPrefs");

function openModal(dlg) {
  if (typeof dlg.showModal === "function") dlg.showModal();
  else dlg.setAttribute("open", "open");
}

function closeModal(dlg) {
  if (typeof dlg.close === "function") dlg.close();
  else dlg.removeAttribute("open");
}

function showCalmToast(message, opts) {
  const duration = typeof opts === "number" ? opts : opts?.duration ?? 2200;
  const extraClass = typeof opts === "object" && opts?.className ? String(opts.className) : "";
  const toast = document.createElement("div");
  toast.className = `calm-toast${extraClass ? ` ${extraClass}` : ""}`;
  toast.setAttribute("role", "status");
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  setTimeout(() => {
    toast.classList.remove("is-visible");
    setTimeout(() => toast.remove(), 220);
  }, duration);
}

/** Strong feedback after a new period log — 2.5s, soft fade (see .calm-toast--linger). */
function showHomePeriodSavedToast(startISO) {
  const today = toISODate(new Date());
  const msg =
    startISO === today
      ? "✓ Period added — Day 1 started today."
      : "✓ Period added — Ayla updated your rhythm.";
  showCalmToast(msg, { duration: 2600, className: "calm-toast--linger" });
}

const PHASE_LEARN = {
  Period: {
    subtitle: "Your body is shifting inward. Softer pacing can feel supportive.",
    sections: [
      { k: "What’s happening", icon: "phase_period", items: ["Hormones are at their lowest.", "The uterine lining is shedding.", "Sensitivity can be higher — kindness helps."] },
      { k: "Energy + emotions", icon: "mood_low", items: ["Lower energy is common.", "More inward / reflective mood.", "Give yourself extra margin."] },
      { k: "Nourish", icon: "phase_follicular", items: ["Iron‑rich foods + vitamin C pairing.", "Warm soups, stews, cooked meals.", "Steady hydration + a little salt."] },
      { k: "Movement", icon: "cal_rest", items: ["Gentle walks, stretching, easy yoga.", "Short sessions can be enough.", "Stop before you feel depleted."] },
      { k: "Nervous system", icon: "energy_low", items: ["Warmth helps: shower, tea, blanket.", "Longer exhales calm the body.", "Lower stimulation in the evening."] },
      { k: "Avoid gently", icon: "pain_medium", items: ["Pushing intensity when cramps are strong.", "Skipping meals (can amplify fatigue).", "Too much caffeine on an empty stomach."] },
    ],
  },
  Follicular: {
    subtitle: "Energy often rises here. It can feel easier to build and begin.",
    sections: [
      { k: "What’s happening", icon: "phase_follicular", items: ["Estrogen starts to rise.", "Follicles develop in the ovaries.", "Mood and motivation often lift."] },
      { k: "Energy + emotions", icon: "mood_okay", items: ["Clearer headspace.", "More curiosity and momentum.", "Great window for planning."] },
      { k: "Nourish", icon: "cal_fertile", items: ["Fresh, colorful meals feel supportive.", "Protein + fiber for steady energy.", "Add minerals: leafy greens, legumes."] },
      { k: "Movement", icon: "energy_medium", items: ["Strength building feels more accessible.", "Try learning a new routine.", "Progress gradually — keep it sustainable."] },
      { k: "Nervous system", icon: "cal_rest", items: ["Use the extra bandwidth wisely.", "Short breaks keep energy clean.", "Let excitement stay gentle."] },
      { k: "Avoid gently", icon: "pain_low", items: ["Overbooking your calendar.", "Going from 0 → 100 too fast.", "Skipping warm‑ups."] },
    ],
  },
  Ovulation: {
    subtitle: "Often the peak. Brightness and connection can feel natural.",
    sections: [
      { k: "What’s happening", icon: "phase_ovulation", items: ["Estrogen peaks, then shifts.", "Ovulation occurs around now.", "Body temperature may rise slightly."] },
      { k: "Energy + emotions", icon: "mood_good", items: ["Confidence and social ease may rise.", "Energy can feel bright and outward.", "Balance intensity with recovery."] },
      { k: "Nourish", icon: "energy_high", items: ["Prioritize protein for steadiness.", "Hydrate a bit more than usual.", "Colorful produce supports recovery."] },
      { k: "Movement", icon: "energy_high", items: ["If you go intense, finish gently.", "Add extra recovery between sets.", "Listen for subtle fatigue."] },
      { k: "Nervous system", icon: "energy_medium", items: ["A soft cool‑down helps you land.", "Breath + stretching keeps you grounded.", "Avoid “all‑or‑nothing” energy."] },
      { k: "Avoid gently", icon: "pain_high", items: ["Burnout from stacking big days.", "Dehydration (can feel like low mood).", "Skipping sleep after high intensity."] },
    ],
  },
  Luteal: {
    subtitle: "Bandwidth can dip. Stability and softness often feel best.",
    sections: [
      { k: "What’s happening", icon: "phase_luteal", items: ["Progesterone rises after ovulation.", "Your body runs a little warmer.", "Cravings can increase as needs shift."] },
      { k: "Energy + emotions", icon: "mood_low", items: ["Lower patience is normal.", "More sensitivity to stress.", "Simplify and protect your focus."] },
      { k: "Nourish", icon: "phase_follicular", items: ["Steady meals prevent energy dips.", "Magnesium‑rich foods can help.", "Warm snacks support grounding."] },
      { k: "Movement", icon: "energy_medium", items: ["Moderate intensity often feels best.", "Longer warm‑ups, softer finishes.", "Choose consistency over extremes."] },
      { k: "Nervous system", icon: "cal_rest", items: ["Earlier wind‑down supports sleep.", "Reduce caffeine later in the day.", "Gentle boundaries feel supportive."] },
      { k: "Avoid gently", icon: "pain_medium", items: ["Skipping meals (cravings amplify).", "Overly intense workouts if sleep is fragile.", "Stacking late nights back‑to‑back."] },
    ],
  },
};

function openPhaseLearn(phase, learnFooter) {
  if (!phaseLearnModal || !phaseLearnGrid) return;
  const cfg = PHASE_LEARN[phase] || PHASE_LEARN.Period;
  const meta = phaseTone(phase);

  if (phaseLearnIcon) phaseLearnIcon.innerHTML = meta.icon;
  if (phaseLearnTitle) phaseLearnTitle.textContent = phase;
  if (phaseLearnSubtitle) phaseLearnSubtitle.textContent = cfg.subtitle;

  phaseLearnGrid.innerHTML = "";
  const sections = Array.isArray(cfg.sections) ? cfg.sections : [];
  if (sections.length === 0) {
    const empty = document.createElement("div");
    empty.className = "micro subtle";
    empty.textContent = "Guidance is loading. Please try again in a moment.";
    phaseLearnGrid.appendChild(empty);
  }

  sections.slice(0, 6).forEach((s) => {
    const card = document.createElement("section");
    card.className = "learn-card";
    card.innerHTML = `
      <div class="learn-card__k">
        <span class="learn-card__icon" aria-hidden="true">${aylaIcon(s.icon)}</span>
        <span class="learn-card__label"></span>
      </div>
      <ul class="learn-card__list"></ul>
    `;
    const label = card.querySelector(".learn-card__label");
    if (label) label.textContent = s.k || "Guidance";
    const ul = card.querySelector("ul");
    (s.items || []).slice(0, 3).forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      ul.appendChild(li);
    });
    phaseLearnGrid.appendChild(card);
  });

  if (phaseLearnNote) {
    phaseLearnNote.textContent = learnFooter || "Gentle guidance for reflection — not medical advice.";
  }

  openModal(phaseLearnModal);
  // Focus close button (icon in head)
  const closeBtn = phaseLearnModal.querySelector(".modal__head .icon-btn");
  if (closeBtn) closeBtn.focus();
}

function bindPhaseNotesLearn() {
  // Phase notes live on the Cycle details view (and may appear elsewhere).
  $$$(".phase-mini[data-phase]").forEach((el) => {
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.setAttribute("aria-label", `Open ${el.dataset.phase} guidance`);

    el.addEventListener("click", () => openPhaseLearn(el.dataset.phase || "Period"));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openPhaseLearn(el.dataset.phase || "Period");
      }
    });
  });

  // Click backdrop to close (native dialog)
  phaseLearnModal?.addEventListener("click", (e) => {
    if (e.target === phaseLearnModal) closeModal(phaseLearnModal);
  });
}

function startOfMonth(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  x.setHours(12, 0, 0, 0);
  return x;
}

function monthTitle(d) {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function mondayIndex(jsDay) {
  return (jsDay + 6) % 7;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function daysBetweenISO(aISO, bISO) {
  const a = parseISODate(aISO);
  const b = parseISODate(bISO);
  return Math.round((b - a) / (24 * 3600 * 1000));
}

function addDaysISO(iso, deltaDays) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + deltaDays);
  return toISODate(d);
}

/** Logged period range containing iso (most recent start if overlapping). */
function periodContainingISO(periods, iso) {
  const matches = (periods || []).filter((p) => iso >= p.startISO && iso <= p.endISO);
  if (!matches.length) return null;
  return matches.sort((a, b) => b.startISO.localeCompare(a.startISO))[0];
}

/** Cycle anchor for a date: active bleed log wins over stale prefs. */
function activeCycleAnchorForDate(iso) {
  const periods = state.data?.periods || [];
  const inLog = periodContainingISO(periods, iso);
  if (inLog) return inLog.startISO;
  return cycleStartForISO(periods, iso, state.data?.cyclePrefs || null);
}

/**
 * Single source of truth for current cycle position.
 * Recalculates from period logs + prefs — never returns stale cached prefs-only state.
 */
function calculateCycle(todayISO) {
  const iso = todayISO || toISODate(new Date());
  const periods = state.data?.periods || [];
  const prefs = state.data?.cyclePrefs || {};
  const cycleLen = clamp(Number(prefs.cycleLength) || averageCycleLength(periods) || 28, 15, 60);
  let periodDur = clamp(Number(prefs.periodDuration) || 5, 2, 10);

  const contained = periodContainingISO(periods, iso);
  const startISO = activeCycleAnchorForDate(iso);

  if (!startISO) {
    return { cycleLen, periodDur, day: null, phase: null, startISO: null };
  }

  if (contained) {
    const day = clamp(daysBetweenISO(contained.startISO, iso) + 1, 1, cycleLen);
    periodDur = clamp(daysBetweenISO(contained.startISO, contained.endISO) + 1, 2, 10);
    return { cycleLen, periodDur, day, phase: "Period", startISO: contained.startISO };
  }

  const day = clamp(daysBetweenISO(startISO, iso) + 1, 1, cycleLen);
  const cyc = cycleForISO(periods, prefs, iso);
  return {
    cycleLen,
    periodDur,
    day,
    phase: cyc?.phase || "Luteal",
    startISO,
  };
}

function syncCyclePrefsFromLogs(todayISO) {
  const iso = todayISO || toISODate(new Date());
  if (!state.data.cyclePrefs) {
    state.data.cyclePrefs = { cycleLength: 28, periodStartISO: null, periodDuration: 5 };
  }
  const anchor = activeCycleAnchorForDate(iso);
  state.data.cyclePrefs.periodStartISO = anchor;
}

function invalidateCycleState() {
  state.heroCycleInfo = null;
}

function cycleDayAndPhase(periods, todayISO) {
  const c = calculateCycle(todayISO);
  return {
    cycleLen: c.cycleLen,
    day: c.day,
    phase: c.phase,
    startISO: c.startISO,
    periodDur: c.periodDur,
  };
}

/** Prefs-based cycle position (aligned with former Cycle Details page). */
function cycleInfoFromPrefs(prefs, todayISO) {
  const cycleLen = clamp(Number(prefs.cycleLength) || 28, 15, 60);
  const periodDur = clamp(Number(prefs.periodDuration) || 5, 2, 10);
  const startISO = prefs.periodStartISO ? String(prefs.periodStartISO) : null;
  if (!startISO) return { cycleLen, periodDur, day: null, phase: null, startISO: null };

  const offset = daysBetweenISO(startISO, todayISO);
  const day = clamp(offset + 1, 1, Math.max(1, cycleLen));

  const ovDay = clamp(cycleLen - 14 + 1, 1, cycleLen);
  const ovuStart = clamp(ovDay - 1, 1, cycleLen);
  const ovuEnd = clamp(ovDay + 1, 1, cycleLen);

  let phase = "Luteal";
  if (day <= periodDur) phase = "Period";
  else if (day < ovuStart) phase = "Follicular";
  else if (day >= ovuStart && day <= ovuEnd) phase = "Ovulation";
  else phase = "Luteal";

  return { cycleLen, periodDur, day, phase, startISO };
}

function predictNextFromCycleStart(startISO, cycleLen) {
  if (!startISO) return null;
  const d = parseISODate(startISO);
  d.setDate(d.getDate() + cycleLen);
  return toISODate(d);
}

function fertileWindowFromCycleStart(startISO, cycleLen) {
  const next = predictNextFromCycleStart(startISO, cycleLen);
  if (!next) return null;
  const ov = parseISODate(next);
  ov.setDate(ov.getDate() - 14);
  const start = new Date(ov);
  start.setDate(start.getDate() - 5);
  const end = new Date(ov);
  end.setDate(end.getDate() + 1);
  return { startISO: toISODate(start), endISO: toISODate(end), ovulationISO: toISODate(ov) };
}

function getHeroCycleInfo(todayISO) {
  return calculateCycle(todayISO);
}

function phaseAccentVar(phase) {
  if (phase === "Period") return "var(--phase-period)";
  if (phase === "Follicular") return "var(--phase-follicular)";
  if (phase === "Ovulation") return "var(--phase-ovulation)";
  if (phase === "Luteal") return "var(--phase-luteal)";
  return "var(--primary)";
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

function setSvg(el, childNodes) {
  if (!el) return;
  el.innerHTML = "";
  childNodes.forEach((n) => el.appendChild(n));
}

function svgEl(tag, attrs = {}) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, String(v)));
  return n;
}

function expectedEnergyRatio(day, cycleLen) {
  // Soft, simple curve: period low → follicular rising → ovulation peak → luteal down
  if (!day) return 0.5;
  const t = (day - 1) / Math.max(1, cycleLen - 1); // 0..1
  // baseline gentle wave
  const base = 0.55 + 0.12 * Math.sin((t - 0.15) * Math.PI * 2);
  // phase shaping
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

function debounce(fn, wait = 280) {
  let t = null;
  return (...args) => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), wait);
  };
}

function writeHomeCycleInputs() {
  const p = state.data?.cyclePrefs || {};
  if (homeCycleLengthInput) homeCycleLengthInput.value = String(p.cycleLength ?? 28);
  if (homePeriodStartInput) homePeriodStartInput.value = p.periodStartISO || "";
  if (homePeriodDurationInput) homePeriodDurationInput.value = String(p.periodDuration ?? 5);
}

function readHomeCycleInputs() {
  if (!state.data.cyclePrefs) {
    state.data.cyclePrefs = { cycleLength: 28, periodStartISO: null, periodDuration: 5 };
  }
  const len = Number(homeCycleLengthInput?.value);
  const dur = Number(homePeriodDurationInput?.value);
  state.data.cyclePrefs.cycleLength = clamp(Number.isFinite(len) && len ? len : 28, 15, 60);
  state.data.cyclePrefs.periodDuration = clamp(Number.isFinite(dur) && dur ? dur : 5, 2, 10);
  state.data.cyclePrefs.periodStartISO = homePeriodStartInput?.value ? String(homePeriodStartInput.value) : null;
}

function renderHomeCycleDetails() {
  writeHomeCycleInputs();
  const todayISO = toISODate(new Date());
  const info = getHeroCycleInfo(todayISO);
  const ratio = expectedEnergyRatio(info.day || 1, info.cycleLen);
  const energyLab = energyLabelFromRatio(ratio);

  if (homeKvPhase) homeKvPhase.textContent = info.phase || "—";
  if (homeKvEnergy) homeKvEnergy.textContent = info.day ? energyLab : "—";

  let nextISO = null;
  if (info.startISO) {
    nextISO = predictNextFromCycleStart(info.startISO, info.cycleLen);
  }
  if (!nextISO) nextISO = predictNextPeriodStart(state.data?.periods || []);

  if (homeKvNextPeriod) homeKvNextPeriod.textContent = nextISO ? formatNiceDate(nextISO) : "—";

  let fw = null;
  if (info.startISO) {
    fw = fertileWindowFromCycleStart(info.startISO, info.cycleLen);
  }
  if (!fw) fw = fertileWindow(state.data?.periods || []);

  if (homeKvFertile) {
    homeKvFertile.textContent = fw ? `${formatNiceDate(fw.startISO)} → ${formatNiceDate(fw.endISO)}` : "—";
  }

  const phaseNotes = {
    Period: {
      current: "During this phase, your body might appreciate warmth, rest, and gentle meals as energy naturally softens.",
      future: "When you reach this phase, consider protecting rest, warmth, and simple nourishment.",
    },
    Follicular: {
      current: "During this phase, your body might appreciate fresh energy, steady nourishment, and one kind intention.",
      future: "When you reach this phase, consider using rising energy for planning, creativity, or gentle strength.",
    },
    Ovulation: {
      current: "During this phase, your body might appreciate hydration, protein, and joyful movement without overextending.",
      future: "When you reach this phase, consider hydration, communication, and balanced intensity.",
    },
    Luteal: {
      current: "During this phase, your body might appreciate steadier meals, earlier rest, and simpler plans.",
      future: "When you reach this phase, consider grounding routines, calmer pacing, and consistent meals.",
    },
  };

  $$$("#view-cycle .phase-mini").forEach((el) => {
    const ph = el.getAttribute("data-phase");
    const note = ph ? phaseNotes[ph] : null;
    const text = el.querySelector(".phase-mini__v");
    const isCurrent = Boolean(info.phase && ph === info.phase);
    if (text && note) {
      const context = info.phase ? (isCurrent ? note.current : note.future) : "As your cycle history grows, Ayla will gently personalize this phase guidance.";
      text.textContent = context;
      el.setAttribute("aria-label", `${ph} phase note. ${text.textContent}`);
    }
    el.style.borderColor = ph ? phaseAccentVar(ph) : "var(--line)";
    el.classList.toggle("is-current", isCurrent);
  });
}

const WELLNESS_MOODS = ["Calm", "Energetic", "Tired", "Emotional", "Irritated", "Sensitive"];
const WELLNESS_FLOW = ["Spotting", "Light", "Medium", "Heavy"];
const WELLNESS_SYMPTOMS = ["Cramps", "Bloating", "Headache", "Fatigue", "Tenderness"];

let wellnessHomeModel = defaultWellnessModel();

function defaultWellnessModel() {
  return {
    mood: "Calm",
    energy: "Medium",
    flowFeel: "Light",
    symptoms: [],
  };
}

function normalizeMoodFromSaved(m) {
  if (!m) return "Calm";
  const legacy = {
    Okay: "Calm",
    Good: "Energetic",
    Bright: "Energetic",
    Low: "Tired",
    Happy: "Energetic",
    Anxious: "Irritated",
    Sensitive: "Sensitive",
    Emotional: "Emotional",
    Energetic: "Energetic",
  };
  const v = legacy[m] || m;
  return WELLNESS_MOODS.includes(v) ? v : "Calm";
}

function readTodayWellnessModel() {
  const iso = toISODate(new Date());
  const c = state.data.checkins[iso] || {};
  const d = defaultWellnessModel();
  const symptoms = Array.isArray(c.symptoms) ? c.symptoms.filter(Boolean) : [];
  return {
    mood: normalizeMoodFromSaved(c.mood) || d.mood,
    energy: c.energy || d.energy,
    flowFeel: c.flowFeel || d.flowFeel,
    symptoms,
  };
}

function persistTodayWellness(model) {
  const iso = toISODate(new Date());
  const prev = state.data.checkins[iso] || {};
  state.data.checkins[iso] = {
    ...prev,
    mood: model.mood,
    energy: model.energy,
    flowFeel: model.flowFeel,
    symptoms: Array.isArray(model.symptoms) ? model.symptoms : [],
  };
  saveUserData(state.user, state.data);
  pulseHomeLogPanel();
  refreshAll();
}

const HOME_SYMPTOM_PICKS = ["Cramps", "Headache", "Acne", "Bloating", "Fatigue", "Tenderness", "Nausea", "Backache"];

function wireHomeSnapSheetsOnce() {
  if (wireHomeSnapSheetsOnce._done) return;
  wireHomeSnapSheetsOnce._done = true;
  $$$("[data-home-sheet-close]").forEach((b) => {
    b.addEventListener("click", () => {
      const dlg = b.closest("dialog");
      if (dlg) closeModal(dlg);
    });
  });
  [homeSnapMoodSheet, homeSnapEnergySheet, homeSnapSleepSheet, homeWaterSheet, homeSymptomsSheet, homePeriodQuickSheet, homePeriodAdaptiveSheet].forEach((dlg) => {
    dlg?.addEventListener("click", (ev) => {
      if (ev.target === dlg) closeModal(dlg);
    });
  });
}

function wireHomeHeroCtasOnce() {
  if (wireHomeHeroCtasOnce._done) return;
  wireHomeHeroCtasOnce._done = true;
  homeHeroPrimaryBtn?.addEventListener("click", () => {
    const todayISO = toISODate(new Date());
    const a = homeHeroPrimaryBtn?.dataset.homeHeroCta;
    if (a === "checkin") openCheckin(todayISO);
    else if (a === "symptoms") openHomeSymptomsSheet();
    else if (a === "energy") openHomeEnergySheet();
    else if (a === "mood") openHomeMoodSheet();
    else if (a === "notes") openCheckin(todayISO);
    else if (a === "adaptive-memory") openAdaptivePeriodFlow({ startStep: "memory-ask" });
    else openAdaptivePeriodFlow();
  });
  homeHeroSecondaryBtn?.addEventListener("click", () => {
    const todayISO = toISODate(new Date());
    const a = homeHeroSecondaryBtn?.dataset.homeHeroCta;
    if (a === "checkin") openCheckin(todayISO);
    else if (a === "symptoms") openHomeSymptomsSheet();
    else if (a === "energy") openHomeEnergySheet();
    else if (a === "mood") openHomeMoodSheet();
    else if (a === "notes") openCheckin(todayISO);
    else openAdaptivePeriodFlow();
  });
  $$("#homeEmptyStartBtn")?.addEventListener("click", () => openCheckin(toISODate(new Date())));
}

function refreshHomeWaterSheetLabel() {
  const el = $$("#homeWaterSheetCount");
  if (!el) return;
  el.textContent = homeWaterVal(toISODate(new Date()));
}

function openHomeWaterSheet() {
  refreshHomeWaterSheetLabel();
  openModal(homeWaterSheet);
}

function openHomeMoodSheet() {
  if (!homeSheetMoodRoot || !homeSnapMoodSheet) return;
  const cur = normalizeMoodFromSaved(readTodayWellnessModel().mood);
  homeSheetMoodRoot.innerHTML = "";
  const opts = [
    { mood: "Calm", lab: "Calm", emo: "🙂" },
    { mood: "Tired", lab: "Tired", emo: "😴" },
    { mood: "Emotional", lab: "Emotional", emo: "😔" },
    { mood: "Energetic", lab: "Bright", emo: "✨" },
    { mood: "Irritated", lab: "Irritated", emo: "😤" },
    { mood: "Sensitive", lab: "Sensitive", emo: "🌙" },
  ];
  opts.forEach(({ mood, lab, emo }) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "home-sheet-chip";
    b.textContent = `${emo} ${lab}`;
    if (cur === mood) b.classList.add("is-on");
    b.addEventListener("click", () => {
      mergeTodayCheckin({ mood });
      showCalmToast("Mood saved gently.");
      closeModal(homeSnapMoodSheet);
    });
    homeSheetMoodRoot.appendChild(b);
  });
  openModal(homeSnapMoodSheet);
}

function openHomeEnergySheet() {
  if (!homeSheetEnergyRoot || !homeSnapEnergySheet) return;
  const cur = readTodayWellnessModel().energy || "Medium";
  homeSheetEnergyRoot.innerHTML = "";
  const opts = [
    { e: "Low", lab: "Soft", emo: "🌙" },
    { e: "Medium", lab: "Steady", emo: "☁️" },
    { e: "High", lab: "Bright", emo: "☀️" },
  ];
  opts.forEach(({ e, lab, emo }) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "home-sheet-chip";
    b.textContent = `${emo} ${lab}`;
    if (cur === e) b.classList.add("is-on");
    b.addEventListener("click", () => {
      mergeTodayCheckin({ energy: e });
      showCalmToast("Energy noted.");
      closeModal(homeSnapEnergySheet);
    });
    homeSheetEnergyRoot.appendChild(b);
  });
  openModal(homeSnapEnergySheet);
}

function openHomeSleepSheet() {
  if (!homeSheetSleepHoursRoot || !homeSheetSleepFeelRoot || !homeSnapSleepSheet) return;
  const iso = toISODate(new Date());
  const c = state.data?.checkins?.[iso] || {};
  const hoursPresets = [
    { min: 300, lab: "Under 6h" },
    { min: 390, lab: "6–7h" },
    { min: 450, lab: "7–8h" },
    { min: 510, lab: "8h+" },
  ];
  homeSheetSleepHoursRoot.innerHTML = "";
  hoursPresets.forEach(({ min, lab }) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "home-sheet-chip";
    b.textContent = lab;
    if (typeof c.sleepMinutes === "number" && Math.abs(c.sleepMinutes - min) < 25) b.classList.add("is-on");
    b.addEventListener("click", () => {
      mergeTodayCheckin({ sleepMinutes: min });
      showCalmToast("Sleep time saved.");
    });
    homeSheetSleepHoursRoot.appendChild(b);
  });
  homeSheetSleepFeelRoot.innerHTML = "";
  ["Restless", "Settled", "Deep"].forEach((q) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "home-sheet-chip";
    b.textContent = q;
    if (c.sleepQuality === q) b.classList.add("is-on");
    b.addEventListener("click", () => {
      mergeTodayCheckin({ sleepQuality: q });
      showCalmToast("Sleep feeling saved.");
    });
    homeSheetSleepFeelRoot.appendChild(b);
  });
  openModal(homeSnapSleepSheet);
}

function recentSymptomsHint() {
  const checkins = state.data?.checkins || {};
  const days = Object.keys(checkins)
    .filter((k) => k <= toISODate(new Date()))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 14);
  const seen = new Set();
  for (const d of days) {
    const sy = checkins[d]?.symptoms;
    if (!Array.isArray(sy)) continue;
    sy.forEach((s) => {
      if (s) seen.add(s);
    });
  }
  const arr = [...seen].filter((s) => HOME_SYMPTOM_PICKS.includes(s)).slice(0, 4);
  if (!arr.length) return "";
  return `Recently: ${arr.join(" · ")}`;
}

function openHomeSymptomsSheet() {
  if (!homeSheetSymptomsRoot || !homeSymptomsSheet) return;
  const iso = toISODate(new Date());
  const prev = state.data.checkins[iso] || {};
  const selected = new Set((Array.isArray(prev.symptoms) ? prev.symptoms : []).filter(Boolean));
  homeSymptomsSheet._symDraft = selected;

  const renderChips = (filter) => {
    const q = (filter || "").trim().toLowerCase();
    homeSheetSymptomsRoot.innerHTML = "";
    HOME_SYMPTOM_PICKS.filter((s) => !q || s.toLowerCase().includes(q)).forEach((sym) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "home-sheet-chip";
      b.textContent = sym;
      b.dataset.symptom = sym;
      const on = homeSymptomsSheet._symDraft.has(sym);
      b.classList.toggle("is-on", on);
      b.addEventListener("click", () => {
        if (homeSymptomsSheet._symDraft.has(sym)) homeSymptomsSheet._symDraft.delete(sym);
        else homeSymptomsSheet._symDraft.add(sym);
        b.classList.toggle("is-on", homeSymptomsSheet._symDraft.has(sym));
      });
      homeSheetSymptomsRoot.appendChild(b);
    });
  };

  if (homeSheetSymptomSearch) {
    homeSheetSymptomSearch.value = "";
    homeSheetSymptomSearch.oninput = () => renderChips(homeSheetSymptomSearch.value);
  }
  renderChips("");
  const hint = recentSymptomsHint();
  if (homeSheetSymptomRecent) {
    homeSheetSymptomRecent.hidden = !hint;
    homeSheetSymptomRecent.textContent = hint;
  }
  openModal(homeSymptomsSheet);
}

function pushPeriodUnique(startISO, endISO, flowFeel) {
  const flow = String(flowFeel || "medium").toLowerCase();
  const normalized = normalizePeriod({ startISO, endISO, flow });
  if (!normalized || !state.user) return false;
  const key = `${normalized.startISO}__${normalized.endISO}__${normalized.flow}`;
  const existingKeys = new Set((state.data?.periods || []).map((p) => `${p.startISO}__${p.endISO}__${p.flow}`));
  if (existingKeys.has(key)) return false;
  state.data.periods.push(normalized);
  sortPeriods(state.data.periods);
  syncCyclePrefsFromLogs(toISODate(new Date()));
  saveUserData(state.user, state.data);
  invalidateCycleState();
  return true;
}

function openAdaptivePeriodFlow(opts = {}) {
  if (!homePeriodAdaptiveSheet || !homePeriodAdaptiveRoot) return;
  const today = toISODate(new Date());
  const w = readTodayWellnessModel();
  let initialStep = dayHasPeriod(today) ? "tune-today" : "bleeding-ask";
  if (opts.startStep === "memory-ask") initialStep = "memory-ask";
  else if (opts.startStep === "bleeding-ask") initialStep = "bleeding-ask";
  else if (opts.startStep === "tune-today") initialStep = "tune-today";
  const prevNotes = (state.data?.checkins?.[today]?.notes || "").trim();
  const ctx = {
    step: initialStep,
    periodStart: today,
    periodEnd: today,
    willAddPeriod: false,
    flow: w.flowFeel || "Light",
    pain: state.data?.checkins?.[today]?.pain || "None",
    notes: prevNotes,
    symptoms: new Set(
      (Array.isArray(state.data?.checkins?.[today]?.symptoms) ? state.data.checkins[today].symptoms : []).filter((s) =>
        HOME_SYMPTOM_PICKS.includes(s),
      ),
    ),
  };

  const closeFlow = () => closeModal(homePeriodAdaptiveSheet);

  const setHeadline = (t) => {
    if (homePeriodAdaptiveHeadline) homePeriodAdaptiveHeadline.textContent = t;
  };

  function buildSymptomListForSave() {
    const prev = state.data.checkins[today] || {};
    const prevSy = Array.isArray(prev.symptoms) ? prev.symptoms.filter(Boolean) : [];
    const picked = [...ctx.symptoms];
    return [...new Set([...prevSy, ...picked])].slice(0, 12);
  }

  function saveTuneOnly() {
    mergeTodayCheckin({
      flowFeel: ctx.flow,
      pain: ctx.pain,
      symptoms: buildSymptomListForSave(),
      notes: (ctx.notes || "").trim(),
    });
    refreshAll();
    showCalmToast("Updated for today.");
    closeFlow();
  }

  function saveTuneWithPeriod() {
    const added = pushPeriodUnique(ctx.periodStart, ctx.periodEnd, ctx.flow);
    if (!added) {
      syncCyclePrefsFromLogs(toISODate(new Date()));
      invalidateCycleState();
    }
    mergeTodayCheckin({
      flowFeel: ctx.flow,
      pain: ctx.pain,
      symptoms: buildSymptomListForSave(),
      notes: (ctx.notes || "").trim(),
    });
    refreshAll();
    if (added) showHomePeriodSavedToast(ctx.periodStart);
    else showCalmToast("Rhythm noted.");
    closeFlow();
  }

  function mkBtn(text, primary, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = primary ? "btn btn--primary btn--block home-period-flow__btn" : "btn btn--soft home-period-flow__btn";
    b.textContent = text;
    b.addEventListener("click", onClick);
    return b;
  }

  function renderFlowPainSymptoms() {
    const frag = document.createDocumentFragment();
    const flLabel = document.createElement("div");
    flLabel.className = "group__label";
    flLabel.textContent = "Flow intensity";
    const flowRow = document.createElement("div");
    flowRow.className = "home-sheet__chips";
    WELLNESS_FLOW.forEach((fl) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "home-sheet-chip";
      b.textContent = fl;
      if (ctx.flow === fl) b.classList.add("is-on");
      b.addEventListener("click", () => {
        ctx.flow = fl;
        render();
      });
      flowRow.appendChild(b);
    });
    const pnLabel = document.createElement("div");
    pnLabel.className = "group__label";
    pnLabel.style.marginTop = "12px";
    pnLabel.textContent = "Comfort (optional)";
    const painRow = document.createElement("div");
    painRow.className = "home-sheet__chips";
    CHECKIN.pain.forEach((p) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "home-sheet-chip";
      b.textContent = p;
      if (ctx.pain === p) b.classList.add("is-on");
      b.addEventListener("click", () => {
        ctx.pain = p;
        render();
      });
      painRow.appendChild(b);
    });
    const syLabel = document.createElement("div");
    syLabel.className = "group__label";
    syLabel.style.marginTop = "12px";
    syLabel.textContent = "Symptoms (optional)";
    const syRow = document.createElement("div");
    syRow.className = "home-sheet__chips";
    HOME_SYMPTOM_PICKS.slice(0, 8).forEach((sym) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "home-sheet-chip";
      b.textContent = sym;
      if (ctx.symptoms.has(sym)) b.classList.add("is-on");
      b.addEventListener("click", () => {
        if (ctx.symptoms.has(sym)) ctx.symptoms.delete(sym);
        else ctx.symptoms.add(sym);
        render();
      });
      syRow.appendChild(b);
    });
    frag.appendChild(flLabel);
    frag.appendChild(flowRow);
    frag.appendChild(pnLabel);
    frag.appendChild(painRow);
    frag.appendChild(syLabel);
    frag.appendChild(syRow);
    const nLabel = document.createElement("div");
    nLabel.className = "group__label";
    nLabel.style.marginTop = "12px";
    nLabel.textContent = "Notes (optional)";
    const ta = document.createElement("textarea");
    ta.className = "field__input home-period-flow__notes";
    ta.rows = 2;
    ta.setAttribute("aria-label", "Optional notes for this entry");
    ta.placeholder = "Anything you want remembered with this entry…";
    ta.value = ctx.notes || "";
    ta.addEventListener("input", () => {
      ctx.notes = ta.value;
    });
    frag.appendChild(nLabel);
    frag.appendChild(ta);
    return frag;
  }

  function render() {
    homePeriodAdaptiveRoot.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "home-period-flow";

    if (ctx.step === "bleeding-ask") {
      setHeadline("Your rhythm");
      const title = document.createElement("h3");
      title.className = "home-period-flow__title";
      title.textContent = "Are you currently on your period?";
      const txt = document.createElement("p");
      txt.className = "home-period-flow__text";
      txt.textContent = "One gentle answer is enough — you can adjust anytime.";
      const row = document.createElement("div");
      row.className = "home-period-flow__actions";
      row.appendChild(
        mkBtn("Yes", false, () => {
          ctx.step = "bleed-when";
          render();
        }),
      );
      row.appendChild(
        mkBtn("No", false, () => {
          ctx.step = "memory-ask";
          render();
        }),
      );
      row.appendChild(
        mkBtn("Unsure", false, () => {
          ctx.step = "unsure-bridge";
          render();
        }),
      );
      wrap.appendChild(title);
      wrap.appendChild(txt);
      wrap.appendChild(row);
    } else if (ctx.step === "unsure-bridge") {
      setHeadline("Take your time");
      const title = document.createElement("h3");
      title.className = "home-period-flow__title";
      title.textContent = "Uncertainty is normal here";
      const txt = document.createElement("p");
      txt.className = "home-period-flow__text";
      txt.textContent = "Choose what feels closest right now — nothing is permanent.";
      const row = document.createElement("div");
      row.className = "home-period-flow__actions";
      row.appendChild(
        mkBtn("I might be bleeding", false, () => {
          ctx.step = "bleed-when";
          render();
        }),
      );
      row.appendChild(
        mkBtn("Probably not bleeding now", false, () => {
          ctx.step = "memory-ask";
          render();
        }),
      );
      row.appendChild(
        mkBtn("Back", false, () => {
          ctx.step = "bleeding-ask";
          render();
        }),
      );
      wrap.appendChild(title);
      wrap.appendChild(txt);
      wrap.appendChild(row);
    } else if (ctx.step === "bleed-when") {
      setHeadline("This bleed");
      const title = document.createElement("h3");
      title.className = "home-period-flow__title";
      title.textContent = "When did this period start?";
      const txt = document.createElement("p");
      txt.className = "home-period-flow__text";
      txt.textContent = "Approximate is fine.";
      const row = document.createElement("div");
      row.className = "home-period-flow__actions";
      row.appendChild(
        mkBtn("It started today", false, () => {
          ctx.periodStart = today;
          ctx.periodEnd = today;
          ctx.willAddPeriod = true;
          ctx.step = "tune-bleeding";
          render();
        }),
      );
      row.appendChild(
        mkBtn("It started earlier", false, () => {
          ctx.step = "bleed-start-date";
          render();
        }),
      );
      row.appendChild(
        mkBtn("Back", false, () => {
          ctx.step = "bleeding-ask";
          render();
        }),
      );
      wrap.appendChild(title);
      wrap.appendChild(txt);
      wrap.appendChild(row);
    } else if (ctx.step === "bleed-start-date") {
      setHeadline("Start day");
      const title = document.createElement("h3");
      title.className = "home-period-flow__title";
      title.textContent = "First day of this bleed";
      const inp = document.createElement("input");
      inp.type = "date";
      inp.className = "field__input home-period-flow__date";
      inp.value = addDaysISO(today, -2);
      inp.max = today;
      const row = document.createElement("div");
      row.className = "home-period-flow__actions";
      row.appendChild(
        mkBtn("Continue", true, () => {
          const s = inp.value;
          if (!s || s > today) return;
          ctx.periodStart = s;
          ctx.periodEnd = today;
          ctx.willAddPeriod = true;
          ctx.step = "tune-bleeding";
          render();
        }),
      );
      row.appendChild(
        mkBtn("Back", false, () => {
          ctx.step = "bleed-when";
          render();
        }),
      );
      wrap.appendChild(title);
      wrap.appendChild(inp);
      wrap.appendChild(row);
    } else if (ctx.step === "memory-ask") {
      setHeadline("Last period");
      const title = document.createElement("h3");
      title.className = "home-period-flow__title";
      title.textContent = "Do you remember approximately when your last period happened?";
      const txt = document.createElement("p");
      txt.className = "home-period-flow__text";
      txt.textContent = "Anything you share helps Ayla meet you where you are.";
      const row = document.createElement("div");
      row.className = "home-period-flow__actions";
      row.appendChild(
        mkBtn("I know the date", false, () => {
          ctx.step = "memory-exact";
          render();
        }),
      );
      row.appendChild(
        mkBtn("Rough timing", false, () => {
          ctx.step = "memory-rough";
          render();
        }),
      );
      row.appendChild(
        mkBtn("I don't remember", false, () => {
          ctx.step = "memory-forget";
          render();
        }),
      );
      row.appendChild(
        mkBtn("Back", false, () => {
          ctx.step = "bleeding-ask";
          render();
        }),
      );
      wrap.appendChild(title);
      wrap.appendChild(txt);
      wrap.appendChild(row);
    } else if (ctx.step === "memory-exact") {
      setHeadline("Last period");
      const title = document.createElement("h3");
      title.className = "home-period-flow__title";
      title.textContent = "First day of that period";
      const inp = document.createElement("input");
      inp.type = "date";
      inp.className = "field__input home-period-flow__date";
      inp.max = today;
      inp.value = addDaysISO(today, -28);
      const hint = document.createElement("p");
      hint.className = "micro subtle home-period-flow__hint";
      hint.textContent = "We’ll use a gentle default length — you can fine-tune anytime.";
      const row = document.createElement("div");
      row.className = "home-period-flow__actions";
      row.appendChild(
        mkBtn("Save", true, () => {
          const s = inp.value;
          if (!s || s > today) return;
          ctx.periodStart = s;
          ctx.periodEnd = addDaysISO(s, 4);
          ctx.willAddPeriod = true;
          ctx.step = "tune-bleeding";
          render();
        }),
      );
      row.appendChild(
        mkBtn("Back", false, () => {
          ctx.step = "memory-ask";
          render();
        }),
      );
      wrap.appendChild(title);
      wrap.appendChild(inp);
      wrap.appendChild(hint);
      wrap.appendChild(row);
    } else if (ctx.step === "memory-rough") {
      setHeadline("Last period");
      const title = document.createElement("h3");
      title.className = "home-period-flow__title";
      title.textContent = "About how long ago was the first day?";
      const row = document.createElement("div");
      row.className = "home-period-flow__actions";
      const pick = (daysBack) => {
        const s = addDaysISO(today, -daysBack);
        ctx.periodStart = s;
        ctx.periodEnd = addDaysISO(s, 4);
        ctx.willAddPeriod = true;
        ctx.step = "tune-bleeding";
        render();
      };
      row.appendChild(mkBtn("Within the last ~10 days", false, () => pick(10)));
      row.appendChild(mkBtn("About 2–3 weeks ago", false, () => pick(21)));
      row.appendChild(mkBtn("About a month ago", false, () => pick(30)));
      row.appendChild(
        mkBtn("Back", false, () => {
          ctx.step = "memory-ask";
          render();
        }),
      );
      wrap.appendChild(title);
      wrap.appendChild(row);
    } else if (ctx.step === "memory-forget") {
      setHeadline("That’s okay");
      const title = document.createElement("h3");
      title.className = "home-period-flow__title";
      title.textContent = "You don’t have to remember perfectly";
      const txt = document.createElement("p");
      txt.className = "home-period-flow__text";
      txt.textContent =
        "That's completely okay. Ayla can still begin understanding your rhythm gently.";
      const row = document.createElement("div");
      row.className = "home-period-flow__actions";
      row.appendChild(
        mkBtn("Continue", true, () => {
          refreshAll();
          showCalmToast("Ayla will learn gently as you go.");
          closeFlow();
        }),
      );
      row.appendChild(
        mkBtn("Back", false, () => {
          ctx.step = "memory-ask";
          render();
        }),
      );
      wrap.appendChild(title);
      wrap.appendChild(txt);
      wrap.appendChild(row);
    } else if (ctx.step === "tune-today") {
      setHeadline("Today on your period");
      const title = document.createElement("h3");
      title.className = "home-period-flow__title";
      title.textContent = "How does today feel?";
      const txt = document.createElement("p");
      txt.className = "home-period-flow__text";
      txt.textContent = "Tune flow and comfort — your dates stay as they are unless you open the full editor.";
      wrap.appendChild(title);
      wrap.appendChild(txt);
      wrap.appendChild(renderFlowPainSymptoms());
      const row = document.createElement("div");
      row.className = "home-period-flow__actions";
      row.appendChild(mkBtn("Save for today", true, saveTuneOnly));
      row.appendChild(
        mkBtn("Edit period dates…", false, () => {
          closeFlow();
          openPeriodModal(today);
        }),
      );
      wrap.appendChild(row);
    } else if (ctx.step === "tune-bleeding") {
      setHeadline("Almost there");
      const title = document.createElement("h3");
      title.className = "home-period-flow__title";
      title.textContent = "Shape this entry";
      const txt = document.createElement("p");
      txt.className = "home-period-flow__text";
      txt.textContent = "Flow, comfort, and anything you want remembered with this bleed.";
      wrap.appendChild(title);
      wrap.appendChild(txt);
      wrap.appendChild(renderFlowPainSymptoms());
      const row = document.createElement("div");
      row.className = "home-period-flow__actions";
      row.appendChild(mkBtn("Save period", true, saveTuneWithPeriod));
      row.appendChild(
        mkBtn("Full date editor…", false, () => {
          closeFlow();
          openPeriodModal(ctx.periodStart);
        }),
      );
      wrap.appendChild(row);
    }

    homePeriodAdaptiveRoot.appendChild(wrap);
  }

  render();
  openModal(homePeriodAdaptiveSheet);
}

function wellnessEnergyIndex(label) {
  if (label === "Low") return 0;
  if (label === "High") return 2;
  return 1;
}

function wellnessEnergyFromIndex(i) {
  return ["Low", "Medium", "High"][Number(i)] || "Medium";
}

function wellnessSlug(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function buildWellnessEchoLine(m) {
  const bits = [];
  if (m.mood && m.mood !== "Calm") bits.push(m.mood.toLowerCase());
  if (m.energy === "High") bits.push("bright energy");
  else if (m.energy === "Low") bits.push("a soft pace");
  else if (m.energy === "Medium") bits.push("a steady center");
  if (m.flowFeel === "Heavy") bits.push("deeper flow");
  else if (m.flowFeel === "Spotting") bits.push("spotting");
  else if (m.flowFeel === "Light") bits.push("a light day");
  if (m.symptoms?.includes("Fatigue")) bits.push("rest would help");
  else if (m.symptoms?.length) bits.push("body signals noted");
  if (!bits.length) return "Your rhythm is unfolding — touch what feels true.";
  return `Ayla senses ${bits.join(" · ")} — you’re being heard.`;
}

function wellnessPhaseSlugForViz() {
  const p = currentPhaseToday();
  if (!p) return "unknown";
  return String(p).toLowerCase();
}

function updateWellnessCanvas(model) {
  if (!wellnessCanvas) return;
  wellnessCanvas.dataset.energy = wellnessSlug(model.energy);
  wellnessCanvas.dataset.mood = wellnessSlug(model.mood);
  wellnessCanvas.dataset.flow = wellnessSlug(model.flowFeel);
  const n = model.symptoms?.length || 0;
  wellnessCanvas.dataset.symptoms = String(Math.min(n, 4));
  wellnessCanvas.dataset.phase = wellnessPhaseSlugForViz();
  wellnessCanvas.dataset.fatigue = model.symptoms?.includes("Fatigue") ? "1" : "0";
  wellnessCanvas.dataset.emotional = ["Anxious", "Emotional", "Sensitive", "Irritated"].includes(model.mood) ? "1" : "0";
  wellnessCanvas.dataset.flowheavy = model.flowFeel === "Heavy" ? "1" : "0";
  if (wellnessVizPhaseLabel) {
    const ph = currentPhaseToday();
    wellnessVizPhaseLabel.textContent = ph ? `${ph}` : "";
  }
  if (wellnessCanvasEcho) {
    const ph = currentPhaseToday();
    const mood = model.mood || "Calm";
    const enShort =
      model.energy === "High" ? "Bright energy" : model.energy === "Low" ? "Soft energy" : "Steady energy";
    wellnessCanvasEcho.textContent = ph ? `${ph} · ${mood} · ${enShort}` : `${mood} · ${enShort}`;
  }
  syncHomeAtmosphere(model);
  syncHomeSignature(model, currentPhaseToday());
  syncWellnessPhaseLegend();
  clearTimeout(wellnessCanvas._vizPulseDebounce);
  wellnessCanvas._vizPulseDebounce = setTimeout(() => pulseWellnessCanvasReaction(), 90);
}

function syncSegmentRow(root, val, cls) {
  if (!root) return;
  $$$("." + cls, root).forEach((btn) => {
    const on = btn.dataset.value === val;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

/** Map saved mood onto the four Home quick-log chips (Irritated → Emotional). */
function moodForHomeQuickLog(m) {
  const v = normalizeMoodFromSaved(m);
  if (v === "Irritated") return "Emotional";
  return v;
}

function setHomeMoodPillOn(root, value) {
  if (!root) return;
  $$$(".home-mood-pill", root).forEach((btn) => {
    const on = btn.dataset.mood === value;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    if (on) {
      btn.classList.remove("home-mood-pill--pop");
      void btn.offsetWidth;
      btn.classList.add("home-mood-pill--pop");
    }
  });
}

function syncHomeEnergySeg(root, energyLabel) {
  if (!root) return;
  const key = energyLabel === "High" ? "High" : energyLabel === "Low" ? "Low" : "Medium";
  $$$(".home-energy-seg__btn", root).forEach((btn) => {
    const on = btn.dataset.energy === key;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    if (on) {
      btn.classList.remove("home-energy-seg__btn--pop");
      void btn.offsetWidth;
      btn.classList.add("home-energy-seg__btn--pop");
    }
  });
}

function mountHomeMoodPills(root, onCommit) {
  if (!root || root.dataset.homeMoodMount === "v3") return;
  root.dataset.homeMoodMount = "v3";
  root.innerHTML = "";
  const emoji = {
    Calm: "🙂",
    Energetic: "✨",
    Tired: "😴",
    Emotional: "😔",
  };
  const pills = [
    { mood: "Calm", label: "Calm" },
    { mood: "Tired", label: "Tired" },
    { mood: "Emotional", label: "Emotional" },
    { mood: "Energetic", label: "Energetic" },
  ];
  pills.forEach(({ mood, label }) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "home-mood-pill";
    b.dataset.mood = mood;
    b.setAttribute("aria-pressed", "false");
    const ic = document.createElement("span");
    ic.className = "home-mood-pill__emo";
    ic.setAttribute("aria-hidden", "true");
    ic.textContent = emoji[mood] || emoji.Calm;
    const tx = document.createElement("span");
    tx.className = "home-mood-pill__lab";
    tx.textContent = label;
    b.appendChild(ic);
    b.appendChild(tx);
    b.addEventListener("click", () => {
      wellnessHomeModel.mood = mood;
      setHomeMoodPillOn(root, mood);
      onCommit();
    });
    root.appendChild(b);
  });
}

function mountHomeEnergySeg(root, onCommit) {
  if (!root || root.dataset.homeEnergyMount === "v3") return;
  root.dataset.homeEnergyMount = "v3";
  root.innerHTML = "";
  const emoji = { Low: "🌙", Medium: "☁️", High: "☀️" };
  const opts = [
    { energy: "Low", label: "Low" },
    { energy: "Medium", label: "Balanced" },
    { energy: "High", label: "Bright" },
  ];
  opts.forEach(({ energy, label }) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "home-energy-seg__btn";
    b.dataset.energy = energy;
    b.setAttribute("aria-pressed", "false");
    const ic = document.createElement("span");
    ic.className = "home-energy-seg__emo";
    ic.setAttribute("aria-hidden", "true");
    ic.textContent = emoji[energy] || emoji.Medium;
    const tx = document.createElement("span");
    tx.textContent = label;
    b.appendChild(ic);
    b.appendChild(tx);
    b.addEventListener("click", () => {
      wellnessHomeModel.energy = energy;
      syncHomeEnergySeg(root, energy);
      onCommit();
    });
    root.appendChild(b);
  });
}

function syncWellnessHomeFromState() {
  wellnessHomeModel = readTodayWellnessModel();
  updateWellnessCanvas(wellnessHomeModel);
}

function mountSegmentRow(root, options, cls, current, onPick) {
  if (!root) return;
  root.innerHTML = "";
  options.forEach((label) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.dataset.value = label;
    b.textContent = label;
    b.setAttribute("aria-pressed", label === current ? "true" : "false");
    if (label === current) b.classList.add("is-on");
    b.addEventListener("click", () => onPick(label));
    root.appendChild(b);
  });
}

function initWellnessHome() {
  wellnessHomeModel = readTodayWellnessModel();
  updateWellnessCanvas(wellnessHomeModel);
  bindHomeOrbInteractionsOnce();
}

const saveHomePrefsDebounced = debounce(() => {
  readHomeCycleInputs();
  saveUserData(state.user, state.data);
  if (homeCycleSaveState) homeCycleSaveState.textContent = "Saved locally.";
  refreshAll();
}, 280);

function renderHeroCycleRing(info) {
  if (!heroCycleRing) return;

  const { cycleLen, day, phase } = info;
  const periodDur = clamp(Number(info.periodDur) || 5, 2, 10);

  const cx = 110;
  const cy = 110;
  const r = 78;
  const strokeW = 12;
  const gapDeg = 2.2;
  const startBase = -90;

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
      opacity: phase && s.phase === phase ? "0.98" : "0.62",
    });
  });

  const dot = (() => {
    if (!day) {
      const pt = polarToCartesian(cx, cy, r, -90);
      return svgEl("circle", { cx: pt.x, cy: pt.y, r: "5", fill: "rgba(239,127,168,.14)" });
    }
    const ang = startBase + ((day - 1) / cycleLen) * 360;
    const pt = polarToCartesian(cx, cy, r, ang);
    return svgEl("circle", {
      cx: pt.x,
      cy: pt.y,
      r: "6.2",
      fill: phaseAccentVar(phase),
      stroke: "rgba(253,245,248,.92)",
      "stroke-width": "2.2",
    });
  })();

  setSvg(heroCycleRing, [bg, ...paths, dot]);

  if (heroRingDay) heroRingDay.textContent = day ? String(day) : "—";
}

function renderEnergyWaveInto(svgRoot, { cycleLen, day, phase }, opts = {}) {
  if (!svgRoot) return;
  const gradId = opts.gradId || "energyAreaGrad";
  const lineId = opts.lineId || "energyWaveLine";

  const W = 720;
  const H = 120;
  const padX = 22;
  const padY = 14;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const bottomY = H - padY;

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

  const last = points[points.length - 1];
  const first = points[0];
  const areaD = `${dPath} L ${last.x.toFixed(2)} ${bottomY.toFixed(2)} L ${first.x.toFixed(2)} ${bottomY.toFixed(2)} Z`;

  const defs = svgEl("defs", {});
  const glowId = `${lineId}Glow`;
  const grad = svgEl("linearGradient", {
    id: gradId,
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1",
  });
  const accent = phaseAccentVar(phase);
  grad.appendChild(svgEl("stop", { offset: "0%", "stop-color": accent, "stop-opacity": "0.32" }));
  grad.appendChild(svgEl("stop", { offset: "55%", "stop-color": accent, "stop-opacity": "0.08" }));
  grad.appendChild(svgEl("stop", { offset: "100%", "stop-color": accent, "stop-opacity": "0" }));
  defs.appendChild(grad);
  const glow = svgEl("filter", {
    id: glowId,
    x: "-8%",
    y: "-18%",
    width: "116%",
    height: "136%",
    "color-interpolation-filters": "sRGB",
  });
  glow.appendChild(svgEl("feGaussianBlur", { stdDeviation: "1.45", result: "softBlur" }));
  glow.appendChild(svgEl("feMerge", {}));
  const merge = glow.querySelector("feMerge");
  merge?.appendChild(svgEl("feMergeNode", { in: "softBlur" }));
  merge?.appendChild(svgEl("feMergeNode", { in: "SourceGraphic" }));
  defs.appendChild(glow);

  const base = svgEl("path", {
    d: `M ${padX} ${bottomY.toFixed(2)} L ${(W - padX).toFixed(2)} ${bottomY.toFixed(2)}`,
    fill: "none",
    stroke: "rgba(239,127,168,.08)",
    "stroke-width": "1.4",
  });

  const area = svgEl("path", {
    d: areaD,
    fill: `url(#${gradId})`,
    stroke: "none",
    opacity: "1",
  });

  const strokeW = opts.strokeWidth ?? 3;
  const lineGlow = svgEl("path", {
    d: dPath,
    fill: "none",
    stroke: accent,
    "stroke-width": String(strokeW + 4.8),
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    opacity: "0.18",
    filter: `url(#${glowId})`,
  });
  const lineBase = svgEl("path", {
    d: dPath,
    fill: "none",
    stroke: accent,
    "stroke-width": String(strokeW + 2.2),
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    opacity: "0.18",
  });
  const line = svgEl("path", {
    id: lineId,
    d: dPath,
    fill: "none",
    stroke: accent,
    "stroke-width": String(strokeW),
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    opacity: "1",
  });

  const dotR = opts.dotR ?? 6;
  const todayDot = (() => {
    const safeDay = day || 1;
    const t = (safeDay - 1) / Math.max(1, cycleLen - 1);
    const x = padX + t * innerW;
    const rRatio = expectedEnergyRatio(safeDay, cycleLen);
    const y = padY + (1 - rRatio) * innerH;
    return svgEl("circle", {
      cx: x,
      cy: y,
      r: String(dotR),
      fill: accent,
      stroke: "rgba(253,245,248,.94)",
      "stroke-width": "2.4",
      opacity: day ? "1" : "0.5",
    });
  })();

  const hoverDot = svgEl("circle", {
    id: `${lineId}HoverDot`,
    class: "energy-hover-dot",
    cx: points[0].x,
    cy: points[0].y,
    r: String(dotR * 0.82),
    fill: accent,
    stroke: "rgba(253,245,248,.96)",
    "stroke-width": "2.2",
    opacity: "0",
  });

  const hover = svgEl("rect", { x: "0", y: "0", width: String(W), height: String(H), fill: "transparent" });
  hover.style.cursor = opts.skipHoverRect ? "default" : "crosshair";

  const nodes = opts.skipHoverRect ? [defs, base, area, lineGlow, lineBase, line, todayDot, hoverDot] : [defs, base, area, lineGlow, lineBase, line, todayDot, hoverDot, hover];

  setSvg(svgRoot, nodes);

  requestAnimationFrame(() => {
    const el = svgRoot.querySelector(`#${lineId}`);
    const glowEl = lineGlow;
    const baseEl = lineBase;
    if (!el) return;
    const len = el.getTotalLength();
    [el, glowEl, baseEl].forEach((node) => {
      node.style.strokeDasharray = String(len);
      node.style.strokeDashoffset = String(len);
    });
    requestAnimationFrame(() => {
      [el, glowEl, baseEl].forEach((node) => {
        node.style.transition = "stroke-dashoffset 1050ms cubic-bezier(0.22, 1, 0.36, 1)";
        node.style.strokeDashoffset = "0";
      });
    });
  });
}

function renderHeroEnergyWave(info) {
  renderEnergyWaveInto(heroEnergyWave, info, {
    gradId: "heroEnergyAreaGrad",
    lineId: "heroEnergyLine",
    strokeWidth: 4,
    dotR: 6.5,
  });
}

function renderEnergyPageWave(info) {
  renderEnergyWaveInto(energyPageWave, info, {
    gradId: "energyPageAreaGrad",
    lineId: "energyPageLine",
    strokeWidth: 3.6,
    skipHoverRect: true,
  });
}

function bindHeroWaveHoverOnce() {
  if (bindHeroWaveHoverOnce._done) return;
  bindHeroWaveHoverOnce._done = true;

  const W = 720;
  const padX = 22;
  const padY = 14;
  const innerW = W - padX * 2;
  const innerH = 120 - padY * 2;

  function showWaveTooltip({ wrap, svg, tooltip, clientX, clientY, lock = false }) {
    const info = state.heroCycleInfo;
    if (!info || !tooltip || !svg || !wrap) return;
    const cycleLen = info.cycleLen;
    const rect = svg.getBoundingClientRect();
    const x = (clientX - rect.left) * (W / rect.width);
    const t = clamp((x - padX) / innerW, 0, 1);
    const d = 1 + Math.round(t * (cycleLen - 1));
    const ratio = expectedEnergyRatio(d, cycleLen);
    const label = energyLabelFromRatio(ratio);
    const dot = svg.querySelector(".energy-hover-dot");
    if (dot) {
      dot.setAttribute("cx", String(padX + t * innerW));
      dot.setAttribute("cy", String(padY + (1 - ratio) * innerH));
      dot.setAttribute("opacity", "1");
      dot.classList.add("is-active");
    }
    tooltip.textContent = `Day ${d}: ${label} energy`;
    tooltip.hidden = false;
    const wrapRect = wrap.getBoundingClientRect();
    const lx = clamp(clientX - wrapRect.left, 16, wrapRect.width - 16);
    const ly = clamp(clientY - wrapRect.top, 16, wrapRect.height - 16);
    tooltip.style.left = `${lx}px`;
    tooltip.style.top = `${ly}px`;
    tooltip.classList.add("is-visible");
    tooltip.classList.toggle("is-locked", lock);
  }

  function hideWaveTooltip(tooltip) {
    if (!tooltip || tooltip.classList.contains("is-locked")) return;
    const wrap = tooltip.closest(".energy-card__chart, .energy-page__viz");
    const dot = wrap?.querySelector(".energy-hover-dot");
    if (dot) {
      dot.setAttribute("opacity", "0");
      dot.classList.remove("is-active");
    }
    tooltip.classList.remove("is-visible");
    setTimeout(() => {
      if (!tooltip.classList.contains("is-visible")) tooltip.hidden = true;
    }, 160);
  }

  function bindWaveTooltip(wrap, svg, tooltip) {
    if (!wrap || !svg || !tooltip) return;
    wrap.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch" && tooltip.classList.contains("is-locked")) return;
      showWaveTooltip({ wrap, svg, tooltip, clientX: e.clientX, clientY: e.clientY });
    });
    wrap.addEventListener("pointerleave", () => hideWaveTooltip(tooltip));
    wrap.addEventListener("pointerdown", (e) => {
      const lock = e.pointerType === "touch" || e.pointerType === "pen";
      if (lock && tooltip.classList.contains("is-locked")) {
        tooltip.classList.remove("is-locked");
        hideWaveTooltip(tooltip);
        return;
      }
      showWaveTooltip({ wrap, svg, tooltip, clientX: e.clientX, clientY: e.clientY, lock });
    });
    wrap.addEventListener("blur", () => hideWaveTooltip(tooltip), true);
  }

  bindWaveTooltip(heroEnergyChartWrap, heroEnergyWave, heroWaveTooltip);
  bindWaveTooltip(energyPageChartWrap, energyPageWave, energyPageWaveTooltip);
}

function renderCycleIntel() {
  const todayISO = toISODate(new Date());
  const info = getHeroCycleInfo(todayISO);
  state.heroCycleInfo = info;

  if (heroDayPhaseLine) {
    if (!info.day) {
      heroDayPhaseLine.textContent = "Add period dates to begin";
    } else {
      heroDayPhaseLine.textContent = `Day ${info.day} · ${info.phase}`;
    }
  }

  const rHero = info.day ? expectedEnergyRatio(info.day, info.cycleLen) : null;
  const labHero = rHero != null ? energyLabelFromRatio(rHero) : null;

  if (homeEnergySubtitle) {
    if (info.day && info.phase && labHero) {
      const pace =
        labHero === "High" ? "Gentle rise" : labHero === "Medium" ? "Steady rhythm" : "Soft pace";
      homeEnergySubtitle.textContent = `${info.phase} · ${pace}`;
    } else {
      homeEnergySubtitle.textContent = "Log your cycle to see the curve";
    }
  }

  if (homeEnergyBadge) {
    if (labHero === "High") homeEnergyBadge.textContent = "Rising";
    else if (labHero === "Medium") homeEnergyBadge.textContent = "Steady";
    else if (labHero === "Low") homeEnergyBadge.textContent = "Soft";
    else homeEnergyBadge.textContent = "—";
  }

  if (homeCycleWhisper) {
    if (info.day && info.phase && labHero) {
      const w =
        labHero === "High"
          ? "Energy rising gently"
          : labHero === "Medium"
            ? "A balanced rhythm today"
            : "Softness is productive too";
      homeCycleWhisper.textContent = w;
      homeCycleWhisper.hidden = false;
    } else {
      homeCycleWhisper.textContent = "";
      homeCycleWhisper.hidden = true;
    }
  }

  renderHeroCycleRing(info);
  renderHeroEnergyWave(info);
  renderEnergyPageWave(info);
  renderHomeCycleDetails();
}

function dayHasPeriod(iso) {
  const ps = state.data?.periods || [];
  for (const p of ps) if (iso >= p.startISO && iso <= p.endISO) return true;
  return false;
}

function dayHasCheckin(iso) {
  return Boolean(state.data?.checkins?.[iso]);
}

function isPredictedPeriodDay(iso) {
  const nextStart = predictNextPeriodStart(state.data?.periods || []);
  if (!nextStart) return false;
  const a = parseISODate(nextStart);
  const b = new Date(a);
  b.setDate(b.getDate() + 4);
  return iso >= toISODate(a) && iso <= toISODate(b);
}

function fillCalUl(el, lines) {
  if (!el) return;
  el.innerHTML = "";
  (lines || []).forEach((t) => {
    const s = String(t || "").trim();
    if (!s) return;
    const li = document.createElement("li");
    li.textContent = s;
    el.appendChild(li);
  });
}

function dedupeStrings(items) {
  const seen = new Set();
  const out = [];
  for (const t of items || []) {
    const s = String(t || "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function calPhaseEnergyTag(phase) {
  const map = {
    Period: "REST FORWARD",
    Follicular: "ENERGY RISING",
    Ovulation: "PEAK OUTWARD",
    Luteal: "SOFTER BANDWIDTH",
  };
  return map[phase] || "RHYTHM FORMING";
}

function calEnergyLead(iso, phase, w) {
  if (!phase) {
    return pickHomeLine(iso, "cel-nophase", [
      "Log your last period once so today’s arc can sharpen — stillness here is normal.",
      "Your map is still gathering — one date unlocks a gentler forecast.",
    ]);
  }
  if (w.energy === "High" && phase === "Follicular") return "Energy is likely rising through this stretch.";
  if (w.energy === "Low") return "Your body may prefer softer pacing today — that still counts as care.";
  if (phase === "Period") return "A rest-forward rhythm today — warmth and slower asks help.";
  if (phase === "Follicular") return "Vitality often builds quietly here — let focus arrive without forcing it.";
  if (phase === "Ovulation") return "Outward brightness may feel easier today — hydrate and keep margin.";
  if (phase === "Luteal") return "Bandwidth may narrow — simplify where you can.";
  return "Today invites honest pacing rather than performance.";
}

function calBodyFeelBullets(iso, phase, w) {
  if (!phase) {
    return [
      pickHomeLine(iso, "cbf-n1", ["Signals may feel quieter", "Curiosity beats judgment", "Warm fluids still land"]),
      pickHomeLine(iso, "cbf-n2", ["Rhythm gathers with each log", "Gentle movement is still movement", "Short lists protect focus"]),
      pickHomeLine(iso, "cbf-n3", ["Body cues may be subtle", "Hydration supports patience", "One soft win counts"]),
    ];
  }
  if (w.symptoms?.includes("Cramps")) {
    return [
      pickHomeLine(iso, "cbf-cramp1", ["Comfort signals read louder", "Warmth may travel easier than hustle", "Pelvis busy — pace honors it"]),
      pickHomeLine(iso, "cbf-cramp2", ["Tension may pool lower", "Shorter sits with micro-stretches help", "Hot liquids often soften edges"]),
      pickHomeLine(iso, "cbf-cramp3", ["Gentleness reads as intelligent", "Inflammation-sensitive day", "Honor rest without guilt"]),
    ];
  }
  const key = `${phase}|${w.energy}|${w.mood}`;
  if (phase === "Period") {
    return [
      pickHomeLine(iso, `cbf-p1|${key}`, ["More inward pull", "Comfort craving rises", "Nervous system may want quieter rooms"]),
      pickHomeLine(iso, `cbf-p2|${key}`, ["Sleep pressure may shift", "Iron-friendly snacks land well", "Emotional edges can feel softer"]),
      pickHomeLine(iso, `cbf-p3|${key}`, ["Bandwidth for social noise may shrink", "Warm layers help grounding", "Honesty about limits protects you"]),
    ];
  }
  if (phase === "Follicular") {
    return [
      pickHomeLine(iso, `cbf-f1|${key}`, ["Mental clarity may lift", "Social energy can feel a touch lighter", "Physical steadiness often returns"]),
      pickHomeLine(iso, `cbf-f2|${key}`, ["Motivation without urgency", "Stamina stacks gradually", "Ideas arrive without needing to chase them"]),
      pickHomeLine(iso, `cbf-f3|${key}`, ["Creativity hiccups less", "Voice may feel steadier", "Movement asks feel lighter"]),
    ];
  }
  if (phase === "Ovulation") {
    return [
      pickHomeLine(iso, `cbf-o1|${key}`, ["Outward brightness may show", "Hydration matters more than usual", "Pace still deserves margin"]),
      pickHomeLine(iso, `cbf-o2|${key}`, ["Confidence can feel more accessible", "Heat sensitivity may rise slightly", "Communication flows easier"]),
      pickHomeLine(iso, `cbf-o3|${key}`, ["Post‑peak recovery is still near", "Avoid overfilling the diary", "Strength without rigidity"]),
    ];
  }
  return [
    pickHomeLine(iso, `cbf-l1|${key}`, ["Sensitivity can read higher", "Cravings may whisper louder", "Earlier wind-down often helps"]),
    pickHomeLine(iso, `cbf-l2|${key}`, ["Patience with yourself is data", "Bandwidth may prefer shorter lists", "Skin or sleep may fluctuate"]),
    pickHomeLine(iso, `cbf-l3|${key}`, ["Steadier carbs soften swings", "Softer edges protect mood", "Momentum still exists — quieter"]),
  ];
}

function calSupportBulletsForDay(iso, phase, w, cyc) {
  if (!phase) {
    return dedupeStrings([
      pickHomeLine(iso, "csu-n1", ["Log your last period when you’re ready", "Keep water within reach"]),
      pickHomeLine(iso, "csu-n2", ["Ten slow breaths between tasks", "Protect one pocket of quiet"]),
      pickHomeLine(iso, "csu-n3", ["One gentler boundary today", "Choose the smallest supportive meal"]),
    ]).slice(0, 3);
  }
  const prio = buildHomePriorityBullets(phase, w, cyc);
  const micro = homeActionMicroline(phase, w).replace(/^Try:\s*/i, "").trim();
  return dedupeStrings([...prio, micro]).slice(0, 3);
}

function calUpcomingBullets(iso, cyc) {
  const phase = cyc?.phase || null;
  const periods = state.data?.periods || [];
  const prefs = state.data?.cyclePrefs || null;
  const out = [];
  const horizon = buildHomeHorizonLine(iso, phase, getHeroCycleInfo(iso), cyc);
  if (horizon) out.push(horizon);

  if (phase === "Follicular") {
    out.push(
      pickHomeLine(iso, "cup-f1", [
        "Ovulation energy may approach over the coming days.",
        "A brighter focus window often builds through this arc.",
      ]),
    );
  }
  if (phase === "Ovulation") {
    out.push(
      pickHomeLine(iso, "cup-o1", [
        "Energy may soften again as you move past this peak.",
        "Recovery margin matters more in the days right after this window.",
      ]),
    );
  }
  if (phase === "Luteal") {
    out.push(
      pickHomeLine(iso, "cup-l1", [
        "PMS-sensitive days may land closer to your next bleed.",
        "Sleep pressure or cravings may fluctuate — steadiness helps.",
      ]),
    );
  }
  if (phase === "Period") {
    out.push(
      pickHomeLine(iso, "cup-p1", [
        "Iron-friendly meals can support replenishment toward the tail of bleeding.",
        "As bleeding eases, vitality often returns quietly.",
      ]),
    );
  }

  const tom = addDaysISO(iso, 1);
  const cycT = cycleForISO(periods, prefs, tom);
  if (cycT?.isFertile && !cyc?.isOvulation) {
    out.push("Tomorrow may step into your fertile window — your choices stay yours.");
  }
  return dedupeStrings(out).slice(0, 3);
}

function calendarCheckinNarrative(iso, c, cyc) {
  if (!c) {
    return "No reflection here yet — when you add a check-in, Ayla will translate it into gentle meaning (not raw labels).";
  }
  const mood = normalizeMoodFromSaved(c.mood);
  const energy = (c.energy || "Medium").toLowerCase();
  const pain = c.pain || "None";
  const moodRaw = String(c.mood || "").toLowerCase();
  const enRaw = String(c.energy || "").toLowerCase();

  if (moodRaw.includes("tired") && enRaw.includes("high")) {
    return "Your note paired tired feelings with higher energy — bodies often stack opposites; gentler transitions may still help.";
  }
  if (pain === "High" || pain === "Medium") {
    return pickHomeLine(iso, "ccn-pain", [
      `With ${energy} energy and more noticeable discomfort, your system may be asking for slower pacing and softer edges.`,
      `Discomfort showed alongside ${energy} energy — recovery margin often matters more than pushing through.`,
    ]);
  }
  if (["Emotional", "Irritated"].includes(mood)) {
    return pickHomeLine(iso, "ccn-moodheavy", [
      `Mood read heavier while energy was ${energy} — that contrast can feel confusing; steady meals and reduced stimulation often help.`,
      `You signaled emotional load — even with ${energy} energy, smaller asks can feel kinder.`,
    ]);
  }
  return pickHomeLine(iso, `ccn-${mood}-${energy}`, [
    `A ${mood.toLowerCase()} tone sat next to ${energy} energy — let the day stay flexible rather than forced.`,
    `Your check-in sketched ${mood.toLowerCase()} feelings with ${energy} energy — prefer honest pacing over performance.`,
  ]);
}

function renderCalendarTodayCard() {
  const iso = toISODate(new Date());
  const periods = state.data?.periods || [];
  const prefs = state.data?.cyclePrefs || null;
  const cyc = cycleForISO(periods, prefs, iso);
  const w = readTodayWellnessModel();
  const info = getHeroCycleInfo(iso);
  const phase = cyc?.phase || null;

  if (!calTodayHeadline) return;

  if (phase && info?.day) {
    calTodayHeadline.textContent = `Day ${info.day} · ${phase}`;
  } else {
    calTodayHeadline.textContent = "Today · rhythm still unfolding";
  }

  if (calTodayLead) calTodayLead.textContent = calEnergyLead(iso, phase, w);
  if (calTodayHorizon) calTodayHorizon.textContent = buildHomeHorizonLine(iso, phase, info, cyc);

  fillCalUl(calTodayBodyFeel, calBodyFeelBullets(iso, phase, w));
  fillCalUl(calTodaySupport, calSupportBulletsForDay(iso, phase, w, cyc));
}

function buildCalendar() {
  const view = state.viewMonth ?? startOfMonth(new Date());
  state.viewMonth = startOfMonth(view);
  calTitle.textContent = monthTitle(state.viewMonth);

  const periods = state.data?.periods || [];
  const prefs = state.data?.cyclePrefs || null;

  const first = new Date(state.viewMonth);
  const offset = mondayIndex(first.getDay());
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const CALENDAR_ROWS = 6;
  const CALENDAR_COLS = 7;
  const cells = CALENDAR_ROWS * CALENDAR_COLS;
  const start = new Date(first);
  start.setDate(start.getDate() - offset);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);

  calendarGrid.innerHTML = "";
  calendarGrid.style.gridTemplateColumns = `repeat(${CALENDAR_COLS}, minmax(0, 1fr))`;
  calendarGrid.style.gridTemplateRows = `repeat(${CALENDAR_ROWS}, minmax(0, 1fr))`;
  calendarGrid.style.aspectRatio = `${CALENDAR_COLS} / ${CALENDAR_ROWS}`;
  const todayISO = toISODate(new Date());
  const selectedISO = state.selectedISO;

  for (let i = 0; i < cells; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = toISODate(d);

    // Filler cells keep every month at a stable 42-card layout.
    if (d.getMonth() !== first.getMonth()) {
      const blank = document.createElement("div");
      blank.className = "day day--blank day--filler";
      blank.setAttribute("role", "presentation");
      blank.setAttribute("aria-hidden", "true");
      blank.dataset.iso = iso;
      const num = document.createElement("div");
      num.className = "day__num";
      num.textContent = String(d.getDate());
      blank.appendChild(num);
      calendarGrid.appendChild(blank);
      continue;
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day";
    btn.setAttribute("role", "gridcell");
    btn.dataset.iso = iso;

    btn.classList.toggle("is-out", d.getMonth() !== first.getMonth());
    btn.classList.toggle("is-today", iso === todayISO);
    btn.classList.toggle("is-selected", Boolean(selectedISO && iso === selectedISO));
    btn.classList.toggle("day--past", iso < todayISO);
    btn.classList.toggle("day--future", iso > todayISO);

    const checkin = state.data?.checkins?.[iso] || null;
    const energyMark = checkin?.energy === "High" ? "high" : checkin?.energy === "Low" ? "low" : null;
    const { cyc, phaseKey } = applyCyclePhaseVizToCell(btn, iso, periods, prefs, {
      todayISO,
      includeCheckinTips: true,
      defaultTitle: "View this day",
    });
    const anyPeriod = dayHasPeriod(iso);
    const isOvulation = Boolean(cyc?.isOvulation);

    btn.classList.toggle("sig-energy-low", !anyPeriod && energyMark === "low");
    btn.classList.toggle("sig-rest", !anyPeriod && energyMark === "low");

    const num = document.createElement("div");
    num.className = "day__num";
    num.textContent = String(d.getDate());
    btn.appendChild(num);

    let mic = "";
    if (anyPeriod) mic = "Period";
    else if (phaseKey === "ovulation") mic = "Ovulation";
    else if (phaseKey === "follicular") mic = "Follicular";
    else if (phaseKey === "luteal") mic = "Luteal";
    if (mic) {
      const micro = document.createElement("div");
      micro.className = "day__micro";
      micro.textContent = mic;
      btn.appendChild(micro);
    }

    const dotrow = document.createElement("div");
    dotrow.className = "dotrow";
    const anyCheckin = dayHasCheckin(iso);
    const anyPred = isPredictedPeriodDay(iso);
    if (anyPeriod || anyCheckin || anyPred) {
      if (anyPeriod) dotrow.appendChild(Object.assign(document.createElement("div"), { className: "dot is-period" }));
      if (anyCheckin) dotrow.appendChild(Object.assign(document.createElement("div"), { className: "dot is-checkin" }));
      if (!anyPeriod && anyPred) dotrow.appendChild(Object.assign(document.createElement("div"), { className: "dot is-pred" }));
      btn.appendChild(dotrow);
    }

    // Emblems stay visual; `title` + `.day__micro` carry plain-language cues.
    const emblem = document.createElement("div");
    emblem.className = "day__emblem";
    emblem.setAttribute("aria-hidden", "true");

    let emblemKind = null;
    if (anyPeriod) emblemKind = "period";
    else if (phaseKey === "ovulation") emblemKind = "ovu";
    else if (energyMark === "low") emblemKind = "rest";

    if (emblemKind) {
      emblem.classList.add(`day__emblem--${emblemKind}`);
      emblem.innerHTML =
        emblemKind === "period"
          ? aylaIcon("cal_period")
          : emblemKind === "fertile"
            ? aylaIcon("cal_fertile")
            : emblemKind === "ovu"
              ? aylaIcon("cal_ovu")
              : aylaIcon("cal_rest");
      btn.appendChild(emblem);
    }

    btn.addEventListener("click", () => selectDate(iso));
    calendarGrid.appendChild(btn);
  }

  buildHomeMiniCalendar();
}

function buildHomeMiniCalendar() {
  if (!homeMiniCalGrid) return;

  const view = state.viewMonth ?? startOfMonth(new Date());
  state.viewMonth = startOfMonth(view);
  if (homeMiniCalTitle) homeMiniCalTitle.textContent = monthTitle(state.viewMonth);

  const periods = state.data?.periods || [];
  const prefs = state.data?.cyclePrefs || null;

  const first = new Date(state.viewMonth);
  const offset = mondayIndex(first.getDay());
  const CALENDAR_ROWS = 6;
  const CALENDAR_COLS = 7;
  const cells = CALENDAR_ROWS * CALENDAR_COLS;
  const start = new Date(first);
  start.setDate(start.getDate() - offset);

  homeMiniCalGrid.innerHTML = "";
  const refLayout = document.querySelector(".home-layout--reference");
  if (refLayout) {
    homeMiniCalGrid.style.gridTemplateColumns = "";
    homeMiniCalGrid.style.gridTemplateRows = "";
  } else {
    homeMiniCalGrid.style.gridTemplateColumns = `repeat(${CALENDAR_COLS}, minmax(0, 1fr))`;
    homeMiniCalGrid.style.gridTemplateRows = `repeat(${CALENDAR_ROWS}, minmax(0, 1fr))`;
  }

  const todayISO = toISODate(new Date());
  const passiveCal = Boolean(homeMiniCal?.classList?.contains("home-mini-cal--passive"));

  for (let i = 0; i < cells; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = toISODate(d);
    const inMonth = d.getMonth() === first.getMonth();

    if (!inMonth) {
      const blank = document.createElement("div");
      blank.className = "home-mini-cal__cell home-mini-cal__cell--blank";
      blank.setAttribute("role", "presentation");
      blank.setAttribute("aria-hidden", "true");
      const num = document.createElement("span");
      num.className = "home-mini-cal__num";
      num.textContent = String(d.getDate());
      blank.appendChild(num);
      homeMiniCalGrid.appendChild(blank);
      continue;
    }

    const cell = document.createElement(passiveCal ? "div" : "button");
    if (!passiveCal) cell.type = "button";
    cell.className = "home-mini-cal__cell";
    if (!passiveCal) cell.setAttribute("role", "gridcell");
    else cell.setAttribute("aria-hidden", "true");
    cell.dataset.iso = iso;
    cell.classList.toggle("is-today", iso === todayISO);
    if (!passiveCal) {
      cell.classList.toggle("is-selected", Boolean(state.selectedISO && iso === state.selectedISO));
      cell.classList.toggle("home-mini-cal__cell--past", iso < todayISO);
      cell.classList.toggle("home-mini-cal__cell--future", iso > todayISO);
    }

    const anyCheckin = dayHasCheckin(iso);
    const { phaseKey } = applyCyclePhaseVizToCell(cell, iso, periods, prefs, {
      todayISO,
      skipPhaseTips: true,
      includeCheckinTips: passiveCal ? false : anyCheckin,
      passive: passiveCal,
    });
    if (!passiveCal) {
      cell.setAttribute("aria-label", `${formatNiceDate(iso)}${anyCheckin ? ", has log entry" : ""}`);
    }
    const anyPeriod = dayHasPeriod(iso);
    cell.dataset.calMeaning = phaseKey || (anyPeriod ? "period" : "neutral");

    if (!passiveCal) {
      const periodStartHere = periods.some((p) => p.startISO === iso);
      cell.classList.toggle("home-mini-cal__cell--period-start", Boolean(anyPeriod && periodStartHere));
      cell.classList.toggle("home-mini-cal__cell--period-today", Boolean(iso === todayISO && anyPeriod));
    }

    const num = document.createElement("span");
    num.className = "home-mini-cal__num";
    num.textContent = String(d.getDate());
    cell.appendChild(num);

    if (!passiveCal) {
      const dotrow = document.createElement("div");
      dotrow.className = "home-mini-cal__dots";
      if (anyPeriod || anyCheckin) {
        if (anyPeriod) dotrow.appendChild(Object.assign(document.createElement("span"), { className: "home-mini-cal__dot home-mini-cal__dot--period" }));
        if (anyCheckin) dotrow.appendChild(Object.assign(document.createElement("span"), { className: "home-mini-cal__dot home-mini-cal__dot--checkin" }));
        cell.appendChild(dotrow);
      }
      cell.addEventListener("click", () => {
        selectDate(iso);
        openDayView(iso);
      });
    }
    homeMiniCalGrid.appendChild(cell);
  }
}

function selectDate(iso) {
  state.selectedISO = iso;
  buildCalendar();
  renderDayPanel();
}

function scoreEnergy(v) {
  if (!v) return 0.4;
  if (v === "High") return 0.9;
  if (v === "Medium") return 0.6;
  if (v === "Low") return 0.35;
  return 0.4;
}

function scorePain(v) {
  if (!v) return 0.2;
  if (v === "High") return 0.92;
  if (v === "Medium") return 0.62;
  if (v === "Low") return 0.4;
  if (v === "None") return 0.18;
  return 0.2;
}

function setFill(el, ratio) {
  if (!el) return;
  const r = Math.max(0.12, Math.min(1, ratio));
  el.style.width = `${Math.round(r * 100)}%`;
}

function lastCycleSameOffsetISO(periods, iso) {
  const starts = cycleStarts(periods);
  if (starts.length < 2) return null;

  // current cycle start = latest start <= iso
  const currentStart = [...starts].reverse().find((s) => s <= iso);
  if (!currentStart) return null;
  const idx = starts.indexOf(currentStart);
  if (idx <= 0) return null;

  const prevStart = starts[idx - 1];
  const offset = Math.round((parseISODate(iso) - parseISODate(currentStart)) / (24 * 3600 * 1000));
  const prev = parseISODate(prevStart);
  prev.setDate(prev.getDate() + offset);
  return toISODate(prev);
}

function smartInsightsForDay(periods, checkins, iso) {
  const out = [];
  const ph = phaseForDate(periods, iso);

  if (ph?.phase === "Luteal") {
    const lutealDates = Object.keys(checkins).filter((d) => phaseForDate(periods, d)?.phase === "Luteal");
    const lows = lutealDates.filter((d) => checkins[d]?.mood === "Low");
    if (lutealDates.length >= 4 && lows.length / lutealDates.length >= 0.45) {
      out.push("You often feel a little lower in the luteal phase. Plan gentler tasks when you can.");
    }
  }

  const fw = fertileWindow(periods);
  if (fw && iso >= fw.startISO && iso <= fw.endISO) {
    out.push("This day falls in your estimated fertile window.");
  }

  const periodSet = new Set((periods || []).flatMap(periodDays));
  if (periodSet.has(iso)) out.push("You’re within your logged period days. Extra rest and warmth can help.");

  const prevISO = lastCycleSameOffsetISO(periods, iso);
  if (prevISO && checkins[prevISO]?.pain && checkins[iso]?.pain) {
    if (checkins[prevISO].pain === "High" && checkins[iso].pain !== "High") out.push("Compared to last cycle: pain looks improved.");
  }

  return out.slice(0, 3);
}

function openDayView(iso) {
  if (!dayModal) return;

  const periods = state.data?.periods || [];
  const checkins = state.data?.checkins || {};
  const c = checkins[iso] || null;
  const p = periods.find((x) => iso >= x.startISO && iso <= x.endISO) || null;

  const reflectWho = state.profile?.fullName;
  const reflectFirst = reflectWho ? reflectWho.split(" ")[0] : "";
  const todayISOModal = toISODate(new Date());
  const isTodayModal = iso === todayISOModal;
  dayModalSubtitle.textContent = reflectFirst
    ? isTodayModal
      ? `Today's reflection · ${reflectFirst}`
      : `This day · ${reflectFirst}`
    : isTodayModal
      ? "Today's reflection"
      : "This day";
  dayModalDate.textContent = formatNiceDate(iso);

  const ph = phaseForDate(periods, iso);
  if (ph) {
    dayModalPhase.hidden = false;
    dayModalPhase.textContent = ph.phase === "Period" ? "🌸 Period day" : ph.phase;
    dayGuidance.textContent = ph.tone;
  } else {
    dayModalPhase.hidden = true;
    dayGuidance.textContent = "Log a period when you’re ready, and Ayla will begin offering gentler day-by-day support.";
  }

  const emotionLine = c
    ? `${c.pain === "High" ? "Extra care and rest may support you today." : c.energy === "Low" ? "Today may call for gentleness and slower pacing." : c.energy === "High" ? "Your energy feels stronger today — move forward intentionally." : "Your body may appreciate a steady, unhurried rhythm today."} ${
        c.pain === "High" ? "Warmth, softness, and fewer demands can be enough." : "Small awareness creates better care."
      }`
    : ph
      ? ph.tone
      : "Nothing logged yet. A quick check-in can help Ayla care for this day with more context.";
  dayModalEmotionLine.textContent = emotionLine;
  daySummaryTitle.textContent = c ? "You checked in today 🌷" : "A gentle space for today";

  const hasCheckin = Boolean(c);
  dayNoData.hidden = hasCheckin;

  dayMood.textContent = c?.mood || "—";
  dayEnergy.textContent = c?.energy || "—";
  dayPain.textContent = c?.pain || "—";
  const hasNotes = Boolean(c?.notes && String(c.notes).trim());
  dayNotes.textContent = hasNotes ? c.notes : "No reflections added yet.";
  dayNotes.classList.toggle("is-placeholder", !hasNotes);
  if (dayNotesHint) dayNotesHint.hidden = hasNotes;
  dayMoodMini.textContent = c?.mood || "—";
  if (dayEnergyLabel) dayEnergyLabel.textContent = c?.energy || "Medium";
  if (dayPainLabel) dayPainLabel.textContent = c?.pain || "Low";

  setFill(dayEnergyFill, scoreEnergy(c?.energy));
  setFill(dayPainFill, scorePain(c?.pain));

  dayActionCheckin.textContent = hasCheckin ? "Edit check‑in" : "Add check‑in";
  dayActionCheckin.onclick = () => openCheckin(iso);
  dayActionPeriod.onclick = () => openPeriodModal(iso);

  // Smart insights
  const dayInsights = smartInsightsForDay(periods, checkins, iso);
  daySmartInsights.innerHTML = "";
  daySmartInsightsEmpty.hidden = dayInsights.length > 0;
  dayInsightsPreview.textContent = dayInsights[0] || "Ayla will reflect patterns as you log more.";
  dayInsights.forEach((t) => {
    const box = document.createElement("div");
    box.className = "insight-card";
    const k = document.createElement("div");
    k.className = "insight-card__k";
    k.textContent = "Insight";
    const v = document.createElement("div");
    v.className = "insight-card__v";
    v.textContent = t;
    box.appendChild(k);
    box.appendChild(v);
    daySmartInsights.appendChild(box);
  });

  // Comparison
  const prevISO = lastCycleSameOffsetISO(periods, iso);
  if (!prevISO) {
    dayCompareLine.textContent = "Ayla needs a little more cycle history before reflecting patterns back to you.";
  } else {
    const prev = checkins[prevISO] || null;
    if (!prev) {
      dayCompareLine.textContent = `Last cycle around this point (${formatNiceDate(prevISO)}), there was no check-in yet.`;
    } else if (!c) {
      dayCompareLine.textContent = `Last cycle around this point, you logged ${prev.mood} mood · ${prev.energy} energy · ${prev.pain} pain.`;
    } else {
      const energyDelta =
        scoreEnergy(c.energy) > scoreEnergy(prev.energy) ? "improved energy" : scoreEnergy(c.energy) < scoreEnergy(prev.energy) ? "lower energy" : "similar energy";
      const painDelta =
        scorePain(c.pain) < scorePain(prev.pain) ? "less pain" : scorePain(c.pain) > scorePain(prev.pain) ? "more pain" : "similar pain";
      dayCompareLine.textContent = `Compared with last cycle, today shows ${energyDelta} and ${painDelta}. Use that as a gentle cue, not a rule.`;
    }
  }
  dayComparePreview.textContent = dayCompareLine.textContent;

  // Keep a calm default: guidance open, others closed
  if (dayGuidanceDetails) dayGuidanceDetails.open = true;
  if (dayInsightsDetails) dayInsightsDetails.open = false;
  if (dayCompareDetails) dayCompareDetails.open = false;
  if (dayDoneBtn) {
    dayDoneBtn.textContent = "Done";
    dayDoneBtn.classList.remove("is-success");
    dayDoneBtn.onclick = () => {
      dayDoneBtn.textContent = "Saved ✨";
      dayDoneBtn.classList.add("is-success");
      setTimeout(() => closeModal(dayModal), 650);
    };
  }

  openModal(dayModal);
}

function renderDayPanel() {
  const iso = state.selectedISO;
  if (!iso) {
    dayPanelEmpty.hidden = false;
    dayPanelContent.hidden = true;
    return;
  }

  dayPanelEmpty.hidden = true;
  dayPanelContent.hidden = false;
  selectedDateLabel.textContent = formatNiceDate(iso);

  const periods = state.data?.periods || [];
  const prefs = state.data?.cyclePrefs || null;
  const cyc = cycleForISO(periods, prefs, iso);
  const w = readWellnessModelForISO(iso);
  const c = state.data?.checkins?.[iso] || null;
  const phase = cyc?.phase || null;
  const info = getHeroCycleInfo(iso);

  if (calPanelPhaseLine) {
    if (phase) {
      calPanelPhaseLine.textContent = `${phase} · ${calPhaseEnergyTag(phase)}`;
    } else {
      calPanelPhaseLine.textContent = "Rhythm mapping · add your last period when you can";
    }
  }

  fillCalUl(calPanelBodyFeel, calBodyFeelBullets(iso, phase, w));
  fillCalUl(calPanelSupport, calSupportBulletsForDay(iso, phase, w, cyc));
  fillCalUl(calPanelUpcoming, calUpcomingBullets(iso, cyc));

  if (calPanelInsight) {
    calPanelInsight.textContent = phase
      ? buildHomeDailyIntelLine(iso, phase, w)
      : buildHomeBodySignalLine(iso, phase, w, info);
  }

  if (calPanelCheckinNarrative) {
    calPanelCheckinNarrative.textContent = calendarCheckinNarrative(iso, c, cyc);
  }

  if (calOpenDayDetailsBtn) {
    calOpenDayDetailsBtn.hidden = false;
    calOpenDayDetailsBtn.disabled = false;
  }
}

function renderInsights() {
  const periods = state.data?.periods || [];
  const next = predictNextPeriodStart(periods);
  if (next) {
    insNextPeriod.textContent = formatNiceDate(next);
    const avg = averageCycleLength(periods) ?? 28;
    insNextPeriodSub.textContent = `A gentle estimate from your ${avg}-day rhythm. Use it to plan softly, not perfectly.`;
  } else {
    insNextPeriod.textContent = "—";
    insNextPeriodSub.textContent = "Log a period when you can, and Ayla will begin learning your rhythm.";
  }

  const todayISO = toISODate(new Date());
  const fw = fertileWindowForISO(periods, todayISO);
  insFertileWindow.textContent = fw ? `${formatNiceDate(fw.startISO)} → ${formatNiceDate(fw.endISO)}` : "—";

  const ph = cycleForISO(periods, state.data?.cyclePrefs || null, todayISO);
  if (ph) {
    insGuidance.textContent = `${ph.phase}`;
    insGuidanceSub.textContent = ph.tone;
  } else {
    insGuidance.textContent = "—";
    insGuidanceSub.textContent = "A little cycle history helps Ayla offer kinder, more relevant guidance.";
  }

  // Quick dashboard tiles (today)
  const c = state.data?.checkins?.[todayISO] || null;
  const qEnergy = $$("#insQuickEnergy");
  const qEnergySub = $$("#insQuickEnergySub");
  const qMood = $$("#insQuickMood");
  const qMoodSub = $$("#insQuickMoodSub");
  const qHyd = $$("#insQuickHydration");
  const qHydSub = $$("#insQuickHydrationSub");
  const qRec = $$("#insQuickRecovery");
  const qRecSub = $$("#insQuickRecoverySub");

  if (qEnergy && qEnergySub) {
    qEnergy.textContent = c?.energy || "—";
    qEnergySub.textContent = c?.energy ? "Thank you for checking in today." : "A quick check‑in helps Ayla notice your energy patterns.";
  }
  if (qMood && qMoodSub) {
    qMood.textContent = c?.mood || "—";
    qMoodSub.textContent = c?.mood ? "Your mood note is part of the pattern." : "Even one soft mood note can help future insights feel more personal.";
  }
  if (qHyd && qHydSub) {
    const hyd =
      ph?.phase === "Ovulation" ? "Focus" : ph?.phase === "Period" ? "Gentle" : ph?.phase ? "Steady" : "—";
    qHyd.textContent = hyd;
    qHydSub.textContent =
      ph?.phase === "Ovulation"
        ? "Your body may appreciate a little extra hydration."
        : ph?.phase === "Period"
          ? "Warm fluids may feel grounding and comforting."
          : ph?.phase
            ? "Small, steady sips are enough."
            : "Once your cycle rhythm is available, hydration cues will become gentler and more specific.";
  }
  if (qRec && qRecSub) {
    const rec =
      c?.pain === "High" ? "High" : c?.pain === "Medium" ? "Medium" : ph?.phase === "Period" ? "High" : "Normal";
    qRec.textContent = rec;
    qRecSub.textContent =
      rec === "High"
        ? "Make extra room for softness today."
        : rec === "Medium"
          ? "Lighter plans may help your body feel more supported."
          : "A steady pace is enough — no need to overdo it.";
  }

  const insReflectionTitle = $$("#insReflectionTitle");
  const insReflectionBody = $$("#insReflectionBody");
  if (insReflectionTitle && insReflectionBody) {
    if (ph?.phase) {
      insReflectionTitle.textContent = ph.phase === "Period" ? "Make room for softness" : ph.phase === "Ovulation" ? "Let things feel light" : ph.phase === "Follicular" ? "A gentle build phase" : "Simplify where you can";
      insReflectionBody.textContent =
        ph.phase === "Period"
          ? "Warmth, rest, and simpler plans can feel supportive today. You don’t have to earn recovery."
          : ph.phase === "Follicular"
            ? "Energy often rises here. Choose one small intention you can carry gently through the day."
            : ph.phase === "Ovulation"
              ? "You may feel brighter and more social. Hydrate, and let connection feel easy rather than performative."
              : "If bandwidth feels lower, that’s normal. Soften your schedule and keep meals steady and grounding.";
    } else {
      insReflectionTitle.textContent = "A gentle note for today";
      insReflectionBody.textContent = "Your body works in seasons. A small daily check‑in helps Ayla learn your rhythm — softly, over time.";
    }
  }

  if (energyPgNext) energyPgNext.textContent = insNextPeriod.textContent;
  if (energyPgNextSub) energyPgNextSub.textContent = insNextPeriodSub.textContent;
  if (energyPgFertile) energyPgFertile.textContent = insFertileWindow.textContent;
  if (energyPgGuidance) energyPgGuidance.textContent = insGuidance.textContent;
  if (energyPgGuidanceSub) energyPgGuidanceSub.textContent = insGuidanceSub.textContent;

  const patterns = insightsFromData(periods, state.data?.checkins || {});

  function patternTip(text) {
    const s = String(text || "").toLowerCase();
    if (s.includes("low mood") || s.includes("luteal")) {
      return "Try planning lighter tasks, earlier wind-downs, and steadier meals during luteal days.";
    }
    if (s.includes("pain")) {
      return "Consider warmth, hydration, and a gentler schedule around the days pain usually rises.";
    }
    if (s.includes("fertile")) {
      return "Use this window as a soft planning cue; hydration and recovery still matter.";
    }
    return "Use this pattern as a gentle cue for planning, not a strict rule.";
  }

  function fillPatternList(rootEl, prefixLabel) {
    if (!rootEl) return;
    rootEl.innerHTML = "";
    if (!patterns.length) {
      const empty = document.createElement("div");
      empty.className = "patterns-empty";
      empty.innerHTML = `
        <span class="patterns-empty__icon" aria-hidden="true">${aylaIcon("energy_medium")}</span>
        <span class="patterns-empty__copy">
          <span class="patterns-empty__title">Patterns are still forming</span>
          <span class="patterns-empty__body">Keep adding gentle check-ins. After a few notes, Ayla can reflect your energy rhythm back with more care.</span>
        </span>
      `;
      rootEl.appendChild(empty);
      return;
    }
    patterns.forEach((t) => {
      const box = document.createElement("div");
      box.className = "insight-card insight-card--interactive";
      box.tabIndex = 0;
      box.setAttribute("role", "button");
      box.setAttribute("aria-label", `${prefixLabel}: ${t}. ${patternTip(t)}`);
      box.dataset.tip = patternTip(t);
      const k = document.createElement("div");
      k.className = "insight-card__k";
      k.textContent = prefixLabel;
      const v = document.createElement("div");
      v.className = "insight-card__v";
      v.textContent = t;
      box.appendChild(k);
      box.appendChild(v);
      box.addEventListener("click", () => {
        box.classList.toggle("is-tip-visible");
      });
      box.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          box.classList.toggle("is-tip-visible");
        }
        if (e.key === "Escape") box.classList.remove("is-tip-visible");
      });
      box.addEventListener("blur", () => box.classList.remove("is-tip-visible"));
      rootEl.appendChild(box);
    });
  }

  fillPatternList(insightList, "Pattern");
  fillPatternList(energyInsightList, "Pattern");
}

function refreshAll() {
  renderCycleIntel();
  renderHomeSurface();
  buildCalendar();
  renderCalendarTodayCard();
  renderDayPanel();
  renderInsights();
  syncWellnessHomeFromState();
  const r = getRouteFromHash();
  if (r === "food") refreshFoodView();
  if (r === "movement") refreshMovementView();
}

function getRouteFromHash() {
  const raw = (location.hash || "#home").replace(/^#/, "").toLowerCase();
  if (raw === "privacy") return "privacy";
  const allowed = ["home", "calendar", "insights", "food", "movement", "cycle", "energy"];
  return allowed.includes(raw) ? raw : "home";
}

function updateNavActive(route) {
  const navRoutes = new Set(["home", "insights"]);
  $$$(".app-nav__tab").forEach((el) => {
    const r = el.dataset.route;
    if (!r) return;
    const on = navRoutes.has(route) && r === route;
    el.classList.toggle("is-active", on);
    if (el.tagName === "BUTTON") el.setAttribute("aria-current", on ? "page" : "false");
  });
  $$$(".mobile-tabbar__item[data-route]").forEach((el) => {
    const r = el.dataset.route;
    if (!r) return;
    const on = navRoutes.has(route) && r === route;
    el.classList.toggle("is-active", on);
  });
}

function showAppView(route) {
  const views = {
    home: $$("#view-home"),
    calendar: $$("#view-calendar"),
    insights: $$("#view-insights"),
    food: $$("#view-food"),
    movement: $$("#view-movement"),
    cycle: $$("#view-cycle"),
    energy: $$("#view-energy"),
  };

  if (dashboardShell) dashboardShell.dataset.activeView = route;

  Object.entries(views).forEach(([key, el]) => {
    if (!el) return;
    el.hidden = key !== route;
  });

  updateNavActive(route);

  if (route === "food") refreshFoodView();
  if (route === "movement") refreshMovementView();
}

function applyRoute() {
  if (document.body.classList.contains("is-onboarding")) return;
  const route = getRouteFromHash();
  if (route === "privacy") {
    showAppView(state.lastRoute || "home");
    updateNavActive("privacy");
    openModal(privacyModal);
    return;
  }
  state.lastRoute = route;
  showAppView(route);
}

// Chips
function aylaIcon(name) {
  // Consistent stroke language: rounded caps/joins, hybrid line + soft fill where needed.
  const S = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
  const F = 'fill="currentColor"';

  const icons = {
    // Mood
    mood_low: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path ${S} d="M8.2 18.3h9.2a3.2 3.2 0 0 0 .5-6.3 4.6 4.6 0 0 0-8.9-1.1 3.5 3.5 0 0 0-.8 6.7" />
      <path ${S} d="M9.2 20.1l-.9 1.4M12 20.1l-.9 1.4M14.8 20.1l-.9 1.4" />
    </svg>`,
    mood_okay: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path ${S} d="M4.5 13.2c2.2-2.8 4.7-4.2 7.1-4.2 2.6 0 4.4 1.7 7.9 1.7 1.7 0 3.1-.4 4-1" />
      <path ${S} d="M6 16.5c2.1-1.7 4.1-2.6 6.2-2.6 2.1 0 3.7.9 5.8.9" />
    </svg>`,
    mood_good: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path ${S} d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />
      <path ${S} d="M12 2.7v2.1M4.7 12H2.6M21.4 12h-2.1" />
      <path ${S} d="M6 6l1.5 1.5M16.5 16.5 18 18" />
    </svg>`,
    mood_bright: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path ${S} d="M12 2.6l1.9 6.2 6.2 1.9-6.2 1.9L12 18.8l-1.9-6.2-6.2-1.9 6.2-1.9L12 2.6Z" />
      <path ${S} d="M19.1 4.9l.6-2.2M20.9 9.6l2.2-.6M4.9 19.1l-2.2.6M9.6 20.9l-.6 2.2" />
    </svg>`,

    // Energy (distinct from mood)
    energy_low: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path ${S} d="M15.7 18.2a7 7 0 1 1-5.9-12.3 6 6 0 1 0 5.9 12.3Z" />
      <path ${S} d="M18.2 6.7l.9-1.7M19.9 10.1l1.8-.7" />
    </svg>`,
    energy_medium: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path ${S} d="M3.8 13c2.4-3.5 5.4-5.2 8.1-5.2 3 0 4.9 2 8.3 2 1.6 0 2.9-.4 4-1.1" />
      <path ${S} d="M4.5 17c2.1-2 4.4-3 6.9-3 2.6 0 4.5 1.1 7.2 1.1" />
    </svg>`,
    energy_high: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path ${S} d="M13 2 5.2 13.2h5.8L10.6 22 18.8 10.8H13L13 2Z" />
    </svg>`,

    // Pain (sensitive, non-medical)
    pain_none: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path ${S} d="M12 20.4c-4.9-2.7-8.1-6-8.1-10 0-2.3 1.8-4.1 4.1-4.1 1.6 0 3 .9 3.9 2.3  .9-1.4 2.3-2.3 3.9-2.3 2.3 0 4.1 1.8 4.1 4.1 0 4-3.2 7.3-8 10Z" />
      <path ${S} d="M8.2 11.8c1 .9 2.2 1.3 3.8 1.3s2.9-.4 3.8-1.3" />
    </svg>`,
    pain_low: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path ${S} d="M12 6.4a5.6 5.6 0 0 1 5.6 5.6" />
      <path ${S} d="M6.4 12A5.6 5.6 0 0 1 12 6.4" />
      <path ${S} d="M8.7 15.3A3.9 3.9 0 0 0 12 16.7c1.2 0 2.3-.4 3.3-1.4" />
    </svg>`,
    pain_medium: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path ${S} d="M4.6 13.3c2.6-2.7 5.2-3.9 7.4-3.9 2.5 0 4.3 1.5 7 1.5 1.4 0 2.6-.3 3.6-.9" />
      <path ${S} d="M5.6 16.9c2.2-1.6 4.3-2.4 6.4-2.4 2.3 0 4 1 6.3 1" />
      <path ${S} d="M7.2 19.3c1.6-.8 3.1-1.1 4.8-1.1 1.7 0 3.3.3 4.8 1.1" />
    </svg>`,
    pain_high: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path ${S} d="M4.2 12c2.8-3 5.6-4.4 8-4.4 2.7 0 4.6 1.7 7.5 1.7 1.7 0 3-.4 4.3-1.2" />
      <path ${S} d="M5.2 16.2c2.2-2 4.6-3 6.9-3 2.4 0 4.4 1 6.9 1" />
      <path ${S} d="M7 20l2-1.6 2 1.6 2-1.6 2 1.6" />
    </svg>`,

    // Period flow (related but clearly different density)
    flow_light: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path ${S} d="M12 4.2c2.1 3.3 5.2 6.2 5.2 9.6A5.2 5.2 0 0 1 12 19a5.2 5.2 0 0 1-5.2-5.2c0-3.4 3.1-6.3 5.2-9.6Z" />
    </svg>`,
    flow_medium: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path ${S} d="M12 3.3c2.6 4 6.4 7.2 6.4 11.3A6.4 6.4 0 0 1 12 21a6.4 6.4 0 0 1-6.4-6.4c0-4.1 3.8-7.3 6.4-11.3Z" />
      <path ${S} d="M9.7 16.1c.6 1.2 1.6 1.8 2.9 1.8 1.2 0 2.1-.6 2.8-1.8" />
    </svg>`,
    flow_heavy: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path ${S} d="M11 3.1c2.1 3.3 5 6.2 5 9.7A5.7 5.7 0 0 1 11 18.6a5.7 5.7 0 0 1-5.7-5.7c0-3.5 3-6.4 5.7-9.8Z" />
      <path ${S} d="M15.5 6.2c1.7 2.8 3.9 4.9 3.9 7.6a3.9 3.9 0 0 1-3.9 3.9" />
    </svg>`,

    // Calendar signals
    calendar_month: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path ${S} d="M8 2v4M16 2v4M3 10h18" />
      <path ${S} d="M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
    </svg>`,
    cal_period: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path ${S} d="M12 3.2c2.7 4.2 6.6 7.6 6.6 11.8A6.6 6.6 0 0 1 12 21.6 6.6 6.6 0 0 1 5.4 15c0-4.2 3.9-7.6 6.6-11.8Z"/></svg>`,
    cal_fertile: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path ${S} d="M19.5 4.5c-5.2.5-9.2 3.5-11 7.3-1.2 2.4-1.4 5-.8 7.7 3.2-.6 5.8-2.1 7.7-4.2 3.1-3.3 4.1-7.4 4.1-10.8Z"/><path ${S} d="M6.2 18.8c2.6-3.1 5.8-5.6 9.9-7.5"/></svg>`,
    cal_ovu: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path ${S} d="M12 2.7l1.9 6.2 6.2 1.9-6.2 1.9L12 18.9l-1.9-6.2-6.2-1.9 6.2-1.9L12 2.7Z"/></svg>`,
    cal_rest: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path ${S} d="M8.6 18.4h8.9a3.2 3.2 0 0 0 .6-6.3 4.6 4.6 0 0 0-9-.9 3.5 3.5 0 0 0-.5 7.2Z"/><path ${S} d="M15.7 6.9a3.4 3.4 0 0 1 2.8 1.5"/></svg>`,

    // Phase icons (distinct silhouettes)
    phase_period: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path ${S} d="M12 3.2c2.7 4.2 6.6 7.6 6.6 11.8A6.6 6.6 0 0 1 12 21.6 6.6 6.6 0 0 1 5.4 15c0-4.2 3.9-7.6 6.6-11.8Z"/></svg>`,
    phase_follicular: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path ${S} d="M12 20.2v-6.8" />
      <path ${S} d="M12 13.4c-2.5 0-4.7 1.4-6.2 3.9 3.2.6 5.8 0 7.8-1.8" />
      <path ${S} d="M12 13.4c2.5 0 4.7 1.4 6.2 3.9-3.2.6-5.8 0-7.8-1.8" />
    </svg>`,
    phase_ovulation: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path ${S} d="M12 2.7l1.9 6.2 6.2 1.9-6.2 1.9L12 18.9l-1.9-6.2-6.2-1.9 6.2-1.9L12 2.7Z"/></svg>`,
    phase_luteal: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path ${S} d="M15.7 18.2a7 7 0 1 1-5.9-12.3 6 6 0 1 0 5.9 12.3Z" /></svg>`,

    home_smile: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path ${S} d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path ${S} d="M8 14s1.5 2 4 2 4-2 4-2"/><path ${S} d="M9 9h.01"/><path ${S} d="M15 9h.01"/></svg>`,
    home_zap: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path ${S} d="M13 2 5.2 13.2h5.8L10.6 22 18.8 10.8H13L13 2z"/></svg>`,
    home_moon: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path ${S} d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
    home_droplets: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path ${S} d="M7 16.3c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4z"/><path ${S} d="M12.2 21.4c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4z"/></svg>`,
    home_heart_pulse: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path ${S} d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.51 4.04 3 5.5l7 7Z"/><path ${S} d="M3.5 12.5h4l1.5-3 2 6 2-4 1.5 3h4.5"/></svg>`,
    home_activity: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path ${S} d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
    home_droplet: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path ${S} d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5S13.5 4 12 4 8 6.5 8 10s3.5 5.5 5 5.5a7 7 0 0 0 7 7z"/></svg>`,
    home_plus: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path ${S} d="M5 12h14"/><path ${S} d="M12 5v14"/></svg>`,
    home_notes: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path ${S} d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path ${S} d="M14 2v4a2 2 0 0 0 2 2h4"/><path ${S} d="M10 9H8"/><path ${S} d="M16 13H8"/><path ${S} d="M16 17H8"/></svg>`,
  };

  return icons[name] || `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path ${S} d="M12 6.2a5.8 5.8 0 1 0 0 11.6 5.8 5.8 0 0 0 0-11.6Z"/></svg>`;
}

function phaseTone(phase) {
  if (phase === "Period") return { tone: "rose", icon: aylaIcon("phase_period") };
  if (phase === "Follicular") return { tone: "sage", icon: aylaIcon("phase_follicular") };
  if (phase === "Ovulation") return { tone: "peach", icon: aylaIcon("phase_ovulation") };
  return { tone: "lav", icon: aylaIcon("phase_luteal") };
}

function makeChips(root, options, { tone = "lav", kind = "generic", onPick }) {
  root.innerHTML = "";
  options.forEach((label) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `chip ${tone === "rose" ? "is-rose" : ""} chip--${
      kind === "wellnessMood"
        ? "mood"
        : kind === "wellnessStress" || kind === "wellnessNeed" || kind === "wellnessCraving"
          ? "mood"
          : kind
    }`;
    b.dataset.value = label;
    b.setAttribute("aria-pressed", "false");

    const icon = document.createElement("span");
    icon.className = "chip__icon";
    icon.setAttribute("aria-hidden", "true");

    const iconSvg = (() => {
      if (kind === "mood") {
        if (label === "Low") return aylaIcon("mood_low");
        if (label === "Okay") return aylaIcon("mood_okay");
        if (label === "Good") return aylaIcon("mood_good");
        return aylaIcon("mood_bright");
      }
      if (kind === "wellnessMood") {
        if (label === "Emotional" || label === "Anxious") return aylaIcon("mood_low");
        if (label === "Calm" || label === "Sensitive") return aylaIcon("mood_okay");
        if (label === "Happy") return aylaIcon("mood_good");
        return aylaIcon("mood_okay");
      }
      if (kind === "wellnessStress") {
        if (label === "Calm") return aylaIcon("energy_low");
        if (label === "Mixed") return aylaIcon("energy_medium");
        if (label === "Tense") return aylaIcon("energy_high");
        return aylaIcon("pain_high");
      }
      if (kind === "wellnessNeed" || kind === "wellnessCraving") {
        return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" fill-opacity=".35" d="M12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z"/></svg>';
      }
      if (kind === "energy") {
        if (label === "Low") return aylaIcon("energy_low");
        if (label === "Medium") return aylaIcon("energy_medium");
        return aylaIcon("energy_high");
      }
      if (kind === "pain") {
        if (label === "None") return aylaIcon("pain_none");
        if (label === "Low") return aylaIcon("pain_low");
        if (label === "Medium") return aylaIcon("pain_medium");
        return aylaIcon("pain_high");
      }
      if (kind === "flow") {
        if (label === "Light") return aylaIcon("flow_light");
        if (label === "Medium") return aylaIcon("flow_medium");
        return aylaIcon("flow_heavy");
      }
      return '<svg viewBox="0 0 24 24"><path d="M12 6.2a5.8 5.8 0 1 0 0 11.6 5.8 5.8 0 0 0 0-11.6Z"/></svg>';
    })();
    icon.innerHTML = iconSvg;

    const text = document.createElement("span");
    text.className = "chip__label";
    text.textContent = label;

    b.appendChild(icon);
    b.appendChild(text);
    b.dataset.value = label;
    b.addEventListener("click", () => onPick(label));
    root.appendChild(b);
  });
}

function setChipOn(root, value) {
  $$$(".chip", root).forEach((c) => {
    const on = c.dataset.value === value;
    c.classList.toggle("is-on", on);
    c.setAttribute("aria-pressed", on ? "true" : "false");
    if (on) {
      c.classList.remove("chip--pop");
      void c.offsetWidth;
      c.classList.add("chip--pop");
    }
  });
}

// Check-in modal
const CHECKIN = {
  mood: ["Low", "Okay", "Good", "Bright"],
  energy: ["Low", "Medium", "High"],
  pain: ["None", "Low", "Medium", "High"],
};

function moodForCheckinModal(m) {
  if (!m) return "Okay";
  if (["Low", "Okay", "Good", "Bright"].includes(m)) return m;
  if (["Emotional", "Anxious", "Irritated", "Sensitive", "Tired"].includes(m)) return "Low";
  if (["Happy", "Energetic"].includes(m)) return "Good";
  if (m === "Calm") return "Okay";
  return "Okay";
}

function moodFromModalSave(m) {
  const map = { Okay: "Calm", Good: "Energetic", Bright: "Energetic", Low: "Tired" };
  return map[m] || m;
}

function openCheckin(iso) {
  checkinTitleDate.textContent = iso === toISODate(new Date()) ? `Today · ${formatNiceDate(iso)}` : formatNiceDate(iso);
  const current = state.data.checkins[iso] || null;
  const model = {
    mood: moodForCheckinModal(current?.mood),
    energy: current?.energy || "Medium",
    pain: current?.pain || "Low",
    notes: current?.notes || "",
    flowFeel: current?.flowFeel || "Light",
    symptoms: Array.isArray(current?.symptoms) ? current.symptoms.filter(Boolean) : [],
  };

  makeChips(moodChips, CHECKIN.mood, { kind: "mood", onPick: (v) => { model.mood = v; setChipOn(moodChips, v); } });
  makeChips(energyChips, CHECKIN.energy, { kind: "energy", onPick: (v) => { model.energy = v; setChipOn(energyChips, v); } });
  makeChips(painChips, CHECKIN.pain, { kind: "pain", onPick: (v) => { model.pain = v; setChipOn(painChips, v); } });

  if (checkinFlowChips) {
    makeChips(checkinFlowChips, WELLNESS_FLOW, {
      tone: "rose",
      kind: "flow",
      onPick: (v) => {
        model.flowFeel = v;
        checkinFlowChips.dataset.value = v.toLowerCase();
        setChipOn(checkinFlowChips, v);
      },
    });
    const fl = model.flowFeel || "Light";
    const flowLabel = fl[0].toUpperCase() + String(fl).slice(1).toLowerCase();
    checkinFlowChips.dataset.value = String(fl).toLowerCase();
    setChipOn(checkinFlowChips, flowLabel);
  }

  if (checkinSymptomRow) {
    checkinSymptomRow.innerHTML = "";
    WELLNESS_SYMPTOMS.forEach((sym) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "wellness-bubble";
      b.dataset.symptom = sym;
      b.textContent = sym;
      b.setAttribute("aria-pressed", model.symptoms.includes(sym) ? "true" : "false");
      if (model.symptoms.includes(sym)) b.classList.add("is-on");
      b.addEventListener("click", () => {
        const set = new Set(model.symptoms);
        if (set.has(sym)) set.delete(sym);
        else set.add(sym);
        model.symptoms = Array.from(set).slice(0, 4);
        $$$(".wellness-bubble", checkinSymptomRow).forEach((btn) => {
          const on = model.symptoms.includes(btn.dataset.symptom);
          btn.classList.toggle("is-on", on);
          btn.setAttribute("aria-pressed", on ? "true" : "false");
        });
      });
      checkinSymptomRow.appendChild(b);
    });
  }

  setChipOn(moodChips, model.mood);
  setChipOn(energyChips, model.energy);
  setChipOn(painChips, model.pain);
  notesEl.value = model.notes;
  saveCheckinBtn.textContent = "Save today’s check-in";
  saveCheckinBtn.classList.remove("is-success");

  deleteCheckinBtn.hidden = !current;
  closeCheckinBtn.onclick = () => closeModal(checkinModal);
  deleteCheckinBtn.onclick = () => {
    delete state.data.checkins[iso];
    saveUserData(state.user, state.data);
    closeModal(checkinModal);
    refreshAll();
    showCalmToast("Check-in removed. Your calendar has been updated gently.");
  };

  $$("#checkinForm").onsubmit = (e) => {
    e.preventDefault();
    state.data.checkins[iso] = {
      ...(state.data.checkins[iso] || {}),
      mood: moodFromModalSave(model.mood),
      energy: model.energy,
      pain: model.pain,
      notes: (notesEl.value || "").trim(),
      flowFeel: model.flowFeel,
      symptoms: Array.isArray(model.symptoms) ? model.symptoms : [],
    };
    saveUserData(state.user, state.data);
    saveCheckinBtn.textContent = "Check-in saved ✨";
    saveCheckinBtn.classList.add("is-success");
    refreshAll();
    const insight = postCheckinHomeLine(iso);
    showCalmToast(insight ? `Saved · ${insight}` : "Check-in saved ✨");
    setTimeout(() => closeModal(checkinModal), 850);
  };

  openModal(checkinModal);
}

// Period modal
const FLOW = ["Light", "Medium", "Heavy"];

function showPeriodError(msg) {
  periodError.hidden = false;
  periodError.textContent = msg;
}

function getPeriodFormState() {
  return {
    start: periodStartEl?.value || "",
    end: periodEndEl?.value || "",
    flow: (flowChips?.dataset.value || "medium").toLowerCase(),
  };
}

function periodFormIsDirty() {
  if (!periodModalInitial) return false;
  const cur = getPeriodFormState();
  return (
    cur.start !== periodModalInitial.start ||
    cur.end !== periodModalInitial.end ||
    cur.flow !== periodModalInitial.flow
  );
}

function resetPeriodFormToInitial() {
  if (!periodModalInitial) return;
  periodStartEl.value = periodModalInitial.start;
  periodEndEl.value = periodModalInitial.end;
  flowChips.dataset.value = periodModalInitial.flow;
  const flowLabel = periodModalInitial.flow[0].toUpperCase() + periodModalInitial.flow.slice(1);
  setChipOn(flowChips, flowLabel);
  periodError.hidden = true;
  periodError.textContent = "";
}

function closePeriodModalOnly() {
  periodModalInitial = null;
  closeModal(periodDiscardModal);
  closeModal(periodModal);
}

function requestClosePeriodModal() {
  if (!periodFormIsDirty()) {
    closePeriodModalOnly();
    return;
  }
  openModal(periodDiscardModal);
}

function savePeriodFromModal() {
  periodError.hidden = true;
  periodError.textContent = "";
  const s = periodStartEl.value;
  const en = periodEndEl.value;
  const flow = (flowChips.dataset.value || "medium").toLowerCase();
  if (!s || !en) {
    showPeriodError("Please select start and end dates.");
    return false;
  }
  const normalized = normalizePeriod({ startISO: s, endISO: en, flow });
  if (!normalized) {
    showPeriodError("End date must be the same day or after the start date.");
    return false;
  }

  const key = `${normalized.startISO}__${normalized.endISO}__${normalized.flow}`;
  const existingKeys = new Set(state.data.periods.map((p) => `${p.startISO}__${p.endISO}__${p.flow}`));
  if (!existingKeys.has(key)) {
    state.data.periods.push(normalized);
    sortPeriods(state.data.periods);
  }
  syncCyclePrefsFromLogs(toISODate(new Date()));
  saveUserData(state.user, state.data);
  invalidateCycleState();
  savePeriodBtn.textContent = "Period saved 🌷";
  savePeriodBtn.classList.add("is-success");
  refreshAll();
  if (!existingKeys.has(key)) showHomePeriodSavedToast(normalized.startISO);
  else showCalmToast("Already on your calendar — no change needed.");
  periodModalInitial = getPeriodFormState();
  setTimeout(() => closePeriodModalOnly(), 850);
  return true;
}

function bindPeriodModalOnce() {
  if (bindPeriodModalOnce._done) return;
  bindPeriodModalOnce._done = true;

  $$("#periodForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
  });

  closePeriodBtn?.addEventListener("click", () => requestClosePeriodModal());

  periodModal?.addEventListener("cancel", (e) => {
    e.preventDefault();
    requestClosePeriodModal();
  });

  savePeriodBtn?.addEventListener("click", () => savePeriodFromModal());

  periodDiscardBtn?.addEventListener("click", () => {
    resetPeriodFormToInitial();
    closePeriodModalOnly();
  });

  periodDiscardSaveBtn?.addEventListener("click", () => {
    closeModal(periodDiscardModal);
    savePeriodFromModal();
  });

  periodDiscardContinueBtn?.addEventListener("click", () => {
    closeModal(periodDiscardModal);
  });

  deletePeriodBtn?.addEventListener("click", () => {
    if (state.data.periods.length === 0) return;
    state.data.periods.pop();
    syncCyclePrefsFromLogs(toISODate(new Date()));
    saveUserData(state.user, state.data);
    invalidateCycleState();
    periodModalInitial = null;
    closeModal(periodDiscardModal);
    closeModal(periodModal);
    refreshAll();
    showCalmToast("Period log removed. Your cycle view has been refreshed.");
  });
}

function openPeriodModal(prefillISO = null) {
  bindPeriodModalOnce();
  periodError.hidden = true;
  periodError.textContent = "";
  savePeriodBtn.textContent = "Save period";
  savePeriodBtn.classList.remove("is-success");

  makeChips(flowChips, FLOW, {
    tone: "rose",
    kind: "flow",
    onPick: (v) => {
      flowChips.dataset.value = v.toLowerCase();
      setChipOn(flowChips, v);
    },
  });

  const lp = lastPeriod(state.data.periods);
  const defaultStart = prefillISO || toISODate(new Date());
  periodStartEl.value = defaultStart;
  periodEndEl.value = defaultStart;
  const flowLabel = lp?.flow ? lp.flow[0].toUpperCase() + lp.flow.slice(1) : "Medium";
  flowChips.dataset.value = (lp?.flow || "medium").toLowerCase();
  setChipOn(flowChips, flowLabel);

  deletePeriodBtn.hidden = state.data.periods.length === 0;

  periodModalInitial = getPeriodFormState();
  openModal(periodModal);
}

/* ═══ First-time onboarding (premium ritual) ═══ */

function needsOnboarding() {
  return state.data?.onboardingComplete === false;
}

let onbStep = 0;
let onbDraft = {
  preferredName: "",
  phase: null,
  energy: "Medium",
  moods: [],
  symptoms: [],
  cycleLength: 28,
  periodDuration: 5,
};

const ONB_MOOD_TO_SAVE = {
  Calm: "Calm",
  Sensitive: "Sensitive",
  Emotional: "Emotional",
  Anxious: "Anxious",
  Hopeful: "Happy",
  Drained: "Emotional",
  Focused: "Calm",
};

const ONB_SYMPTOM_CHIPS = [
  { id: "Cramps", label: "Cramps", mapsTo: "Cramps" },
  { id: "Bloating", label: "Bloating", mapsTo: "Bloating" },
  { id: "Fatigue", label: "Fatigue", mapsTo: "Fatigue" },
  { id: "Headache", label: "Headache", mapsTo: "Headache" },
  { id: "Tenderness", label: "Tenderness", mapsTo: "Tenderness" },
  { id: "Rest", label: "Rest", mapsTo: "Fatigue" },
  { id: "Hydration", label: "Hydration", mapsTo: null },
];

function onbPhaseSlug() {
  if (!onbDraft.phase || onbDraft.phase === "Unsure") return "unknown";
  return String(onbDraft.phase).toLowerCase();
}

function onbPreviewProgress() {
  const s = onbPhaseSlug();
  const m = { period: 0.1, follicular: 0.35, ovulation: 0.55, luteal: 0.78, unknown: 0.22 };
  return m[s] ?? 0.22;
}

function draftToWellnessModel() {
  const m0 = onbDraft.moods[0];
  const mood = m0 && ONB_MOOD_TO_SAVE[m0] ? ONB_MOOD_TO_SAVE[m0] : "Calm";
  const symptoms = [];
  for (const id of onbDraft.symptoms) {
    const row = ONB_SYMPTOM_CHIPS.find((x) => x.id === id);
    const tgt = row?.mapsTo === null ? null : row?.mapsTo || id;
    if (tgt && !symptoms.includes(tgt)) symptoms.push(tgt);
  }
  return {
    mood,
    energy: onbDraft.energy || "Medium",
    flowFeel: "Light",
    symptoms: symptoms.slice(0, 4),
  };
}

function syncOnboardingOrbPreview() {
  const el = $$("#onboardingWellnessViz");
  if (!el) return;
  const m = draftToWellnessModel();
  const slug = onbPhaseSlug();
  const pct = onbPreviewProgress();
  el.style.setProperty("--cycle-progress", String(pct));
  el.dataset.energy = wellnessSlug(m.energy);
  el.dataset.mood = wellnessSlug(m.mood);
  el.dataset.flow = "light";
  el.dataset.symptoms = String(Math.min(m.symptoms.length, 4));
  el.dataset.phase = slug;
  el.dataset.fatigue = m.symptoms.includes("Fatigue") ? "1" : "0";
  el.dataset.emotional = ["Anxious", "Emotional", "Sensitive"].includes(m.mood) ? "1" : "0";
  el.dataset.flowheavy = "0";
  const phEl = $$("#onbVizPhase");
  if (phEl) phEl.textContent = onbDraft.phase && onbDraft.phase !== "Unsure" ? `Today · ${onbDraft.phase}` : "Today · gentle start";
  const enShort =
    m.energy === "High" ? "Bright energy" : m.energy === "Low" ? "Soft energy" : "Steady energy";
  const echo = $$("#onbVizEcho");
  if (echo) echo.textContent = `${m.mood} · ${enShort} · Light flow`;
  const cap = el.querySelector(".onboarding-progress-cap");
  if (cap) {
    const deg = -90 + pct * 360;
    cap.setAttribute("transform", `rotate(${deg} 140 140)`);
  }
  let sig = "steady";
  if (slug === "ovulation" && m.energy === "High") sig = "radiant";
  else if (slug === "period") sig = "release";
  else if (["Anxious", "Emotional", "Sensitive"].includes(m.mood)) sig = "inward";
  else if (m.energy === "Low") sig = "rest";
  else if (slug === "luteal") sig = "gather";
  else if (slug === "follicular") sig = "open";
  el.dataset.signature = sig;
  const pnm = $$("#onbPreviewName");
  if (pnm) {
    pnm.textContent = onbDraft.preferredName.trim()
      ? `Hello, ${onbDraft.preferredName.trim()}`
      : "Your rhythm will greet you here";
  }
}

function onbValidateStep() {
  if (onbStep === 2) return Boolean(onbDraft.phase);
  if (onbStep === 4) return onbDraft.moods.length >= 1 && onbDraft.moods.length <= 2;
  return true;
}

function renderOnboardingStep() {
  const title = $$("#onbStepTitle");
  const sub = $$("#onbStepSub");
  const body = $$("#onbStepBody");
  const rail = $$("#onbRailFill");
  const back = $$("#onbBack");
  const next = $$("#onbNext");
  if (!title || !sub || !body || !next) return;
  const total = 8;
  if (rail) rail.style.width = `${(onbStep / Math.max(1, total - 1)) * 100}%`;
  if (back) back.hidden = onbStep === 0;

  const steps = [
    {
      title: "Ayla learns your rhythm softly",
      sub: "No rush — a few gentle touches, and your space begins to feel like you.",
      kind: "welcome",
    },
    {
      title: "What should Ayla call you?",
      sub: "This is only for warmth inside the app — never clinical.",
      kind: "name",
    },
    {
      title: "Where are you in your cycle today?",
      sub: "Tap what feels closest; your orb will shift with you.",
      kind: "phase",
    },
    {
      title: "How is your energy feeling lately?",
      sub: "Slide softly — Resting, Balanced, or Bright.",
      kind: "energy",
    },
    {
      title: "What feels closest today?",
      sub: "Choose up to two — mixed feelings belong here.",
      kind: "mood",
    },
    {
      title: "What is your body asking for?",
      sub: "Pick whatever fits — you can change this anytime.",
      kind: "symptoms",
    },
    {
      title: "Your gentle averages",
      sub: "Fine-tune defaults for forecasts — you can edit later in cycle details.",
      kind: "rhythm",
    },
    {
      title: "You are already understood a little more",
      sub: "Take a breath — your homepage is ready when you are.",
      kind: "done",
    },
  ];

  const st = steps[onbStep] || steps[0];
  title.textContent = st.title;
  sub.textContent = st.sub;
  sub.hidden = !st.sub;

  if (onbStep === total - 1) next.textContent = "Enter Ayla";
  else if (onbStep === 0) next.textContent = "Begin gently";
  else next.textContent = "Continue";

  const moodUi = ["Calm", "Sensitive", "Emotional", "Anxious", "Hopeful", "Drained", "Focused"];

  if (st.kind === "welcome") {
    body.innerHTML =
      '<p class="ayla-onboarding__welcome-copy">Your answers stay on this device. Ayla uses them only to soften guidance — never to judge.</p>';
  } else if (st.kind === "name") {
    body.innerHTML = '<div class="ayla-onboarding__field" id="onbNameMount"></div>';
    const mount = $$("#onbNameMount");
    if (mount) {
      mount.innerHTML = "";
      const inp = document.createElement("input");
      inp.type = "text";
      inp.className = "ayla-onboarding__input";
      inp.id = "onbNameInput";
      inp.maxLength = 40;
      inp.autocomplete = "given-name";
      inp.placeholder = "First name or nickname";
      inp.value = onbDraft.preferredName;
      inp.addEventListener("input", () => {
        onbDraft.preferredName = inp.value;
        syncOnboardingOrbPreview();
      });
      mount.appendChild(inp);
    }
  } else if (st.kind === "phase") {
    const cards = [
      { id: "Period", label: "Period", hint: "Bleeding days", tone: "rose" },
      { id: "Follicular", label: "Follicular", hint: "After your bleed", tone: "sage" },
      { id: "Ovulation", label: "Ovulation", hint: "Radiant window", tone: "peach" },
      { id: "Luteal", label: "Luteal", hint: "Pre-bleed inward arc", tone: "plum" },
      { id: "Unsure", label: "I'm unsure", hint: "We'll stay soft until you log dates", tone: "mist" },
    ];
    const frag = document.createElement("div");
    frag.className = "ayla-onboarding__cards";
    frag.setAttribute("role", "list");
    cards.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `ayla-onboarding__card ayla-onboarding__card--${c.tone}${onbDraft.phase === c.id ? " is-selected" : ""}`;
      btn.dataset.phase = c.id;
      btn.setAttribute("role", "listitem");
      const lb = document.createElement("span");
      lb.className = "ayla-onboarding__card-label";
      lb.textContent = c.label;
      const hi = document.createElement("span");
      hi.className = "ayla-onboarding__card-hint";
      hi.textContent = c.hint;
      btn.appendChild(lb);
      btn.appendChild(hi);
      btn.addEventListener("click", () => {
        onbDraft.phase = c.id;
        renderOnboardingStep();
        syncOnboardingOrbPreview();
      });
      frag.appendChild(btn);
    });
    body.innerHTML = "";
    body.appendChild(frag);
  } else if (st.kind === "energy") {
    const v = wellnessEnergyIndex(onbDraft.energy);
    body.innerHTML = `<div class="ayla-onboarding__slider-wrap">
      <input type="range" class="ayla-onboarding__range" id="onbEnergy" min="0" max="2" step="1" value="${v}" />
      <div class="ayla-onboarding__ticks"><span>Resting</span><span>Balanced</span><span>Bright</span></div>
    </div>`;
    $$("#onbEnergy")?.addEventListener("input", (e) => {
      onbDraft.energy = wellnessEnergyFromIndex(e.target.value);
      syncOnboardingOrbPreview();
    });
  } else if (st.kind === "mood") {
    const frag = document.createElement("div");
    frag.className = "ayla-onboarding__pills";
    moodUi.forEach((m) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `ayla-onboarding__pill${onbDraft.moods.includes(m) ? " is-on" : ""}`;
      btn.dataset.mood = m;
      btn.textContent = m;
      btn.addEventListener("click", () => {
        const set = new Set(onbDraft.moods);
        if (set.has(m)) set.delete(m);
        else {
          if (set.size >= 2) return;
          set.add(m);
        }
        onbDraft.moods = Array.from(set);
        renderOnboardingStep();
        syncOnboardingOrbPreview();
      });
      frag.appendChild(btn);
    });
    body.innerHTML = "";
    body.appendChild(frag);
  } else if (st.kind === "symptoms") {
    const frag = document.createElement("div");
    frag.className = "ayla-onboarding__pills ayla-onboarding__pills--sym";
    ONB_SYMPTOM_CHIPS.forEach((s) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `ayla-onboarding__pill ayla-onboarding__pill--sym${onbDraft.symptoms.includes(s.id) ? " is-on" : ""}`;
      btn.dataset.sym = s.id;
      btn.textContent = s.label;
      btn.addEventListener("click", () => {
        const set = new Set(onbDraft.symptoms);
        if (set.has(s.id)) set.delete(s.id);
        else if (set.size < 4) set.add(s.id);
        onbDraft.symptoms = Array.from(set);
        renderOnboardingStep();
        syncOnboardingOrbPreview();
      });
      frag.appendChild(btn);
    });
    body.innerHTML = "";
    body.appendChild(frag);
  } else if (st.kind === "rhythm") {
    body.innerHTML = `<div class="ayla-onboarding__wheels">
      <div class="ayla-onboarding__wheel">
        <label class="ayla-onboarding__wheel-label">Average cycle <span id="onbCycleLabel">${onbDraft.cycleLength}</span> days</label>
        <input type="range" id="onbCycleLen" min="21" max="40" value="${onbDraft.cycleLength}" />
      </div>
      <div class="ayla-onboarding__wheel">
        <label class="ayla-onboarding__wheel-label">Average period <span id="onbPeriodLabel">${onbDraft.periodDuration}</span> days</label>
        <input type="range" id="onbPeriodDur" min="2" max="8" value="${onbDraft.periodDuration}" />
      </div>
    </div>`;
    $$("#onbCycleLen")?.addEventListener("input", (e) => {
      onbDraft.cycleLength = Number(e.target.value);
      const l = $$("#onbCycleLabel");
      if (l) l.textContent = String(onbDraft.cycleLength);
      syncOnboardingOrbPreview();
    });
    $$("#onbPeriodDur")?.addEventListener("input", (e) => {
      onbDraft.periodDuration = Number(e.target.value);
      const l = $$("#onbPeriodLabel");
      if (l) l.textContent = String(onbDraft.periodDuration);
      syncOnboardingOrbPreview();
    });
  } else if (st.kind === "done") {
    const m = draftToWellnessModel();
    const phaseLine =
      onbDraft.phase && onbDraft.phase !== "Unsure" ? onbDraft.phase : "a gentle rhythm still unfolding";
    const support =
      m.symptoms.includes("Cramps") || m.symptoms.includes("Fatigue")
        ? "Warmth, hydration, and kind pacing may support you beautifully."
        : "Hydration and softer transitions are small gifts your body often notices.";
    body.innerHTML = `<div class="ayla-onboarding__summary">
      <p class="ayla-onboarding__summary-lead">A softer rhythm may support you beautifully today.</p>
      <ul class="ayla-onboarding__summary-list">
        <li><strong>Phase sense</strong> · ${phaseLine}</li>
        <li><strong>Energy</strong> · ${m.energy === "High" ? "Brighter" : m.energy === "Low" ? "Softer" : "Balanced"} tone</li>
        <li><strong>Heart</strong> · ${m.mood}</li>
        <li><strong>Support</strong> · ${support}</li>
      </ul>
    </div>`;
  }

  next.disabled = false;
  syncOnboardingOrbPreview();
}

function closeOnboarding() {
  document.body.classList.remove("is-onboarding");
  const ov = $$("#onboardingOverlay");
  if (ov) {
    ov.hidden = true;
    ov.setAttribute("aria-hidden", "true");
  }
}

function normalizePreferredNameFromOnboarding(raw) {
  const n = String(raw || "").trim().replace(/\s+/g, " ");
  if (!n || n.length > 80) return "";
  try {
    if (!/^[\p{L}\p{M}][\p{L}\p{M}\s'\-.]*$/u.test(n)) return "";
  } catch {
    if (!/^[A-Za-zÀ-ž][A-Za-zÀ-ž\s'\-.]*$/.test(n)) return "";
  }
  return n;
}

function completeOnboarding() {
  const iso = toISODate(new Date());
  const m = draftToWellnessModel();
  let symptoms = m.symptoms.slice();
  if (onbDraft.moods.some((m) => m === "Drained") && !symptoms.includes("Fatigue")) {
    symptoms = [...symptoms, "Fatigue"].slice(0, 4);
  }
  state.data.checkins[iso] = {
    ...(state.data.checkins[iso] || {}),
    mood: m.mood,
    energy: m.energy,
    flowFeel: "Light",
    symptoms,
  };
  state.data.cyclePrefs.cycleLength = clamp(Number(onbDraft.cycleLength) || 28, 15, 60);
  state.data.cyclePrefs.periodDuration = clamp(Number(onbDraft.periodDuration) || 5, 2, 10);
  state.data.onboardingComplete = true;

  const nm = normalizePreferredNameFromOnboarding(onbDraft.preferredName);
  if (nm) {
    const users = loadUsers();
    const idx = users.findIndex((u) => storageSessionKey(u) === state.user);
    if (idx >= 0) {
      users[idx] = { ...users[idx], fullName: nm };
      saveUsers(users);
      state.profile = users[idx];
    }
  }

  saveUserData(state.user, state.data);
  closeOnboarding();
  refreshAll();
  applyRoute();
}

function openOnboarding() {
  document.body.classList.add("is-onboarding");
  const ov = $$("#onboardingOverlay");
  if (ov) {
    ov.hidden = false;
    ov.setAttribute("aria-hidden", "false");
  }
  onbStep = 0;
  onbDraft = {
    preferredName: (state.profile && state.profile.fullName) || "",
    phase: null,
    energy: "Medium",
    moods: [],
    symptoms: [],
    cycleLength: 28,
    periodDuration: 5,
  };
  renderOnboardingStep();
  syncOnboardingOrbPreview();
  requestAnimationFrame(() => $$("#onbNext")?.focus());
}

function bindOnboardingOnce() {
  if (document.body.dataset.onbBound === "1") return;
  document.body.dataset.onbBound = "1";
  $$("#onbNext")?.addEventListener("click", () => {
    if (!onbValidateStep()) {
      const nb = $$("#onbNext");
      nb?.classList.add("ayla-onboarding__next--warn");
      setTimeout(() => nb?.classList.remove("ayla-onboarding__next--warn"), 500);
      return;
    }
    if (onbStep >= 7) {
      document.body.classList.add("onboarding-leaving");
      setTimeout(() => {
        document.body.classList.remove("onboarding-leaving");
        completeOnboarding();
      }, 480);
      return;
    }
    onbStep += 1;
    renderOnboardingStep();
  });
  $$("#onbBack")?.addEventListener("click", () => {
    if (onbStep <= 0) return;
    onbStep -= 1;
    renderOnboardingStep();
  });
}

function bumpViewMonth(delta) {
  const d = state.viewMonth ?? startOfMonth(new Date());
  state.viewMonth = startOfMonth(new Date(d.getFullYear(), d.getMonth() + delta, 1));
  buildCalendar();
  renderCalendarTodayCard();
  renderDayPanel();
}

function isHomeSidebarMobile() {
  return window.matchMedia("(max-width: 1179px)").matches;
}

function readSidebarCollapsed() {
  try {
    return localStorage.getItem(LS.sidebarCollapsed) === "true";
  } catch {
    return false;
  }
}

function persistSidebarCollapsed(collapsed) {
  try {
    localStorage.setItem(LS.sidebarCollapsed, String(collapsed));
  } catch {
    /* storage unavailable */
  }
}

function updateSidebarToggleUi(collapsed, mobile) {
  if (!homeSidebarToggle) return;
  if (mobile) {
    const open = !collapsed;
    homeSidebarToggle.setAttribute("aria-expanded", String(open));
    homeSidebarToggle.setAttribute("aria-label", open ? "Close sidebar" : "Open sidebar");
    homeSidebarToggle.dataset.sidebarChevron = open ? "left" : "right";
    return;
  }
  homeSidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  homeSidebarToggle.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
  homeSidebarToggle.dataset.sidebarChevron = collapsed ? "right" : "left";
}

function applySidebarState(collapsed, { persist = true } = {}) {
  if (!homeSidebar || !homeLayoutRef) return;
  const mobile = isHomeSidebarMobile();
  const collapsedNav = homeSidebar.querySelector(".home-sidebar__collapsed-nav");

  homeSidebar.dataset.collapsed = collapsed ? "true" : "false";
  homeSidebar.classList.remove("is-sidebar-collapsed", "is-sidebar-open");
  homeLayoutRef.classList.remove("is-sidebar-collapsed");

  if (mobile) {
    const open = !collapsed;
    homeSidebar.classList.toggle("is-sidebar-open", open);
    if (homeSidebarBackdrop) {
      homeSidebarBackdrop.hidden = !open;
      homeSidebarBackdrop.classList.toggle("is-visible", open);
    }
    homeLayoutRef.style.removeProperty("--dash-sidebar-active-w");
    if (collapsedNav) collapsedNav.setAttribute("aria-hidden", "true");
  } else {
    homeSidebar.classList.toggle("is-sidebar-collapsed", collapsed);
    homeLayoutRef.classList.toggle("is-sidebar-collapsed", collapsed);
    homeLayoutRef.style.setProperty("--dash-sidebar-active-w", collapsed ? "72px" : "320px");
    if (homeSidebarBackdrop) {
      homeSidebarBackdrop.hidden = true;
      homeSidebarBackdrop.classList.remove("is-visible");
    }
    if (collapsedNav) collapsedNav.setAttribute("aria-hidden", collapsed ? "false" : "true");
  }

  updateSidebarToggleUi(collapsed, mobile);
  if (persist) persistSidebarCollapsed(collapsed);
}

function toggleHomeSidebar() {
  const collapsed = homeSidebar?.dataset.collapsed !== "true";
  applySidebarState(collapsed);
}

function initHomeSidebar() {
  if (!homeSidebar || !homeLayoutRef) return;
  applySidebarState(readSidebarCollapsed(), { persist: false });

  homeSidebarToggle?.addEventListener("click", toggleHomeSidebar);
  homeSidebarBackdrop?.addEventListener("click", () => applySidebarState(true));

  $$$("[data-sidebar-expand]", homeSidebar).forEach((btn) => {
    btn.addEventListener("click", () => applySidebarState(false));
  });

  window.matchMedia("(max-width: 1179px)").addEventListener("change", () => {
    applySidebarState(readSidebarCollapsed(), { persist: false });
  });
}

let calendarDayRollTimer = null;

/** Re-render calendars when the calendar day rolls (midnight) or tab becomes visible. */
function onCalendarDayPossiblyChanged() {
  const today = toISODate(new Date());
  if (state._calAnchorDay === today) return;
  const hadPrior = Boolean(state._calAnchorDay);
  state._calAnchorDay = today;
  if (!hadPrior) return;
  buildCalendar();
  if (typeof renderHomeSurface === "function") renderHomeSurface();
}

function scheduleCalendarDayRoll() {
  if (calendarDayRollTimer) clearTimeout(calendarDayRollTimer);
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1, 0);
  calendarDayRollTimer = setTimeout(() => {
    onCalendarDayPossiblyChanged();
    scheduleCalendarDayRoll();
  }, Math.max(1000, next.getTime() - now.getTime()));
}

function init() {
  const username = requireSession();
  if (!username) return;

  state.user = username;
  const users = loadUsers();
  state.profile = findUser(users, username);
  state.data = loadUserData(username);

  state.selectedISO = toISODate(new Date());
  state.viewMonth = startOfMonth(new Date());

  logoutBtn?.addEventListener("click", logout);

  heroCycleBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    location.hash = "cycle";
  });

  heroEnergyBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    location.hash = "energy";
  });

  homeNotifyBtn?.addEventListener("click", () => {
    localStorage.setItem("ayla_notify_demo", "0");
    if (homeNotifyDot) homeNotifyDot.hidden = true;
  });

  mobileTabLog?.addEventListener("click", () => openCheckin(toISODate(new Date())));

  mobileTabProfile?.addEventListener("click", () => openModal(settingsModal));
  topbarProfileBtn?.addEventListener("click", () => openModal(settingsModal));

  $$$(".mobile-tabbar__item[data-route]").forEach((el) => {
    el.addEventListener("click", (e) => {
      const r = el.dataset.route;
      if (!r) return;
      e.preventDefault();
      location.hash = r;
    });
  });

  homeSnapMoodBtn?.addEventListener("click", () => openHomeMoodSheet());
  homeSnapEnergyBtn?.addEventListener("click", () => openHomeEnergySheet());
  homeSnapSleepBtn?.addEventListener("click", () => openHomeSleepSheet());
  homeSnapSymptomsBtn?.addEventListener("click", () => openHomeSymptomsSheet());
  homeSnapWaterBtn?.addEventListener("click", () => openHomeWaterSheet());

  $$("#homeQuicklogPrimaryCta")?.addEventListener("click", () => {
    const action = $$("#homeQuicklogPrimaryCta")?.dataset.homeQuicklogCta || "symptoms";
    if (action === "symptoms") openHomeSymptomsSheet();
    else if (action === "mood") openHomeMoodSheet();
    else openHomeMoodSheet();
  });

  homeWaterPlusBtn?.addEventListener("click", () => {
    const iso = toISODate(new Date());
    const prev = state.data.checkins[iso] || {};
    const cur = Number(prev.waterGlasses);
    const next = Number.isFinite(cur) ? clamp(cur + 1, 0, 12) : 1;
    mergeTodayCheckin({ waterGlasses: next });
    refreshHomeWaterSheetLabel();
  });
  homeWaterMinusBtn?.addEventListener("click", () => {
    const iso = toISODate(new Date());
    const prev = state.data.checkins[iso] || {};
    const cur = Number(prev.waterGlasses);
    const next = clamp((Number.isFinite(cur) ? cur : 0) - 1, 0, 12);
    mergeTodayCheckin({ waterGlasses: next });
    refreshHomeWaterSheetLabel();
  });

  homeSheetSymptomsSave?.addEventListener("click", () => {
    const set = homeSymptomsSheet?._symDraft;
    if (!set) return;
    const iso = toISODate(new Date());
    const prev = state.data.checkins[iso] || {};
    const prevSy = Array.isArray(prev.symptoms) ? prev.symptoms.filter(Boolean) : [];
    const kept = prevSy.filter((s) => !HOME_SYMPTOM_PICKS.includes(s));
    const picked = [...set].filter((s) => HOME_SYMPTOM_PICKS.includes(s));
    mergeTodayCheckin({ symptoms: [...kept, ...picked].slice(0, 12) });
    showCalmToast("Symptoms saved.");
    closeModal(homeSymptomsSheet);
  });

  homePeriodOpenFullBtn?.addEventListener("click", () => {
    closeModal(homePeriodQuickSheet);
    closeModal(homePeriodAdaptiveSheet);
    openPeriodModal(toISODate(new Date()));
  });

  const quickRow = $$("#homeQuickLogRow");
  quickRow?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-home-quick]");
    if (!btn || !quickRow.contains(btn)) return;
    const q = btn.getAttribute("data-home-quick");
    pulseHomeQuickChip(btn, q);
    const iso = toISODate(new Date());
    if (q === "period") openAdaptivePeriodFlow();
    else if (q === "cramps" || q === "symptoms") openHomeSymptomsSheet();
    else if (q === "notes") openCheckin(iso);
    else if (q === "flow") openAdaptivePeriodFlow({ startStep: "tune-today" });
    else if (q === "water") openHomeWaterSheet();
    else if (q === "energy") openHomeEnergySheet();
    else if (q === "sleep") openHomeSleepSheet();
    else if (q === "mood") openHomeMoodSheet();
    else if (q === "movement") openCheckin(iso);
    else if (q === "medication") openCheckin(iso);
    else if (q === "intimacy" || q === "more") openCheckin(iso);
  });

  footerPrivacyBtn?.addEventListener("click", () => {
    location.hash = "privacy";
  });

  const onHomeCycleFieldInput = () => {
    if (homeCycleSaveState) homeCycleSaveState.textContent = "Saving…";
    saveHomePrefsDebounced();
  };
  homeCycleLengthInput?.addEventListener("input", onHomeCycleFieldInput);
  homePeriodStartInput?.addEventListener("input", onHomeCycleFieldInput);
  homePeriodDurationInput?.addEventListener("input", onHomeCycleFieldInput);

  settingsThemeBtn?.addEventListener("click", () => {
    closeModal(settingsModal);
    const tm = $$("#themeModal");
    if (tm) openModal(tm);
  });

  privacyModal?.addEventListener("close", () => {
    if ((location.hash || "").toLowerCase() === "#privacy") {
      history.replaceState(null, "", `${location.pathname}${location.search}#${state.lastRoute || "home"}`);
      updateNavActive(state.lastRoute || "home");
    }
  });

  $$$(".app-nav__tab[data-route]").forEach((el) => {
    el.addEventListener("click", (e) => {
      const r = el.dataset.route;
      if (!r) return;
      if (el.tagName === "A") return;
      e.preventDefault();
      location.hash = r;
    });
  });

  if (!location.hash || location.hash === "#") {
    location.replace(`${location.pathname}${location.search}#home`);
  }
  if (!needsOnboarding()) {
    applyRoute();
  }
  window.addEventListener("hashchange", () => {
    if (document.body.classList.contains("is-onboarding")) return;
    applyRoute();
  });

  prevMonthBtn?.addEventListener("click", () => bumpViewMonth(-1));
  nextMonthBtn?.addEventListener("click", () => bumpViewMonth(1));
  homeMiniCalPrev?.addEventListener("click", () => bumpViewMonth(-1));
  homeMiniCalNext?.addEventListener("click", () => bumpViewMonth(1));

  $$$(".js-open-checkin-today").forEach((btn) => {
    btn.addEventListener("click", () => openCheckin(toISODate(new Date())));
  });
  $$$(".js-open-period-today").forEach((btn) => {
    btn.addEventListener("click", () => openPeriodModal(toISODate(new Date())));
  });

  calOpenDayDetailsBtn?.addEventListener("click", () => {
    if (!state.selectedISO) return;
    openDayView(state.selectedISO);
  });

  dayPanel?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cal-action]");
    if (!btn || !dayPanel.contains(btn)) return;
    const iso = state.selectedISO;
    if (!iso) return;
    const act = btn.getAttribute("data-cal-action");
    if (act === "checkin") openCheckin(iso);
    if (act === "period") openPeriodModal(iso);
  });

  initWellnessHome();
  bindPhaseNotesLearn();
  bindOnboardingOnce();
  wireHomeSnapSheetsOnce();
  wireHomeHeroCtasOnce();
  bindPeriodModalOnce();
  if (needsOnboarding()) {
    openOnboarding();
  } else {
    refreshAll();
  }
  state._calAnchorDay = toISODate(new Date());
  scheduleCalendarDayRoll();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") onCalendarDayPossiblyChanged();
  });
  bindHeroWaveHoverOnce();
  initHomeSidebar();

  // Calm page-load polish for inner content only
  requestAnimationFrame(() => {
    document.body.classList.add("is-ready");
  });
}

init();

