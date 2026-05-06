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
    .filter((u) => u && typeof u.username === "string" && typeof u.password === "string")
    .map((u) => ({
      fullName: typeof u.fullName === "string" ? u.fullName : undefined,
      username: String(u.username),
      password: String(u.password),
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

function hasTwoWords(fullName) {
  return fullName.split(/\s+/).filter(Boolean).length >= 2;
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
  authSubmit.disabled = !fn || !u || !p;
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
    ? "Tip: This app stores your data only on this device (localStorage)."
    : "Create a private local account for this device.";

  applyFieldVisibility(fullNameField, !isLogin);
  applyFieldVisibility(usernameField, true);
  applyFieldVisibility(passwordField, true);

  // Clear all inputs + messages on switch
  if (fullNameEl) fullNameEl.value = "";
  usernameEl.value = "";
  passwordEl.value = "";
  clearAuthMessages();

  usernameEl.placeholder = isLogin ? "Enter your username" : "Choose a unique username (min 3 characters)";
  passwordEl.placeholder = isLogin ? "Enter your password" : "Create a password (min 4 characters)";
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
    onAuthInput(mode);
  });
  fullNameEl?.addEventListener("input", () => {
    clearFieldError(fullNameEl, fullNameError);
    onAuthInput(mode);
  });

  authForm.addEventListener("submit", (e) => {
    e.preventDefault();
    clearAuthMessages();

    const username = normalizeUsernameInput(usernameEl.value);
    const password = normalizePasswordInput(passwordEl.value);

    if (mode === "login") {
      if (!username || !password) {
        usernameEl.classList.add("is-invalid");
        passwordEl.classList.add("is-invalid");
        return showAuthError("Please enter username and password");
      }

      withAuthBusy(() => {
        const users = loadUsers();
        const u = findUser(users, username);
        if (!u || u.password !== password) {
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

    if (!password) {
      setFieldError(passwordEl, passwordError, "Password is required.");
      ok = false;
    } else if (password.length < 4) {
      setFieldError(passwordEl, passwordError, "Password must be at least 4 characters.");
      ok = false;
    }

    if (!ok) return;

    withAuthBusy(() => {
      const users = loadUsers();
      if (findUser(users, username)) {
        setFieldError(usernameEl, usernameError, "Username already exists. Please log in.");
        return;
      }

      users.push({ fullName, username, password });
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

