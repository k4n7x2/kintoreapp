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
const exerciseEmpty = byId("exercise-empty");
let calendarSaving = false;
let calendarStatusDate = "";
let calendarStatusMessage = "";
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
  const state = calendarDays.get(selectedDate);
  dayPlanned.checked = !!state?.planned;
  dayAttended.checked = !!state?.attended;
  dayPlanned.disabled = !authorized || !calendarAvailable || calendarSaving;
  dayAttended.disabled = !authorized || !calendarAvailable || calendarSaving;
  calendarError.textContent = authorized && recordsLoaded && !calendarAvailable
    ? "予定・来館の保存にはD1の追加マイグレーション（0002）が必要です。"
    : calendarStatusDate === selectedDate ? calendarStatusMessage : "";
}

function setReady(ready) {
  dbReady = ready;
  saveDate.disabled = !ready;
  saveNote.disabled = !ready;
  saveButton.disabled = !ready;
  addExerciseButton.disabled = !ready;
  exerciseList.querySelectorAll("input, button").forEach(el => { el.disabled = !ready; });
  exerciseList.querySelectorAll(".exercise-card").forEach(card => {
    if (card.renderPrevious) card.renderPrevious();
  });
}


const formatPrevious = set => Number(set.weight_kg).toString() + "kg × " + set.reps + "回";
function updateExerciseEmpty() {
  exerciseEmpty.hidden = !!exerciseList.querySelector(".exercise-card");
}
function refreshPreviousReferences() {
  exerciseList.querySelectorAll(".exercise-card").forEach(card => {
    if (typeof card.refreshPrevious === "function") card.refreshPrevious();
  });
}
function newSetRow(container, set = { weight_kg: 0, reps: 10 }) {
  const row = document.createElement("div");
  row.className = "exercise-set";
  const number = document.createElement("span");
  number.className = "set-number";
  const last = document.createElement("span");
  last.className = "set-previous";
  last.textContent = "前回：—";
  const weightLabel = document.createElement("label");
  weightLabel.textContent = "重量 kg";
  const weight = document.createElement("input");
  weight.type = "number"; weight.min = "0"; weight.max = "2000"; weight.step = "0.5";
  weight.inputMode = "decimal";
  weight.className = "set-weight";
  weight.value = String(set.weight_kg ?? 0);
  weightLabel.appendChild(weight);
  const repsLabel = document.createElement("label");
  repsLabel.textContent = "回数";
  const reps = document.createElement("input");
  reps.type = "number"; reps.min = "0"; reps.max = "1000"; reps.step = "1";
  reps.inputMode = "numeric";
  reps.className = "set-reps";
  reps.value = String(set.reps ?? 10);
  repsLabel.appendChild(reps);
  const remove = document.createElement("button");
  remove.type = "button"; remove.className = "secondary-action";
  remove.textContent = "×"; remove.setAttribute("aria-label", "このセットを削除");
  remove.addEventListener("click", () => { row.remove(); renumberSets(container); });
  row.append(number, last, weightLabel, repsLabel, remove);
  container.appendChild(row);
  renumberSets(container);
  return row;
}
function renumberSets(container) {
  container.querySelectorAll(".exercise-set").forEach((row, index) => {
    row.querySelector(".set-number").textContent = (index + 1) + "セット";
  });
  const card = container.closest(".exercise-card");
  if (card?.renderPrevious) card.renderPrevious();
  if (card?.renderSummary) card.renderSummary();
}
function addExercise(name = "", sets = [{ weight_kg: 0, reps: 10 }]) {
  // 通常時は一覧、編集中だけ展開する。SD栞の下部表示を維持する。
  exerciseList.querySelectorAll(".exercise-card").forEach(card => { card.open = false; });
  const card = document.createElement("details");
  card.className = "exercise-card";
  card.open = true;
  const summary = document.createElement("summary");
  summary.className = "exercise-overview";
  const heading = document.createElement("strong");
  heading.className = "exercise-overview-name";
  const current = document.createElement("span");
  current.className = "exercise-overview-current";
  const previousSummary = document.createElement("span");
  previousSummary.className = "exercise-overview-previous";
  summary.append(heading, current, previousSummary);
  const body = document.createElement("div");
  body.className = "exercise-editor";
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
  remove.addEventListener("click", () => { card.remove(); updateExerciseEmpty(); });
  head.append(label, remove);
  const rows = document.createElement("div");
  rows.className = "exercise-sets";
  const previousLabel = document.createElement("p");
  previousLabel.className = "exercise-previous-heading";
  previousLabel.textContent = "前回の記録を確認中…";
  const actions = document.createElement("div");
  actions.className = "exercise-actions";
  const addSet = document.createElement("button");
  addSet.type = "button"; addSet.className = "secondary-action"; addSet.textContent = "＋ セット";
  addSet.addEventListener("click", () => {
    if (rows.children.length >= 12) return;
    const last = rows.lastElementChild;
    const row = newSetRow(rows, {
      weight_kg: last ? Number(last.querySelector(".set-weight").value) : 0,
      reps: last ? Number(last.querySelector(".set-reps").value) : 10
    });
    row.querySelector(".set-weight").focus();
  });
  const recent = document.createElement("button");
  recent.type = "button"; recent.className = "secondary-action";
  recent.textContent = "前回のセットをコピー";
  recent.disabled = true;
  const feedback = document.createElement("p");
  feedback.className = "field-hint"; feedback.setAttribute("role", "status");
  let previous = [];
  let referenceKey = "";
  let lookupId = 0;
  card.renderSummary = () => {
    heading.textContent = nameInput.value.trim() || "新しい種目";
    const currentSets = [...rows.querySelectorAll(".exercise-set")];
    current.textContent = currentSets.length
      ? "今回 " + currentSets.map(row => {
        const kg = row.querySelector(".set-weight").value;
        const reps = row.querySelector(".set-reps").value;
        return (kg || "—") + "kg×" + (reps || "—") + "回";
      }).join(" / ") : "セットなし";
  };
  card.renderPrevious = () => {
    previousSummary.textContent = previous.length
      ? "前回 " + previous.map(formatPrevious).join(" / ")
      : "前回の記録なし";
    previousLabel.textContent = previous.length
      ? "前回 " + previous[0].performed_on + " の記録"
      : "前回の記録なし";
    rows.querySelectorAll(".exercise-set").forEach((row, i) => {
      const set = previous.find(p => Number(p.set_number) === i + 1);
      row.querySelector(".set-previous").textContent = set
        ? "前回：" + formatPrevious(set) : "前回：—";
    });
    recent.disabled = !dbReady || !previous.length;
  };
  card.refreshPrevious = async () => {
    const chosen = nameInput.value.trim();
    const date = saveDate.value;
    const id = ++lookupId;
    previous = [];
    card.renderPrevious();
    if (!chosen || !date || !dbReady) return;
    referenceKey = chosen + "|" + date;
    previousLabel.textContent = "前回の記録を確認中…";
    try {
      const result = await fetchJSON("/api/workouts/recent?name=" +
        encodeURIComponent(chosen) + "&before=" + encodeURIComponent(date));
      if (id !== lookupId || !card.isConnected ||
          referenceKey !== nameInput.value.trim() + "|" + saveDate.value) return;
      previous = Array.isArray(result.sets) ? result.sets : [];
      card.renderPrevious();
    } catch {
      if (id !== lookupId || !card.isConnected) return;
      previousSummary.textContent = "前回を取得できませんでした";
      previousLabel.textContent = "前回の記録を取得できませんでした";
      recent.disabled = true;
    }
  };
  nameInput.addEventListener("input", () => {
    ++lookupId;
    previous = [];
    card.renderSummary();
    card.renderPrevious();
  });
  nameInput.addEventListener("change", () => card.refreshPrevious());
  rows.addEventListener("input", card.renderSummary);
  recent.addEventListener("click", () => {
    if (!previous.length || !dbReady) return;
    if (rows.querySelector(".exercise-set") && !confirm("入力中のセットを前回の内容に置き換えますか？")) return;
    rows.replaceChildren();
    for (const set of previous) newSetRow(rows, set);
    card.renderPrevious();
    card.renderSummary();
    feedback.textContent = "前回のセットを反映しました。";
  });
  actions.append(addSet, recent);
  body.append(head, previousLabel, rows, actions, feedback);
  card.append(summary, body);
  exerciseList.appendChild(card);
  for (const set of sets) newSetRow(rows, set);
  card.renderSummary();
  card.renderPrevious();
  card.addEventListener("toggle", () => {
    if (card.open) exerciseList.querySelectorAll(".exercise-card").forEach(other => {
      if (other !== card) other.open = false;
    });
  });
  card.querySelectorAll("input, button").forEach(el => { el.disabled = !dbReady; });
  // 同日・未来の記録を「前回」に混ぜず、選択日より前の最新実績だけ参照。
  if (name && dbReady) card.refreshPrevious();
  updateExerciseEmpty();
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
  updateExerciseEmpty();
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
  if (groups.size) for (const [name, sets] of groups) addExercise(name, sets);
  updateExerciseEmpty();
  if (dbReady) refreshPreviousReferences();
  saveFeedback.textContent = "過去の記録を編集中です。";
  setScreen("record");
  byId("record-scroll").scrollTop = 0;
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
    refreshPreviousReferences();
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

addExerciseButton.addEventListener("click", () => {
  if (!dbReady) return;
  const card = addExercise();
  card.querySelector(".exercise-name").focus();
});
cancelWorkoutEdit.addEventListener("click", () => { resetWorkoutForm(saveDate.value); saveFeedback.textContent = ""; });
resetWorkoutForm();

function collectSets() {
  const result = [];
  for (const card of exerciseList.querySelectorAll(".exercise-card")) {
    const name = card.querySelector(".exercise-name").value.trim();
    const rows = [...card.querySelectorAll(".exercise-set")];
    if (!name) {
      const untouched = rows.length === 1 &&
        rows[0].querySelector(".set-weight").value === "0" &&
        rows[0].querySelector(".set-reps").value === "10";
      // 空のひな形だけなら、既存の「メモのみ記録」を妨げない。
      if (!rows.length || untouched) continue;
      card.open = true;
      card.querySelector(".exercise-name").focus();
      throw new Error("種目名を入力してください。");
    }
    if (name.length > 60) throw new Error("種目名は60文字以内です。");
    if (!rows.length) { card.open = true; throw new Error("セットを追加してください。"); }
    for (let i = 0; i < rows.length; i++) {
      const weightInput = rows[i].querySelector(".set-weight");
      const repsInput = rows[i].querySelector(".set-reps");
      const weight = Number(weightInput.value);
      const reps = Number(repsInput.value);
      if (!weightInput.value || !repsInput.value ||
          !Number.isFinite(weight) || weight < 0 || weight > 2000 ||
          !Number.isInteger(reps) || reps < 0 || reps > 1000 ||
          !weightInput.validity.valid || !repsInput.validity.valid) {
        card.open = true;
        (weightInput.value && weightInput.validity.valid ? repsInput : weightInput).focus();
        throw new Error("重量・回数を確認してください。");
      }
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
    if (activePage === "record") showSideDialogue("record", "saved");
  } catch {
    setReady(true);
    saveFeedback.textContent = "保存できませんでした。日付・入力内容・接続状態を確認してください。";
  }
});
async function persistDaySwitches() {
  if (!authorized || !calendarAvailable || calendarSaving) return;
  const date = selectedDate;
  const planned = dayPlanned.checked;
  const attended = dayAttended.checked;
  calendarSaving = true;
  calendarStatusDate = date;
  calendarStatusMessage = "保存中…";
  calendarError.textContent = calendarStatusMessage;
  dayPlanned.disabled = true;
  dayAttended.disabled = true;
  try {
    const result = await fetchJSON("/api/calendar/" + encodeURIComponent(date), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planned, attended })
    });
    if (date.slice(0, 7) === currentMonth()) {
      if (result.planned || result.attended) calendarDays.set(date, result);
      else calendarDays.delete(date);
    }
    calendarStatusMessage = "保存しました。";
  } catch (error) {
    if (error.status === 401) {
      setAuthenticated(false);
      loginFeedback.textContent = "ログインの有効期限が切れました。もう一度ログインしてください。";
      return;
    }
    calendarStatusMessage = "保存できませんでした。変更前の状態に戻しました。";
  } finally {
    calendarSaving = false;
    if (authorized) renderCalendar();
  }
}
dayPlanned.addEventListener("change", persistDaySwitches);
dayAttended.addEventListener("change", persistDaySwitches);
// 記録の日付を直接変更した場合も予定・来館の表示先を追従させる。
saveDate.addEventListener("change", () => {
  if (!saveDate.value) return;
  selectedDate = saveDate.value;
  calendarStatusDate = "";
  calendarStatusMessage = "";
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
  refreshPreviousReferences();
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
// 衣装／表情は固定素材。セリフとの条件付けは将来行うため、今は均等ランダムに表示する。
// 画像ごとの補正値は CSS 変数へ流し、ホームの承認済み距離感を保つ。
const trainingLayout = {
  base: { scale: 1.14, origin: "right bottom", bottom: "0px" },
  narrow: { scale: 1.159, origin: "right bottom", bottom: "0px" },
  short: { scale: 1.064, origin: "right bottom", bottom: "0px" }
};
// 新しい部屋着差分の共通初期値。旧テスト画像より頭部が上に見えるため、
// スクリーンショット比較に基づき約24pxだけ下へ補正する。最終実機確認は別途。
const roomwearLayout = {
  base: { scale: 1.276, origin: "72% 55%", bottom: "calc(-1 * min(38vw, 160px) - 24px)" },
  narrow: { scale: 1.297, origin: "72% 55%", bottom: "calc(-1 * min(38vw, 160px) - 24px)" },
  short: { scale: 1.191, origin: "62% 39%", bottom: "calc(-1 * min(38vw, 160px) - 24px)" }
};
const roomwearVariantDefinitions = [
  { id: "normal", label: "通常" },
  { id: "joy", label: "喜" },
  { id: "anger", label: "怒" },
  { id: "sad", label: "哀" },
  { id: "fun", label: "楽" },
  { id: "shy", label: "照れ" },
  { id: "mischievous", label: "小悪魔" }
];
// layout を各差分に独立して用意。必要になれば該当する差分だけ調整する。
// 例: { id: "shy", label: "照れ", overrides: { base: { bottom: "-175px" } } }
const homePortraits = {
  training: [{
    id: "training-default",
    label: "トレーニングウェア",
    outfit: "training",
    src: "/assets/shiori/gim/v1/shiori-home-training-bust-v1.webp",
    width: 800,
    height: 1067,
    layout: trainingLayout
  }],
  roomwear: roomwearVariantDefinitions.map(({ id, label, overrides = {} }) => ({
    id,
    label,
    outfit: "roomwear",
    src: `/assets/shiori/home/v1/shiori-home-roomwear-${id}-r1.webp`,
    width: 941,
    height: 1672,
    layout: Object.fromEntries(
      ["base", "narrow", "short"].map((size) => [
        size, { ...roomwearLayout[size], ...(overrides[size] || {}) }
      ])
    )
  }))
};
let currentOutfit = "training";
let currentPortrait = null;
const failedHomePortraits = new Set();

function applyHomePortrait(variant) {
  // CSS の個別補正を更新してから画像を切り替え、切り替え時のサイズ跳びを抑える。
  shioriHomeTouch.style.aspectRatio = variant.width + " / " + variant.height;
  shioriHomeTouch.dataset.outfit = variant.outfit;
  shioriHomeTouch.dataset.variant = variant.id;
  for (const size of ["base", "narrow", "short"]) {
    const layout = variant.layout[size];
    shioriHomeTouch.style.setProperty(`--home-character-scale-${size}`, String(layout.scale));
    shioriHomeTouch.style.setProperty(`--home-character-origin-${size}`, layout.origin);
    shioriHomeTouch.style.setProperty(`--home-character-bottom-${size}`, layout.bottom);
  }
  shioriHomeArt.width = variant.width;
  shioriHomeArt.height = variant.height;
  if (shioriHomeArt.getAttribute("src") !== variant.src) shioriHomeArt.src = variant.src;
  outfitSelect.value = currentOutfit;
  outfitStatus.textContent = variant.outfit === "roomwear"
    ? `部屋着・${variant.label}を表示中（表情はランダム）。`
    : "トレーニングウェアを表示中。";
}

// 直前と同じ差分を避ける。表情をセリフから選ぶ機能は現時点では持たせない。
function refreshOutfit({ reroll = false } = {}) {
  let candidates = homePortraits[currentOutfit]
    .filter((variant) => !failedHomePortraits.has(variant.src));
  if (!candidates.length) {
    currentOutfit = "training";
    candidates = homePortraits.training;
    currentPortrait = null;
  }
  const canReuse = !reroll && currentPortrait?.outfit === currentOutfit
    && candidates.some((variant) => variant.id === currentPortrait.id);
  if (!canReuse) {
    const alternatives = candidates.filter((variant) => variant.id !== currentPortrait?.id
      || variant.outfit !== currentPortrait?.outfit);
    const pool = alternatives.length ? alternatives : candidates;
    currentPortrait = pool[Math.floor(Math.random() * pool.length)];
  }
  applyHomePortrait(currentPortrait);
}

function selectOutfit(next) {
  if (!authorized || !(next in homePortraits)) return;
  currentOutfit = next;
  refreshOutfit({ reroll: true });
}

outfitSelect.addEventListener("change", () => selectOutfit(outfitSelect.value));
shioriHomeArt.addEventListener("error", () => {
  if (currentOutfit !== "roomwear" || !currentPortrait
    || currentPortrait.src !== shioriHomeArt.getAttribute("src")) return;
  failedHomePortraits.add(currentPortrait.src);
  const remaining = homePortraits.roomwear.some(({ src }) => !failedHomePortraits.has(src));
  refreshOutfit({ reroll: true });
  if (!remaining) {
    outfitStatus.textContent = "部屋着の画像を読み込めなかったため、トレーニングウェアに戻しました。";
  }
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
let sideDialogueRequestId = 0;
let lastSideDialogue = "";

const sideDialogueNodes = {
  record: byId("record-sd-line"),
  calendar: byId("calendar-sd-line")
};

// ホーム用の採用済み文言を共有。セリフ内容とSD画像の有無は独立して扱う。
async function ensureGreetingData() {
  if (greetingData) return greetingData;
  if (!greetingLoading) {
    greetingLoading = fetch("/data/shiori-greetings.json", { cache: "force-cache" })
      .then(response => {
        if (!response.ok) throw new Error("greetings_unavailable");
        return response.json();
      })
      .then(data => { greetingData = data; return data; })
      .finally(() => { greetingLoading = null; });
  }
  return greetingLoading;
}

// 記録画面・カレンダー下のSD領域に吹き出しを表示する。
// 正式SD素材が登録されたら、画像だけ独立して配置できる。
async function showSideDialogue(page, reason = "normal") {
  const requestId = ++sideDialogueRequestId;
  if (!authorized || activePage !== page || !sideDialogueNodes[page]) return;
  const node = sideDialogueNodes[page];
  if (reason === "saved") {
    // dialogue.mdにある確定口調の文言。保存成功時だけ表示。
    node.textContent = "そっか。頑張ったね。";
    lastSideDialogue = node.textContent;
    return;
  }
  const fallback = page === "record"
    ? "今日は記録だけでもいいんじゃないかな。"
    : "あ、来た。今日はどうする？";
  try {
    const data = await ensureGreetingData();
    if (!authorized || activePage !== page || requestId !== sideDialogueRequestId) return;
    const candidates = (Array.isArray(data?.anytime) ? data.anytime : [])
      .filter(line => typeof line === "string" && line.trim());
    const alternatives = candidates.filter(line => line !== lastSideDialogue);
    const pool = alternatives.length ? alternatives : candidates;
    node.textContent = pool.length ? pool[Math.floor(Math.random() * pool.length)] : fallback;
    lastSideDialogue = node.textContent;
  } catch {
    if (!authorized || activePage !== page || requestId !== sideDialogueRequestId) return;
    node.textContent = fallback;
    lastSideDialogue = fallback;
  }
}

byId("record-sd-talk").addEventListener("click", () => showSideDialogue("record"));
byId("calendar-sd-talk").addEventListener("click", () => showSideDialogue("calendar"));
let lastHomeGreeting = "";
let greetingRequestId = 0;

// 画像へのタップ／キーボードの操作で、一言と控えめなリアクションを返す。
shioriHomeTouch.addEventListener("click", () => {
  if (!authorized || activePage !== "home") return;
  shioriHomeTouch.classList.remove("is-poked");
  // 同じアニメーションを連続タップでも先頭から再生する。
  void shioriHomeArt.offsetWidth;
  shioriHomeTouch.classList.add("is-poked");
  if (currentOutfit === "roomwear") refreshOutfit({ reroll: true });
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
    await ensureGreetingData();
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
  document.body.classList.toggle("is-record", screen === "record");
  if (screen === "home") {
    if (previousPage !== "home" && currentOutfit === "roomwear") refreshOutfit({ reroll: true });
    if (previousPage !== "home" || homeDialogue.hidden) showHomeGreeting();
  } else {
    ++greetingRequestId;
  }
  // 画面間の非同期応答が別画面の吹き出しへ入り込まないよう破棄する。
  if (screen !== previousPage) ++sideDialogueRequestId;
  if (screen === "record" || screen === "calendar") {
    if (screen !== previousPage) {
      byId("record-scroll").scrollTop = 0;
      showSideDialogue(screen);
    }
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
  if (!next) document.body.classList.remove("is-home", "is-record");
  document.title = next ? "kintoreapp | 筋トレ記録" : "ログイン";
  loginSuccess.hidden = !next;
  if (next) {
    if (!wasAuthorized) {
      sceneLocation = randomSceneLocation();
      sceneTime = null;
      currentOutfit = "training";
      currentPortrait = null;
      failedHomePortraits.clear();
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
    currentPortrait = null;
    failedHomePortraits.clear();
    refreshOutfit();
    outfitStatus.textContent = "";
    ++greetingRequestId;
    shioriHomeTouch.classList.remove("is-poked");
    homeDialogue.hidden = true;
    homeDialogue.textContent = "";
    lastHomeGreeting = "";
    ++sideDialogueRequestId;
    lastSideDialogue = "";
    sideDialogueNodes.record.textContent = "今日は記録だけでもいいんじゃないかな。";
    sideDialogueNodes.calendar.textContent = "あ、来た。今日はどうする？";
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

