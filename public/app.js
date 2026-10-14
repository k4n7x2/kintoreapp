const now = new Date();
let shownYear = now.getFullYear();
let shownMonth = now.getMonth();
const completeDates = new Set();
let workouts = [];
let authorized = false;
let dbReady = false;
let activePage = "home";
let recordsRequestId = 0;
let recordsLoaded = false;

const byId = (id) => document.getElementById(id);
// テーマは操作中のメモリにのみ保持。ユーザー設定をブラウザストレージへ保存しない。
const themeToggle = byId("theme-toggle");
const themeMeta = document.querySelector('meta[name="theme-color"]');
let currentTheme = "dark";

function applyTheme(nextTheme) {
  currentTheme = nextTheme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = currentTheme;
  const isLight = currentTheme === "light";
  themeToggle.setAttribute("aria-pressed", String(isLight));
  const toggleLabel = isLight ? "ダークモードに切り替える" : "ライトモードに切り替える";
  themeToggle.setAttribute("aria-label", toggleLabel);
  themeToggle.title = toggleLabel;
  if (themeMeta) themeMeta.content = isLight ? "#f5f1f7" : "#1c1a28";
}
applyTheme(window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
themeToggle.addEventListener("click", () => {
  applyTheme(currentTheme === "light" ? "dark" : "light");
});


const monthTitle = byId("month-title");
const calendarGrid = byId("calendar-grid");
const dateLabel = byId("today-label");
const authStatus = byId("auth-status");
const statusLabel = byId("db-status");
const statusIndicator = byId("db-indicator");
const saveDate = byId("workout-date");
const saveNote = byId("workout-note");
const saveButton = byId("save-workout");
const saveFeedback = byId("save-feedback");
const list = byId("record-list");

const localISO = (d) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
const currentMonth = () => String(shownYear).padStart(4, "0") + "-" + String(shownMonth + 1).padStart(2, "0");
const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

dateLabel.textContent = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric", month: "long", day: "numeric", weekday: "short"
}).format(now);
saveDate.value = localISO(now);

function renderCalendar() {
  monthTitle.textContent = String(shownYear) + "年 " + String(shownMonth + 1) + "月";
  byId("month-count").textContent = recordsLoaded ? completeDates.size + "日実施" : "読み込み中";
  renderOverview();
  calendarGrid.replaceChildren();
  const startWeekday = new Date(shownYear, shownMonth, 1).getDay();
  const daysInMonth = new Date(shownYear, shownMonth + 1, 0).getDate();

  for (let slot = 0; slot < startWeekday + daysInMonth; slot++) {
    const empty = slot < startWeekday;
    const cell = document.createElement(empty ? "span" : "button");
    cell.className = "calendar-day";
    if (empty) {
      cell.classList.add("is-empty");
      cell.setAttribute("aria-hidden", "true");
    } else {
      const day = slot - startWeekday + 1;
      const date = new Date(shownYear, shownMonth, day);
      const dateKey = localISO(date);
      const completed = completeDates.has(dateKey);
      cell.type = "button";
      cell.textContent = String(day);
      if (completed) cell.classList.add("is-completed");
      if (sameDay(date, now)) {
        cell.classList.add("is-today");
        cell.setAttribute("aria-current", "date");
      }
      cell.setAttribute("aria-label", String(shownMonth + 1) + "月" + String(day) + "日" + (completed ? "、記録済み" : "") + "。記録画面へ");
      cell.addEventListener("click", () => {
        saveDate.value = dateKey;
        setScreen("record");
      });
    }
    calendarGrid.appendChild(cell);
  }
}
function renderOverview() {
  byId("stat-days").textContent = recordsLoaded ? String(completeDates.size) : "—";
  byId("stat-sessions").textContent = recordsLoaded ? String(workouts.length) : "—";

}

function setReady(ready) {
  dbReady = ready;
  saveDate.disabled = !ready;
  saveNote.disabled = !ready;
  saveButton.disabled = !ready;
}

function renderHistory() {
  list.replaceChildren();
  if (!workouts.length) {
    list.textContent = "この月はまだ記録がありません。";
    return;
  }
  for (const record of workouts) {
    const row = document.createElement("div");
    row.className = "record-item";
    const detail = document.createElement("div");
    const date = document.createElement("strong");
    date.textContent = record.performed_on;
    const note = document.createElement("p");
    note.textContent = record.note || "実施日を記録しました";
    detail.append(date, note);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "delete-record";
    del.textContent = "削除";
    del.setAttribute("aria-label", record.performed_on + "の記録を削除");
    del.addEventListener("click", () => removeWorkout(record.id));
    row.append(detail, del);
    list.appendChild(row);
  }
}

async function fetchJSON(path, options = {}) {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options });
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(body.error || "request_failed");
    error.status = response.status;
    throw error;
  }
  return body;
}

async function loadWorkouts() {
  const month = currentMonth();
  const requestId = ++recordsRequestId;
  try {
    const result = await fetchJSON("/api/workouts?month=" + encodeURIComponent(month));
    if (!authorized || currentMonth() !== month || requestId !== recordsRequestId) return;
    workouts = result.workouts || [];
    recordsLoaded = true;
    completeDates.clear();
    workouts.forEach((w) => completeDates.add(w.performed_on));
    renderCalendar();
    renderHistory();
    setReady(true);
  } catch (error) {
    if (!authorized || currentMonth() !== month || requestId !== recordsRequestId) return;
    if (error.status === 401) {
      setAuthenticated(false);
      loginFeedback.textContent = "ログインの有効期限が切れました。もう一度ログインしてください。";
      return;
    }
    workouts = [];
    recordsLoaded = false;
    completeDates.clear();
    renderCalendar();
    byId("month-count").textContent = "取得できません";
    setReady(false);
    list.textContent = error.status === 503
      ? "D1のテーブル準備が必要です。"
      : "記録を読み込めませんでした。";
  }
}
async function removeWorkout(id) {
  if (!dbReady || !confirm("この記録を削除しますか？")) return;
  setReady(false);
  try {
    await fetchJSON("/api/workouts/" + encodeURIComponent(id), {
      method: "DELETE", headers: { "Content-Type": "application/json" }
    });
    await loadWorkouts();
    saveFeedback.textContent = "削除しました。";
  } catch {
    setReady(true);
    saveFeedback.textContent = "削除できませんでした。";
  }
}

byId("workout-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!authorized || !dbReady) return;
  setReady(false);
  saveFeedback.textContent = "保存中…";
  try {
    const result = await fetchJSON("/api/workouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ performed_on: saveDate.value, note: saveNote.value })
    });
    shownYear = Number(result.performed_on.slice(0, 4));
    shownMonth = Number(result.performed_on.slice(5, 7)) - 1;
    await loadWorkouts();
    saveNote.value = "";
    saveFeedback.textContent = "クラウドに保存しました。";
  } catch {
    setReady(true);
    saveFeedback.textContent = "保存に失敗しました。日付と接続状態を確認してください。";
  }
});

function changeMonth(offset) {
  const result = new Date(shownYear, shownMonth + offset, 1);
  shownYear = result.getFullYear();
  shownMonth = result.getMonth();
  ++recordsRequestId;
  recordsLoaded = false;
  setReady(false);
  completeDates.clear();
  workouts = [];
  renderCalendar();
  list.textContent = "読み込み中…";
  if (authorized) loadWorkouts();
}
byId("prev-month").addEventListener("click", () => changeMonth(-1));
byId("next-month").addEventListener("click", () => changeMonth(1));
renderCalendar();

const loginForm = byId("login-form");
const loginPassword = byId("login-password");
const loginButton = byId("login-button");
const loginFeedback = byId("login-feedback");
const loginSuccess = byId("login-success");

const pages = new Set(["home", "record", "history", "settings"]);

// ホームの既存セリフ候補を必要時だけ取得する。端末には永続保存しない。
const homeDialogue = byId("shiori-home-dialogue");
const shioriHomeTouch = byId("shiori-home-touch");
const shioriHomeArt = shioriHomeTouch.querySelector(".character-layer__art");
let greetingData = null;
let greetingLoading = null;
let lastHomeGreeting = "";
let greetingRequestId = 0;

// 画像へのタップ／キーボードの操作で、一言と控えめなリアクションを返す。
shioriHomeTouch.addEventListener("click", () => {
  if (!authorized || activePage !== "home") return;
  shioriHomeTouch.classList.remove("is-poked");
  // 同じアニメーションを連続タップでも先頭から再生する。
  void shioriHomeArt.offsetWidth;
  shioriHomeTouch.classList.add("is-poked");
  showHomeGreeting();
});
// ネイティブのボタン押下ハイライトを避けつつ、キーボードでの操作性は維持する。
shioriHomeTouch.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  if (!authorized || activePage !== "home" || event.repeat) return;
  shioriHomeTouch.click();
});
shioriHomeArt.addEventListener("animationend", () => {
  shioriHomeTouch.classList.remove("is-poked");
});

function greetingTimeSlot(hour) {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

async function showHomeGreeting() {
  const requestId = ++greetingRequestId;
  try {
    if (!greetingData) {
      if (!greetingLoading) {
        greetingLoading = fetch("/data/shiori-greetings.json", { cache: "force-cache" })
          .then((response) => {
            if (!response.ok) throw new Error("greetings_unavailable");
            return response.json();
          })
          .then((data) => {
            greetingData = data;
            return data;
          })
          .finally(() => { greetingLoading = null; });
      }
      await greetingLoading;
    }
    if (!authorized || activePage !== "home" || requestId !== greetingRequestId) return;

    const slot = greetingTimeSlot(new Date().getHours());
    const candidates = [greetingData?.[slot], greetingData?.anytime]
      .flat()
      .filter((line) => typeof line === "string" && line.trim());
    const alternatives = candidates.filter((line) => line !== lastHomeGreeting);
    const pool = alternatives.length ? alternatives : candidates;
    const line = pool.length ? pool[Math.floor(Math.random() * pool.length)] : "あ、来た。今日はどうする？";
    lastHomeGreeting = line;
    homeDialogue.textContent = line;
    homeDialogue.hidden = false;
  } catch {
    if (!authorized || activePage !== "home" || requestId !== greetingRequestId) return;
    // 読み込み失敗時にも、未確認の実績などを語らない短い一言だけ表示する。
    homeDialogue.textContent = "あ、来た。今日はどうする？";
    homeDialogue.hidden = false;
  }
}


function setScreen(screen, pushHistory = true) {
  if (!authorized || !pages.has(screen)) return;
  const previousPage = activePage;
  activePage = screen;
  document.body.classList.toggle("is-home", screen === "home");
  if (screen === "home") {
    if (previousPage !== "home" || homeDialogue.hidden) showHomeGreeting();
  } else {
    ++greetingRequestId;
  }
  document.querySelectorAll("[data-page]").forEach((page) => {
    page.hidden = page.dataset.page !== screen;
  });
  document.querySelectorAll(".nav-item").forEach((item) => {
    const isCurrent = item.dataset.screen === screen;
    item.classList.toggle("is-active", isCurrent);
    if (isCurrent) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  if (pushHistory && location.hash !== "#" + screen) {
    history.pushState({ screen }, "", "#" + screen);
  }
  window.scrollTo(0, 0);
}

document.querySelectorAll("[data-screen]").forEach((button) => {
  button.addEventListener("click", () => setScreen(button.dataset.screen));
});

window.addEventListener("popstate", () => {
  if (!authorized) return;
  const screen = location.hash.slice(1);
  setScreen(pages.has(screen) ? screen : "home", false);
});

function setAuthenticated(next) {
  authorized = next;
  ++recordsRequestId;
  byId("boot-screen").hidden = true;
  byId("auth-screen").hidden = next;
  byId("app-screen").hidden = !next;
  byId("bottom-nav").hidden = !next;
  byId("app-header").hidden = !next;
  byId("app-footer").hidden = !next;
  document.body.classList.toggle("is-authenticated", next);
  if (!next) document.body.classList.remove("is-home");
  document.title = next ? "kintoreapp | 筋トレ記録" : "ログイン";
  loginSuccess.hidden = !next;
  if (next) {
    authStatus.textContent = "ログイン済み（自分専用）";
    setScreen("home", false);
  } else {
    ++greetingRequestId;
    shioriHomeTouch.classList.remove("is-poked");
    homeDialogue.hidden = true;
    homeDialogue.textContent = "";
    lastHomeGreeting = "";
    authStatus.textContent = "未ログイン：パスワードを入力してください。";
    setReady(false);
    workouts = [];
    recordsLoaded = false;
    completeDates.clear();
    renderCalendar();
    list.textContent = "ログインすると記録が表示されます。";
    history.replaceState(null, "", location.pathname + location.search);
    window.scrollTo(0, 0);
  }
}
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginButton.disabled = true;
  loginFeedback.textContent = "ログイン中…";
  try {
    await fetchJSON("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: loginPassword.value })
    });
    loginPassword.value = "";
    setAuthenticated(true);
    loginFeedback.textContent = "";
    await loadWorkouts();
  } catch (error) {
    loginFeedback.textContent = error.status === 503
      ? "現在ログインできません。"
      : "パスワードを確認してください。";
  } finally {
    loginButton.disabled = false;
  }
});

byId("logout-button").addEventListener("click", async () => {
  try {
    await fetchJSON("/api/logout", { method: "POST" });
  } catch {
    loginFeedback.textContent = "ログアウト処理に失敗しました。";
    return;
  }
  setAuthenticated(false);
  loginFeedback.textContent = "ログアウトしました。";
});

async function initialize() {
  let loginConfigured = false;
  try {
    const health = await fetchJSON("/api/health");
    loginConfigured = health.login_configured === true;
    if (health.ok) {
      statusLabel.textContent = "D1 接続確認済み";
      statusIndicator.classList.add("ok");
    } else throw new Error("unavailable");
  } catch {
    statusLabel.textContent = "D1 接続確認待ち";
    statusIndicator.classList.add("error");
  }
  try {
    await fetchJSON("/api/session");
    setAuthenticated(true);
    list.textContent = "記録を読み込み中…";
    await loadWorkouts();
  } catch {
    setAuthenticated(false);
    if (!loginConfigured) {
      loginFeedback.textContent = "現在ログインできません。";
    }
  }
}
initialize();
