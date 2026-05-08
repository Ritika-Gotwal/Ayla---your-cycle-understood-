/* Ayla — Auth page (index.html) */

const LS = {
  users: "ayla_users_v1",
  loggedInUser: "loggedInUser",
};

const $$ = (sel, root = document) => root.querySelector(sel);

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

  // Migration: previously stored as { [username]: { password } }
  if (parsed && !Array.isArray(parsed) && typeof parsed === "object") {
    const migrated = Object.entries(parsed)
      .filter(([u, v]) => typeof u === "string" && v && typeof v.password === "string")
      .map(([u, v]) => ({ username: u, password: v.password }));
    localStorage.setItem(LS.users, JSON.stringify(migrated));
    return migrated;
  }

  if (!Array.isArray(parsed)) return [];

  const cleaned = parsed
    .filter((u) => u && typeof u.username === "string" && (typeof u.password === "string" || typeof u.passwordHash === "string"))
    .map((u) => ({
      fullName: typeof u.fullName === "string" ? u.fullName : undefined,
      username: String(u.username),
      password: typeof u.password === "string" ? String(u.password) : undefined, // legacy
      passwordHash: typeof u.passwordHash === "string" ? String(u.passwordHash) : undefined,
      passwordSalt: typeof u.passwordSalt === "string" ? String(u.passwordSalt) : undefined,
      securityQuestionId: typeof u.securityQuestionId === "string" ? String(u.securityQuestionId) : undefined,
      securityAnswerHash: typeof u.securityAnswerHash === "string" ? String(u.securityAnswerHash) : undefined,
      securityAnswerSalt: typeof u.securityAnswerSalt === "string" ? String(u.securityAnswerSalt) : undefined,
      recoveryPinHash: typeof u.recoveryPinHash === "string" ? String(u.recoveryPinHash) : undefined,
      recoveryPinSalt: typeof u.recoveryPinSalt === "string" ? String(u.recoveryPinSalt) : undefined,
    }));

  // Enforce "no email anywhere"
  localStorage.setItem(LS.users, JSON.stringify(cleaned));
  return cleaned;
}

function saveUsers(users) {
  localStorage.setItem(LS.users, JSON.stringify(users));
}

function usernameKey(username) {
  return String(username || "").trim().toLowerCase();
}

function findUser(users, username) {
  const key = usernameKey(username);
  return users.find((u) => usernameKey(u.username) === key) || null;
}

function loadLoggedInUser() {
  const u = localStorage.getItem(LS.loggedInUser);
  return u ? String(u) : null;
}

function saveLoggedInUser(username) {
  localStorage.setItem(LS.loggedInUser, username);
}

// Elements
const authForm = $$("#authForm");
const authCard = $$(".auth__card");

const tabLogin = $$("#tabLogin");
const tabSignup = $$("#tabSignup");

const fullNameField = $$("#fullNameField");
const usernameField = $$("#usernameField");
const passwordField = $$("#passwordField");

const fullNameEl = $$("#fullName");
const usernameEl = $$("#username");
const passwordEl = $$("#password");

const authSubmit = $$("#authSubmit");
const authHint = $$("#authHint");
const authError = $$("#authError");
const authSuccess = $$("#authSuccess");

const fullNameError = $$("#fullNameError");
const usernameError = $$("#usernameError");
const passwordError = $$("#passwordError");

let authMsgTimer = null;

function applyFieldVisibility(wrapperEl, shouldShow) {
  if (!wrapperEl) return;
  if (shouldShow) {
    wrapperEl.hidden = false;
    wrapperEl.classList.remove("hidden");
    wrapperEl.style.display = "";
    wrapperEl.setAttribute("aria-hidden", "false");
  } else {
    wrapperEl.hidden = true;
    wrapperEl.classList.add("hidden");
    wrapperEl.style.display = "none";
    wrapperEl.setAttribute("aria-hidden", "true");
  }
}

function setFieldError(inputEl, errorEl, msg) {
  if (!inputEl || !errorEl) return;
  inputEl.classList.add("is-invalid");
  errorEl.hidden = false;
  errorEl.textContent = msg;
}

function clearFieldError(inputEl, errorEl) {
  if (!inputEl || !errorEl) return;
  inputEl.classList.remove("is-invalid");
  errorEl.hidden = true;
  errorEl.textContent = "";
}

function clearAuthMessages() {
  clearTimeout(authMsgTimer);
  authMsgTimer = null;

  authError.hidden = true;
  authError.textContent = "";
  authSuccess.hidden = true;
  authSuccess.textContent = "";

  clearFieldError(fullNameEl, fullNameError);
  clearFieldError(usernameEl, usernameError);
  clearFieldError(passwordEl, passwordError);
}

function showAuthMessage(type, msg) {
  clearTimeout(authMsgTimer);
  const isError = type === "error";
  authError.hidden = !isError;
  authSuccess.hidden = isError;

  if (isError) {
    authError.textContent = msg;
    authSuccess.textContent = "";
  } else {
    authSuccess.textContent = msg;
    authError.textContent = "";
  }

  authMsgTimer = setTimeout(() => clearAuthMessages(), 3000);
}

function showAuthError(msg) {
  showAuthMessage("error", msg);
}

function showAuthSuccess(msg) {
  showAuthMessage("success", msg);
}

function normalizeFullNameInput(s) {
  return String(s || "").trim();
}

function normalizeUsernameInput(s) {
  return String(s || "").trim();
}

function normalizePasswordInput(s) {
  return String(s || "");
}

function normalizeAnswerInput(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function stripPasswordSpaces(s) {
  // Security-ish UX: prevent whitespace-only or leading/trailing spaces from being "real" password chars.
  return String(s || "").replace(/\s+/g, " ").trim();
}

function hasTwoWords(fullName) {
  return fullName.split(/\s+/).filter(Boolean).length >= 2;
}

function hasUppercase(s) {
  return /[A-Z]/.test(String(s || ""));
}

function hasNumber(s) {
  return /\d/.test(String(s || ""));
}

function passwordMeetsRules(s) {
  const p = stripPasswordSpaces(s);
  return {
    value: p,
    lenOk: p.length >= 8,
    upperOk: hasUppercase(p),
    numOk: hasNumber(p),
    ok: p.length >= 8 && hasUppercase(p) && hasNumber(p),
  };
}

function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function makeSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
}

async function sha256Base64(input) {
  const data = new TextEncoder().encode(String(input));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToBase64(new Uint8Array(digest));
}

async function hashWithSalt(value, salt) {
  return sha256Base64(`${salt}:${String(value)}`);
}

function setAuthBusy(isBusy) {
  // Keep the button visually interactive (no "blocked" cursor),
  // while still preventing double-submits.
  authSubmit.classList.toggle("is-busy", isBusy);
  authSubmit.setAttribute("aria-busy", String(isBusy));
}

function withAuthBusy(fn) {
  setAuthBusy(true);
  const done = () => setTimeout(() => setAuthBusy(false), 220);
  try {
    fn();
  } finally {
    done();
  }
}

async function withAuthBusyAsync(fn) {
  setAuthBusy(true);
  try {
    await fn();
  } finally {
    setTimeout(() => setAuthBusy(false), 220);
  }
}

function updateAuthButtonState(mode) {
  // If a submit is in-flight, keep the enabled cursor/feel but block interaction via CSS.
  if (authSubmit.classList.contains("is-busy")) return;
  const u = normalizeUsernameInput(usernameEl.value);
  const p = normalizePasswordInput(passwordEl.value);
  if (mode === "login") {
    authSubmit.disabled = !u || !p;
    return;
  }
  const fn = normalizeFullNameInput(fullNameEl?.value);
  const q = $$("#securityQuestion")?.value || "";
  const a = $$("#securityAnswer")?.value || "";
  const pin = getPINFromBoxes();
  authSubmit.disabled = !fn || !u || !p || !q || !a.trim() || pin.length !== 4;
}

function setAuthMode(mode) {
  const isLogin = mode === "login";

  authForm.classList.add("is-switching");
  setTimeout(() => authForm.classList.remove("is-switching"), 140);

  tabLogin.classList.toggle("is-active", isLogin);
  tabSignup.classList.toggle("is-active", !isLogin);
  tabLogin.setAttribute("aria-selected", String(isLogin));
  tabSignup.setAttribute("aria-selected", String(!isLogin));

  authSubmit.textContent = isLogin ? "Log in" : "Create account";
  authHint.textContent = isLogin
    ? "Private by design. Your cycle data stays on your device."
    : "Create a private local account for this device.";

  applyFieldVisibility(fullNameField, !isLogin);
  applyFieldVisibility(usernameField, true);
  applyFieldVisibility(passwordField, true);
  applyFieldVisibility($$("#signupExtra"), !isLogin);
  applyFieldVisibility($$("#forgotRow"), isLogin);

  // Clear all inputs + messages on switch
  if (fullNameEl) fullNameEl.value = "";
  usernameEl.value = "";
  passwordEl.value = "";
  const securityQuestionEl = $$("#securityQuestion");
  const securityAnswerEl = $$("#securityAnswer");
  if (securityQuestionEl) securityQuestionEl.value = "";
  if (securityAnswerEl) securityAnswerEl.value = "";
  getPINBoxes().forEach((b) => (b.value = ""));
  const signupFill = $$("#signupPwFill");
  if (signupFill) signupFill.style.width = "0%";
  $$("#pwTagLen")?.classList.remove("is-ok");
  $$("#pwTagUpper")?.classList.remove("is-ok");
  $$("#pwTagNum")?.classList.remove("is-ok");
  clearAuthMessages();

  usernameEl.placeholder = isLogin ? "Enter your username" : "Choose a unique username (min 3 characters)";
  passwordEl.placeholder = isLogin ? "Enter your password" : "Create a password (min 8, uppercase + number)";
  passwordEl.autocomplete = isLogin ? "current-password" : "new-password";

  updateAuthButtonState(mode);

  // Focus first visible field
  (isLogin ? usernameEl : fullNameEl || usernameEl).focus();
}

// Input UX: clear errors on typing (no stacking)
function onAuthInput(mode) {
  authError.hidden = true;
  authError.textContent = "";
  authSuccess.hidden = true;
  authSuccess.textContent = "";
  clearTimeout(authMsgTimer);
  authMsgTimer = null;
  updateAuthButtonState(mode);
}

function init() {
  // If already logged in, go straight to dashboard
  const existing = loadLoggedInUser();
  if (existing) {
    window.location.href = "dashboard.html#home";
    return;
  }

  let mode = "login";
  setAuthMode(mode);

  tabLogin.addEventListener("click", () => {
    mode = "login";
    setAuthMode(mode);
  });
  tabSignup.addEventListener("click", () => {
    mode = "signup";
    setAuthMode(mode);
  });

  usernameEl.addEventListener("input", () => {
    clearFieldError(usernameEl, usernameError);
    onAuthInput(mode);
  });
  passwordEl.addEventListener("input", () => {
    clearFieldError(passwordEl, passwordError);
    updateSignupPasswordMeter();
    onAuthInput(mode);
  });
  fullNameEl?.addEventListener("input", () => {
    clearFieldError(fullNameEl, fullNameError);
    onAuthInput(mode);
  });

  // Password show/hide
  const passwordToggle = $$("#passwordToggle");
  passwordToggle?.addEventListener("click", () => {
    const isShown = passwordEl.type === "text";
    passwordEl.type = isShown ? "password" : "text";
    passwordToggle.setAttribute("aria-pressed", String(!isShown));
    passwordToggle.setAttribute("aria-label", isShown ? "Show password" : "Hide password");
  });

  // Signup security inputs
  const securityQuestionEl = $$("#securityQuestion");
  const securityAnswerEl = $$("#securityAnswer");
  const securityQuestionError = $$("#securityQuestionError");
  const securityAnswerError = $$("#securityAnswerError");
  const recoveryPinError = $$("#recoveryPinError");
  securityQuestionEl?.addEventListener("change", () => {
    clearFieldError(securityQuestionEl, securityQuestionError);
    onAuthInput(mode);
  });
  securityAnswerEl?.addEventListener("input", () => {
    clearFieldError(securityAnswerEl, securityAnswerError);
    onAuthInput(mode);
  });

  // PIN inputs (signup + recovery modal will reuse behavior)
  const pinBoxes = getPINBoxes();
  pinBoxes.forEach((box, idx) => wirePINBox(box, idx, pinBoxes, () => onAuthInput(mode)));

  // Forgot password modal
  initRecoveryModal();

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAuthMessages();

    const username = normalizeUsernameInput(usernameEl.value);
    const passwordRaw = normalizePasswordInput(passwordEl.value);

    if (mode === "login") {
      if (!username || !passwordRaw) {
        usernameEl.classList.add("is-invalid");
        passwordEl.classList.add("is-invalid");
        return showAuthError("Please enter username and password");
      }

      await withAuthBusyAsync(async () => {
        const users = loadUsers();
        const u = findUser(users, username);
        if (!u) {
          usernameEl.classList.add("is-invalid");
          passwordEl.classList.add("is-invalid");
          return showAuthError("Invalid username or password");
        }

        const password = stripPasswordSpaces(passwordRaw);
        let ok = false;
        if (typeof u.passwordHash === "string" && typeof u.passwordSalt === "string") {
          const candidate = await hashWithSalt(password, u.passwordSalt);
          ok = candidate === u.passwordHash;
        } else if (typeof u.password === "string") {
          ok = u.password === passwordRaw;
        }

        if (!ok) {
          usernameEl.classList.add("is-invalid");
          passwordEl.classList.add("is-invalid");
          return showAuthError("Invalid username or password");
        }

        saveLoggedInUser(u.username);
        window.location.href = "dashboard.html#home";
      });
      return;
    }

    // Sign up
    const fullName = normalizeFullNameInput(fullNameEl?.value);
    let ok = true;
    const pw = passwordMeetsRules(passwordRaw);
    const securityQuestionId = String(securityQuestionEl?.value || "");
    const securityAnswer = normalizeAnswerInput(securityAnswerEl?.value || "");
    const pin = getPINFromBoxes();

    if (!fullName) {
      setFieldError(fullNameEl, fullNameError, "Full name is required.");
      ok = false;
    } else if (!hasTwoWords(fullName)) {
      setFieldError(fullNameEl, fullNameError, "Please enter your first and last name.");
      ok = false;
    }

    if (!username) {
      setFieldError(usernameEl, usernameError, "Username is required.");
      ok = false;
    } else if (username.length < 3) {
      setFieldError(usernameEl, usernameError, "Username must be at least 3 characters.");
      ok = false;
    }

    if (!pw.value) {
      setFieldError(passwordEl, passwordError, "Password is required.");
      ok = false;
    } else if (!pw.ok) {
      setFieldError(passwordEl, passwordError, "Use 8+ characters with 1 uppercase and 1 number.");
      ok = false;
    }

    if (!securityQuestionId) {
      setFieldError(securityQuestionEl, securityQuestionError, "Please choose a security question.");
      ok = false;
    }

    if (!securityAnswer) {
      setFieldError(securityAnswerEl, securityAnswerError, "Answer is required.");
      ok = false;
    }

    if (pin.length !== 4) {
      setFieldError(pinBoxes[0] || passwordEl, recoveryPinError, "Enter your 4-digit recovery passcode.");
      ok = false;
    }

    if (!ok) return;

    await withAuthBusyAsync(async () => {
      const users = loadUsers();
      if (findUser(users, username)) {
        setFieldError(usernameEl, usernameError, "Username already exists. Please log in.");
        return;
      }

      const passwordSalt = makeSalt();
      const passwordHash = await hashWithSalt(pw.value, passwordSalt);
      const securityAnswerSalt = makeSalt();
      const securityAnswerHash = await hashWithSalt(securityAnswer, securityAnswerSalt);
      const recoveryPinSalt = makeSalt();
      const recoveryPinHash = await hashWithSalt(pin, recoveryPinSalt);

      users.push({
        fullName,
        username,
        passwordHash,
        passwordSalt,
        securityQuestionId,
        securityAnswerHash,
        securityAnswerSalt,
        recoveryPinHash,
        recoveryPinSalt,
      });
      saveUsers(users);

      showAuthSuccess("Account created successfully. Please log in.");
      mode = "login";
      setAuthMode(mode);
      usernameEl.value = username;
      passwordEl.value = "";
      passwordEl.focus();
    });
  });
}

init();

// --- PIN helpers (shared) ---
function getPINBoxes(root = document) {
  return [$$('#recoveryPin1', root), $$('#recoveryPin2', root), $$('#recoveryPin3', root), $$('#recoveryPin4', root)].filter(Boolean);
}

function getPINFromBoxes(root = document) {
  const boxes = getPINBoxes(root);
  return boxes.map((b) => String(b.value || "").replace(/\D/g, "")).join("");
}

function wirePINBox(box, idx, boxes, onChange) {
  if (!box) return;
  box.addEventListener("input", () => {
    box.value = String(box.value || "").replace(/\D/g, "").slice(0, 1);
    onChange?.();
    if (box.value && boxes[idx + 1]) boxes[idx + 1].focus();
  });
  box.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && !box.value && boxes[idx - 1]) {
      boxes[idx - 1].focus();
      return;
    }
    if (e.key === "ArrowLeft" && boxes[idx - 1]) boxes[idx - 1].focus();
    if (e.key === "ArrowRight" && boxes[idx + 1]) boxes[idx + 1].focus();
  });
  box.addEventListener("paste", (e) => {
    const text = String(e.clipboardData?.getData("text") || "").replace(/\D/g, "").slice(0, 4);
    if (!text) return;
    e.preventDefault();
    for (let i = 0; i < boxes.length; i++) boxes[i].value = text[i] || "";
    onChange?.();
    const next = boxes.find((b) => !b.value) || boxes[boxes.length - 1];
    next?.focus();
  });
}

// --- Signup password meter ---
function updateSignupPasswordMeter() {
  const meter = $$("#signupPwMeter");
  if (!meter || meter.hidden) return;

  const fill = $$("#signupPwFill");
  const tagLen = $$("#pwTagLen");
  const tagUpper = $$("#pwTagUpper");
  const tagNum = $$("#pwTagNum");

  const pw = passwordMeetsRules(passwordEl.value);
  const score = (pw.lenOk ? 1 : 0) + (pw.upperOk ? 1 : 0) + (pw.numOk ? 1 : 0);
  const pct = [0, 34, 68, 100][score] || 0;

  if (fill) fill.style.width = `${pct}%`;
  tagLen?.classList.toggle("is-ok", pw.lenOk);
  tagUpper?.classList.toggle("is-ok", pw.upperOk);
  tagNum?.classList.toggle("is-ok", pw.numOk);
}

// --- Recovery modal system ---
function securityQuestionLabel(id) {
  const map = {
    pet: "What was the name of your first pet?",
    city: "What city were you born in?",
    teacher: "What is the last name of a favorite teacher?",
    song: "What is a song that always calms you?",
    flower: "What is your favorite flower?",
  };
  return map[String(id || "")] || "Security question";
}

function initRecoveryModal() {
  const link = $$("#forgotPasswordLink");
  const dlg = $$("#recoverModal");
  const body = $$("#recoverBody");
  const foot = $$("#recoverFoot");
  const title = $$("#recoverTitle");
  const subtitle = $$("#recoverSubtitle");

  if (!link || !dlg || !body || !foot || !title || !subtitle) return;

  let step = "username";
  let verifiedUserKey = null; // normalized username key
  let lastFocus = null;

  const focusablesSel = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");

  function modalBusy(btn, isBusy) {
    if (!btn) return;
    btn.classList.toggle("is-busy", isBusy);
    btn.setAttribute("aria-busy", String(isBusy));
    btn.disabled = !!isBusy;
  }

  function trapFocus(e) {
    if (e.key !== "Tab") return;
    const focusables = Array.from(dlg.querySelectorAll(focusablesSel)).filter((el) => el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function shake(el) {
    if (!el) return;
    el.classList.remove("is-shaking");
    void el.offsetWidth;
    el.classList.add("is-shaking");
  }

  function resetState() {
    step = "username";
    verifiedUserKey = null;
    body.innerHTML = "";
    foot.innerHTML = "";
  }

  function closeModal() {
    dlg.close();
    resetState();
    lastFocus?.focus?.();
    lastFocus = null;
  }

  dlg.addEventListener("keydown", trapFocus);
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) closeModal();
  });
  dlg.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeModal();
  });
  dlg.addEventListener("close", () => {
    // If user clicked the native close button
    resetState();
  });

  link.addEventListener("click", () => {
    lastFocus = document.activeElement;
    render();
    dlg.showModal();
    setTimeout(() => dlg.querySelector("input, button")?.focus(), 0);
  });

  async function render() {
    body.innerHTML = "";
    foot.innerHTML = "";

    if (step === "username") {
      title.textContent = "Recover your account";
      subtitle.textContent = "Enter your username to verify your identity.";

      body.innerHTML = `
        <label class="field">
          <span class="field__label">Username</span>
          <input class="field__input" id="recoverUsername" inputmode="text" autocomplete="username" placeholder="Enter your username" />
          <p class="micro error field__error" id="recoverError" role="status" aria-live="polite" hidden></p>
        </label>
      `;

      foot.innerHTML = `
        <button class="btn btn--ghost" type="button" id="recoverCancel">Cancel</button>
        <div class="spacer"></div>
        <button class="btn btn--primary" type="button" id="recoverContinue">Continue</button>
      `;

      const uEl = $$("#recoverUsername", body);
      const err = $$("#recoverError", body);
      const btn = $$("#recoverContinue", foot);

      $$("#recoverCancel", foot)?.addEventListener("click", closeModal);

      async function onContinue() {
        err.hidden = true;
        err.textContent = "";
        const username = normalizeUsernameInput(uEl.value);
        if (!username) {
          err.hidden = false;
          err.textContent = "Please enter your username.";
          shake(uEl);
          return;
        }

        modalBusy(btn, true);
        try {
          const users = loadUsers();
          const u = findUser(users, username);
          if (!u) {
            err.hidden = false;
            err.textContent = "No account found with this username.";
            shake(uEl);
            return;
          }
          verifiedUserKey = usernameKey(u.username);
          step = "method";
          await render();
        } finally {
          modalBusy(btn, false);
        }
      }

      btn?.addEventListener("click", onContinue);
      uEl?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") onContinue();
      });
      return;
    }

    if (step === "method") {
      title.textContent = "Verify it’s you";
      subtitle.textContent = "Choose a verification method to continue.";

      body.innerHTML = `
        <div class="recover-options" role="list">
          <button class="recover-option" type="button" id="optQuestion" role="listitem">
            <div class="recover-option__title">Security Question</div>
            <div class="micro subtle">Answer the question you chose during signup.</div>
          </button>
          <button class="recover-option" type="button" id="optPin" role="listitem">
            <div class="recover-option__title">Recovery Passcode</div>
            <div class="micro subtle">Enter your 4-digit recovery PIN.</div>
          </button>
        </div>
        <p class="micro subtle">For your privacy, Ayla never sends emails or texts. This stays on your device.</p>
      `;

      foot.innerHTML = `
        <button class="btn btn--ghost" type="button" id="recoverBack">Back</button>
        <div class="spacer"></div>
        <button class="btn btn--ghost" type="button" id="recoverCancel">Cancel</button>
      `;

      $$("#recoverBack", foot)?.addEventListener("click", async () => {
        step = "username";
        await render();
        setTimeout(() => $$("#recoverUsername")?.focus(), 0);
      });
      $$("#recoverCancel", foot)?.addEventListener("click", closeModal);
      $$("#optQuestion", body)?.addEventListener("click", async () => {
        step = "question";
        await render();
        setTimeout(() => $$("#recoverAnswer")?.focus(), 0);
      });
      $$("#optPin", body)?.addEventListener("click", async () => {
        step = "pin";
        await render();
        setTimeout(() => $$("#pinRecover1")?.focus(), 0);
      });
      return;
    }

    const users = loadUsers();
    const u = users.find((x) => usernameKey(x.username) === verifiedUserKey) || null;
    if (!u) {
      step = "username";
      return render();
    }

    if (step === "question") {
      title.textContent = "Verify it’s you";
      subtitle.textContent = "Answer your security question to continue.";

      const q = securityQuestionLabel(u.securityQuestionId);
      body.innerHTML = `
        <div class="recover-question">
          <div class="micro subtle">Security question</div>
          <div class="recover-question__q">${q}</div>
        </div>
        <label class="field">
          <span class="field__label">Your answer</span>
          <input class="field__input" id="recoverAnswer" autocomplete="off" placeholder="Enter your answer" />
          <p class="micro error field__error" id="recoverError" role="status" aria-live="polite" hidden></p>
        </label>
      `;

      foot.innerHTML = `
        <button class="btn btn--ghost" type="button" id="recoverBack">Back</button>
        <div class="spacer"></div>
        <button class="btn btn--primary" type="button" id="recoverContinue">Continue</button>
      `;

      const ansEl = $$("#recoverAnswer", body);
      const err = $$("#recoverError", body);
      const btn = $$("#recoverContinue", foot);

      $$("#recoverBack", foot)?.addEventListener("click", async () => {
        step = "method";
        await render();
      });

      async function onContinue() {
        err.hidden = true;
        err.textContent = "";
        const answer = normalizeAnswerInput(ansEl.value);
        if (!answer) {
          err.hidden = false;
          err.textContent = "Please enter your answer.";
          shake(ansEl);
          return;
        }

        modalBusy(btn, true);
        try {
          if (!u.securityAnswerHash || !u.securityAnswerSalt) {
            err.hidden = false;
            err.textContent = "This account doesn’t have recovery set up. Please use the recovery passcode instead.";
            return;
          }
          const candidate = await hashWithSalt(answer, u.securityAnswerSalt);
          if (candidate !== u.securityAnswerHash) {
            err.hidden = false;
            err.textContent = "That answer doesn’t match. Please try again.";
            shake(ansEl);
            return;
          }
          step = "reset";
          await render();
          setTimeout(() => $$("#newPassword")?.focus(), 0);
        } finally {
          modalBusy(btn, false);
        }
      }

      btn?.addEventListener("click", onContinue);
      ansEl?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") onContinue();
      });
      return;
    }

    if (step === "pin") {
      title.textContent = "Verify it’s you";
      subtitle.textContent = "Enter your 4-digit recovery passcode.";

      body.innerHTML = `
        <label class="field">
          <span class="field__label">Recovery passcode</span>
          <span class="pin" role="group" aria-label="Recovery passcode">
            <input class="pin__box" id="pinRecover1" inputmode="numeric" maxlength="1" aria-label="Digit 1" />
            <input class="pin__box" id="pinRecover2" inputmode="numeric" maxlength="1" aria-label="Digit 2" />
            <input class="pin__box" id="pinRecover3" inputmode="numeric" maxlength="1" aria-label="Digit 3" />
            <input class="pin__box" id="pinRecover4" inputmode="numeric" maxlength="1" aria-label="Digit 4" />
          </span>
          <p class="micro error field__error" id="recoverError" role="status" aria-live="polite" hidden></p>
        </label>
      `;

      foot.innerHTML = `
        <button class="btn btn--ghost" type="button" id="recoverBack">Back</button>
        <div class="spacer"></div>
        <button class="btn btn--primary" type="button" id="recoverContinue">Continue</button>
      `;

      const boxes = [$$('#pinRecover1', body), $$('#pinRecover2', body), $$('#pinRecover3', body), $$('#pinRecover4', body)].filter(Boolean);
      boxes.forEach((box, idx) => wirePINBox(box, idx, boxes, null));

      const err = $$("#recoverError", body);
      const btn = $$("#recoverContinue", foot);

      $$("#recoverBack", foot)?.addEventListener("click", async () => {
        step = "method";
        await render();
      });

      async function onContinue() {
        err.hidden = true;
        err.textContent = "";
        const pin = boxes.map((b) => String(b.value || "").replace(/\D/g, "")).join("");
        if (pin.length !== 4) {
          err.hidden = false;
          err.textContent = "Please enter all 4 digits.";
          shake(boxes[0]);
          return;
        }

        modalBusy(btn, true);
        try {
          if (!u.recoveryPinHash || !u.recoveryPinSalt) {
            err.hidden = false;
            err.textContent = "This account doesn’t have recovery set up. Please use the security question instead.";
            return;
          }
          const candidate = await hashWithSalt(pin, u.recoveryPinSalt);
          if (candidate !== u.recoveryPinHash) {
            err.hidden = false;
            err.textContent = "That passcode doesn’t match. Please try again.";
            boxes.forEach((b) => shake(b));
            return;
          }
          step = "reset";
          await render();
          setTimeout(() => $$("#newPassword")?.focus(), 0);
        } finally {
          modalBusy(btn, false);
        }
      }

      btn?.addEventListener("click", onContinue);
      boxes[3]?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") onContinue();
      });
      return;
    }

    if (step === "reset") {
      title.textContent = "Reset password";
      subtitle.textContent = "Choose a new password for your account.";

      body.innerHTML = `
        <label class="field">
          <span class="field__label">New password</span>
          <span class="field__control">
            <input class="field__input field__input--withIcon" id="newPassword" type="password" autocomplete="new-password" placeholder="New password" />
            <button class="field__iconBtn" type="button" id="newPwToggle" aria-label="Show password" aria-pressed="false">
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M12 5c5.7 0 10 5.6 10 7s-4.3 7-10 7S2 14.4 2 12s4.3-7 10-7Zm0 2C7.7 7 4.2 11 4.2 12S7.7 17 12 17s7.8-4 7.8-5S16.3 7 12 7Zm0 2.2A2.8 2.8 0 1 1 12 14.8a2.8 2.8 0 0 1 0-5.6Z" />
              </svg>
            </button>
          </span>
          <div class="pw-meter" aria-live="polite">
            <div class="pw-meter__bar" aria-hidden="true"><span class="pw-meter__fill" id="resetPwFill"></span></div>
            <div class="pw-meter__row">
              <div class="micro subtle" id="resetPwLabel">Strength</div>
              <div class="pw-meter__tags" aria-hidden="true">
                <span class="pw-tag" id="resetTagLen">8+</span>
                <span class="pw-tag" id="resetTagUpper">A‑Z</span>
                <span class="pw-tag" id="resetTagNum">0‑9</span>
              </div>
            </div>
          </div>
          <p class="micro error field__error" id="pwError" role="status" aria-live="polite" hidden></p>
        </label>

        <label class="field">
          <span class="field__label">Confirm password</span>
          <span class="field__control">
            <input class="field__input field__input--withIcon" id="confirmPassword" type="password" autocomplete="new-password" placeholder="Confirm password" />
            <button class="field__iconBtn" type="button" id="confirmPwToggle" aria-label="Show password" aria-pressed="false">
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M12 5c5.7 0 10 5.6 10 7s-4.3 7-10 7S2 14.4 2 12s4.3-7 10-7Zm0 2C7.7 7 4.2 11 4.2 12S7.7 17 12 17s7.8-4 7.8-5S16.3 7 12 7Zm0 2.2A2.8 2.8 0 1 1 12 14.8a2.8 2.8 0 0 1 0-5.6Z" />
              </svg>
            </button>
          </span>
          <p class="micro error field__error" id="matchError" role="status" aria-live="polite" hidden></p>
        </label>
      `;

      foot.innerHTML = `
        <button class="btn btn--ghost" type="button" id="recoverBack">Back</button>
        <div class="spacer"></div>
        <button class="btn btn--primary" type="button" id="resetSubmit">Update password</button>
      `;

      const newPw = $$("#newPassword", body);
      const confirmPw = $$("#confirmPassword", body);
      const pwErr = $$("#pwError", body);
      const matchErr = $$("#matchError", body);
      const btn = $$("#resetSubmit", foot);

      const fill = $$("#resetPwFill", body);
      const tagLen = $$("#resetTagLen", body);
      const tagUpper = $$("#resetTagUpper", body);
      const tagNum = $$("#resetTagNum", body);

      function toggle(btnEl, inputEl) {
        if (!btnEl || !inputEl) return;
        btnEl.addEventListener("click", () => {
          const isShown = inputEl.type === "text";
          inputEl.type = isShown ? "password" : "text";
          btnEl.setAttribute("aria-pressed", String(!isShown));
          btnEl.setAttribute("aria-label", isShown ? "Show password" : "Hide password");
          inputEl.focus();
        });
      }
      toggle($$("#newPwToggle", body), newPw);
      toggle($$("#confirmPwToggle", body), confirmPw);

      function updateMeter() {
        const pw = passwordMeetsRules(newPw.value);
        const score = (pw.lenOk ? 1 : 0) + (pw.upperOk ? 1 : 0) + (pw.numOk ? 1 : 0);
        const pct = [0, 34, 68, 100][score] || 0;
        if (fill) fill.style.width = `${pct}%`;
        tagLen?.classList.toggle("is-ok", pw.lenOk);
        tagUpper?.classList.toggle("is-ok", pw.upperOk);
        tagNum?.classList.toggle("is-ok", pw.numOk);
      }

      function validateInline() {
        pwErr.hidden = true;
        pwErr.textContent = "";
        matchErr.hidden = true;
        matchErr.textContent = "";
        updateMeter();

        const pw = passwordMeetsRules(newPw.value);
        if (newPw.value && !pw.ok) {
          pwErr.hidden = false;
          pwErr.textContent = "Minimum 8 characters, with 1 uppercase and 1 number.";
        }
        if (confirmPw.value && stripPasswordSpaces(confirmPw.value) !== stripPasswordSpaces(newPw.value)) {
          matchErr.hidden = false;
          matchErr.textContent = "Passwords don’t match.";
        }
      }

      newPw.addEventListener("input", validateInline);
      confirmPw.addEventListener("input", validateInline);
      validateInline();

      $$("#recoverBack", foot)?.addEventListener("click", async () => {
        step = "method";
        await render();
      });

      async function onSubmit() {
        validateInline();
        const pw = passwordMeetsRules(newPw.value);
        const confirm = stripPasswordSpaces(confirmPw.value);
        if (!pw.ok) {
          shake(newPw);
          return;
        }
        if (confirm !== pw.value) {
          shake(confirmPw);
          return;
        }

        modalBusy(btn, true);
        try {
          const passwordSalt = makeSalt();
          const passwordHash = await hashWithSalt(pw.value, passwordSalt);

          const nextUsers = loadUsers();
          const idx = nextUsers.findIndex((x) => usernameKey(x.username) === verifiedUserKey);
          if (idx === -1) return;
          nextUsers[idx] = {
            ...nextUsers[idx],
            passwordHash,
            passwordSalt,
            password: undefined,
          };
          saveUsers(nextUsers);
          step = "success";
          await render();
          setTimeout(() => $$("#returnToLogin")?.focus(), 0);
        } finally {
          modalBusy(btn, false);
        }
      }

      btn?.addEventListener("click", onSubmit);
      confirmPw?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") onSubmit();
      });
      return;
    }

    if (step === "success") {
      title.textContent = "All set";
      subtitle.textContent = "Password updated successfully";

      body.innerHTML = `
        <div class="recover-success has-successGlow" role="status" aria-live="polite">
          <div class="recover-success__icon" aria-hidden="true">✓</div>
          <div class="recover-success__title">Password updated successfully</div>
          <p class="micro subtle">You can now log in with your new password.</p>
        </div>
      `;
      foot.innerHTML = `
        <div class="spacer"></div>
        <button class="btn btn--primary" type="button" id="returnToLogin">Return to login</button>
      `;

      $$("#returnToLogin", foot)?.addEventListener("click", () => {
        closeModal();
        setTimeout(() => usernameEl.focus(), 0);
      });
      return;
    }
  }
}

