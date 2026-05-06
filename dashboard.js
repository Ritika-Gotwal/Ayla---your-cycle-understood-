/* Ayla — Dashboard app (dashboard.html) */

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

function loadUsers() {
  const raw = localStorage.getItem(LS.users);
  const parsed = safeJSONParse(raw || "[]", []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((u) => u && typeof u.username === "string" && typeof u.password === "string")
    .map((u) => ({
      fullName: typeof u.fullName === "string" ? u.fullName : undefined,
      username: String(u.username),
      password: String(u.password),
    }));
}

function usernameKey(username) {
  return String(username || "").trim().toLowerCase();
}

function findUser(users, username) {
  const key = usernameKey(username);
  return users.find((u) => usernameKey(u.username) === key) || null;
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
    periods: [], // { startISO, endISO, flow }
    checkins: {}, // iso -> { mood, energy, pain, notes }
    cyclePrefs: {
      cycleLength: 28,
      periodStartISO: null,
      periodDuration: 5,
    },
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

function fertileWindowForISO(periods, iso) {
  const cyc = cycleForISO(periods, state.data?.cyclePrefs || null, iso);
  return cyc?.fertileWindow || null;
}

/**
 * Single source of truth for cycle phase + fertility signals.
 * Returns null when there isn't enough data to make a deterministic call.
 */
function cycleForISO(periods, prefs, iso) {
  const ps = periods || [];
  const startISO = cycleStartForISO(ps, iso, prefs);
  if (!startISO) return null;

  const contained = ps.find((p) => iso >= p.startISO && iso <= p.endISO) || null;
  const pdFromLog = contained ? daysBetweenISO(contained.startISO, contained.endISO) + 1 : null;
  const periodDur = clamp(Number(prefs?.periodDuration) || pdFromLog || 5, 2, 10);

  // If we're within a logged period range, phase is deterministic even without cycle length.
  if (contained) {
    return {
      phase: "Period",
      tone: "Gentle rest. Warmth, softness, and slow plans.",
      startISO,
      cycleLen: cycleLenForStart(ps, startISO, prefs),
      periodDur,
      ovulationISO: null,
      fertileWindow: null,
      isFertile: false,
      isOvulation: false,
    };
  }

  const cycleLen = cycleLenForStart(ps, startISO, prefs);
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
      ? "Steady energy. Great time to plan and start fresh."
      : phase === "Ovulation"
        ? "You may feel bright and social. Hydrate and listen in."
        : phase === "Luteal"
          ? "Lower bandwidth is normal. Choose softer tasks and early nights."
          : "Gentle rest. Warmth, softness, and slow plans.";

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
  };
}

function dynamicTopLine(phase, checkin) {
  if (checkin?.pain === "High") return "A tender day. Choose softness, warmth, and a slower pace.";
  if (checkin?.energy === "Low") return "You’re in a slower phase today. Go gently with yourself.";
  if (checkin?.energy === "High") return "Energy is rising today. This can be a lovely time to begin.";
  if (phase === "Period") return "A quieter phase today. Rest is productive too.";
  if (phase === "Follicular") return "You may feel more open to starting fresh today.";
  if (phase === "Ovulation") return "A brighter phase today. Let things feel light and flowing.";
  if (phase === "Luteal") return "A softer rhythm may support you best right now.";
  return "A gentle place to check in.";
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
        if ((checkins[iso]?.mood || "") === "Low") lutealLows.push(iso);
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
    body: "Energy is often lowest and the nervous system can be more sensitive. Many women feel better with gentler movement here.",
    do: ["Light: walking, stretching", "Yoga: child’s pose, legs‑up‑wall", "Optional: gentle mobility"],
    why: "Gentle movement supports circulation and comfort without pushing recovery.",
  },
  Follicular: {
    body: "Many women feel more motivated and resilient here. It can be a great time to learn or build strength.",
    do: ["Moderate: strength training", "Cardio: steady pace", "Yoga: flow / mobility"],
    why: "Rising estrogen often supports strength and recovery (listen to your baseline).",
  },
  Ovulation: {
    body: "Often a high-energy window. Your body may tolerate intensity better today.",
    do: ["Intense: intervals, faster cardio", "Strength: heavier sets", "Yoga: dynamic flow"],
    why: "Higher energy can make hard sessions feel smoother—warm up well and hydrate.",
  },
  Luteal: {
    body: "Bandwidth may drop. Stable, calming movement often feels best.",
    do: ["Light–Moderate: pilates, zone‑2", "Yoga: yin, slow flow", "Recovery: longer walks"],
    why: "Lowering intensity can reduce stress load and support mood steadiness.",
  },
};

function currentPhaseToday() {
  const periods = state.data?.periods || [];
  const iso = toISODate(new Date());
  return phaseForDate(periods, iso)?.phase || null;
}

function renderPhaseCards(container, kind) {
  if (!container) return;
  const phaseToday = currentPhaseToday();
  const data = kind === "food" ? FOOD_GUIDANCE : MOVE_GUIDANCE;
  const isBoard = container.id === "foodCards" || container.id === "moveCards";
  container.innerHTML = "";

  PHASE_ORDER.forEach((phase) => {
    const cfg = data[phase];
    if (!cfg) return;

    const card = document.createElement("div");
    card.className = `phase-card ${isBoard ? "phase-card--compact" : ""}`.trim();
    card.dataset.phase = phase;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `${phase} phase`);
    if (phaseToday && phase === phaseToday) card.classList.add("is-current");

    const top = document.createElement("div");
    top.className = "phase-card__top";

    const left = document.createElement("div");
    left.className = "phase-card__left";
    const meta = phaseTone(phase);
    const icon = document.createElement("span");
    icon.className = `phase-card__icon phase-card__icon--${meta.tone}`;
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = meta.icon;
    const title = document.createElement("div");
    title.className = "phase-card__title";
    title.textContent = phase;
    const hint = document.createElement("div");
    hint.className = "phase-card__hint";
    hint.textContent = cfg.body;
    const titleStack = document.createElement("div");
    titleStack.className = "phase-card__titleStack";
    titleStack.appendChild(title);
    titleStack.appendChild(hint);
    left.appendChild(icon);
    left.appendChild(titleStack);

    const pill = document.createElement("div");
    pill.className = "pill";
    pill.textContent = "Today";
    pill.style.visibility = phaseToday && phase === phaseToday ? "visible" : "hidden";

    top.appendChild(left);
    top.appendChild(pill);
    card.appendChild(top);

    const ul = document.createElement("ul");
    ul.className = "phase-card__list";
    const items = kind === "food" ? cfg.eat : cfg.do;
    // Left preview = 2–3 highlights max (avoid tall cards).
    items.slice(0, isBoard ? 3 : 6).forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      ul.appendChild(li);
    });
    card.appendChild(ul);

    if (isBoard) {
      container.appendChild(card);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          card.click();
        }
      });
      return;
    }

    const why = document.createElement("div");
    why.className = "phase-card__why";
    why.textContent = `Why: ${cfg.why}`;
    card.appendChild(why);

    if (kind === "food" && cfg.avoid) {
      const avoid = document.createElement("div");
      avoid.className = "phase-card__avoid";
      avoid.textContent = `Optional avoid: ${cfg.avoid}`;
      card.appendChild(avoid);
    }

    container.appendChild(card);
  });
}

function scrollToTodayPhase(scrollEl) {
  const phaseToday = currentPhaseToday();
  if (!scrollEl || !phaseToday) return;
  const target = scrollEl.querySelector(`.phase-card[data-phase="${phaseToday}"]`);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateScrollFade(el) {
  if (!el) return;
  const atTop = el.scrollTop <= 1;
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
  el.classList.toggle("is-not-top", !atTop);
  el.classList.toggle("is-not-bottom", !atBottom);
}

function refreshFoodView() {
  renderPhaseCards(foodCards, "food");
  renderPhaseAside("food");
  if (foodTodayBtn?.classList.contains("is-active")) scrollToTodayPhase(foodCards);

  $$$(".phase-card", foodCards).forEach((el) => {
    el.addEventListener("click", () => {
      state.foodPhase = el.dataset.phase || null;
      renderPhaseAside("food");
    });
  });
}

function refreshMovementView() {
  renderPhaseCards(moveCards, "move");
  renderPhaseAside("move");
  if (moveTodayBtn?.classList.contains("is-active")) scrollToTodayPhase(moveCards);

  $$$(".phase-card", moveCards).forEach((el) => {
    el.addEventListener("click", () => {
      state.movePhase = el.dataset.phase || null;
      renderPhaseAside("move");
    });
  });
}

function activePhaseForBoard(kind) {
  const explicit = kind === "food" ? state.foodPhase : state.movePhase;
  if (explicit) return explicit;
  const today = currentPhaseToday();
  return today || "Follicular";
}

function renderPhaseAside(kind) {
  const aside = kind === "food" ? foodAside : moveAside;
  if (!aside) return;
  const phase = activePhaseForBoard(kind);
  const data = kind === "food" ? FOOD_GUIDANCE : MOVE_GUIDANCE;
  const cfg = data[phase];
  if (!cfg) return;
  const meta = phaseTone(phase);

  const mkCard = (title, body, tone) => {
    const el = document.createElement("section");
    el.className = `aside-card aside-card--${tone}`;
    const h = document.createElement("div");
    h.className = "aside-card__k";
    h.textContent = title;
    const p = document.createElement("div");
    p.className = "aside-card__v";
    p.textContent = body;
    el.appendChild(h);
    el.appendChild(p);
    return el;
  };

  const listCard = (title, items, tone) => {
    const el = document.createElement("section");
    el.className = `aside-card aside-card--${tone}`;
    const h = document.createElement("div");
    h.className = "aside-card__k";
    h.textContent = title;
    const ul = document.createElement("ul");
    ul.className = "aside-card__list";
    items.slice(0, 5).forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      ul.appendChild(li);
    });
    el.appendChild(h);
    el.appendChild(ul);
    return el;
  };

  aside.innerHTML = "";
  // Soft transition on phase changes (250ms)
  aside.classList.remove("is-updating");
  // eslint-disable-next-line no-unused-expressions
  aside.offsetHeight;
  aside.classList.add("is-updating");
  setTimeout(() => aside.classList.remove("is-updating"), 260);

  const todayLine =
    phase === "Period"
      ? "Your body may need more warmth and grounding today."
      : phase === "Follicular"
        ? "Energy is often rising — lighter, fresher meals can feel supportive."
        : phase === "Ovulation"
          ? "Hydration and steady protein can help you feel clear and energized."
          : "Stability helps — steady snacks and softer pacing can feel kind.";

  const hero = document.createElement("section");
  hero.className = `aside-hero aside-hero--${meta.tone}`;
  hero.innerHTML = `
    <div class="aside-hero__top">
      <span class="aside-hero__icon" aria-hidden="true">${meta.icon}</span>
      <div class="aside-hero__titles">
        <div class="aside-hero__phase">${phase}</div>
        <div class="aside-hero__summary">${todayLine}</div>
      </div>
      <span class="aside-hero__chip ${phase === currentPhaseToday() ? "" : "is-hidden"}">Today</span>
    </div>
  `;
  aside.appendChild(hero);

  if (kind === "food") {
    const grid = document.createElement("div");
    grid.className = "aside-grid";

    // Avoid duplicating the left preview list: show the NEXT items here.
    const nourishItems = cfg.eat.slice(3, 6).length ? cfg.eat.slice(3, 6) : cfg.eat.slice(0, 3);

    const chipCard = document.createElement("section");
    chipCard.className = "aside-card aside-card--rose";
    chipCard.innerHTML = `<div class="aside-card__k">Nourish</div><div class="chip-grid"></div>`;
    const chipGrid = chipCard.querySelector(".chip-grid");
    nourishItems.forEach((t) => {
      const c = document.createElement("span");
      c.className = "food-chip";
      c.innerHTML = `<span class="food-chip__icon" aria-hidden="true">${meta.icon}</span><span class="food-chip__t"></span>`;
      c.querySelector(".food-chip__t").textContent = t;
      chipGrid.appendChild(c);
    });

    const hydration = mkCard(
      "Hydration",
      phase === "Ovulation" ? "Hydrate a little more than usual." : phase === "Period" ? "Warm fluids can feel supportive." : "Small sips through the day.",
      "sage",
    );
    const ritual = mkCard(
      "Ritual",
      phase === "Period"
        ? "Warm soup + early night."
        : phase === "Follicular"
          ? "Fresh plate + one intention."
          : phase === "Ovulation"
            ? "Protein + color + a walk."
            : "Grounding snack + softer evening.",
      "cream",
    );
    const avoid = cfg.avoid ? mkCard("Avoid gently", cfg.avoid, "lav") : mkCard("Avoid gently", "Keep sugar on an empty stomach minimal when you can.", "lav");

    grid.appendChild(chipCard);
    grid.appendChild(hydration);
    grid.appendChild(avoid);
    grid.appendChild(ritual);
    aside.appendChild(grid);
  } else {
    const grid = document.createElement("div");
    grid.className = "aside-grid";

    const tryCard = document.createElement("section");
    tryCard.className = "aside-card aside-card--sage";
    tryCard.innerHTML = `<div class="aside-card__k">Try</div><ul class="aside-card__list"></ul>`;
    const ul = tryCard.querySelector("ul");
    cfg.do.slice(0, 3).forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      ul.appendChild(li);
    });

    const recovery = mkCard(
      "Recovery",
      phase === "Period" ? "Slower movement supports comfort." : phase === "Luteal" ? "Lower intensity supports steadier mood." : "Warm up well and finish gently.",
      "lav",
    );
    const nervous = mkCard("Nervous system", "Try a slower exhale for 2 minutes after movement.", "rose");
    const pacing = mkCard("Pacing", phase === "Ovulation" ? "If you go intense, keep the finish gentle." : "Steady effort often feels better than extremes.", "cream");

    grid.appendChild(tryCard);
    grid.appendChild(recovery);
    grid.appendChild(nervous);
    grid.appendChild(pacing);
    aside.appendChild(grid);
  }
}

// App state
const state = {
  user: null,
  profile: null,
  data: null,
  viewMonth: null,
  selectedISO: null,
  lastRoute: "home",
  foodPhase: null,
  movePhase: null,
  /** Latest hero cycle info for energy wave hover (set in renderCycleIntel) */
  heroCycleInfo: null,
};

// Elements
const greeting = $$("#greeting");
const todayLine = $$("#todayLine");
const heroCycleRing = $$("#heroCycleRing");
const heroRingDay = $$("#heroRingDay");
const heroDayPhaseLine = $$("#heroDayPhaseLine");
const homeEnergySubtitle = $$("#homeEnergySubtitle");
const homeEnergyBadge = $$("#homeEnergyBadge");
const homeCycleWhisper = $$("#homeCycleWhisper");
const heroEnergyWave = $$("#heroEnergyWave");
const energyPageWave = $$("#energyPageWave");
const heroWaveTooltip = $$("#heroWaveTooltip");
const heroEnergyChartWrap = $$("#heroEnergyChartWrap");
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
const selectedDateLabel = $$("#selectedDateLabel");
const kvPeriod = $$("#kvPeriod");
const kvCheckin = $$("#kvCheckin");
const phasePill = $$("#phasePill");
const dayPanelTone = $$("#dayPanelTone");

// Calendar actions are wired via `.js-open-*` class hooks.

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

const homeMoodChips = $$("#homeMoodChips");
const homeEnergyChips = $$("#homeEnergyChips");
const homePainChips = $$("#homePainChips");
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
const moodChips = $$("#moodChips");
const energyChips = $$("#energyChips");
const painChips = $$("#painChips");
const notesEl = $$("#notes");
const deleteCheckinBtn = $$("#deleteCheckinBtn");

const periodModal = $$("#periodModal");
const periodStartEl = $$("#periodStart");
const periodEndEl = $$("#periodEnd");
const flowChips = $$("#flowChips");
const periodError = $$("#periodError");
const deletePeriodBtn = $$("#deletePeriodBtn");

// Phase learn modal (educational popups from Phase notes)
const phaseLearnModal = $$("#phaseLearnModal");
const phaseLearnIcon = $$("#phaseLearnIcon");
const phaseLearnTitle = $$("#phaseLearnTitle");
const phaseLearnSubtitle = $$("#phaseLearnSubtitle");
const phaseLearnGrid = $$("#phaseLearnGrid");

// Day view modal
const dayModal = $$("#dayModal");
const dayModalDate = $$("#dayModalDate");
const dayModalSubtitle = $$("#dayModalSubtitle");
const dayModalPhase = $$("#dayModalPhase");
const dayModalEmotionLine = $$("#dayModalEmotionLine");
const dayMood = $$("#dayMood");
const dayEnergy = $$("#dayEnergy");
const dayPain = $$("#dayPain");
const dayNotes = $$("#dayNotes");
const dayNoData = $$("#dayNoData");
const dayActionCheckin = $$("#dayActionCheckin");
const dayActionPeriod = $$("#dayActionPeriod");
const dayEnergyFill = $$("#dayEnergyFill");
const dayPainFill = $$("#dayPainFill");
const daySmartInsights = $$("#daySmartInsights");
const daySmartInsightsEmpty = $$("#daySmartInsightsEmpty");
const dayCompareLine = $$("#dayCompareLine");
const dayGuidance = $$("#dayGuidance");
const dayInsightsDetails = $$("#dayInsightsDetails");
const dayCompareDetails = $$("#dayCompareDetails");
const dayGuidanceDetails = $$("#dayGuidanceDetails");

const foodCards = $$("#foodCards");
const moveCards = $$("#moveCards");
const foodAside = $$("#foodAside");
const moveAside = $$("#moveAside");
const foodAllBtn = $$("#foodAllBtn");
const foodTodayBtn = $$("#foodTodayBtn");
const moveAllBtn = $$("#moveAllBtn");
const moveTodayBtn = $$("#moveTodayBtn");

function openModal(dlg) {
  if (typeof dlg.showModal === "function") dlg.showModal();
  else dlg.setAttribute("open", "open");
}

function closeModal(dlg) {
  if (typeof dlg.close === "function") dlg.close();
  else dlg.removeAttribute("open");
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

function openPhaseLearn(phase) {
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

function refreshGreeting() {
  const now = new Date();
  const iso = toISODate(now);
  const who = state.profile?.fullName || state.user;
  const firstName = who ? who.split(" ")[0] : "";
  greeting.textContent = firstName ? `Hi ${firstName} 🌸` : `Hi there 🌸`;
  const ph = cycleForISO(state.data?.periods || [], state.data?.cyclePrefs || null, iso);
  todayLine.textContent = dynamicTopLine(ph?.phase || null, state.data?.checkins?.[iso] || null);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function daysBetweenISO(aISO, bISO) {
  const a = parseISODate(aISO);
  const b = parseISODate(bISO);
  return Math.round((b - a) / (24 * 3600 * 1000));
}

function cycleDayAndPhase(periods, todayISO) {
  const lp = lastPeriod(periods);
  const prefLen = Number(state.data?.cyclePrefs?.cycleLength);
  const cycleLen = clamp(Number.isFinite(prefLen) && prefLen ? prefLen : (averageCycleLength(periods) ?? 28), 15, 60);

  const prefStart = state.data?.cyclePrefs?.periodStartISO ? String(state.data.cyclePrefs.periodStartISO) : null;
  const startISO = prefStart || (lp ? lp.startISO : null);

  if (!startISO) {
    return { cycleLen, day: null, phase: null, startISO: null, periodDur: 5 };
  }

  const offset = daysBetweenISO(startISO, todayISO);
  // Day 1 is period start day. Clamp so UI stays stable even if user hasn't logged recently.
  const day = clamp(offset + 1, 1, Math.max(1, cycleLen));

  let phase = "Luteal";
  if (day <= 5) phase = "Period";
  else if (day <= 13) phase = "Follicular";
  else if (day <= 16) phase = "Ovulation";
  else phase = "Luteal";

  const pd = clamp(Number(state.data?.cyclePrefs?.periodDuration) || 5, 2, 10);
  return { cycleLen, day, phase, startISO, periodDur: pd };
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
  const prefs = state.data?.cyclePrefs;
  if (prefs?.periodStartISO) {
    return cycleInfoFromPrefs(prefs, todayISO);
  }
  const base = cycleDayAndPhase(state.data?.periods || [], todayISO);
  const pd = clamp(Number(prefs?.periodDuration) || 5, 2, 10);
  return {
    cycleLen: base.cycleLen,
    periodDur: pd,
    day: base.day,
    phase: base.phase,
    startISO: base.startISO,
  };
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

  $$$("#view-cycle .phase-mini").forEach((el) => {
    const ph = el.getAttribute("data-phase");
    el.style.borderColor = ph ? phaseAccentVar(ph) : "var(--line)";
    el.classList.toggle("is-current", Boolean(info.phase && ph === info.phase));
  });
}

function persistTodayCheckinFromHome(model) {
  const iso = toISODate(new Date());
  state.data.checkins[iso] = {
    ...(state.data.checkins[iso] || {}),
    mood: model.mood,
    energy: model.energy,
    pain: model.pain,
  };
  saveUserData(state.user, state.data);
  refreshAll();
}

function syncHomeQuickChips() {
  if (!homeMoodChips || !homeEnergyChips || !homePainChips) return;
  const iso = toISODate(new Date());
  const cur = state.data.checkins[iso] || {};
  setChipOn(homeMoodChips, cur.mood || "Okay");
  setChipOn(homeEnergyChips, cur.energy || "Medium");
  setChipOn(homePainChips, cur.pain || "Low");
}

function initHomeQuickChips() {
  if (!homeMoodChips || !homeEnergyChips || !homePainChips) return;
  const iso = toISODate(new Date());
  const cur = state.data.checkins[iso] || {};
  const model = {
    mood: cur.mood || "Okay",
    energy: cur.energy || "Medium",
    pain: cur.pain || "Low",
  };

  makeChips(homeMoodChips, CHECKIN.mood, {
    kind: "mood",
    onPick: (v) => {
      model.mood = v;
      setChipOn(homeMoodChips, v);
      persistTodayCheckinFromHome(model);
    },
  });
  makeChips(homeEnergyChips, CHECKIN.energy, {
    kind: "energy",
    onPick: (v) => {
      model.energy = v;
      setChipOn(homeEnergyChips, v);
      persistTodayCheckinFromHome(model);
    },
  });
  makeChips(homePainChips, CHECKIN.pain, {
    kind: "pain",
    onPick: (v) => {
      model.pain = v;
      setChipOn(homePainChips, v);
      persistTodayCheckinFromHome(model);
    },
  });

  setChipOn(homeMoodChips, model.mood);
  setChipOn(homeEnergyChips, model.energy);
  setChipOn(homePainChips, model.pain);
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
    stroke: "rgba(0,0,0,.06)",
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
      return svgEl("circle", { cx: pt.x, cy: pt.y, r: "5", fill: "rgba(0,0,0,.14)" });
    }
    const ang = startBase + ((day - 1) / cycleLen) * 360;
    const pt = polarToCartesian(cx, cy, r, ang);
    return svgEl("circle", {
      cx: pt.x,
      cy: pt.y,
      r: "6.2",
      fill: phaseAccentVar(phase),
      stroke: "rgba(255,255,255,.92)",
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

  const base = svgEl("path", {
    d: `M ${padX} ${bottomY.toFixed(2)} L ${(W - padX).toFixed(2)} ${bottomY.toFixed(2)}`,
    fill: "none",
    stroke: "rgba(0,0,0,.07)",
    "stroke-width": "1.4",
  });

  const area = svgEl("path", {
    d: areaD,
    fill: `url(#${gradId})`,
    stroke: "none",
    opacity: "1",
  });

  const strokeW = opts.strokeWidth ?? 3;
  const line = svgEl("path", {
    id: lineId,
    d: dPath,
    fill: "none",
    stroke: accent,
    "stroke-width": String(strokeW),
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    opacity: "0.94",
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
      stroke: "rgba(255,255,255,.94)",
      "stroke-width": "2.2",
      opacity: day ? "1" : "0.5",
    });
  })();

  const hover = svgEl("rect", { x: "0", y: "0", width: String(W), height: String(H), fill: "transparent" });
  hover.style.cursor = opts.skipHoverRect ? "default" : "crosshair";

  const nodes = opts.skipHoverRect ? [defs, base, area, line, todayDot] : [defs, base, area, line, todayDot, hover];

  setSvg(svgRoot, nodes);

  requestAnimationFrame(() => {
    const el = svgRoot.querySelector(`#${lineId}`);
    if (!el) return;
    const len = el.getTotalLength();
    el.style.strokeDasharray = String(len);
    el.style.strokeDashoffset = String(len);
    requestAnimationFrame(() => {
      el.style.transition = "stroke-dashoffset 850ms cubic-bezier(0.22, 1, 0.36, 1)";
      el.style.strokeDashoffset = "0";
    });
  });
}

function renderHeroEnergyWave(info) {
  renderEnergyWaveInto(heroEnergyWave, info, {
    gradId: "heroEnergyAreaGrad",
    lineId: "heroEnergyLine",
    strokeWidth: 3.5,
    dotR: 6.5,
  });
}

function renderEnergyPageWave(info) {
  renderEnergyWaveInto(energyPageWave, info, {
    gradId: "energyPageAreaGrad",
    lineId: "energyPageLine",
    skipHoverRect: true,
  });
}

function bindHeroWaveHoverOnce() {
  if (bindHeroWaveHoverOnce._done) return;
  bindHeroWaveHoverOnce._done = true;

  const W = 720;
  const padX = 22;
  const innerW = W - padX * 2;

  heroEnergyChartWrap?.addEventListener("mousemove", (e) => {
    const info = state.heroCycleInfo;
    if (!info || !heroWaveTooltip || !heroEnergyWave) return;
    const cycleLen = info.cycleLen;
    const rect = heroEnergyWave.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W / rect.width);
    const t = clamp((x - padX) / innerW, 0, 1);
    const d = 1 + Math.round(t * (cycleLen - 1));
    const ratio = expectedEnergyRatio(d, cycleLen);
    const label = energyLabelFromRatio(ratio);
    heroWaveTooltip.textContent = `Day ${d}: ${label} energy`;
    heroWaveTooltip.hidden = false;
    const wrapRect = heroEnergyChartWrap.getBoundingClientRect();
    const lx = clamp(e.clientX - wrapRect.left, 12, wrapRect.width - 12);
    const ly = clamp(e.clientY - wrapRect.top, 12, wrapRect.height - 12);
    heroWaveTooltip.style.left = `${lx}px`;
    heroWaveTooltip.style.top = `${ly}px`;
  });

  heroEnergyChartWrap?.addEventListener("mouseleave", () => {
    if (heroWaveTooltip) heroWaveTooltip.hidden = true;
  });
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

function buildCalendar() {
  const view = state.viewMonth ?? startOfMonth(new Date());
  state.viewMonth = startOfMonth(view);
  calTitle.textContent = monthTitle(state.viewMonth);

  const periods = state.data?.periods || [];
  const prefs = state.data?.cyclePrefs || null;

  const first = new Date(state.viewMonth);
  const offset = mondayIndex(first.getDay());
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  const cells = weeks * 7;
  const start = new Date(first);
  start.setDate(start.getDate() - offset);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);

  calendarGrid.innerHTML = "";
  calendarGrid.style.gridTemplateRows = `repeat(${weeks}, minmax(0, 1fr))`;
  calendarGrid.style.aspectRatio = `7 / ${weeks}`;
  const todayISO = toISODate(new Date());
  const selectedISO = state.selectedISO;

  for (let i = 0; i < cells; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = toISODate(d);

    // No next-month preview dates: render a quiet blank cell instead.
    if (d > last) {
      const blank = document.createElement("div");
      blank.className = "day day--blank";
      blank.setAttribute("role", "presentation");
      blank.setAttribute("aria-hidden", "true");
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

    const anyPeriod = dayHasPeriod(iso);
    const cyc = cycleForISO(periods, prefs, iso);
    const isFertile = Boolean(!anyPeriod && cyc?.isFertile);
    const isOvulation = Boolean(!anyPeriod && cyc?.isOvulation);
    const ph = cyc;
    const checkin = state.data?.checkins?.[iso] || null;
    const energyMark = checkin?.energy === "High" ? "high" : checkin?.energy === "Low" ? "low" : null;

    btn.classList.toggle("sig-period", anyPeriod);
    btn.classList.toggle("sig-fertile", !anyPeriod && isFertile);
    btn.classList.toggle("sig-ovu", !anyPeriod && isOvulation);
    btn.classList.toggle("sig-energy-low", !anyPeriod && energyMark === "low");
    btn.classList.toggle("sig-rest", !anyPeriod && !energyMark && (ph?.phase === "Luteal" || ph?.phase === "Period"));

    const num = document.createElement("div");
    num.className = "day__num";
    num.textContent = String(d.getDate());
    btn.appendChild(num);

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

    // Minimal, visual-only emblem (no text labels, no hover tooltips).
    const emblem = document.createElement("div");
    emblem.className = "day__emblem";
    emblem.setAttribute("aria-hidden", "true");

    let emblemKind = null;
    if (anyPeriod) emblemKind = "period";
    else if (isOvulation) emblemKind = "ovu";
    else if (isFertile) emblemKind = "fertile";
    else if (energyMark === "low" || ph?.phase === "Luteal") emblemKind = "rest";

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
}

function selectDate(iso) {
  state.selectedISO = iso;
  buildCalendar();
  renderDayPanel();
  openDayView(iso);
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

  dayModalSubtitle.textContent = state.profile?.fullName ? `For ${state.profile.fullName}` : "Your day";
  dayModalDate.textContent = formatNiceDate(iso);

  const ph = phaseForDate(periods, iso);
  if (ph) {
    dayModalPhase.hidden = false;
    dayModalPhase.textContent = ph.phase;
    dayGuidance.textContent = ph.tone;
  } else {
    dayModalPhase.hidden = true;
    dayGuidance.textContent = "Log a period to unlock phase-based guidance.";
  }

  const emotionLine = c
    ? `${c.energy === "Low" ? "Low energy day." : c.energy === "High" ? "High energy day." : "Steady day."} ${
        c.pain === "High" ? "Be extra gentle with yourself." : "Keep listening to your body."
      }`
    : ph
      ? ph.tone
      : "No data logged yet — you can add a quick check‑in in under 10 seconds.";
  dayModalEmotionLine.textContent = emotionLine;

  const hasCheckin = Boolean(c);
  dayNoData.hidden = hasCheckin;

  dayMood.textContent = c?.mood || "—";
  dayEnergy.textContent = c?.energy || "—";
  dayPain.textContent = c?.pain || "—";
  dayNotes.textContent = c?.notes ? c.notes : "No notes.";

  setFill(dayEnergyFill, scoreEnergy(c?.energy));
  setFill(dayPainFill, scorePain(c?.pain));

  dayActionCheckin.textContent = hasCheckin ? "Edit check‑in" : "Add check‑in";
  dayActionCheckin.onclick = () => openCheckin(iso);
  dayActionPeriod.onclick = () => openPeriodModal(iso);

  // Smart insights
  const dayInsights = smartInsightsForDay(periods, checkins, iso);
  daySmartInsights.innerHTML = "";
  daySmartInsightsEmpty.hidden = dayInsights.length > 0;
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
    dayCompareLine.textContent = "Not enough cycle history yet for comparisons.";
  } else {
    const prev = checkins[prevISO] || null;
    if (!prev) {
      dayCompareLine.textContent = `Last cycle on this day (${formatNiceDate(prevISO)}): no check‑in logged.`;
    } else if (!c) {
      dayCompareLine.textContent = `Last cycle on this day you felt: ${prev.mood} mood · ${prev.energy} energy · ${prev.pain} pain.`;
    } else {
      const energyDelta =
        scoreEnergy(c.energy) > scoreEnergy(prev.energy) ? "improved energy" : scoreEnergy(c.energy) < scoreEnergy(prev.energy) ? "lower energy" : "similar energy";
      const painDelta =
        scorePain(c.pain) < scorePain(prev.pain) ? "less pain" : scorePain(c.pain) > scorePain(prev.pain) ? "more pain" : "similar pain";
      dayCompareLine.textContent = `Last cycle you logged: ${prev.mood} mood · ${prev.energy} energy · ${prev.pain} pain. Today: ${energyDelta}, ${painDelta}.`;
    }
  }

  // Keep a calm default: guidance open, others closed
  if (dayGuidanceDetails) dayGuidanceDetails.open = true;
  if (dayInsightsDetails) dayInsightsDetails.open = false;
  if (dayCompareDetails) dayCompareDetails.open = false;

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

  const p = (state.data?.periods || []).find((x) => iso >= x.startISO && iso <= x.endISO) || null;
  kvPeriod.textContent = p ? `${p.flow} flow` : "Not logged";

  const c = state.data?.checkins?.[iso] || null;
  kvCheckin.textContent = c ? `${c.mood} mood · ${c.energy} energy · ${c.pain} pain` : "Not logged";

  const ph = cycleForISO(state.data?.periods || [], state.data?.cyclePrefs || null, iso);
  if (ph) {
    phasePill.hidden = false;
    phasePill.textContent = ph.phase;
    if (dayPanelTone) dayPanelTone.textContent = ph.tone;
  } else {
    phasePill.hidden = true;
    if (dayPanelTone) dayPanelTone.textContent = "Log a period to see gentle, phase-based guidance.";
  }
}

function renderInsights() {
  const periods = state.data?.periods || [];
  const next = predictNextPeriodStart(periods);
  if (next) {
    insNextPeriod.textContent = formatNiceDate(next);
    const avg = averageCycleLength(periods) ?? 28;
    insNextPeriodSub.textContent = `Based on an average cycle length of ${avg} days.`;
  } else {
    insNextPeriod.textContent = "—";
    insNextPeriodSub.textContent = "Add a period to enable predictions.";
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
    insGuidanceSub.textContent = "Log at least one period to see phases.";
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
    qEnergySub.textContent = c?.energy ? "Logged today" : "Add a check‑in to personalize this.";
  }
  if (qMood && qMoodSub) {
    qMood.textContent = c?.mood || "—";
    qMoodSub.textContent = c?.mood ? "Logged today" : "A quick mood note helps trends emerge.";
  }
  if (qHyd && qHydSub) {
    const hyd =
      ph?.phase === "Ovulation" ? "Focus" : ph?.phase === "Period" ? "Gentle" : ph?.phase ? "Steady" : "—";
    qHyd.textContent = hyd;
    qHydSub.textContent =
      ph?.phase === "Ovulation"
        ? "Hydrate a little more than usual."
        : ph?.phase === "Period"
          ? "Warm fluids can feel supportive."
          : ph?.phase
            ? "Small sips through the day."
            : "Log a period to enable phase tips.";
  }
  if (qRec && qRecSub) {
    const rec =
      c?.pain === "High" ? "High" : c?.pain === "Medium" ? "Medium" : ph?.phase === "Period" ? "High" : "Normal";
    qRec.textContent = rec;
    qRecSub.textContent =
      rec === "High"
        ? "Plan extra softness today."
        : rec === "Medium"
          ? "Keep plans lighter if you can."
          : "A steady pace is enough.";
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

  function fillPatternList(rootEl, prefixLabel) {
    if (!rootEl) return;
    rootEl.innerHTML = "";
    if (!patterns.length) {
      const empty = $$("#insightsEmpty");
      if (empty) rootEl.appendChild(empty);
      else {
        const d = document.createElement("div");
        d.className = "micro subtle";
        d.textContent = "Your patterns will appear here after a few check‑ins.";
        rootEl.appendChild(d);
      }
      return;
    }
    patterns.forEach((t) => {
      const box = document.createElement("div");
      box.className = "insight-card";
      const k = document.createElement("div");
      k.className = "insight-card__k";
      k.textContent = prefixLabel;
      const v = document.createElement("div");
      v.className = "insight-card__v";
      v.textContent = t;
      box.appendChild(k);
      box.appendChild(v);
      rootEl.appendChild(box);
    });
  }

  fillPatternList(insightList, "Pattern");
  fillPatternList(energyInsightList, "Pattern");
}

function refreshAll() {
  refreshGreeting();
  renderCycleIntel();
  buildCalendar();
  renderDayPanel();
  renderInsights();
  syncHomeQuickChips();
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
  const navRoutes = new Set(["home", "calendar", "insights", "food", "movement"]);
  $$$(".app-nav__tab").forEach((el) => {
    const r = el.dataset.route;
    if (!r) return;
    const on = navRoutes.has(route) && r === route;
    el.classList.toggle("is-active", on);
    if (el.tagName === "BUTTON") el.setAttribute("aria-current", on ? "page" : "false");
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
    b.className = `chip ${tone === "rose" ? "is-rose" : ""} chip--${kind}`;
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
  });
}

// Check-in modal
const CHECKIN = {
  mood: ["Low", "Okay", "Good", "Bright"],
  energy: ["Low", "Medium", "High"],
  pain: ["None", "Low", "Medium", "High"],
};

function openCheckin(iso) {
  checkinTitleDate.textContent = iso === toISODate(new Date()) ? "Today" : formatNiceDate(iso);
  const current = state.data.checkins[iso] || null;
  const model = {
    mood: current?.mood || "Okay",
    energy: current?.energy || "Medium",
    pain: current?.pain || "Low",
    notes: current?.notes || "",
  };

  makeChips(moodChips, CHECKIN.mood, { kind: "mood", onPick: (v) => { model.mood = v; setChipOn(moodChips, v); } });
  makeChips(energyChips, CHECKIN.energy, { kind: "energy", onPick: (v) => { model.energy = v; setChipOn(energyChips, v); } });
  makeChips(painChips, CHECKIN.pain, { kind: "pain", onPick: (v) => { model.pain = v; setChipOn(painChips, v); } });

  setChipOn(moodChips, model.mood);
  setChipOn(energyChips, model.energy);
  setChipOn(painChips, model.pain);
  notesEl.value = model.notes;

  deleteCheckinBtn.hidden = !current;
  deleteCheckinBtn.onclick = () => {
    delete state.data.checkins[iso];
    saveUserData(state.user, state.data);
    closeModal(checkinModal);
    refreshAll();
  };

  $$("#checkinForm").onsubmit = (e) => {
    e.preventDefault();
    state.data.checkins[iso] = {
      mood: model.mood,
      energy: model.energy,
      pain: model.pain,
      notes: (notesEl.value || "").trim(),
    };
    saveUserData(state.user, state.data);
    closeModal(checkinModal);
    refreshAll();
  };

  openModal(checkinModal);
}

// Period modal
const FLOW = ["Light", "Medium", "Heavy"];

function showPeriodError(msg) {
  periodError.hidden = false;
  periodError.textContent = msg;
}

function openPeriodModal(prefillISO = null) {
  periodError.hidden = true;
  periodError.textContent = "";

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
  deletePeriodBtn.onclick = () => {
    state.data.periods.pop();
    saveUserData(state.user, state.data);
    closeModal(periodModal);
    refreshAll();
  };

  $$("#periodForm").onsubmit = (e) => {
    e.preventDefault();
    const s = periodStartEl.value;
    const en = periodEndEl.value;
    const flow = (flowChips.dataset.value || "medium").toLowerCase();
    if (!s || !en) return showPeriodError("Please select start and end dates.");
    const normalized = normalizePeriod({ startISO: s, endISO: en, flow });
    if (!normalized) return showPeriodError("End date must be the same day or after the start date.");

    const key = `${normalized.startISO}__${normalized.endISO}__${normalized.flow}`;
    const existingKeys = new Set(state.data.periods.map((p) => `${p.startISO}__${p.endISO}__${p.flow}`));
    if (!existingKeys.has(key)) {
      state.data.periods.push(normalized);
      sortPeriods(state.data.periods);
      saveUserData(state.user, state.data);
    }
    closeModal(periodModal);
    refreshAll();
  };

  openModal(periodModal);
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
  applyRoute();
  window.addEventListener("hashchange", applyRoute);

  prevMonthBtn?.addEventListener("click", () => {
    const d = state.viewMonth ?? startOfMonth(new Date());
    state.viewMonth = startOfMonth(new Date(d.getFullYear(), d.getMonth() - 1, 1));
    buildCalendar();
  });
  nextMonthBtn?.addEventListener("click", () => {
    const d = state.viewMonth ?? startOfMonth(new Date());
    state.viewMonth = startOfMonth(new Date(d.getFullYear(), d.getMonth() + 1, 1));
    buildCalendar();
  });

  $$$(".js-open-checkin-today").forEach((btn) => {
    btn.addEventListener("click", () => openCheckin(toISODate(new Date())));
  });
  $$$(".js-open-period-today").forEach((btn) => {
    btn.addEventListener("click", () => openPeriodModal(toISODate(new Date())));
  });

  function setSeg(allBtn, todayBtn, focusToday) {
    allBtn?.classList.toggle("is-active", !focusToday);
    todayBtn?.classList.toggle("is-active", focusToday);
  }

  foodAllBtn?.addEventListener("click", () => {
    setSeg(foodAllBtn, foodTodayBtn, false);
    refreshFoodView();
  });
  foodTodayBtn?.addEventListener("click", () => {
    setSeg(foodAllBtn, foodTodayBtn, true);
    scrollToTodayPhase(foodCards);
  });

  moveAllBtn?.addEventListener("click", () => {
    setSeg(moveAllBtn, moveTodayBtn, false);
    refreshMovementView();
  });
  moveTodayBtn?.addEventListener("click", () => {
    setSeg(moveAllBtn, moveTodayBtn, true);
    scrollToTodayPhase(moveCards);
  });

  initHomeQuickChips();
  bindPhaseNotesLearn();
  refreshAll();
  bindHeroWaveHoverOnce();

  // Calm page-load polish for inner content only
  requestAnimationFrame(() => {
    document.body.classList.add("is-ready");
  });
}

init();

