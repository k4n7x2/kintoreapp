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
const exerciseList = byId("exercise-list");
const addExerciseButton = byId("add-exercise");
const cancelWorkoutEdit = byId("cancel-workout-edit");
const dayPlanned = byId("day-planned");
const dayAttended = byId("day-attended");
const calendarError = byId("calendar-error");
const saveCalendarDay = byId("save-calendar-day");
const calendarDays = new Map();
let calendarAvailable = false;
let monthTruncated = false;
let selectedDate = "";
let editingWorkoutId = null;

const localISO = (d) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
const currentMonth = () => String(shownYear).padStart(4, "0") + "-" + String(shownMonth + 1).padStart(2, "0");
const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const todayISO = () => localISO(new Date());

dateLabel.textContent = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric", month: "long", day: "numeric", weekday: "short"
}).format(now);
saveDate.value = todayISO();
selectedDate = todayISO();

function showDay(date) {
  // カレンダーから選択した日付で記録画面へ直行。編集中のフォームは上書きしない。
  if (editingWorkoutId || saveNote.value.trim() ||
      [...exerciseList.querySelectorAll(".exercise-name")].some(input => input.value.trim())) {
    if (!confirm("入力中の内容を破棄して、この日の記録画面へ移動しますか？")) return;
  }
  resetWorkoutForm(date);
  selectedDate = date;
  saveFeedback.textContent = "";
  renderCalendar();
  setScreen("record");
}
function renderOverview() {
  // 集計カードは撤去。取得状態のみスクリーンリーダーへ伝える。
  byId("month-count").textContent = recordsLoaded
    ? "記録を取得しました。" + (monthTruncated ? " 月200件の表示上限です。" : "")
    : "読み込み中";
}
function renderCalendar() {
  monthTitle.textContent = shownYear + "年 " + (shownMonth + 1) + "月";
  renderOverview();
  calendarGrid.replaceChildren();
  const startWeekday = new Date(shownYear, shownMonth, 1).getDay();
  const daysInMonth = new Date(shownYear, shownMonth + 1, 0).getDate();
  for (let slot = 0; slot < startWeekday + daysInMonth; slot++) {
    if (slot < startWeekday) {
      const spacer = document.createElement("span");
      spacer.className = "calendar-day is-empty";
      spacer.setAttribute("aria-hidden", "true");
      calendarGrid.appendChild(spacer);
      continue;
    }
    const day = slot - startWeekday + 1;
    const date = new Date(shownYear, shownMonth, day);
    const dateKey = localISO(date);
    const state = calendarDays.get(dateKey);
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "calendar-day";
    cell.textContent = String(day);
    if (state?.planned) cell.classList.add("is-planned");
    if (state?.attended) cell.classList.add("is-attended");
    if (completeDates.has(dateKey)) cell.classList.add("has-workout");
    
    if (sameDay(date, new Date())) {
      cell.classList.add("is-today");
      cell.setAttribute("aria-current", "date");
    }
    
    cell.setAttribute("aria-label", dateKey + [
      state?.planned ? "予定あり" : "",
      state?.attended ? "来館済み" : "",
      completeDates.has(dateKey) ? "筋トレ記録あり" : ""
    ].filter(Boolean).join("、"));
    cell.addEventListener("click", () => showDay(dateKey));
    calendarGrid.appendChild(cell);
  }
  renderDayDetail();
}
function renderDayDetail() {
  byId("selected-day-title").textContent = selectedDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1年$2月$3日");
  const state = calendarDays.get(selectedDate);
  dayPlanned.checked = !!state?.planned;
  dayAttended.checked = !!state?.attended;
  dayPlanned.disabled = !authorized || !calendarAvailable;
  dayAttended.disabled = !authorized || !calendarAvailable;
  saveCalendarDay.disabled = !authorized || !calendarAvailable;
  calendarError.textContent = authorized && recordsLoaded && !calendarAvailable
    ? "予定・来館の保存にはD1の追加マイグレーション（0002）が必要です。" : "";
  const host = byId("selected-day-records");
  host.replaceChildren();
  const entries = workouts.filter(x => x.performed_on === selectedDate);
  if (!entries.length) {
    host.textContent = "この日の筋トレ記録はありません。";
    return;
  }
  const label = document.createElement("p");
  label.textContent = "この日の筋トレ記録：" + entries.length + "件";
  host.appendChild(label);
  for (const record of entries) {
    const row = document.createElement("div");
    row.className = "day-record-row";
    const summary = document.createElement("span");
    summary.textContent = workoutSummary(record);
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "secondary-action";
    edit.textContent = "編集";
    edit.addEventListener("click", () => editWorkout(record));
    row.append(summary, edit);
    host.appendChild(row);
  }
}
function setReady(ready) {
  dbReady = ready;
  saveDate.disabled = !ready;
  saveNote.disabled = !ready;
  saveButton.disabled = !ready;
  addExerciseButton.disabled = !ready;
  exerciseList.querySelectorAll("input, button").forEach(el => { el.disabled = !ready; });
}

function newSetRow(container, set = { weight_kg: 0, reps: 10 }) {
  const row = document.createElement("div");
  row.className = "exercise-set";
  const number = document.createElement("span");
  number.className = "set-number";
  const weightLabel = document.createElement("label");
  weightLabel.textContent = "重量 kg";
  const weight = document.createElement("input");
  weight.type = "number"; weight.min = "0"; weight.max = "2000"; weight.step = "0.5";
  weight.inputMode = "decimal"; weight.required = true;
  weight.className = "set-weight";
  weight.value = String(set.weight_kg ?? 0);
  weightLabel.appendChild(weight);
  const repsLabel = document.createElement("label");
  repsLabel.textContent = "回数";
  const reps = document.createElement("input");
  reps.type = "number"; reps.min = "0"; reps.max = "1000"; reps.step = "1";
  reps.inputMode = "numeric"; reps.required = true;
  reps.className = "set-reps";
  reps.value = String(set.reps ?? 10);
  repsLabel.appendChild(reps);
  const remove = document.createElement("button");
  remove.type = "button"; remove.className = "secondary-action";
  remove.textContent = "×"; remove.setAttribute("aria-label", "このセットを削除");
  remove.addEventListener("click", () => { row.remove(); renumberSets(container); });
  row.append(number, weightLabel, repsLabel, remove);
  container.appendChild(row);
  renumberSets(container);
}
function renumberSets(container) {
  container.querySelectorAll(".set-number").forEach((el, index) => { el.textContent = (index + 1) + "セット目"; });
}
function addExercise(name = "", sets = [{ weight_kg: 0, reps: 10 }]) {
  const card = document.createElement("fieldset");
  card.className = "exercise-card";
  const legend = document.createElement("legend");
  legend.textContent = "トレーニング種目";
  const head = document.createElement("div");
  head.className = "exercise-card-head";
  const label = document.createElement("label");
  label.textContent = "種目名";
  const nameInput = document.createElement("input");
  nameInput.className = "exercise-name";
  nameInput.type = "text"; nameInput.maxLength = 60;
  nameInput.setAttribute("list", "exercise-suggestions");
  nameInput.placeholder = "例：ラットプルダウン";
  nameInput.value = name;
  label.appendChild(nameInput);
  const remove = document.createElement("button");
  remove.type = "button"; remove.className = "secondary-action";
  remove.textContent = "削除";
  remove.addEventListener("click", () => card.remove());
  head.append(label, remove);
  const rows = document.createElement("div");
  rows.className = "exercise-sets";
  for (const set of sets) newSetRow(rows, set);
  const actions = document.createElement("div");
  actions.className = "exercise-actions";
  const addSet = document.createElement("button");
  addSet.type = "button"; addSet.className = "secondary-action"; addSet.textContent = "＋ セット";
  addSet.addEventListener("click", () => {
    if (rows.children.length >= 12) return;
    const last = rows.lastElementChild;
    newSetRow(rows, {
      weight_kg: last ? Number(last.querySelector(".set-weight").value) : 0,
      reps: last ? Number(last.querySelector(".set-reps").value) : 10
    });
  });
  const recent = document.createElement("button");
  recent.type = "button"; recent.className = "secondary-action";
  recent.textContent = "前回の内容を使う";
  const feedback = document.createElement("p");
  feedback.className = "field-hint"; feedback.setAttribute("role", "status");
  recent.addEventListener("click", async () => {
    const chosen = nameInput.value.trim();
    if (!chosen) { feedback.textContent = "種目名を入力してください。"; return; }
    recent.disabled = true;
    feedback.textContent = "前回の内容を確認中…";
    try {
      const result = await fetchJSON("/api/workouts/recent?name=" + encodeURIComponent(chosen));
      if (!card.isConnected) return;
      if (!result.sets.length) { feedback.textContent = "この種目の前回記録はありません。"; return; }
      rows.replaceChildren();
      result.sets.forEach(set => newSetRow(rows, set));
      feedback.textContent = "前回（" + result.sets[0].performed_on + "）のセットを反映しました。";
    } catch {
      feedback.textContent = "前回の記録を取得できませんでした。";
    } finally {
      if (card.isConnected) recent.disabled = !dbReady;
    }
  });
  actions.append(addSet, recent);
  card.append(legend, head, rows, actions, feedback);
  exerciseList.appendChild(card);
  card.querySelectorAll("input, button").forEach(el => { el.disabled = !dbReady; });
  return card;
}
function resetWorkoutForm(date = todayISO()) {
  editingWorkoutId = null;
  byId("record-form-title").textContent = "トレーニングを記録";
  cancelWorkoutEdit.hidden = true;
  saveButton.textContent = "記録を保存";
  saveDate.value = date;
  selectedDate = date;
  saveNote.value = "";
  exerciseList.replaceChildren();
  addExercise();
  renderDayDetail();
}
function workoutSummary(record) {
  const names = [...new Set((record.sets || []).map(x => x.exercise_name))];
  if (names.length) return names.join("・") + "（" + record.sets.length + "セット）" + (record.note ? " / " + record.note : "");
  return record.note || "日付のみの記録";
}
function editWorkout(record) {
  editingWorkoutId = record.id;
  byId("record-form-title").textContent = "記録を編集";
  cancelWorkoutEdit.hidden = false;
  saveButton.textContent = "変更を保存";
  saveDate.value = record.performed_on;
  selectedDate = record.performed_on;
  if (currentMonth() !== selectedDate.slice(0, 7)) {
    shownYear = Number(selectedDate.slice(0, 4));
    shownMonth = Number(selectedDate.slice(5, 7)) - 1;
    loadWorkouts();
  } else {
    renderDayDetail();
  }
  saveNote.value = record.note || "";
  exerciseList.replaceChildren();
  const groups = new Map();
  for (const set of record.sets || []) {
    if (!groups.has(set.exercise_name)) groups.set(set.exercise_name, []);
    groups.get(set.exercise_name).push(set);
  }
  if (!groups.size) addExercise();
  else for (const [name, sets] of groups) addExercise(name, sets);
  saveFeedback.textContent = "過去の記録を編集中です。";
  setScreen("record");
  window.scrollTo(0, 0);
}
function renderHistory() {
  list.replaceChildren();
  if (!recordsLoaded) { list.textContent = "読み込み中…"; return; }
  if (!workouts.length) { list.textContent = "この月はまだ記録がありません。"; return; }
  for (const record of workouts) {
    const row = document.createElement("div");
    row.className = "record-item";
    const detail = document.createElement("div");
    const date = document.createElement("strong");
    date.textContent = record.performed_on;
    const note = document.createElement("p");
    note.textContent = workoutSummary(record);
    detail.append(date, note);
    const actions = document.createElement("div");
    actions.className = "record-item-actions";
    const edit = document.createElement("button");
    edit.type = "button"; edit.className = "secondary-action"; edit.textContent = "編集";
    edit.addEventListener("click", () => editWorkout(record));
    const del = document.createElement("button");
    del.type = "button"; del.className = "delete-record"; del.textContent = "削除";
    del.setAttribute("aria-label", record.performed_on + "の記録を削除");
    del.addEventListener("click", () => removeWorkout(record.id));
    actions.append(edit, del);
    row.append(detail, actions);
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
    if (!authorized || month !== currentMonth() || requestId !== recordsRequestId) return;
    workouts = result.workouts || [];
    monthTruncated = !!result.truncated;
    recordsLoaded = true;
    completeDates.clear();
    workouts.forEach(w => completeDates.add(w.performed_on));
    calendarDays.clear();
    calendarAvailable = false;
    try {
      const calendar = await fetchJSON("/api/calendar?month=" + encodeURIComponent(month));
      if (!authorized || month !== currentMonth() || requestId !== recordsRequestId) return;
      for (const day of calendar.days || []) {
        calendarDays.set(day.on_date, { planned: !!day.planned, attended: !!day.attended });
      }
      calendarAvailable = true;
    } catch (error) {
      if (error.status === 401) throw error;
      // 0002未適用でも既存の筋トレ記録は表示・編集できるようにする。
    }
    renderCalendar();
    renderHistory();
    setReady(true);
  } catch (error) {
    if (!authorized || month !== currentMonth() || requestId !== recordsRequestId) return;
    if (error.status === 401) {
      setAuthenticated(false);
      loginFeedback.textContent = "ログインの有効期限が切れました。もう一度ログインしてください。";
      return;
    }
    workouts = [];
    recordsLoaded = false;
    monthTruncated = false;
    calendarAvailable = false;
    calendarDays.clear();
    completeDates.clear();
    renderCalendar();
    byId("month-count").textContent = "取得できません";
    setReady(false);
    list.textContent = error.status === 503 ? "D1のテーブル準備が必要です。" : "記録を読み込めませんでした。";
  }
}
async function removeWorkout(id) {
  if (!dbReady || !confirm("このトレーニング記録を削除しますか？ 来館記録は削除されません。")) return;
  setReady(false);
  try {
    await fetchJSON("/api/workouts/" + encodeURIComponent(id), {
      method: "DELETE", headers: { "Content-Type": "application/json" }
    });
    if (editingWorkoutId === id) resetWorkoutForm();
    await loadWorkouts();
    saveFeedback.textContent = "筋トレ記録を削除しました。";
  } catch {
    setReady(true);
    saveFeedback.textContent = "削除できませんでした。";
  }
}

addExerciseButton.addEventListener("click", () => { if (dbReady) addExercise(); });
cancelWorkoutEdit.addEventListener("click", () => { resetWorkoutForm(saveDate.value); saveFeedback.textContent = ""; });
resetWorkoutForm();

function collectSets() {
  const result = [];
  for (const card of exerciseList.querySelectorAll(".exercise-card")) {
    const name = card.querySelector(".exercise-name").value.trim();
    const rows = [...card.querySelectorAll(".exercise-set")];
    if (!name && rows.length) continue; // 名前未入力のひな形は送信しない。
    if (!name) continue;
    if (name.length > 60) throw new Error("種目名は60文字以内です。");
    for (let i = 0; i < rows.length; i++) {
      const weight = Number(rows[i].querySelector(".set-weight").value);
      const reps = Number(rows[i].querySelector(".set-reps").value);
      if (!Number.isFinite(weight) || weight < 0 || weight > 2000 ||
          !Number.isInteger(reps) || reps < 0 || reps > 1000) throw new Error("重量・回数を確認してください。");
      result.push({ exercise_name: name, set_number: i + 1, weight_kg: weight, reps });
    }
  }
  if (result.length > 48) throw new Error("1件に保存できるのは48セットまでです。");
  return result;
}
byId("workout-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!authorized || !dbReady) return;
  let sets;
  try {
    sets = collectSets();
    if (!sets.length && !saveNote.value.trim()) throw new Error("種目を追加するか、メモを入力してください。");
  } catch (error) {
    saveFeedback.textContent = error.message;
    return;
  }
  setReady(false);
  saveFeedback.textContent = "保存中…";
  const wasEditing = !!editingWorkoutId;
  const savedDate = saveDate.value;
  try {
    await fetchJSON(wasEditing ? "/api/workouts/" + encodeURIComponent(editingWorkoutId) : "/api/workouts", {
      method: wasEditing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ performed_on: savedDate, note: saveNote.value, sets })
    });
    shownYear = Number(savedDate.slice(0, 4));
    shownMonth = Number(savedDate.slice(5, 7)) - 1;
    selectedDate = savedDate;
    resetWorkoutForm(savedDate);
    await loadWorkouts();
    saveFeedback.textContent = wasEditing ? "記録を更新しました。" : "クラウドに保存しました。";
  } catch {
    setReady(true);
    saveFeedback.textContent = "保存できませんでした。日付・入力内容・接続状態を確認してください。";
  }
});
byId("save-calendar-day").addEventListener("click", async () => {
  if (!authorized || !calendarAvailable) return;
  const date = selectedDate;
  saveCalendarDay.disabled = true;
  calendarError.textContent = "保存中…";
  try {
    const result = await fetchJSON("/api/calendar/" + encodeURIComponent(date), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planned: dayPlanned.checked, attended: dayAttended.checked })
    });
    if (result.planned || result.attended) calendarDays.set(date, result);
    else calendarDays.delete(date);
    if (selectedDate === date) {
      renderCalendar();
      calendarError.textContent = "予定・来館を保存しました。";
    }
  } catch {
    calendarError.textContent = "保存できませんでした。接続状態を確認してください。";
  } finally {
    saveCalendarDay.disabled = !calendarAvailable;
  }
});
// 記録の日付を直接変更した場合も予定・来館の表示先を追従させる。
saveDate.addEventListener("change", () => {
  if (!saveDate.value) return;
  selectedDate = saveDate.value;
  if (currentMonth() !== selectedDate.slice(0, 7)) {
    shownYear = Number(selectedDate.slice(0, 4));
    shownMonth = Number(selectedDate.slice(5, 7)) - 1;
    ++recordsRequestId;
    recordsLoaded = false;
    calendarAvailable = false;
    calendarDays.clear();
    completeDates.clear();
    workouts = [];
    renderCalendar();
    if (authorized) loadWorkouts();
  } else {
    renderDayDetail();
  }
});

function changeMonth(offset) {
  const result = new Date(shownYear, shownMonth + offset, 1);
  shownYear = result.getFullYear();
  shownMonth = result.getMonth();
  selectedDate = currentMonth() === todayISO().slice(0, 7) ? todayISO() : currentMonth() + "-01";
  ++recordsRequestId;
  recordsLoaded = false;
  calendarAvailable = false;
  monthTruncated = false;
  calendarDays.clear();
  completeDates.clear();
  workouts = [];
  setReady(false);
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

const pages = new Set(["home", "calendar", "record", "talk", "notices", "analysis", "events", "gallery", "settings"]);

// 背景はGitHubの固定素材。場所はログインのたびにランダム選択し、端末には保存しない。
const sceneLocations = ["gym", "city", "campus", "room"];
const sceneLocationNames = { gym: "ジム", city: "街", campus: "大学", room: "栞の部屋" };
const sceneTimeNames = { morning: "朝", day: "昼", night: "夜" };
const sceneBackground = byId("scene-background");
const sceneLocationSelect = byId("scene-location");
const sceneStatus = byId("scene-status");
const sceneTimeSelect = byId("scene-time");
let sceneTimeOverride = "auto";
let sceneLocation = null;
let sceneTime = null;

function sceneTimeSlot(hour) {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "day";
  return "night";
}
function randomSceneLocation(excludeCurrent = false) {
  const candidates = excludeCurrent
    ? sceneLocations.filter((location) => location !== sceneLocation)
    : sceneLocations;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
function refreshScene() {
  if (!authorized || !sceneLocation) return;
  const time = sceneTimeOverride === "auto" ? sceneTimeSlot(new Date().getHours()) : sceneTimeOverride;
  if (time !== sceneTime || sceneBackground.dataset.location !== sceneLocation) {
    const url = "/assets/backgrounds/" + sceneLocation + "-" + time + ".webp";
    sceneBackground.style.backgroundImage = 'url("' + url + '")';
    sceneBackground.dataset.location = sceneLocation;
    sceneBackground.dataset.time = time;
    sceneTime = time;
  }
  sceneLocationSelect.value = sceneLocation;
  sceneTimeSelect.value = sceneTimeOverride;
  sceneStatus.textContent = "現在： " + sceneLocationNames[sceneLocation] + "・" + sceneTimeNames[time] + (sceneTimeOverride === "auto" ? "（端末時刻）" : "（テスト固定）");
}
function setSceneLocation(nextLocation) {
  if (!authorized || !sceneLocations.includes(nextLocation)) return;
  sceneLocation = nextLocation;
  refreshScene();
}
sceneLocationSelect.addEventListener("change", () => setSceneLocation(sceneLocationSelect.value));
byId("scene-reroll").addEventListener("click", () => {
  if (!authorized) return;
  setSceneLocation(randomSceneLocation(true));
});
sceneTimeSelect.addEventListener("change", () => {
  if (!authorized) return;
  const next = sceneTimeSelect.value;
  if (!["auto", "morning", "day", "night"].includes(next)) return;
  sceneTimeOverride = next;
  refreshScene();
});
// 自動の場合だけ端末時刻に追従。テスト固定は復帰・画面遷移後も維持する。
setInterval(refreshScene, 60 * 1000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshScene();
});
window.addEventListener("focus", refreshScene);
window.addEventListener("pageshow", refreshScene);


// ホームの既存セリフ候補を必要時だけ取得する。端末には永続保存しない。
const homeDialogue = byId("shiori-home-dialogue");
const shioriHomeTouch = byId("shiori-home-touch");
const shioriHomeArt = shioriHomeTouch.querySelector(".character-layer__art");

// 衣装切り替えの試験用状態。端末やD1へ保存せず、ログイン時は既存衣装に戻す。
const outfitSelect = byId("shiori-outfit");
const outfitStatus = byId("shiori-outfit-status");
const trainingArt = "/assets/shiori/gim/v1/shiori-home-training-bust-v1.webp";
const roomwearArt = "/assets/shiori/home/v1/shiori-home-roomwear-test-v1.webp";
let currentOutfit = "training";

function refreshOutfit() {
  const isRoomwear = currentOutfit === "roomwear";
  const url = isRoomwear
    ? roomwearArt
    : trainingArt;
  if (shioriHomeArt.getAttribute("src") !== url) {
    shioriHomeArt.src = url;
  }
  const width = isRoomwear ? 941 : 800;
  const height = isRoomwear ? 1672 : 1067;
  shioriHomeArt.width = width;
  shioriHomeArt.height = height;
  shioriHomeTouch.style.aspectRatio = width + " / " + height;
  shioriHomeTouch.dataset.outfit = currentOutfit;
  outfitSelect.value = currentOutfit;
  outfitStatus.textContent = isRoomwear
    ? "部屋着のテスト画像を表示中。"
    : "トレーニングウェアを表示中。";
}

function selectOutfit(next) {
  if (!authorized || (next !== "training" && next !== "roomwear")) return;
  currentOutfit = next;
  refreshOutfit();
}

outfitSelect.addEventListener("change", () => selectOutfit(outfitSelect.value));
shioriHomeArt.addEventListener("error", () => {
  if (currentOutfit !== "roomwear") return;
  currentOutfit = "training";
  refreshOutfit();
  outfitStatus.textContent = "部屋着画像を読み込めなかったため、トレーニングウェアに戻しました。";
});
const devPanel = byId("dev-settings-panel");
const devPanelToggle = byId("dev-settings-open");
function setDevPanelOpen(open, restoreFocus = true) {
  if (open && (!authorized || activePage !== "home")) return;
  devPanel.hidden = !open;
  devPanelToggle.setAttribute("aria-expanded", String(open));
  devPanelToggle.setAttribute("aria-label", open ? "開発設定を閉じる" : "開発設定を開く");
  if (open) outfitSelect.focus({ preventScroll: true });
  else if (restoreFocus && authorized && activePage === "home") devPanelToggle.focus({ preventScroll: true });
}
devPanelToggle.addEventListener("click", () => setDevPanelOpen(devPanel.hidden));
byId("dev-settings-close").addEventListener("click", () => setDevPanelOpen(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !devPanel.hidden) {
    event.preventDefault();
    setDevPanelOpen(false);
  }
});

byId("dev-settings-reset").addEventListener("click", () => {
  if (!authorized) return;
  sceneTimeOverride = "auto";
  setSceneLocation(randomSceneLocation());
  selectOutfit("training");
  byId("dev-settings-feedback").textContent = "衣装をトレーニングウェア、時間帯を自動に戻し、場所を再抽選しました。";
});
[sceneLocationSelect, sceneTimeSelect, outfitSelect].forEach((control) => {
  control.addEventListener("change", () => { byId("dev-settings-feedback").textContent = ""; });
});
byId("scene-reroll").addEventListener("click", () => { byId("dev-settings-feedback").textContent = ""; });
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



// オフキャンバスは全ページで利用可能。閉じている間はフォーカス・読み上げ対象から除外する。
const drawerToggle = byId("drawer-toggle");
const drawerClose = byId("drawer-close");
const drawer = byId("app-drawer");
const drawerScrim = byId("drawer-scrim");
let drawerOpen = false;

function setDrawerOpen(open, restoreFocus = true) {
  if (open && !authorized) return;
  if (drawerOpen === open) return;
  drawerOpen = open;
  if (open) setDevPanelOpen(false, false);
  drawer.classList.toggle("is-open", open);
  drawer.inert = !open;
  drawer.setAttribute("aria-hidden", String(!open));
  drawerToggle.setAttribute("aria-expanded", String(open));
  drawerToggle.setAttribute("aria-label", open ? "メニューを閉じる" : "メニューを開く");
  drawerScrim.hidden = !open;
  document.body.classList.toggle("is-drawer-open", open);
  if (open) drawerClose.focus();
  else if (restoreFocus && authorized) drawerToggle.focus();
}
drawerToggle.addEventListener("click", () => setDrawerOpen(!drawerOpen));
drawerClose.addEventListener("click", () => setDrawerOpen(false));
drawerScrim.addEventListener("click", () => setDrawerOpen(false));
document.addEventListener("keydown", (event) => {
  if (!drawerOpen) return;
  if (event.key === "Escape") {
    event.preventDefault();
    setDrawerOpen(false);
  } else if (event.key === "Tab") {
    const focusable = [...drawer.querySelectorAll("button:not(:disabled)")];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

function setScreen(screen, pushHistory = true) {
  if (!authorized || !pages.has(screen)) return;
  const previousPage = activePage;
  if (drawerOpen) setDrawerOpen(false);
  if (screen !== "home") setDevPanelOpen(false, false);
  activePage = screen;
  byId("dev-settings-open").hidden = screen !== "home";
  refreshScene();
  document.body.classList.toggle("is-home", screen === "home");
  if (screen === "home") {
    if (previousPage !== "home" || homeDialogue.hidden) showHomeGreeting();
  } else {
    ++greetingRequestId;
  }
  document.querySelectorAll("[data-page]").forEach((page) => {
    page.hidden = page.dataset.page !== screen;
  });
  document.querySelectorAll(".drawer-item").forEach((item) => {
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
  button.addEventListener("click", () => {
    if (button.closest("#page-home") && button.dataset.screen === "record" && !editingWorkoutId) {
      resetWorkoutForm(todayISO());
      if (currentMonth() !== todayISO().slice(0, 7)) {
        shownYear = Number(todayISO().slice(0, 4));
        shownMonth = Number(todayISO().slice(5, 7)) - 1;
        ++recordsRequestId;
        recordsLoaded = false;
        calendarAvailable = false;
        calendarDays.clear();
        completeDates.clear();
        workouts = [];
        renderCalendar();
        if (authorized) loadWorkouts();
      }
    }
    setScreen(button.dataset.screen);
  });
});

window.addEventListener("popstate", () => {
  if (!authorized) return;
  const screen = location.hash.slice(1);
  setScreen(pages.has(screen) ? screen : screen === "history" ? "calendar" : "home", false);
});

function setAuthenticated(next) {
  const wasAuthorized = authorized;
  if (!next || !wasAuthorized) {
    sceneTimeOverride = "auto";
    sceneTimeSelect.value = "auto";
    byId("dev-settings-feedback").textContent = "";
  }
  authorized = next;
  ++recordsRequestId;
  byId("boot-screen").hidden = true;
  byId("auth-screen").hidden = next;
  byId("app-screen").hidden = !next;
  if (!next) {
    setDrawerOpen(false, false);
    setDevPanelOpen(false, false);
  }
  byId("app-header").hidden = !next;
  byId("app-footer").hidden = !next;
  document.body.classList.toggle("is-authenticated", next);
  if (!next) document.body.classList.remove("is-home");
  document.title = next ? "kintoreapp | 筋トレ記録" : "ログイン";
  loginSuccess.hidden = !next;
  if (next) {
    if (!wasAuthorized) {
      sceneLocation = randomSceneLocation();
      sceneTime = null;
      currentOutfit = "training";
    }
    refreshScene();
    refreshOutfit();
    authStatus.textContent = "ログイン済み（自分専用）";
    setScreen("home", false);
  } else {
    sceneLocation = null;
    sceneTime = null;
    sceneBackground.style.backgroundImage = "";
    delete sceneBackground.dataset.location;
    delete sceneBackground.dataset.time;
    sceneStatus.textContent = "";
    currentOutfit = "training";
    refreshOutfit();
    outfitStatus.textContent = "";
    ++greetingRequestId;
    shioriHomeTouch.classList.remove("is-poked");
    homeDialogue.hidden = true;
    homeDialogue.textContent = "";
    lastHomeGreeting = "";
    authStatus.textContent = "未ログイン：パスワードを入力してください。";
    setReady(false);
    workouts = [];
    recordsLoaded = false;
    calendarAvailable = false;
    monthTruncated = false;
    calendarDays.clear();
    completeDates.clear();
    selectedDate = todayISO();
    resetWorkoutForm();
    saveFeedback.textContent = "";
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

