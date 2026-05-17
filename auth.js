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

function normalizeEmail(s) {
  return String(s || "").trim().toLowerCase();
}

function isValidEmail(s) {
  const v = normalizeEmail(s);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function usernameKey(username) {
  return String(username || "").trim().toLowerCase();
}

function userKey(u) {
  if (!u) return "";
  if (typeof u.email === "string" && u.email.trim()) return normalizeEmail(u.email);
  return usernameKey(u.username);
}

/** Matches dashboard/cycle data keys in localStorage (legacy accounts keyed by username string). */
function storageSessionKey(u) {
  if (!u) return null;
  if (typeof u.username === "string" && u.username.trim()) return String(u.username);
  return userKey(u);
}

function loadUsers() {
  const raw = localStorage.getItem(LS.users);
  const parsed = safeJSONParse(raw || "[]", []);

  if (parsed && !Array.isArray(parsed) && typeof parsed === "object") {
    const migrated = Object.entries(parsed)
      .filter(([u, v]) => typeof u === "string" && v && typeof v.password === "string")
      .map(([u, v]) => ({ username: u, password: v.password }));
    const withEmail = migrated.map((row) => ({
      ...row,
      email: normalizeEmail(`${usernameKey(row.username)}@device.local`),
    }));
    localStorage.setItem(LS.users, JSON.stringify(withEmail));
    return withEmail;
  }

  if (!Array.isArray(parsed)) return [];

  const cleaned = parsed
    .filter(
      (u) =>
        u &&
        (typeof u.username === "string" || typeof u.email === "string") &&
        (typeof u.password === "string" || typeof u.passwordHash === "string")
    )
    .map((u) => {
      const username = typeof u.username === "string" ? String(u.username) : "";
      const emailFrom =
        typeof u.email === "string" && u.email.trim()
          ? normalizeEmail(u.email)
          : username
            ? normalizeEmail(`${usernameKey(username)}@device.local`)
            : "";
      return {
        fullName: typeof u.fullName === "string" ? u.fullName : undefined,
        username: username || emailFrom.split("@")[0] || "user",
        email: emailFrom,
        password: typeof u.password === "string" ? String(u.password) : undefined,
        passwordHash: typeof u.passwordHash === "string" ? String(u.passwordHash) : undefined,
        passwordSalt: typeof u.passwordSalt === "string" ? String(u.passwordSalt) : undefined,
        securityQuestionId: typeof u.securityQuestionId === "string" ? String(u.securityQuestionId) : undefined,
        securityAnswerHash: typeof u.securityAnswerHash === "string" ? String(u.securityAnswerHash) : undefined,
        securityAnswerSalt: typeof u.securityAnswerSalt === "string" ? String(u.securityAnswerSalt) : undefined,
        recoveryPinHash: typeof u.recoveryPinHash === "string" ? String(u.recoveryPinHash) : undefined,
        recoveryPinSalt: typeof u.recoveryPinSalt === "string" ? String(u.recoveryPinSalt) : undefined,
      };
    });

  localStorage.setItem(LS.users, JSON.stringify(cleaned));
  return cleaned;
}

function saveUsers(users) {
  localStorage.setItem(LS.users, JSON.stringify(users));
}

/** Preferred display name — emotional personalization only (stored as fullName). */
function normalizePreferredNameInput(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ");
}

function validatePreferredName(raw) {
  const name = normalizePreferredNameInput(raw);
  if (!name) return { ok: false, code: "empty" };
  if (name.length > 80) return { ok: false, code: "long" };
  try {
    if (!/^[\p{L}\p{M}][\p{L}\p{M}\s'\-.]*$/u.test(name)) return { ok: false, code: "chars" };
  } catch {
    if (!/^[A-Za-zÀ-ž][A-Za-zÀ-ž\s'\-.]*$/.test(name)) return { ok: false, code: "chars" };
  }
  return { ok: true, value: name };
}

function preferredNameErrorMessage(code) {
  const map = {
    empty: "We’d love to know what to call you.",
    long: "Could you use a slightly shorter name?",
    chars: "Letters, spaces, and simple punctuation work best here.",
  };
  return map[code] || map.chars;
}

function findUserForLogin(users, rawInput) {
  const raw = String(rawInput || "").trim();
  if (!raw) return null;
  if (raw.includes("@")) {
    const key = normalizeEmail(raw);
    return users.find((u) => normalizeEmail(u.email) === key) || null;
  }
  const key = usernameKey(raw);
  return users.find((u) => usernameKey(u.username) === key) || null;
}

function loadLoggedInUser() {
  const u = localStorage.getItem(LS.loggedInUser);
  return u ? String(u) : null;
}

function saveLoggedInUser(key) {
  localStorage.setItem(LS.loggedInUser, key);
}

// Elements
const authForm = $$("#authForm");
const tabLogin = $$("#tabLogin");
const tabSignup = $$("#tabSignup");
const authHeading = $$("#authHeading");
const authSubtle = $$("#authSubtle");
const preferredNameField = $$("#preferredNameField");
const preferredNameEl = $$("#preferredName");
const preferredNameError = $$("#preferredNameError");
const emailEl = $$("#email");
const passwordEl = $$("#password");
const confirmPasswordField = $$("#confirmPasswordField");
const confirmPasswordEl = $$("#confirmPassword");
const confirmPasswordError = $$("#confirmPasswordError");
const authSubmit = $$("#authSubmit");
const authHint = $$("#authHint");
const authError = $$("#authError");
const authSuccess = $$("#authSuccess");
const emailError = $$("#emailError");
const passwordError = $$("#passwordError");
const forgotRow = $$("#forgotRow");

let authMsgTimer = null;
let mode = "login";

function applyFieldVisibility(el, show) {
  if (!el) return;
  el.hidden = !show;
  el.style.display = show ? "" : "none";
  el.setAttribute("aria-hidden", show ? "false" : "true");
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

  clearFieldError(preferredNameEl, preferredNameError);
  clearFieldError(emailEl, emailError);
  clearFieldError(passwordEl, passwordError);
  clearFieldError(confirmPasswordEl, confirmPasswordError);
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

function normalizePasswordInput(s) {
  return String(s || "");
}

function stripPasswordSpaces(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
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
  authSubmit.classList.toggle("is-busy", isBusy);
  authSubmit.setAttribute("aria-busy", String(isBusy));
}

function withAuthBusyAsync(fn) {
  setAuthBusy(true);
  return (async () => {
    try {
      await fn();
    } finally {
      setTimeout(() => setAuthBusy(false), 220);
    }
  })();
}

function updateAuthButtonState(currentMode) {
  if (authSubmit.classList.contains("is-busy")) return;
  const m = currentMode || mode;
  const e = normalizeEmail(emailEl.value);
  const p = normalizePasswordInput(passwordEl.value);
  if (m === "login") {
    authSubmit.disabled = !e || !p;
    return;
  }
  const nm = normalizePreferredNameInput(preferredNameEl?.value || "");
  const c = normalizePasswordInput(confirmPasswordEl?.value || "");
  authSubmit.disabled = !nm || !e || !p || !c;
}

function onAuthInput() {
  authError.hidden = true;
  authError.textContent = "";
  authSuccess.hidden = true;
  authSuccess.textContent = "";
  clearTimeout(authMsgTimer);
  authMsgTimer = null;
  updateAuthButtonState();
}

function setAuthMode(next, opts = {}) {
  const preserveMessages = opts.preserveMessages === true;
  mode = next === "signup" ? "signup" : "login";
  const isLogin = mode === "login";

  authForm.classList.add("is-switching");
  setTimeout(() => authForm.classList.remove("is-switching"), 160);

  tabLogin?.classList.toggle("is-active", isLogin);
  tabSignup?.classList.toggle("is-active", !isLogin);
  tabLogin?.setAttribute("aria-selected", String(isLogin));
  tabSignup?.setAttribute("aria-selected", String(!isLogin));

  if (authHeading) {
    authHeading.textContent = isLogin ? "Welcome back" : "Create your account";
  }
  if (authSubtle) {
    authSubtle.textContent = isLogin
      ? "Sign in to your private space — calm, secure, and yours alone."
      : "Start gently — one quiet step toward tracking that honors your body.";
  }

  authSubmit.textContent = isLogin ? "Log in" : "Create account";

  if (authHint) {
    authHint.textContent =
      "Private by design — your cycle data stays on this device until you choose otherwise.";
  }

  applyFieldVisibility(forgotRow, isLogin);
  applyFieldVisibility(preferredNameField, !isLogin);
  applyFieldVisibility(confirmPasswordField, !isLogin);

  passwordEl.autocomplete = isLogin ? "current-password" : "new-password";
  passwordEl.placeholder = isLogin ? "Enter your password" : "Create a password";

  if (preferredNameEl) preferredNameEl.value = "";
  if (confirmPasswordEl) {
    confirmPasswordEl.value = "";
    confirmPasswordEl.autocomplete = "new-password";
  }
  passwordEl.value = "";

  if (preserveMessages) {
    clearFieldError(preferredNameEl, preferredNameError);
    clearFieldError(emailEl, emailError);
    clearFieldError(passwordEl, passwordError);
    clearFieldError(confirmPasswordEl, confirmPasswordError);
  } else {
    clearAuthMessages();
  }

  updateAuthButtonState(mode);
  if (isLogin) emailEl?.focus();
  else preferredNameEl?.focus();
}

function init() {
  const existing = loadLoggedInUser();
  if (existing) {
    window.location.href = "dashboard.html#home";
    return;
  }

  setAuthMode("login");

  tabLogin?.addEventListener("click", () => setAuthMode("login"));
  tabSignup?.addEventListener("click", () => setAuthMode("signup"));

  preferredNameEl?.addEventListener("input", () => {
    clearFieldError(preferredNameEl, preferredNameError);
    onAuthInput();
  });
  emailEl?.addEventListener("input", () => {
    clearFieldError(emailEl, emailError);
    onAuthInput();
  });
  passwordEl.addEventListener("input", () => {
    clearFieldError(passwordEl, passwordError);
    onAuthInput();
  });
  confirmPasswordEl?.addEventListener("input", () => {
    clearFieldError(confirmPasswordEl, confirmPasswordError);
    onAuthInput();
  });

  const passwordToggle = $$("#passwordToggle");
  passwordToggle?.addEventListener("click", () => {
    const isShown = passwordEl.type === "text";
    passwordEl.type = isShown ? "password" : "text";
    passwordToggle.setAttribute("aria-pressed", String(!isShown));
    passwordToggle.setAttribute("aria-label", isShown ? "Show password" : "Hide password");
  });

  const confirmPasswordToggle = $$("#confirmPasswordToggle");
  confirmPasswordToggle?.addEventListener("click", () => {
    if (!confirmPasswordEl) return;
    const isShown = confirmPasswordEl.type === "text";
    confirmPasswordEl.type = isShown ? "password" : "text";
    confirmPasswordToggle.setAttribute("aria-pressed", String(!isShown));
    confirmPasswordToggle.setAttribute("aria-label", isShown ? "Show confirm password" : "Hide confirm password");
  });

  initRecoveryModal();

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAuthMessages();

    const emailRaw = String(emailEl.value || "").trim();
    const passwordRaw = normalizePasswordInput(passwordEl.value);
    const nameRawSignup = mode === "signup" ? normalizePreferredNameInput(preferredNameEl?.value || "") : "";

    if (!emailRaw || !passwordRaw || (mode === "signup" && !nameRawSignup)) {
      if (!emailRaw) setFieldError(emailEl, emailError, "Please enter your email.");
      if (!passwordRaw) setFieldError(passwordEl, passwordError, "Please enter your password.");
      if (mode === "signup" && !nameRawSignup) {
        setFieldError(preferredNameEl, preferredNameError, preferredNameErrorMessage("empty"));
      }
      return showAuthError(mode === "login" ? "Please enter your email and password." : "Please fill in all fields.");
    }

    if (!isValidEmail(emailRaw)) {
      setFieldError(emailEl, emailError, "Please enter a valid email address.");
      return showAuthError("Please enter a valid email address.");
    }

    if (mode === "signup") {
      const nameCheck = validatePreferredName(preferredNameEl?.value || "");
      if (!nameCheck.ok) {
        setFieldError(preferredNameEl, preferredNameError, preferredNameErrorMessage(nameCheck.code));
        return showAuthError(preferredNameErrorMessage(nameCheck.code));
      }

      const confirmRaw = normalizePasswordInput(confirmPasswordEl?.value || "");
      if (!confirmRaw) {
        setFieldError(confirmPasswordEl, confirmPasswordError, "Please confirm your password.");
        return showAuthError("Please confirm your password.");
      }

      const pw = passwordMeetsRules(passwordRaw);
      if (!pw.ok) {
        setFieldError(passwordEl, passwordError, "Use 8+ characters with 1 uppercase letter and 1 number.");
        return showAuthError("Please choose a stronger password.");
      }

      if (stripPasswordSpaces(confirmRaw) !== pw.value) {
        setFieldError(confirmPasswordEl, confirmPasswordError, "Passwords don’t match.");
        return showAuthError("Passwords don’t match.");
      }

      await withAuthBusyAsync(async () => {
        const users = loadUsers();
        if (findUserForLogin(users, emailRaw)) {
          setFieldError(emailEl, emailError, "An account with this email already exists.");
          return showAuthError("That email is already registered. Try logging in.");
        }

        const normalized = normalizeEmail(emailRaw);
        const passwordSalt = makeSalt();
        const passwordHash = await hashWithSalt(pw.value, passwordSalt);

        users.push({
          username: normalized,
          email: normalized,
          fullName: nameCheck.value,
          passwordHash,
          passwordSalt,
        });
        saveUsers(users);

        emailEl.value = normalized;
        setAuthMode("login", { preserveMessages: true });
        showAuthSuccess("You’re all set — sign in when you’re ready.");
      });
      return;
    }

    await withAuthBusyAsync(async () => {
      const users = loadUsers();
      const u = findUserForLogin(users, emailRaw);
      if (!u) {
        emailEl.classList.add("is-invalid");
        passwordEl.classList.add("is-invalid");
        return showAuthError("We couldn’t find an account with those details.");
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
        emailEl.classList.add("is-invalid");
        passwordEl.classList.add("is-invalid");
        return showAuthError("We couldn’t find an account with those details.");
      }

      saveLoggedInUser(storageSessionKey(u));
      window.location.href = "dashboard.html#home";
    });
  });

  setTimeout(() => emailEl?.focus(), 0);
}

init();

// --- PIN helpers (recovery modal) ---
function getPINBoxes(root = document) {
  return [$$("#recoveryPin1", root), $$("#recoveryPin2", root), $$("#recoveryPin3", root), $$("#recoveryPin4", root)].filter(Boolean);
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
    const text = String(e.clipboardData?.getData("text") || "")
      .replace(/\D/g, "")
      .slice(0, 4);
    if (!text) return;
    e.preventDefault();
    for (let i = 0; i < boxes.length; i++) boxes[i].value = text[i] || "";
    onChange?.();
    const next = boxes.find((b) => !b.value) || boxes[boxes.length - 1];
    next?.focus();
  });
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

  let step = "email";
  let verifiedUserKey = null;
  let lastFocus = null;

  function normalizeAnswerInput(s) {
    return String(s || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  const focusablesSel = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
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
    step = "email";
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

    if (step === "email") {
      title.textContent = "Recover your account";
      subtitle.textContent = "Enter the email for your account. Legacy usernames still work if you enter them without @.";

      body.innerHTML = `
        <label class="field">
          <span class="field__label">Email Address</span>
          <input class="field__input" id="recoverEmail" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" placeholder="Enter your email" />
          <p class="micro error field__error" id="recoverError" role="status" aria-live="polite" hidden></p>
        </label>
      `;

      foot.innerHTML = `
        <button class="btn btn--ghost" type="button" id="recoverCancel">Cancel</button>
        <div class="spacer"></div>
        <button class="btn btn--primary" type="button" id="recoverContinue">Continue</button>
      `;

      const uEl = $$("#recoverEmail", body);
      const err = $$("#recoverError", body);
      const btn = $$("#recoverContinue", foot);

      $$("#recoverCancel", foot)?.addEventListener("click", closeModal);

      async function onContinue() {
        err.hidden = true;
        err.textContent = "";
        const raw = String(uEl.value || "").trim();
        if (!raw) {
          err.hidden = false;
          err.textContent = "Please enter your email.";
          shake(uEl);
          return;
        }
        if (raw.includes("@") && !isValidEmail(raw)) {
          err.hidden = false;
          err.textContent = "Please enter a valid email address.";
          shake(uEl);
          return;
        }

        modalBusy(btn, true);
        try {
          const users = loadUsers();
          const u = findUserForLogin(users, raw);
          if (!u) {
            err.hidden = false;
            err.textContent = "No account found with those details.";
            shake(uEl);
            return;
          }
          verifiedUserKey = storageSessionKey(u);
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
            <div class="micro subtle">Answer the question you saved for account recovery.</div>
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
        step = "email";
        await render();
        setTimeout(() => $$("#recoverEmail")?.focus(), 0);
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
    const u = users.find((x) => userKey(x) === verifiedUserKey) || null;
    if (!u) {
      step = "email";
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

      const boxes = [$$("#pinRecover1", body), $$("#pinRecover2", body), $$("#pinRecover3", body), $$("#pinRecover4", body)].filter(Boolean);
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
          const idx = nextUsers.findIndex((x) => storageSessionKey(x) === verifiedUserKey);
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
        setTimeout(() => emailEl?.focus(), 0);
      });
      return;
    }
  }
}
