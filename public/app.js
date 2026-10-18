import { chooseRecordSaveGroup, calendarConditionGroups, savedNumericSnapshot } from "./record-dialogue-rules.js";
import { chooseSdTouchGroup, registerSdTap, chooseLineWithoutRepeat, isValidSdTouchData } from "./sd-touch-rules.js";
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
const deleteExerciseButton = byId("delete-exercise");
const saveFeedback = byId("save-feedback");
const list = byId("record-list");
const exerciseList = byId("exercise-list");
const addExerciseButton = byId("add-exercise");
const cancelWorkoutEdit = byId("cancel-workout-edit");
const dayPlanned = byId("day-planned");
const dayAttended = byId("day-attended");
const calendarError = byId("calendar-error");
const exerciseEmpty = byId("exercise-empty");
const recordOverview = byId("record-overview-view");
const recordEditor = byId("record-editor-view");
const recordEditorHost = byId("record-editor-host");
const recordAttendance = byId("record-attendance");
const recordPlanToggle = byId("record-plan-toggle");
const recordPlanPanel = byId("record-plan-panel");
const recordNoteDetails = byId("record-note-details");
const recordWorkoutPanel = byId("record-workout-panel");
const recordHistoryView = byId("record-history-view");
const analysisExerciseView = byId("analysis-exercise-view");
const analysisDateView = byId("analysis-date-view");
const analysisExerciseList = byId("analysis-exercise-list");
const analysisDateList = byId("analysis-date-list");
const analysisExerciseFeedback = byId("analysis-exercise-feedback");
const analysisDateFeedback = byId("analysis-date-feedback");
let selectedAnalysisExercise = "";
let analysisListRequestId = 0;
let analysisDatesRequestId = 0;
let editorEntry = "record";
let pendingAnalysisRecord = null;
let analysisSaveNotice = "";
const exercisePicker = byId("exercise-picker-view");
const pickerInput = byId("exercise-picker-input");
const pickerList = byId("exercise-picker-list");
const pickerFeedback = byId("exercise-picker-feedback");
const overviewFeedback = byId("record-overview-feedback");
const starterExercises = [...byId("exercise-suggestions").options].map(option => option.value);
let knownExerciseNames = starterExercises;
const exercisePartOptions = ["胸","背中","肩","腕","脚","腹筋","全身","その他"];
const exerciseUnitLabels = { kg_reps:"kg＋回数", reps:"回数", seconds:"秒" };
const starterParts = {
  "ベンチプレス":"胸", "チェストプレス":"胸", "ダンベルプレス":"胸",
  "ラットプルダウン":"背中", "シーテッドロー":"背中", "ショルダープレス":"肩",
  "アームカール":"腕", "レッグプレス":"脚", "スクワット":"脚",
  "レッグカール":"脚", "クランチ":"腹筋"
};
let exerciseCatalog = new Map(starterExercises.map(name => [
  normalizeExerciseName(name), {
    name:normalizeExerciseName(name), body_part:starterParts[name] || "その他",
    unit:"kg_reps"
  }
]));
let recordedExerciseNames = new Set();
let exerciseCatalogReady = false;
let exerciseSettingsOriginal = "";
let exerciseSettingsReturnPage = "record";
let exerciseSettingsReturnPicker = false;
let exerciseSettingsRequestId = 0;
const catalogPartFor = name => exerciseCatalog.get(normalizeExerciseName(name))?.body_part || "その他";
const catalogUnitFor = name => exerciseCatalog.get(normalizeExerciseName(name))?.unit || "kg_reps";
function formatLoggedSet(set, unit = set?.entry_unit || "kg_reps") {
  if (unit === "seconds") return Number(set?.duration_seconds ?? 0) + "秒";
  if (unit === "reps") return Number(set?.reps ?? 0) + "回";
  return Number(set?.weight_kg ?? 0) + "kg × " + Number(set?.reps ?? 0) + "回";
}
let activeExerciseCard = null;
let recordBaseline = "";
let pendingRecordDate = "";
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

function normalizeExerciseName(value) {
  return typeof value === "string"
    ? value.normalize("NFKC").replace(/[\s\u3000]+/g, "").toLowerCase()
    : "";
}

function listExerciseCatalog() {
  return [...exerciseCatalog.values()].sort((a,b) =>
    a.name.localeCompare(b.name, "ja"));
}
function renderExerciseSettingsList() {
  const wrap = byId("exercise-settings-list");
  const part = byId("exercise-settings-filter").value;
  const query = normalizeExerciseName(byId("exercise-settings-search").value);
  wrap.replaceChildren();
  for (const row of listExerciseCatalog().filter(item =>
    (part === "すべて" || item.body_part === part) &&
    (!query || item.name.includes(query)))) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "exercise-settings-item";
    if (row.name === exerciseSettingsOriginal) button.classList.add("is-selected");
    const title = document.createElement("strong");
    title.textContent = row.name;
    const detail = document.createElement("span");
    detail.textContent = row.body_part + " · " + exerciseUnitLabels[row.unit];
    button.append(title, detail);
    button.addEventListener("click", () => editExerciseSettings(row));
    wrap.appendChild(button);
  }
  if (!wrap.children.length) {
    const empty = document.createElement("p");
    empty.className = "field-hint";
    empty.textContent = "該当する種目がありません。";
    wrap.appendChild(empty);
  }
}
function editExerciseSettings(item = null) {
  const entry = item || { name:"", body_part:"その他", unit:"kg_reps" };
  exerciseSettingsOriginal = entry.name;
  byId("exercise-settings-edit-title").textContent =
    entry.name ? "種目を編集" : "新しい種目を登録";
  byId("exercise-settings-name").value = entry.name;
  byId("exercise-settings-part").value = entry.body_part;
  byId("exercise-settings-unit").value = entry.unit;
  byId("exercise-settings-feedback").textContent = "";
  renderExerciseSettingsList();
  if (item) byId("exercise-settings-name").scrollIntoView({ block:"nearest" });
}
function openExerciseSettings() {
  if (!authorized) return;
  exerciseSettingsReturnPage = activePage === "exercise-settings" ? "record" : activePage;
  exerciseSettingsReturnPicker = activePage === "record" && !exercisePicker.hidden;
  if (activePage === "record" && activeExerciseCard) closeExerciseEditor();
  setScreen("exercise-settings");
}
function closeExerciseSettings() {
  if (!authorized) return;
  const destination = pages.has(exerciseSettingsReturnPage)
    ? exerciseSettingsReturnPage : "record";
  setScreen(destination);
  if (destination === "record" && exerciseSettingsReturnPicker) showExercisePicker();
}
async function refreshExerciseSettings() {
  const requestId = ++exerciseSettingsRequestId;
  byId("exercise-settings-feedback").textContent = "";
  await loadExerciseNames();
  if (requestId !== exerciseSettingsRequestId || !authorized) return;
  byId("exercise-settings-save").disabled = !exerciseCatalogReady;
  if (!exerciseCatalogReady) {
    byId("exercise-settings-feedback").textContent =
      "種目設定の保存にはD1マイグレーション（0003）の適用が必要です。";
  }
  renderExerciseSettingsList();
}
byId("exercise-settings-back").addEventListener("click", closeExerciseSettings);
byId("exercise-settings-new").addEventListener("click", () => editExerciseSettings());
byId("exercise-settings-filter").addEventListener("change", renderExerciseSettingsList);
byId("exercise-settings-search").addEventListener("input", renderExerciseSettingsList);
byId("record-manage-exercises").addEventListener("click", openExerciseSettings);
byId("exercise-picker-manage").addEventListener("click", openExerciseSettings);
byId("analysis-manage-exercises").addEventListener("click", openExerciseSettings);
byId("exercise-settings-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!authorized) return;
  const name = normalizeExerciseName(byId("exercise-settings-name").value);
  const previous = normalizeExerciseName(exerciseSettingsOriginal || name);
  const bodyPart = byId("exercise-settings-part").value;
  const unit = byId("exercise-settings-unit").value;
  const feedback = byId("exercise-settings-feedback");
  if (!name || name.length > 60 || !exercisePartOptions.includes(bodyPart) ||
      !Object.hasOwn(exerciseUnitLabels, unit)) {
    feedback.textContent = "種目名・部位・単位を確認してください。";
    return;
  }
  if (name !== previous && hasRecordChanges()) {
    feedback.textContent = "編集中の記録があります。種目名の変更前に記録を保存してください。";
    return;
  }
  const button = byId("exercise-settings-save");
  button.disabled = true;
  feedback.textContent = "保存中…";
  try {
    const result = await fetchJSON("/api/exercises/catalog", {
      method:"PUT", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ name, previous_name:previous, body_part:bodyPart, unit })
    });
    exerciseSettingsOriginal = result.name;
    await loadExerciseNames();
    if (name !== previous && recordsLoaded) {
      await loadWorkouts();
      hydrateStoredRecordForDate(selectedDate);
    }
    editExerciseSettings(exerciseCatalog.get(result.name));
    feedback.textContent = "種目の設定を保存しました。";
  } catch (error) {
    if (error.status === 401) { setAuthenticated(false); return; }
    feedback.textContent = error.status === 409 ? "同じ種目名が既にあります。" :
      error.status === 503 ? "D1マイグレーション（0003）の適用が必要です。" :
      "設定を保存できませんでした。";
  } finally {
    button.disabled = !exerciseCatalogReady;
  }
});
function hydrateStoredRecordForDate(date) {
  resetWorkoutForm(date);
  // 日別セッションを種目名で横断的に束ねる。日付の最新1件しか表示しない旧制約を撤廃。
  const records = workouts.filter(item => item.performed_on === date);
  const groups = new Map();
  for (const record of records) {
    for (const set of record.sets || []) {
      const key = normalizeExerciseName(set.exercise_name);
      if (!key || groups.has(key) && groups.get(key).sourceId !== record.id) continue;
      if (!groups.has(key)) groups.set(key, { sourceId: record.id, note: record.note || "", sets: [] });
      groups.get(key).sets.push(set);
    }
  }
  for (const [name, group] of groups) addExercise(name, group.sets, group.note, true);
  updateExerciseEmpty();
  markRecordBaseline();
}
function selectRecordDate(date, { navigate = true } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < "2000-01-01" || date > "2100-12-31") return false;
  if (hasRecordChanges() &&
      !confirm("未保存の種目入力を破棄して、日付を切り替えますか？")) return false;
  closeExerciseEditor();
  setRecordHistoryVisible(false);
  const previousMonth = currentMonth();
  shownYear = Number(date.slice(0, 4));
  shownMonth = Number(date.slice(5, 7)) - 1;
  pendingRecordDate = date;
  resetWorkoutForm(date);
  saveFeedback.textContent = "";
  recordPlanPanel.hidden = true;
  recordPlanToggle.setAttribute("aria-expanded", "false");
  if (previousMonth !== currentMonth() || !recordsLoaded) {
    ++recordsRequestId;
    recordsLoaded = false;
    calendarAvailable = false;
    calendarDays.clear();
    completeDates.clear();
    workouts = [];
    setReady(false);
    renderCalendar();
    if (authorized) loadWorkouts();
  } else {
    pendingRecordDate = "";
    hydrateStoredRecordForDate(date);
    renderCalendar();
  }
  if (navigate) setScreen("record");
  return true;
}
function showDay(date) { selectRecordDate(date); }
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
  recordAttendance.disabled = dayAttended.disabled;
  recordAttendance.textContent = dayAttended.checked ? "来館済み" : "来館していない";
  recordAttendance.setAttribute("aria-pressed", String(dayAttended.checked));
  recordPlanToggle.disabled = dayPlanned.disabled;
  recordPlanToggle.textContent = dayPlanned.checked ? "予定あり・編集" : "予定を編集";
  calendarError.textContent = authorized && recordsLoaded && !calendarAvailable
    ? "予定・来館の保存にはD1の追加マイグレーション（0002）が必要です。"
    : calendarStatusDate === selectedDate ? calendarStatusMessage : "";
}

function setReady(ready) {
  dbReady = ready;
  saveDate.disabled = !ready;
  saveNote.disabled = !ready;
  saveButton.disabled = !ready;
  deleteExerciseButton.disabled = !ready;
  addExerciseButton.disabled = !ready;
  for (const id of ["record-prev-day", "record-next-day", "record-history-open"]) {
    byId(id).disabled = !ready;
  }
  document.querySelectorAll("#exercise-list input, #exercise-list button, #record-editor-host input, #record-editor-host button").forEach(el => { el.disabled = !ready; });
  exerciseList.querySelectorAll(".exercise-card").forEach(card => {
    if (card.renderPrevious) card.renderPrevious();
  });
  document.querySelectorAll("#exercise-list .set-weight, #exercise-list .set-reps, #record-editor-host .set-weight, #record-editor-host .set-reps")
    .forEach(updateInlineStepButtons);
}


const formatPrevious = set => formatLoggedSet(set);

// 各セットの重量・回数それぞれに [−][数値入力][＋] を直接配置する。
let nextSetInputId = 0;
function inlineStepSpec(input) {
  if (!input) return null;
  if (input.classList.contains("set-weight")) return { step: 2.5, max: 2000 };
  if (input.classList.contains("set-reps")) {
    const card = input.closest(".exercise-sets")?.exerciseCard;
    return card?.unit === "seconds" ? { step: 5, max: 36000 } : { step: 1, max: 1000 };
  }
  return null;
}
function updateInlineStepButtons(input) {
  const spec = inlineStepSpec(input);
  const wrapper = input?.closest(".set-inline-stepper");
  if (!spec || !wrapper) return;
  const minus = wrapper.querySelector(".set-step-minus");
  const plus = wrapper.querySelector(".set-step-plus");
  const current = input.value === "" ? 0 : Number(input.value);
  const enabled = dbReady && !input.disabled && Number.isFinite(current);
  minus.disabled = !enabled || current <= 0;
  plus.disabled = !enabled || current >= spec.max;
}
function stepNumericInput(input, direction) {
  const spec = inlineStepSpec(input);
  if (!spec || !dbReady || input.disabled) return;
  const current = input.value === "" ? 0 : Number(input.value);
  if (!Number.isFinite(current)) return;
  const next = Math.min(spec.max, Math.max(0, Math.round((current + direction * spec.step) * 100) / 100));
  if (next === current && input.value !== "") return;
  input.value = String(next);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
function makeInlineStepper(input, typeName) {
  const wrapper = document.createElement("div");
  wrapper.className = "set-inline-stepper";
  const minus = document.createElement("button");
  minus.type = "button";
  minus.className = "set-step-minus";
  minus.textContent = "−";
  minus.setAttribute("aria-label", typeName + "を減らす");
  const plus = document.createElement("button");
  plus.type = "button";
  plus.className = "set-step-plus";
  plus.textContent = "＋";
  plus.setAttribute("aria-label", typeName + "を増やす");
  minus.addEventListener("click", () => stepNumericInput(input, -1));
  plus.addEventListener("click", () => stepNumericInput(input, 1));
  const valueField = document.createElement("div");
  valueField.className = "set-value-field";
  const suffix = document.createElement("span");
  suffix.className = "set-value-unit";
  suffix.setAttribute("aria-hidden", "true");
  suffix.textContent = typeName === "重量" ? "kg" : typeName === "秒数" ? "秒" : "回";
  valueField.append(input, suffix);
  wrapper.append(minus, valueField, plus);
  input.addEventListener("input", () => updateInlineStepButtons(input));
  updateInlineStepButtons(input);
  return wrapper;
}
function attachNumericInput(input) {
  input.enterKeyHint = "next";
  input.addEventListener("focus", () => {
    try { input.select(); } catch {}
  });
  input.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const fields = [...recordEditorHost.querySelectorAll(".set-weight, .set-reps")];
    const next = fields[fields.indexOf(input) + 1];
    if (next && !next.disabled) next.focus();
    else input.blur();
  });
}

function updateExerciseEmpty() {
  exerciseEmpty.hidden = !!exerciseList.querySelector(".exercise-card");
}
function refreshPreviousReferences() {
  exerciseList.querySelectorAll(".exercise-card").forEach(card => {
    if (typeof card.refreshPrevious === "function") card.refreshPrevious();
  });
}
function newSetRow(container, set = { weight_kg: 0, reps: 10 }) {
  const unit = container.exerciseCard?.unit || "kg_reps";
  const row = document.createElement("div");
  row.className = "exercise-set";
  if (unit !== "kg_reps") row.classList.add("is-simple-unit");
  const number = document.createElement("span");
  number.className = "set-number";
  const weightLabel = document.createElement("div");
  weightLabel.className = "set-metric";
  const previousWeight = document.createElement("button");
  previousWeight.type = "button";
  previousWeight.className = "set-prev-weight set-prev-copy";
  previousWeight.textContent = "前回：—";
  previousWeight.disabled = true;
  previousWeight.title = "前回の重量をこのセットに入力";
  const weight = document.createElement("input");
  weight.type = "number"; weight.min = "0"; weight.max = "2000"; weight.step = "0.5";
  weight.inputMode = "decimal";
  weight.className = "set-weight";
  weight.id = "set-weight-" + (++nextSetInputId);
  weight.value = String(set.weight_kg ?? 0);
  weight.setAttribute("aria-label", "重量（kg）");
  weightLabel.append(previousWeight, makeInlineStepper(weight, "重量"));
  attachNumericInput(weight);
  const repsLabel = document.createElement("div");
  repsLabel.className = "set-metric";
  const previousReps = document.createElement("button");
  previousReps.type = "button";
  previousReps.className = "set-prev-reps set-prev-copy";
  previousReps.textContent = "前回：—";
  previousReps.disabled = true;
  previousReps.title = "前回の回数をこのセットに入力";
  const reps = document.createElement("input");
  reps.type = "number"; reps.min = "0";
  reps.max = unit === "seconds" ? "36000" : "1000";
  reps.step = "1";
  reps.inputMode = "numeric";
  reps.className = "set-reps";
  reps.id = "set-reps-" + (++nextSetInputId);
  reps.value = String(unit === "seconds"
    ? (set.duration_seconds ?? 60) : (set.reps ?? 10));
  reps.setAttribute("aria-label", unit === "seconds" ? "秒数" : "回数");
  repsLabel.append(previousReps, makeInlineStepper(reps,
    unit === "seconds" ? "秒数" : "回数"));
  if (unit !== "kg_reps") weightLabel.hidden = true;
  attachNumericInput(reps);
  previousWeight.addEventListener("click", () => {
    if (!dbReady || !row.previousSet) return;
    weight.value = String(Number(row.previousSet.weight_kg));
    weight.dispatchEvent(new Event("input", { bubbles: true }));
  });
  previousReps.addEventListener("click", () => {
    if (!dbReady || !row.previousSet) return;
    reps.value = String(unit === "seconds"
      ? Number(row.previousSet.duration_seconds || 0)
      : Number(row.previousSet.reps));
    reps.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const remove = document.createElement("button");
  remove.type = "button"; remove.className = "secondary-action";
  remove.textContent = "×"; remove.setAttribute("aria-label", "このセットを削除");
  remove.addEventListener("click", () => {
    row.remove();
    renumberSets(container);
  });
  row.append(number, weightLabel, repsLabel, remove);
  container.appendChild(row);
  renumberSets(container);
  return row;
}
// 3セット分だけを上限にし、4セット目以降はセット領域内でスクロールさせる。
// 行の実測値を使うため、画面幅や文字サイズが変わっても3行目を途中で切らない。
function updateSetScrollLimit(container) {
  const rows = [...container.querySelectorAll(".exercise-set")];
  const overflow = rows.length > 3;
  if (!overflow) {
    container.classList.remove("is-scrollable");
    container.style.removeProperty("--three-sets-height");
    container.removeAttribute("role");
    container.removeAttribute("aria-label");
    container.removeAttribute("tabindex");
    container.scrollTop = 0;
    return;
  }
  // 非表示中の記録は表示時に再計測する（0pxで固定しない）。
  const visibleHeights = rows.slice(0, 3).map(row => row.getBoundingClientRect().height);
  if (!visibleHeights.every(height => height > 0)) return;
  container.style.setProperty("--three-sets-height",
    Math.ceil(visibleHeights.reduce((sum, height) => sum + height, 0)) + "px");
  container.classList.add("is-scrollable");
  container.setAttribute("role", "region");
  container.setAttribute("aria-label", "セット入力。4セット目以降はスクロールして表示");
  container.setAttribute("tabindex", "0");
}
function renumberSets(container) {
  container.querySelectorAll(".exercise-set").forEach((row, index) => {
    row.querySelector(".set-number").textContent = (index + 1) + "セット";
    for (const [selector, label] of [[".set-weight", "重量"], [".set-reps", "回数"]]) {
      const input = row.querySelector(selector);
      const wrapper = input?.closest(".set-inline-stepper");
      if (!wrapper) continue;
      const actualLabel = label === "回数" && container.exerciseCard?.unit === "seconds"
        ? "秒数" : label;
      input.setAttribute("aria-label",
        (index + 1) + "セット目の" + actualLabel + (label === "重量" ? "（kg）" : ""));
      wrapper.querySelector(".set-step-minus")?.setAttribute("aria-label",
        (index + 1) + "セット目の" + actualLabel + "を減らす");
      wrapper.querySelector(".set-step-plus")?.setAttribute("aria-label",
        (index + 1) + "セット目の" + actualLabel + "を増やす");
    }
  });
  updateSetScrollLimit(container);
  const card = container.exerciseCard;
  if (card?.renderPrevious) card.renderPrevious();
  if (card?.renderSummary) card.renderSummary();
  updateDraftIndicators();
}


function analysisDateSummary(sets) {
  if (!sets.length) return "0セット";
  const unit = sets[0].entry_unit || "kg_reps";
  if (sets.some(set => (set.entry_unit || "kg_reps") !== unit)) {
    return "異なる単位の記録 · " + sets.length + "セット";
  }
  if (unit === "seconds") return "最大" +
    Math.max(...sets.map(set => Number(set.duration_seconds || 0))) +
    "秒 / " + sets.length + "セット";
  if (unit === "reps") return "最大" +
    Math.max(...sets.map(set => Number(set.reps))) +
    "回 / " + sets.length + "セット";
  const max = Math.max(...sets.map(set => Number(set.weight_kg)));
  return Number(max.toFixed(2)) + "kg / " + sets.length + "セット";
}
function showAnalysisExerciseList({ reload = true } = {}) {
  ++analysisDatesRequestId;
  analysisDateView.hidden = true;
  analysisExerciseView.hidden = false;
  if (reload) loadAnalysisExercises();
}
async function loadAnalysisExercises() {
  const requestId = ++analysisListRequestId;
  analysisExerciseList.replaceChildren();
  analysisExerciseFeedback.textContent = "種目を読み込み中…";
  byId("analysis-exercise-retry").hidden = true;
  try {
    const result = await fetchJSON("/api/exercises");
    if (requestId !== analysisListRequestId || !authorized) return;
    if (result.catalog_ready) {
      for (const item of result.catalog || []) {
        const name = normalizeExerciseName(item.name);
        if (name) exerciseCatalog.set(name, {
          name, body_part: item.body_part, unit: item.unit
        });
      }
    }
    const names = [...new Set((result.recorded || result.exercises || [])
      .map(normalizeExerciseName).filter(Boolean))];
    const partFilter = byId("analysis-part-filter").value;
    const filteredNames = names.filter(name =>
      partFilter === "すべて" || catalogPartFor(name) === partFilter);
    analysisExerciseFeedback.textContent = filteredNames.length ? "" :
      names.length ? "この部位の実施記録はありません。" : "まだ記録した種目がありません。";
    for (const name of filteredNames) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "analysis-link-card";
      const title = document.createElement("strong");
      title.textContent = name;
      const meta = document.createElement("small");
      meta.textContent = catalogPartFor(name);
      const chevron = document.createElement("span");
      chevron.setAttribute("aria-hidden", "true");
      chevron.textContent = "›";
      const info = document.createElement("span");
      info.className = "analysis-exercise-info";
      info.append(title, meta);
      button.append(info, chevron);
      button.addEventListener("click", () => showAnalysisDates(name));
      analysisExerciseList.appendChild(button);
    }
  } catch (error) {
    if (requestId !== analysisListRequestId || !authorized) return;
    if (error.status === 401) { setAuthenticated(false); return; }
    analysisExerciseFeedback.textContent = "種目一覧を取得できませんでした。";
    byId("analysis-exercise-retry").hidden = false;
  }
}
async function showAnalysisDates(rawName) {
  const name = normalizeExerciseName(rawName);
  if (!name || !authorized) return;
  selectedAnalysisExercise = name;
  analysisExerciseView.hidden = true;
  analysisDateView.hidden = false;
  byId("analysis-selected-exercise").textContent = name;
  analysisDateList.replaceChildren();
  analysisDateFeedback.textContent = "実施日を読み込み中…";
  byId("analysis-date-retry").hidden = true;
  const requestId = ++analysisDatesRequestId;
  try {
    const result = await fetchJSON("/api/exercises/history?name=" + encodeURIComponent(name));
    if (requestId !== analysisDatesRequestId || !authorized || selectedAnalysisExercise !== name) return;
    const byDate = new Map();
    for (const set of result.sets || []) {
      if (!byDate.has(set.performed_on)) byDate.set(set.performed_on, []);
      byDate.get(set.performed_on).push(set);
    }
    const recordMessage = byDate.size
      ? (result.truncated ? "古い履歴の一部は表示されていません。" : "")
      : "この種目の実施記録はまだありません。";
    analysisDateFeedback.textContent = [analysisSaveNotice, recordMessage].filter(Boolean).join(" ");
    analysisSaveNotice = "";
    for (const [date, sets] of byDate) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "analysis-link-card";
      const label = document.createElement("span");
      const heading = document.createElement("strong");
      heading.textContent = date;
      const detail = document.createElement("small");
      detail.textContent = analysisDateSummary(sets);
      label.append(heading, detail);
      const chevron = document.createElement("span");
      chevron.textContent = "›";
      chevron.setAttribute("aria-hidden", "true");
      button.append(label, chevron);
      button.addEventListener("click", () => openAnalysisRecord(name, date));
      analysisDateList.appendChild(button);
    }
  } catch (error) {
    if (requestId !== analysisDatesRequestId || !authorized) return;
    if (error.status === 401) { setAuthenticated(false); return; }
    analysisDateFeedback.textContent = "実施日を取得できませんでした。";
    byId("analysis-date-retry").hidden = false;
  }
}
function openSelectedAnalysisCard(name, date) {
  const card = [...exerciseList.querySelectorAll(".exercise-card")].find(item =>
    normalizeExerciseName(item.nameInput.value) === name);
  if (card && selectedDate === date) {
    openExerciseEditor(card, "analysis");
  } else {
    analysisDateFeedback.textContent = "この日の記録を開けませんでした。";
    setScreen("analysis");
    showAnalysisDates(name);
  }
}
function openAnalysisRecord(name, date) {
  if (!selectRecordDate(date)) return;
  if (recordsLoaded && selectedDate === date) {
    openSelectedAnalysisCard(name, date);
  } else {
    pendingAnalysisRecord = { name, date };
  }
}
function returnToAnalysisDays(name) {
  // 記録編集という一時ビューを履歴スタックへ積み増さず、元の分析入口に復帰する。
  if (location.hash === "#record") {
    history.replaceState({ screen: "analysis" }, "", "#analysis");
    setScreen("analysis", false);
  } else {
    setScreen("analysis");
  }
  showAnalysisDates(name);
}
function returnFromExerciseEditor() {
  if (editorEntry === "analysis") {
    if (hasRecordChanges() && !confirm("未保存の変更があります。保存せず実施日一覧へ戻りますか？")) return;
    const name = selectedAnalysisExercise;
    closeExerciseEditor();
    returnToAnalysisDays(name);
  } else {
    closeExerciseEditor({ focus: true });
  }
}
byId("analysis-part-filter").addEventListener("change", loadAnalysisExercises);
byId("analysis-dates-back").addEventListener("click", () => {
  showAnalysisExerciseList({ reload: false });
  byId("analysis-heading").focus?.();
});
byId("analysis-exercise-retry").addEventListener("click", loadAnalysisExercises);
byId("analysis-date-retry").addEventListener("click", () => showAnalysisDates(selectedAnalysisExercise));

function setRecordHistoryVisible(visible) {
  if (visible) closeExerciseEditor();
  recordWorkoutPanel.hidden = visible;
  recordHistoryView.hidden = !visible;
  byId("record-scroll").scrollTop = 0;
  if (visible) byId("record-history-back").focus();
  else if (activePage === "record") byId("record-history-open").focus();
}
byId("record-history-open").addEventListener("click", () => setRecordHistoryVisible(true));
byId("record-history-back").addEventListener("click", () => setRecordHistoryVisible(false));


function cardDraftSnapshot(card) {
  return JSON.stringify({
    name: normalizeExerciseName(card.nameInput.value),
    unit: card.unit,
    note: card.noteValue || "",
    sets: [...card.rows.querySelectorAll(".exercise-set")].map(row => [
      row.querySelector(".set-weight").value, row.querySelector(".set-reps").value
    ])
  });
}
function updateDraftIndicators() {
  if (activeExerciseCard) activeExerciseCard.noteValue = saveNote.value;
  for (const card of exerciseList.querySelectorAll(".exercise-card")) {
    const dirty = card.savedSnapshot !== cardDraftSnapshot(card);
    if (card.unsavedBadge) card.unsavedBadge.hidden = !dirty;
    const name = card.nameInput.value.trim() || "新しい種目";
    card.overviewButton.setAttribute("aria-label",
      name + "のセットを編集" + (dirty ? "、未保存" : ""));
  }
  const currentDirty = !!activeExerciseCard &&
    activeExerciseCard.savedSnapshot !== cardDraftSnapshot(activeExerciseCard);
  byId("record-editor-unsaved").hidden = !currentDirty;
  if (saveButton.getAttribute("aria-label") !== "保存中") {
    saveButton.setAttribute("aria-label",
      currentDirty ? "この種目を保存（未保存の変更あり）" : "この種目を保存");
    saveButton.title = currentDirty ? "未保存の変更を保存" : "この種目を保存";
  }
  if (currentDirty && saveFeedback.textContent === "保存しました。続けて編集できます。") {
    saveFeedback.textContent = "";
  }
}
function markRecordBaseline() {
  exerciseList.querySelectorAll(".exercise-card").forEach(card => {
    card.savedSnapshot = cardDraftSnapshot(card);
  });
  updateDraftIndicators();
}
function hasRecordChanges() {
  updateDraftIndicators();
  return [...exerciseList.querySelectorAll(".exercise-card")].some(card =>
    card.savedSnapshot !== cardDraftSnapshot(card));
}
function closeExerciseEditor({ focus = false } = {}) {
  if (!activeExerciseCard) return;
  const card = activeExerciseCard;
  card.noteValue = saveNote.value;
  // 前回の実施日表示を次回も再利用できるよう、編集DOMに戻す。
  if (card.previousLabel) card.editorBody.prepend(card.previousLabel);
  card.append(card.editorBody);
  card.editorBody.hidden = true;
  activeExerciseCard = null;
  editorEntry = "record";
  recordEditor.hidden = true;
  recordOverview.hidden = false;
  card.renderSummary();
  updateDraftIndicators();
  byId("record-scroll").scrollTop = 0;
  if (focus && card.isConnected) card.overviewButton.focus();
}
function openExerciseEditor(card, origin = "record") {
  if (!card || !dbReady) return;
  if (activeExerciseCard && activeExerciseCard !== card) closeExerciseEditor();
  activeExerciseCard = card;
  editorEntry = origin;
  const backText = origin === "analysis" ? "実施日一覧へ戻る" : "その日の種目一覧へ戻る";
  byId("record-editor-back").setAttribute("aria-label", backText);
  byId("record-editor-back").title = backText;
  byId("record-editor-date").textContent = saveDate.value.replaceAll("-", "/");
  exercisePicker.hidden = true;
  recordOverview.hidden = true;
  recordEditor.hidden = false;
  card.editorBody.hidden = false;
  recordEditorHost.appendChild(card.editorBody);
  // 同じDOMの前回情報をヘッダーへ移動。読み込み中・取得失敗も共通表示。
  if (card.previousLabel) byId("record-editor-meta").appendChild(card.previousLabel);
  updateSetScrollLimit(card.rows);
  byId("record-editor-title").textContent = card.nameInput.value.trim() || "種目を編集";
  saveNote.value = card.noteValue || "";
  recordNoteDetails.open = !!saveNote.value;
  saveFeedback.textContent = "";
  updateDraftIndicators();
  byId("record-scroll").scrollTop = 0;
  byId("record-editor-back").focus();
}
window.addEventListener("resize", () => {
  if (activeExerciseCard && !recordEditor.hidden) {
    updateSetScrollLimit(activeExerciseCard.rows);
  }
});
async function deleteSelectedExercise() {
  const card = activeExerciseCard;
  if (!authorized || !dbReady || !card) return;
  const date = saveDate.value;
  const name = normalizeExerciseName(card.nameInput.value);
  const isPersisted = !!card.savedOnServer;
  const backToAnalysis = editorEntry === "analysis";
  const question = isPersisted
    ? date + "の「" + name + "」の記録を削除しますか？\n重量・回数とメモは元に戻せません。他の種目・来館記録は残ります。"
    : "未保存の「" + name + "」を一覧から削除しますか？";
  if (!confirm(question)) return;

  if (!isPersisted) {
    closeExerciseEditor();
    card.remove();
    updateExerciseEmpty();
    updateDraftIndicators();
    overviewFeedback.textContent = "未保存の種目を一覧から削除しました。";
    if (backToAnalysis) returnToAnalysisDays(name);
    return;
  }

  setReady(false);
  saveFeedback.textContent = "削除中…";
  try {
    await fetchJSON("/api/exercises/log", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ performed_on: date, exercise_name: name })
    });
    if (!authorized || !card.isConnected) return;
    closeExerciseEditor();
    card.remove();
    updateExerciseEmpty();
    updateDraftIndicators();
    overviewFeedback.textContent = "「" + name + "」の記録を削除しました。";
    if (backToAnalysis) returnToAnalysisDays(name);
    await loadWorkouts();
    loadExerciseNames();
  } catch (error) {
    if (error.status === 401) {
      setAuthenticated(false);
      loginFeedback.textContent = "ログイン期限が切れました。";
      return;
    }
    setReady(true);
    saveFeedback.textContent = error.status === 404
      ? "この日の保存済み記録が見つかりません。"
      : "種目を削除できませんでした。接続状態を確認してください。";
  }
}
deleteExerciseButton.addEventListener("click", deleteSelectedExercise);
byId("record-editor-back").addEventListener("click", returnFromExerciseEditor);
saveNote.addEventListener("input", () => {
  if (activeExerciseCard) updateDraftIndicators();
});

function showExercisePicker() {
  if (!dbReady) return;
  closeExerciseEditor();
  recordOverview.hidden = true;
  recordEditor.hidden = true;
  exercisePicker.hidden = false;
  pickerInput.value = "";
  byId("exercise-picker-part").value = "すべて";
  pickerFeedback.textContent = "";
  renderExerciseChoices();
  // Android Chromeの自動フォーカスによるキーボード表示と意図しないスクロールを避ける。
  // フォーカスを戻るボタンへ移し、表示は必ず一覧の先頭から始める。
  byId("exercise-picker-back").focus({ preventScroll: true });
  byId("record-scroll").scrollTop = 0;
}
function closeExercisePicker() {
  exercisePicker.hidden = true;
  recordOverview.hidden = false;
  byId("record-scroll").scrollTop = 0;
}
function renderExerciseChoices() {
  pickerList.replaceChildren();
  const query = normalizeExerciseName(pickerInput.value);
  const part = byId("exercise-picker-part").value;
  const filtered = knownExerciseNames.filter(item => item.includes(query) &&
    (part === "すべて" || catalogPartFor(item) === part)).slice(0, 100);
  for (const name of filtered) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "exercise-choice";
    const title = document.createElement("strong");
    title.textContent = name;
    const detail = document.createElement("small");
    detail.textContent = catalogPartFor(name) + " · " + exerciseUnitLabels[catalogUnitFor(name)];
    button.append(title, detail);
    button.addEventListener("click", () => chooseExercise(name));
    pickerList.appendChild(button);
  }
  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "field-hint";
    empty.textContent = "該当する種目はありません。";
    pickerList.appendChild(empty);
  }
}
async function loadExerciseNames() {
  try {
    const data = await fetchJSON("/api/exercises");
    if (!authorized) return;
    exerciseCatalogReady = !!data.catalog_ready;
    recordedExerciseNames = new Set((data.recorded || []).map(normalizeExerciseName));
    if (exerciseCatalogReady) {
      exerciseCatalog = new Map();
      for (const item of data.catalog || []) {
        const name = normalizeExerciseName(item.name);
        if (name) exerciseCatalog.set(name, { name, body_part:item.body_part, unit:item.unit });
      }
      for (const name of recordedExerciseNames) {
        if (!exerciseCatalog.has(name)) exerciseCatalog.set(name, {
          name, body_part:starterParts[name] || "その他", unit:"kg_reps"
        });
      }
      knownExerciseNames = [...exerciseCatalog.keys()];
    } else {
      knownExerciseNames = [...new Set([...starterExercises, ...(data.exercises || [])]
        .map(normalizeExerciseName).filter(Boolean))];
      exerciseCatalog = new Map(knownExerciseNames.map(name => [name,{
        name, body_part:starterParts[name] || "その他",
        unit:"kg_reps"
      }]));
    }
    const suggestions = byId("exercise-suggestions");
    suggestions.replaceChildren();
    for (const name of knownExerciseNames) {
      const option = document.createElement("option");
      option.value = name;
      suggestions.appendChild(option);
    }
    renderExerciseChoices();
    renderExerciseSettingsList();
  } catch { /* 初期候補と手入力で記録を継続可能 */ }
}
function chooseExercise(raw) {
  if (!authorized || !dbReady) return;
  const name = normalizeExerciseName(raw);
  if (!name || name.length > 60) {
    pickerFeedback.textContent = "種目名を60文字以内で入力してください。";
    return;
  }
  exercisePicker.hidden = true;
  const existing = [...exerciseList.querySelectorAll(".exercise-card")].find(card =>
    normalizeExerciseName(card.nameInput.value) === name);
  const card = existing || addExercise(name);
  openExerciseEditor(card);
}
byId("exercise-picker-back").addEventListener("click", closeExercisePicker);
byId("exercise-picker-confirm").addEventListener("click", () => chooseExercise(pickerInput.value));
pickerInput.addEventListener("input", renderExerciseChoices);
byId("exercise-picker-part").addEventListener("change", renderExerciseChoices);
pickerInput.addEventListener("keydown", event => {
  if (event.key === "Enter") { event.preventDefault(); chooseExercise(pickerInput.value); }
});

function addExercise(name = "", sets = [{ weight_kg: 0, reps: 10 }], note = "", saved = false) {
  // 一覧のカードと専用編集ビューを分ける。編集中の値は同じDOM上に維持する。
  const card = document.createElement("div");
  card.className = "exercise-card";
  const summary = document.createElement("button");
  summary.type = "button";
  summary.className = "exercise-overview";
  const nameRow = document.createElement("span");
  nameRow.className = "exercise-overview-heading";
  const heading = document.createElement("strong");
  heading.className = "exercise-overview-name";
  const unsaved = document.createElement("span");
  unsaved.className = "record-unsaved-dot record-unsaved-dot--list";
  unsaved.setAttribute("aria-hidden", "true");
  unsaved.hidden = true;
  nameRow.append(heading, unsaved);
  const current = document.createElement("span");
  current.className = "exercise-overview-current";
  const previousSummary = document.createElement("span");
  previousSummary.className = "exercise-overview-previous";
  summary.append(nameRow, current, previousSummary);
  const body = document.createElement("div");
  body.className = "exercise-editor";
  body.hidden = true;
  card.nameInput = null;
  const nameInput = document.createElement("input");
  nameInput.className = "exercise-name";
  nameInput.type = "text";
  nameInput.maxLength = 60;
  nameInput.setAttribute("list", "exercise-suggestions");
  nameInput.placeholder = "例：ラットプルダウン";
  nameInput.value = name;
  nameInput.readOnly = true; // 種目名で履歴を照合するため、直接変更はしない。
  const rows = document.createElement("div");
  rows.className = "exercise-sets";
  rows.exerciseCard = card;
  card.rows = rows;
  card.unit = saved && sets[0]?.entry_unit
    ? sets[0].entry_unit : catalogUnitFor(name);
  card.nameInput = nameInput;
  card.editorBody = body;
  card.overviewButton = summary;
  card.unsavedBadge = unsaved;
  card.noteValue = note;
  const previousLabel = document.createElement("p");
  previousLabel.className = "exercise-previous-heading";
  previousLabel.textContent = "前回を確認中…";
  card.previousLabel = previousLabel;
  const actions = document.createElement("div");
  actions.className = "exercise-actions";
  const addSet = document.createElement("button");
  addSet.type = "button"; addSet.className = "secondary-action"; addSet.textContent = "＋ セット";
  addSet.addEventListener("click", () => {
    if (rows.children.length >= 12) return;
    const last = rows.lastElementChild;
    const lastValue = last ? Number(last.querySelector(".set-reps").value) : 10;
    const row = newSetRow(rows, {
      weight_kg: card.unit === "kg_reps" && last
        ? Number(last.querySelector(".set-weight").value) : 0,
      reps: card.unit === "seconds" ? 0 : lastValue,
      duration_seconds: card.unit === "seconds" ? (last ? lastValue : 60) : 0
    });
    // 4セット目以降を表示し、新しいセットの使用する値にフォーカス。
    row.querySelector(card.unit === "kg_reps" ? ".set-weight" : ".set-reps").focus();
    if (rows.classList.contains("is-scrollable")) {
      row.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
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
    const chosen = nameInput.value.trim();
    heading.textContent = chosen || "新しい種目";
    summary.setAttribute("aria-label", (chosen || "新しい種目") + "のセットを編集");
    const currentSets = [...rows.querySelectorAll(".exercise-set")];
    const values = currentSets.map(row => {
      const kg = row.querySelector(".set-weight").value;
      const amount = row.querySelector(".set-reps").value || "—";
      return card.unit === "seconds" ? amount + "秒" :
        card.unit === "reps" ? amount + "回" :
        (kg || "—") + "kg × " + amount + "回";
    });
    const uniform = values.length && values.every(value => value === values[0]);
    current.textContent = !values.length ? "セットなし" :
      uniform ? values[0] + " × " + values.length + "セット" :
      values.join(" / ");
  };
  card.renderPrevious = () => {
    const compatible = previous.filter(set => (set.entry_unit || "kg_reps") === card.unit);
    previousSummary.textContent = compatible.length
      ? "前回 " + compatible.map(formatPrevious).join(" / ")
      : previous.length ? "前回は別の単位で記録されています" : "前回の記録なし";
    const lastDate = previous[0]?.performed_on || "";
    const shortDate = lastDate.slice(0, 4) === saveDate.value.slice(0, 4)
      ? lastDate.slice(5).replace("-", "/")
      : lastDate.replaceAll("-", "/");
    previousLabel.textContent = lastDate ? "前回 " + shortDate : "前回なし";
    rows.querySelectorAll(".exercise-set").forEach((row, i) => {
      const set = compatible.find(p => Number(p.set_number) === i + 1);
      row.previousSet = set || null;
      const copyWeight = row.querySelector(".set-prev-weight");
      const copyReps = row.querySelector(".set-prev-reps");
      copyWeight.textContent = set
        ? "前回：" + Number(set.weight_kg).toString() + "kg ↙" : "前回：—";
      copyReps.textContent = set
        ? "前回：" + (card.unit === "seconds" ? set.duration_seconds : set.reps) +
          (card.unit === "seconds" ? "秒" : "回") + " ↙" : "前回：—";
      copyWeight.disabled = !dbReady || !set;
      copyReps.disabled = !dbReady || !set;
      copyWeight.setAttribute("aria-label", (i + 1) + "セット目の前回重量を入力");
      copyReps.setAttribute("aria-label", (i + 1) + "セット目の前回回数を入力");
    });
    recent.disabled = !dbReady || !compatible.length;
  };
  card.refreshPrevious = async () => {
    const chosen = nameInput.value.trim();
    const date = saveDate.value;
    const id = ++lookupId;
    previous = [];
    card.renderPrevious();
    if (!chosen || !date || !dbReady) return;
    referenceKey = chosen + "|" + date;
    previousLabel.textContent = "前回を確認中…";
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
      previousLabel.textContent = "前回を取得できませんでした";
      recent.disabled = true;
    }
  };
  nameInput.addEventListener("input", () => {
    ++lookupId;
    previous = [];
    card.renderSummary();
    card.renderPrevious();
    byId("record-editor-title").textContent = nameInput.value.trim() || "新しい種目";
  });
  nameInput.addEventListener("change", () => card.refreshPrevious());
  rows.addEventListener("input", () => {
    card.renderSummary();
    updateDraftIndicators();
  });
  recent.addEventListener("click", () => {
    const compatible = previous.filter(set => (set.entry_unit || "kg_reps") === card.unit);
    if (!compatible.length || !dbReady) return;
    if (rows.querySelector(".exercise-set") &&
        !confirm("入力中のセットを前回の内容に置き換えますか？")) return;
    rows.replaceChildren();
    for (const set of compatible) newSetRow(rows, set);
    card.renderPrevious();
    card.renderSummary();
    feedback.textContent = "前回のセットを反映しました。";
    updateDraftIndicators();
  });
  summary.addEventListener("click", () => openExerciseEditor(card));
  actions.append(addSet, recent);
  // 削除は共通エディタ右上のゴミ箱に集約する。
  body.append(previousLabel, rows, actions, feedback);
  card.append(summary, body);
  exerciseList.appendChild(card);
  for (const set of sets) newSetRow(rows, set);
  card.renderSummary();
  card.renderPrevious();
  card.querySelectorAll("input, button").forEach(el => { el.disabled = !dbReady; });
  if (name && dbReady) card.refreshPrevious();
  if (saved) {
    card.savedSnapshot = cardDraftSnapshot(card);
    card.savedSetsSnapshot = savedNumericSnapshot(card.unit, sets);
    card.savedOnServer = true;
  }
  updateExerciseEmpty();
  updateDraftIndicators();
  return card;
}
function resetWorkoutForm(date = todayISO()) {
  closeExerciseEditor();
  exercisePicker.hidden = true;
  recordOverview.hidden = false;
  editingWorkoutId = null;
  byId("record-form-title").textContent = date === todayISO() ? "今日のトレーニング" : "この日のトレーニング";
  cancelWorkoutEdit.hidden = true;
  saveButton.setAttribute("aria-label", "この種目を保存");
  saveButton.title = "この種目を保存";
  saveDate.value = date;
  selectedDate = date;
  saveNote.value = "";
  recordNoteDetails.open = false;
  exerciseList.replaceChildren();
  updateExerciseEmpty();
  renderDayDetail();
  markRecordBaseline();
}
function workoutSummary(record) {
  const names = [...new Set((record.sets || []).map(x => x.exercise_name))];
  if (names.length) return names.join("・") + "（" + record.sets.length + "セット）" + (record.note ? " / " + record.note : "");
  return record.note || "日付のみの記録";
}
function editWorkout(record) {
  // 旧セッションを開いても1つの記録だけで日別一覧を上書きしない。
  if (!selectRecordDate(record.performed_on)) return;
  const selectedName = normalizeExerciseName(record.sets?.[0]?.exercise_name);
  const openMatch = () => {
    const card = [...exerciseList.querySelectorAll(".exercise-card")].find(entry =>
      normalizeExerciseName(entry.nameInput.value) === selectedName);
    if (card) openExerciseEditor(card);
  };
  if (recordsLoaded && currentMonth() === record.performed_on.slice(0, 7)) openMatch();
  else pendingExerciseToOpen = selectedName;
}
let pendingExerciseToOpen = "";
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
    edit.addEventListener("click", () => {
      if (hasRecordChanges() && !confirm("入力中の変更を破棄して、この記録を編集しますか？")) return;
      editWorkout(record);
    });
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
  const calendarTouchAtStart = calendarDialogueInteractionId;
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
    // 月データ到着直後だけ、未操作のカレンダー吹き出しを再評価。
    if (activePage === "calendar" && !calendarDialogueUserOverride &&
        calendarTouchAtStart === calendarDialogueInteractionId) {
      showSideDialogue("calendar");
    }
    if (pendingRecordDate && pendingRecordDate.slice(0, 7) === month && activePage === "record") {
      const date = pendingRecordDate;
      pendingRecordDate = "";
      hydrateStoredRecordForDate(date);
    }
    refreshPreviousReferences();
    if (pendingExerciseToOpen && activePage === "record") {
      const name = pendingExerciseToOpen;
      pendingExerciseToOpen = "";
      const card = [...exerciseList.querySelectorAll(".exercise-card")].find(entry =>
        normalizeExerciseName(entry.nameInput.value) === name);
      if (card) openExerciseEditor(card);
    }
    if (pendingAnalysisRecord && activePage === "record") {
      const target = pendingAnalysisRecord;
      pendingAnalysisRecord = null;
      openSelectedAnalysisCard(target.name, target.date);
    }
    return true;
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
    if (pendingAnalysisRecord) {
      const target = pendingAnalysisRecord;
      pendingAnalysisRecord = null;
      setScreen("analysis");
      showAnalysisDates(target.name);
    }
    return false;
  }
}
async function removeWorkout(id) {
  if (!dbReady || !confirm("このトレーニング記録を削除しますか？ 来館記録は削除されません。")) return;
  setReady(false);
  try {
    await fetchJSON("/api/workouts/" + encodeURIComponent(id), {
      method: "DELETE", headers: { "Content-Type": "application/json" }
    });
    pendingRecordDate = selectedDate;
    await loadWorkouts();
    overviewFeedback.textContent = "筋トレ記録を削除しました。";
  } catch {
    setReady(true);
    saveFeedback.textContent = "削除できませんでした。";
  }
}

addExerciseButton.addEventListener("click", showExercisePicker);
cancelWorkoutEdit.addEventListener("click", () => {
  if (hasRecordChanges() && !confirm("入力中の変更を破棄して、新しい記録を作りますか？")) return;
  resetWorkoutForm(saveDate.value);
  saveFeedback.textContent = "";
});
recordAttendance.addEventListener("click", () => {
  if (!authorized || !calendarAvailable || calendarSaving) return;
  dayAttended.checked = !dayAttended.checked;
  persistDaySwitches();
});
recordPlanToggle.addEventListener("click", () => {
  if (!authorized || !calendarAvailable) return;
  recordPlanPanel.hidden = !recordPlanPanel.hidden;
  recordPlanToggle.setAttribute("aria-expanded", String(!recordPlanPanel.hidden));
});
for (const [id, delta] of [["record-prev-day", -1], ["record-next-day", 1]]) {
  byId(id).addEventListener("click", () => {
    const date = saveDate.value;
    if (!date) return;
    const [year, month, day] = date.split("-").map(Number);
    const next = new Date(year, month - 1, day + delta);
    selectRecordDate(localISO(next));
  });
}
resetWorkoutForm();

function collectExerciseSets(card) {
  const rows = [...card.rows.querySelectorAll(".exercise-set")];
  if (!rows.length || rows.length > 12) throw new Error("セットは1～12個にしてください。");
  const sets = [];
  for (const row of rows) {
    const weightInput = row.querySelector(".set-weight");
    const valueInput = row.querySelector(".set-reps");
    const weight = Number(weightInput.value), value = Number(valueInput.value);
    if (!valueInput.value || !Number.isInteger(value) ||
        value < (card.unit === "seconds" ? 1 : 0) ||
        value > (card.unit === "seconds" ? 36000 : 1000) ||
        !valueInput.validity.valid ||
        (card.unit === "kg_reps" && (!weightInput.value ||
          !Number.isFinite(weight) || weight < 0 || weight > 2000 ||
          !weightInput.validity.valid))) {
      (card.unit === "kg_reps" && (!weightInput.value || !weightInput.validity.valid)
        ? weightInput : valueInput).focus();
      throw new Error("入力した数値を確認してください。");
    }
    sets.push({
      weight_kg: card.unit === "kg_reps" ? weight : 0,
      reps: card.unit === "seconds" ? 0 : value,
      duration_seconds: card.unit === "seconds" ? value : 0
    });
  }
  return sets;
}
// 一度成功した日付・種目への繰り返し保存を新しい達成として扱わない（メモリのみ）。
let exerciseSaveInFlight = false;
const exerciseSavedThisSession = new Set();
byId("workout-form").addEventListener("submit", async event => {
  event.preventDefault();
  const card = activeExerciseCard;
  if (!authorized || !dbReady || !card || exerciseSaveInFlight) return;
  let sets;
  try { sets = collectExerciseSets(card); }
  catch (error) { saveFeedback.textContent = error.message; return; }
  const date = saveDate.value;
  const name = normalizeExerciseName(card.nameInput.value);
  const unit = card.unit;
  if (!name || name.length > 60) {
    saveFeedback.textContent = "種目名を確認してください。";
    return;
  }
  const note = saveNote.value;
  if (note.length > 300) {
    saveFeedback.textContent = "メモは300文字以内です。";
    return;
  }
  card.noteValue = note;
  const initialSnapshot = cardDraftSnapshot(card);
  const numericSnapshot = savedNumericSnapshot(unit, sets);
  const key = date + "|" + name + "|" + unit;
  const samePersisted = card.savedOnServer && card.savedSetsSnapshot === numericSnapshot;
  const alreadySaved = exerciseSavedThisSession.has(key);
  // 開始時より後の本体タップ・吹き出し・画面移動を、保存結果で上書きしない。
  const dialogueAtSaveStart = sideDialogueRequestId;
  exerciseSaveInFlight = true;
  saveButton.disabled = true;
  saveButton.setAttribute("aria-label", "保存中");
  saveButton.title = "保存中";
  saveFeedback.textContent = "保存中…";
  let previousSets = null;
  try {
    // PUT前の厳密に過去の履歴だけを確保する。取得失敗は保存処理へ影響しない。
    if (!samePersisted && !alreadySaved) {
      try {
        const history = await fetchJSON("/api/workouts/recent?name=" +
          encodeURIComponent(name) + "&before=" + encodeURIComponent(date));
        previousSets = !history.truncated && Array.isArray(history.sets) ? history.sets : null;
      } catch { previousSets = null; }
    }
    // 取得中の画面／日付／種目／数値／メモ変更は、古い結果で保存しない。
    if (!authorized || activePage !== "record" || !card.isConnected ||
        activeExerciseCard !== card || saveDate.value !== date ||
        normalizeExerciseName(card.nameInput.value) !== name || card.unit !== unit ||
        saveNote.value !== note || cardDraftSnapshot(card) !== initialSnapshot) {
      if (authorized && activePage === "record") saveFeedback.textContent =
        "入力内容が変更されたため保存を中止しました。もう一度保存してください。";
      return;
    }
    setReady(false);
    let result;
    try {
      result = await fetchJSON("/api/exercises/log", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ performed_on: date, exercise_name: name,
          unit, sets, note })
      });
    } catch (error) {
      if (error.status === 401) {
        setAuthenticated(false);
        loginFeedback.textContent = "ログイン期限が切れました。";
      } else if (authorized) {
        setReady(true);
        saveFeedback.textContent = "保存できませんでした。接続状態を確認してください。";
      }
      return;
    }
    // PUT成功以降の再取得エラーは保存失敗と混同しない。
    exerciseSavedThisSession.add(key);
    if (!authorized) return;
    const editorUnchanged = card.isConnected && activeExerciseCard === card &&
      saveDate.value === date && cardDraftSnapshot(card) === initialSnapshot;
    if (editorUnchanged) {
      card.nameInput.value = result.exercise_name;
      card.savedSnapshot = cardDraftSnapshot(card);
      card.savedSetsSnapshot = numericSnapshot;
      card.savedOnServer = true;
      updateDraftIndicators();
    }
    saveFeedback.textContent = "保存しました。続けて編集できます。";
    pendingRecordDate = "";
    if (activePage === "record" && editorUnchanged &&
        dialogueAtSaveStart === sideDialogueRequestId) {
      const group = chooseRecordSaveGroup({
        unit, sets, previousSets, performedOn: date, samePersisted, alreadySaved
      });
      showSideDialogue("record", group);
    }
    let refreshed = false;
    try { refreshed = await loadWorkouts() === true; } catch { /* 保存は確定済み */ }
    if (authorized && !refreshed && activePage === "record") {
      setReady(true);
      saveFeedback.textContent = "保存しました。ただし月間一覧を更新できませんでした。";
    }
    if (authorized) loadExerciseNames();
  } finally {
    exerciseSaveInFlight = false;
    saveButton.setAttribute("aria-label", "この種目を保存");
    saveButton.title = "この種目を保存";
    if (authorized && dbReady) saveButton.disabled = false;
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
// Androidのネイティブ日付ピッカーにも同じ日別ナビゲーションを適用する。
saveDate.addEventListener("change", () => {
  const date = saveDate.value;
  saveDate.value = selectedDate;
  if (date) selectRecordDate(date);
});

function changeMonth(offset) {
  calendarDialogueUserOverride = false; // 月移動は新しい明示操作
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
  if (authorized && activePage === "calendar") showSideDialogue("calendar");
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

const pages = new Set(["home", "calendar", "record", "talk", "notices", "analysis", "exercise-settings", "events", "gallery", "settings"]);

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
// 衣装／表情は固定素材。現行ジム立ち絵は第1話の採用 normal を共用し、
// ホームでのジム用表情自動切り替えはまだ行わない。部屋着は従来どおり均等抽選。
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
    src: "/assets/shiori/gim/v1/shiori-gim-story-normal-alt1-before.webp",
    width: 1086,
    height: 1448,
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
let screenDialogueData = null;
let screenDialogueLoading = null;
let sdTouchDialogueLoading = null; // エラーも保持する（再試行ループを防止）。
let calendarDialogueUserOverride = false;
let sdTapHistory = [];
let sideDialogueRequestId = 0;
let calendarDialogueInteractionId = 0;
let lastSideDialogue = { record: "", calendar: "", analysis: "" };
const sideDialogueNodes = {
  record: byId("record-sd-line"),
  calendar: byId("calendar-sd-line"),
  analysis: byId("analysis-sd-line")
};

// ホームと分析が利用する採用済みの候補は変更しない。
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

// 記録／カレンダー専用115本は初回のみ読み込み、ユーザーの記録は保持しない。
async function ensureScreenDialogueData() {
  if (screenDialogueData) return screenDialogueData;
  if (!screenDialogueLoading) {
    screenDialogueLoading = fetch("/data/shiori-record-calendar-v0.1.json", { cache: "force-cache" })
      .then(response => {
        if (!response.ok) throw new Error("screen_dialogues_unavailable");
        return response.json();
      })
      .then(data => {
        if (!data || !data.groups || !Array.isArray(data.groups["record.normal"]) ||
            !Array.isArray(data.groups["calendar.normal"])) throw new Error("invalid_screen_dialogues");
        screenDialogueData = data.groups;
        return screenDialogueData;
      })
      .finally(() => { screenDialogueLoading = null; });
  }
  return screenDialogueLoading;
}
// 30本が揃わない場合は全グループを不採用にして固定セリフへフォールバック。
async function ensureSdTouchDialogueData() {
  if (!sdTouchDialogueLoading) {
    sdTouchDialogueLoading = fetch("/data/shiori-sd-touch-v0.1.json", { cache: "force-cache" })
      .then(response => {
        if (!response.ok) throw new Error("sd_touch_unavailable");
        return response.json();
      })
      .then(data => {
        if (!isValidSdTouchData(data)) throw new Error("invalid_sd_touch_data");
        return data.groups;
      })
      .catch(() => null);
  }
  return sdTouchDialogueLoading;
}
function pickSideLine(page, entries, fallback) {
  return chooseLineWithoutRepeat(entries, lastSideDialogue[page], fallback, Math.random());
}
function applicableCalendarDialogues() {
  return calendarConditionGroups({
    month: currentMonth(), localMonth: todayISO().slice(0, 7),
    recordsKnown: recordsLoaded, calendarKnown: calendarAvailable,
    hasPlan: [...calendarDays.values()].some(day => day.planned),
    hasAttendance: [...calendarDays.values()].some(day => day.attended),
    hasWorkout: workouts.some(record => Array.isArray(record.sets) && record.sets.length > 0),
    truncated: monthTruncated
  });
}

// 保存成功だけは専用グループを直接要求し、先行する非同期抽選を無効化。
async function showSideDialogue(page, reason = "normal") {
  const requestId = ++sideDialogueRequestId;
  if (!authorized || activePage !== page || !sideDialogueNodes[page]) return;
  const node = sideDialogueNodes[page];
  const touched = reason.startsWith("touch.");
  const saved = page === "record" && reason.startsWith("record.") && reason !== "normal";
  const fallback = touched ? "ん？ 呼んだ？" : saved ? "うん、保存できたね。" :
    page === "record" ? "今日は記録だけでもいいんじゃないかな。" :
    "あ、来た。今日はどうする？";
  try {
    let chosen;
    if (touched) {
      const data = await ensureSdTouchDialogueData();
      chosen = pickSideLine(page, data?.[reason], fallback);
    } else if (page === "analysis") {
      const data = await ensureGreetingData();
      chosen = pickSideLine(page, data?.anytime, fallback);
    } else {
      const data = await ensureScreenDialogueData();
      let group = page === "record" ? (saved ? reason : "record.normal") : "calendar.normal";
      if (page === "calendar") {
        const conditions = applicableCalendarDialogues().filter(id => data[id]?.length);
        if (conditions.length && Math.random() < 0.30) {
          group = conditions[Math.floor(Math.random() * conditions.length)];
        }
      }
      chosen = pickSideLine(page, data[group] || data[page + ".normal"], fallback);
    }
    if (!authorized || activePage !== page || requestId !== sideDialogueRequestId) return;
    node.textContent = chosen;
    lastSideDialogue[page] = chosen;
  } catch {
    if (!authorized || activePage !== page || requestId !== sideDialogueRequestId) return;
    node.textContent = fallback;
    lastSideDialogue[page] = fallback;
  }
}

byId("record-sd-talk").addEventListener("click", () => showSideDialogue("record"));
byId("calendar-sd-talk").addEventListener("click", () => {
  ++calendarDialogueInteractionId;
  calendarDialogueUserOverride = true;
  showSideDialogue("calendar");
});
byId("analysis-sd-talk").addEventListener("click", () => showSideDialogue("analysis"));
// 実画像の不透明ピクセルだけを物理タップ対象として扱う。
const sdAlphaCache = new WeakMap();
function hitSdVisiblePixel(event, layer) {
  if (event.detail === 0) return true; // Enter / Space のネイティブclick
  const image = layer?.querySelector("img");
  if (!image?.naturalWidth || !image?.naturalHeight) return false;
  const rect = layer.getBoundingClientRect();
  const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
  const imageWidth = image.naturalWidth * scale;
  const imageHeight = image.naturalHeight * scale;
  const x = (event.clientX - (rect.right - imageWidth)) / imageWidth;
  const y = (event.clientY - (rect.bottom - imageHeight)) / imageHeight;
  if (x < 0 || x >= 1 || y < 0 || y >= 1) return false;
  let pixels = sdAlphaCache.get(image);
  if (!pixels) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return true; // CSS polygon is still limited
      context.drawImage(image, 0, 0, 128, 128);
      pixels = context.getImageData(0, 0, 128, 128).data;
      sdAlphaCache.set(image, pixels);
    } catch { return true; } // canvas非対応時はCSSの輪郭に任せる
  }
  const px = Math.floor(x * 128), py = Math.floor(y * 128);
  return pixels[(py * 128 + px) * 4 + 3] > 24;
}
function resetSdTouchState() {
  sdTapHistory = [];
  document.querySelectorAll(".record-sd-art-slot.is-poked").forEach(layer =>
    layer.classList.remove("is-poked"));
}
for (const page of ["record", "calendar", "analysis"]) {
  const button = byId(page + "-sd-touch");
  const layer = button.previousElementSibling;
  button.addEventListener("click", event => {
    if (!authorized || activePage !== page || !hitSdVisiblePixel(event, layer)) return;
    const state = registerSdTap(sdTapHistory, performance.now());
    sdTapHistory = state.history;
    if (page === "calendar") {
      ++calendarDialogueInteractionId;
      calendarDialogueUserOverride = true;
    }
    // 画像だけを微小に圧縮・反発させる。連打時も毎回先頭から再生する。
    layer.classList.remove("is-poked");
    void layer.offsetWidth;
    layer.classList.add("is-poked");
    showSideDialogue(page, chooseSdTouchGroup(page, Math.random(), state.repeat));
  });
  button.addEventListener("keydown", event => {
    if (event.repeat && (event.key === "Enter" || event.key === " ")) event.preventDefault();
  });
}

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
  document.body.classList.toggle("is-sd-page", ["record", "calendar", "analysis"].includes(screen));
  if (screen === "home") {
    if (previousPage !== "home" && currentOutfit === "roomwear") refreshOutfit({ reroll: true });
    if (previousPage !== "home" || homeDialogue.hidden) showHomeGreeting();
  } else {
    ++greetingRequestId;
  }
  // 画面間の非同期応答が別画面の吹き出しへ入り込まないよう破棄する。
  if (screen !== previousPage) {
    ++sideDialogueRequestId;
    resetSdTouchState();
    if (screen === "calendar") calendarDialogueUserOverride = false;
  }
  if (screen === "analysis" && previousPage !== "analysis") showAnalysisExerciseList();
  if (screen === "exercise-settings" && previousPage !== "exercise-settings") {
    exerciseSettingsReturnPage = previousPage;
    exerciseSettingsReturnPicker = previousPage === "record" && !exercisePicker.hidden;
    refreshExerciseSettings();
  }
  if (screen === "record" || screen === "calendar" || screen === "analysis") {
    if (screen !== previousPage) {
      if (screen === "record") byId("record-scroll").scrollTop = 0;
      showSideDialogue(screen);
      if (screen === "record" && !recordsLoaded && !pendingRecordDate) {
        pendingRecordDate = selectedDate;
      }
      if (screen === "record" && recordsLoaded && !hasRecordChanges() &&
          !exerciseList.querySelector(".exercise-card")) {
        hydrateStoredRecordForDate(selectedDate);
      }
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
    if (button.closest("#page-home") && button.dataset.screen === "record") {
      if (!selectRecordDate(todayISO())) return;
    }
    setScreen(button.dataset.screen);
  });
});

window.addEventListener("popstate", () => {
  if (!authorized) return;
  const screen = location.hash.slice(1);
  if (screen === "analysis" && activePage === "record" && editorEntry === "analysis") {
    const name = selectedAnalysisExercise;
    closeExerciseEditor();
    setScreen("analysis", false);
    showAnalysisDates(name);
    return;
  }
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
  if (!next) document.body.classList.remove("is-home", "is-record", "is-sd-page");
  document.title = next ? "kintoreapp | 筋トレ記録" : "ログイン";
  loginSuccess.hidden = !next;
  if (next) {
    if (!wasAuthorized) {
      loadExerciseNames();
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
    resetSdTouchState();
    calendarDialogueUserOverride = false;
    calendarDialogueInteractionId = 0;
    lastSideDialogue = { record: "", calendar: "", analysis: "" };
    exerciseSavedThisSession.clear();
    sideDialogueNodes.record.textContent = "今日は記録だけでもいいんじゃないかな。";
    sideDialogueNodes.calendar.textContent = "あ、来た。今日はどうする？";
    sideDialogueNodes.analysis.textContent = "あ、来た。今日はどうする？";
    authStatus.textContent = "未ログイン：パスワードを入力してください。";
    setReady(false);
    workouts = [];
    recordsLoaded = false;
    calendarAvailable = false;
    monthTruncated = false;
    calendarDays.clear();
    completeDates.clear();
    selectedDate = todayISO();
    pendingRecordDate = "";
    pendingAnalysisRecord = null;
    editorEntry = "record";
    analysisSaveNotice = "";
    ++analysisListRequestId;
    ++analysisDatesRequestId;
    selectedAnalysisExercise = "";
    analysisExerciseList.replaceChildren();
    analysisDateList.replaceChildren();
    analysisExerciseFeedback.textContent = "";
    analysisDateFeedback.textContent = "";
    analysisDateView.hidden = true;
    analysisExerciseView.hidden = false;
    knownExerciseNames = starterExercises;
    exerciseCatalogReady = false;
    recordedExerciseNames = new Set();
    exerciseCatalog = new Map(starterExercises.map(name => [name, {
      name, body_part:starterParts[name] || "その他",
      unit:"kg_reps"
    }]));
    ++exerciseSettingsRequestId;
    recordPlanPanel.hidden = true;
    recordPlanToggle.setAttribute("aria-expanded", "false");
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

/* Trial-only event player: independent of the canonical story and D1 persistence. */
const storyDemoLines = [
  "あ、こんにちは。ちゃんと見えてる？",
  "今日はセリフ送りのテストなんだって。",
  "画面をタップすると、こんなふうに会話が進むよ。",
  "立ち絵の大きさも、いつものホームと比べてみてね。",
  "これで最後だよ。もう一度タップすると一覧に戻るね。"
];
const storyPlayer = byId("story-test-player");
const storyOpen = byId("story-test-open");
const storyNext = byId("story-test-next");
const storyClose = byId("story-test-close");
let storyIndex = 0;
function renderStoryDemo() {
  byId("story-test-line").textContent = storyDemoLines[storyIndex];
  byId("story-test-progress").textContent = (storyIndex + 1) + " / " + storyDemoLines.length;
}
function closeStoryDemo(fromPopstate = false) {
  if (storyPlayer.hidden) return;
  storyPlayer.hidden = true;
  document.body.classList.remove("is-story-test");
  byId("app-screen").inert = false;
  byId("app-header").inert = false;
  if (authorized && activePage === "events") storyOpen.focus();
  if (!fromPopstate && location.hash === "#events-test") history.back();
}
storyOpen.addEventListener("click", () => {
  if (!authorized || activePage !== "events" || !storyPlayer.hidden) return;
  const portrait = homePortraits.training[0];
  const portraitBox = byId("story-test-portrait");
  const portraitImage = byId("story-test-portrait-image");
  portraitBox.style.aspectRatio = portrait.width + " / " + portrait.height;
  for (const size of ["base", "narrow", "short"]) {
    const layout = portrait.layout[size];
    portraitBox.style.setProperty("--story-scale-" + size, String(layout.scale));
    portraitBox.style.setProperty("--story-origin-" + size, layout.origin);
    portraitBox.style.setProperty("--story-bottom-" + size, layout.bottom);
  }
  portraitImage.width = portrait.width;
  portraitImage.height = portrait.height;
  portraitImage.src = portrait.src;
  byId("story-test-backdrop").style.backgroundImage =
    'url("/assets/backgrounds/gym-' + sceneTimeSlot(new Date().getHours()) + '.webp")';
  storyIndex = 0;
  renderStoryDemo();
  storyPlayer.hidden = false;
  document.body.classList.add("is-story-test");
  byId("app-screen").inert = true;
  byId("app-header").inert = true;
  history.pushState({ screen: "events", storyTest: true }, "", "#events-test");
  storyNext.focus();
});
storyNext.addEventListener("click", () => {
  if (storyPlayer.hidden) return;
  if (++storyIndex >= storyDemoLines.length) closeStoryDemo();
  else renderStoryDemo();
});
storyClose.addEventListener("click", () => closeStoryDemo());
window.addEventListener("popstate", () => {
  if (!storyPlayer.hidden) closeStoryDemo(true);
});
document.addEventListener("keydown", (event) => {
  if (storyPlayer.hidden) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeStoryDemo();
  } else if (event.key === "Tab") {
    if (event.shiftKey && document.activeElement === storyNext) {
      event.preventDefault();
      storyClose.focus();
    } else if (!event.shiftKey && document.activeElement === storyClose) {
      event.preventDefault();
      storyNext.focus();
    }
  }
});


/* Monogatari comparison: lazy iframe only. No D1, app storage or new auth flow. */
const monogatariTestShell = byId("monogatari-test-shell");
const monogatariTestOpen = byId("monogatari-test-open");
const monogatariTestClose = byId("monogatari-test-close");
const monogatariTestFrame = byId("monogatari-test-frame");
const monogatariTestTitle = byId("monogatari-test-title");
const episode01VariantToggle = byId("episode-01-variant-toggle");
let episode01Variant = "after";
let activeMonogatariEntry = monogatariTestOpen;
function syncEpisode01VariantToggle() {
  const revised = episode01Variant === "after";
  episode01VariantToggle.setAttribute("aria-checked", String(revised));
  episode01VariantToggle.setAttribute("aria-label",
    revised ? "第1話：採用版を表示中。旧差分に切り替える"
            : "第1話：旧差分を表示中。採用版に切り替える");
  episode01VariantToggle.classList.toggle("is-revised", revised);
}
function sendEpisode01Variant() {
  if (monogatariTestShell.hidden || activeMonogatariEntry !== episode01Open) return;
  monogatariTestFrame.contentWindow?.postMessage(
    { type: "kintore-episode-01-variant-v1", variant: episode01Variant },
    window.location.origin
  );
}
episode01VariantToggle.addEventListener("click", () => {
  if (monogatariTestShell.hidden || activeMonogatariEntry !== episode01Open) return;
  episode01Variant = episode01Variant === "before" ? "after" : "before";
  syncEpisode01VariantToggle();
  sendEpisode01Variant();
});
monogatariTestFrame.addEventListener("load", sendEpisode01Variant);
function closeMonogatariTest(fromPopstate = false) {
  if (monogatariTestShell.hidden) return;
  monogatariTestShell.hidden = true;
  monogatariTestFrame.src = "about:blank";
  episode01VariantToggle.hidden = true;
  document.body.classList.remove("is-story-test");
  byId("app-screen").inert = false;
  byId("app-header").inert = false;
  if (authorized && activePage === "events") activeMonogatariEntry.focus();
  if (!fromPopstate && ["#events-monogatari", "#events-episode-01"].includes(location.hash)) history.back();
}
monogatariTestOpen.addEventListener("click", () => {
  if (!authorized || activePage !== "events" ||
      !storyPlayer.hidden || !monogatariTestShell.hidden) return;
  activeMonogatariEntry = monogatariTestOpen;
  episode01VariantToggle.hidden = true;
  monogatariTestTitle.removeAttribute("aria-label");
  monogatariTestTitle.textContent = "Monogatari試作";
  monogatariTestShell.hidden = false;
  document.body.classList.add("is-story-test");
  byId("app-screen").inert = true;
  byId("app-header").inert = true;
  history.pushState({ screen: "events", monogatariTest: true }, "", "#events-monogatari");
  monogatariTestFrame.src = "/experiments/monogatari/index.html";
  monogatariTestClose.focus();
});
monogatariTestClose.addEventListener("click", () => closeMonogatariTest());
window.addEventListener("popstate", () => {
  if (!monogatariTestShell.hidden) closeMonogatariTest(true);
});
window.addEventListener("message", (event) => {
  if (monogatariTestShell.hidden || event.origin !== window.location.origin ||
      event.source !== monogatariTestFrame.contentWindow) return;
  const type = event.data?.type;
  if (type === "kintore-monogatari-finished-v1" ||
      type === "kintore-monogatari-close-request-v1") {
    closeMonogatariTest();
  }
});
document.addEventListener("keydown", (event) => {
  if (monogatariTestShell.hidden || event.key !== "Escape") return;
  event.preventDefault();
  closeMonogatariTest();
});

/* Episode 01: standalone Monogatari story; uses the same verified iframe shell. */
const episode01Open = byId("episode-01-open");
episode01Open.addEventListener("click", () => {
  if (!authorized || activePage !== "events" ||
      !storyPlayer.hidden || !monogatariTestShell.hidden) return;
  activeMonogatariEntry = episode01Open;
  episode01Variant = "after";
  syncEpisode01VariantToggle();
  episode01VariantToggle.hidden = false;
  monogatariTestTitle.textContent = "第1話";
  monogatariTestTitle.setAttribute("aria-label", "第1話 久しぶり、はじめまして。｜仮実装");
  monogatariTestShell.hidden = false;
  document.body.classList.add("is-story-test");
  byId("app-screen").inert = true;
  byId("app-header").inert = true;
  history.pushState({ screen: "events", episode01: true }, "", "#events-episode-01");
  monogatariTestFrame.src = "/experiments/monogatari/episode-01.html";
  monogatariTestClose.focus();
});
