import { chooseRecordSaveGroup, calendarConditionGroups, savedNumericSnapshot } from "./record-dialogue-rules.js";
import { createSavedTemplateEditor } from "./saved-template-editor.js?v=20261023-v01";
import { createTrainingMode } from "./training-mode.js?v=20261023-v02";
import { chooseSdTouchGroup, registerSdTap, chooseLineWithoutRepeat, isValidSdTouchData } from "./sd-touch-rules.js";
import { resolveCalendarIcon } from "./calendar-status.js";
import { REGULAR_SCENE_LOCATIONS, resolveGymVisuals, gymLeaseDuration } from "./gym-presence-ui.js?v=20261020-daily-private-v1";
import { tokyoDateKey, dailyPrivateOutfit, isPrivateOutfit, millisecondsUntilNextTokyoMidnight } from "./daily-private-outfit.js?v=20261020-daily-private-v1";
import { choosePortraitVariant } from "./home-portrait-selection.js?v=20261020-daily-private-v1";
import { pickDialogue, resolveDialoguePortrait } from "./shiori-dialogue-expression.js?v=20261022-v1";
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
const recordDateText = byId("record-date-text");
const recordDateCalendar = byId("record-date-calendar");
// Native :active に加え、Android のタッチ開始時点で押下色を即時適用する。
recordDateCalendar.addEventListener("pointerdown", (event) => {
  if (event.button === 0) recordDateCalendar.classList.add("is-pressed");
});
for (const eventName of ["pointerup", "pointercancel", "pointerleave", "blur"]) {
  recordDateCalendar.addEventListener(eventName, () => {
    recordDateCalendar.classList.remove("is-pressed");
  });
}
const saveNote = byId("workout-note");
const saveButton = byId("save-workout");
const deleteExerciseButton = byId("delete-exercise");
const saveFeedback = byId("save-feedback");
const list = byId("record-list");
const exerciseList = byId("exercise-list");
const addExerciseButton = byId("add-exercise");
const cancelWorkoutEdit = byId("cancel-workout-edit");
const dayPlanned = byId("day-planned");
const dayRest = byId("day-rest");
const dayAttended = byId("day-attended");
const calendarError = byId("calendar-error");
const exerciseEmpty = byId("exercise-empty");
const recordOverview = byId("record-overview-view");
const recordEditor = byId("record-editor-view");
const recordEditorHost = byId("record-editor-host");
const recordPlanOptions = [...document.querySelectorAll("#page-record .record-plan-option")];
const recordAttendanceStatus = byId("record-attendance-status");
const repeatTrigger = byId("repeat-trigger");
const repeatSheet = byId("repeat-sheet");
const repeatSheetClose = byId("repeat-sheet-close");
const repeatSheetBackdrop = byId("repeat-sheet-backdrop");
const repeatSheetForm = byId("repeat-sheet-form");
const repeatSheetPreview = byId("repeat-sheet-preview");
const repeatCadence = byId("repeat-cadence");
const repeatEnd = byId("repeat-end");
const repeatEndEnabled = byId("repeat-end-enabled");
const repeatEndField = byId("repeat-end-field");
const repeatScopePanel = byId("repeat-scope-panel");
const repeatScopeTitle = byId("repeat-scope-title");
const repeatScopeDescription = byId("repeat-scope-description");
const repeatScopeFeedback = byId("repeat-scope-feedback");
const repeatSave = byId("repeat-save");
const repeatDelete = byId("repeat-delete");
const repeatSummary = byId("repeat-summary");
const repeatFeedback = byId("repeat-feedback");
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
  "レッグカール":"脚", "クランチ":"腹筋",
  "ヴァーティカルトラクション":"背中", "アブドミナルクランチ":"腹筋",
  "ローワーバック":"背中", "ロータリートーソ":"腹筋",
  "アームエクステンション":"腕", "アダクター":"脚",
  "アブダクター":"脚", "ペクトラル":"胸",
  "ローロー":"背中", "レッグエクステンション":"脚", "マルチヒップ":"脚"
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
let calendarRestReady = false;
let recurrenceReady = false;
let recurrenceRules = [];
let repeatOccurrence = null;
let repeatReady = false;
let repeatLoading = false;
let repeatBusy = false;
let repeatRequestId = 0;
let repeatEditorSeriesId = null;
let repeatSheetOpen = false;
let repeatScopeMethod = null;
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
  loadRepeatForDate(date);
}
function selectRecordDate(date, { navigate = true } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < "2000-01-01" || date > "2100-12-31") return false;
  if (hasRecordChanges() &&
      !confirm("未保存の種目入力を破棄して、日付を切り替えますか？")) return false;
  closeExerciseEditor();
  setRecordHistoryVisible(false);
  closeRepeatSheet(false);
  const previousMonth = currentMonth();
  shownYear = Number(date.slice(0, 4));
  shownMonth = Number(date.slice(5, 7)) - 1;
  pendingRecordDate = date;
  resetWorkoutForm(date);
  saveFeedback.textContent = "";
  if (previousMonth !== currentMonth() || !recordsLoaded) {
    ++recordsRequestId;
    recordsLoaded = false;
    calendarAvailable = false;
    calendarRestReady = false;
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
    const iconState = resolveCalendarIcon({
      hasWorkout: completeDates.has(dateKey),
      planned: !!state?.planned,
      rest: !!state?.rest
    });
    const number = document.createElement("span");
    number.className = "calendar-day__number";
    number.textContent = String(day);
    const marker = document.createElement("span");
    marker.className = "calendar-day__status";
    marker.setAttribute("aria-hidden", "true");
    if (iconState !== "none") {
      marker.classList.add("is-" + iconState);
      marker.innerHTML = iconState === "rest" ? "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M2 4v16M2 8h16a4 4 0 0 1 4 4v8M2 17h20M6 8v9\"/></svg>" : "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"m6.5 6.5 11 11M4 10l6-6M2 8l6-6m12 18 6-6m-2 8 4-4\"/></svg>";
    }
    cell.append(number, marker);
    if (state?.attended) cell.classList.add("is-attended");
    if (iconState !== "none") cell.classList.add("is-" + iconState);
    if (sameDay(date, new Date())) {
      cell.classList.add("is-today");
      cell.setAttribute("aria-current", "date");
    }
    cell.setAttribute("aria-label", [
      dateKey,
      completeDates.has(dateKey) ? "筋トレ実施済み" : "",
      state?.planned ? "筋トレ予定あり" : "",
      state?.rest ? "休息日" : "",
      state?.attended ? "来館済み" : "",
      state?.repeat_conflict ? "繰り返し予定が重複しています" : ""
    ].filter(Boolean).join("、"));
    cell.addEventListener("click", () => showDay(dateKey));
    calendarGrid.appendChild(cell);
  }
  renderDayDetail();
}
function renderDayDetail() {
  const state = calendarDays.get(selectedDate);
  dayPlanned.checked = !!state?.planned;
  dayRest.checked = !!state?.rest;
  dayAttended.checked = !!state?.attended;
  dayPlanned.disabled = !authorized || !calendarAvailable || calendarSaving;
  dayRest.disabled = !authorized || !calendarAvailable || !calendarRestReady || calendarSaving;
  dayAttended.disabled = !authorized || !calendarAvailable || calendarSaving;
  byId("rest-migration-hint").hidden = !authorized || !calendarAvailable || calendarRestReady;
  const planStatus = dayRest.checked ? "rest" : dayPlanned.checked ? "gym" : "none";
  for (const option of recordPlanOptions) {
    option.setAttribute("aria-pressed", String(option.dataset.planStatus === planStatus));
    option.disabled = !authorized || !calendarAvailable || calendarSaving ||
      (option.dataset.planStatus === "rest" && !calendarRestReady);
  }
  recordAttendanceStatus.textContent = dayAttended.checked ? "来館済み" : "来館記録なし";
  renderRepeatEditor();
  calendarError.textContent = authorized && recordsLoaded && !calendarAvailable
    ? "予定・来館の保存にはD1の追加マイグレーション（0002）が必要です。"
    : calendarDays.get(selectedDate)?.repeat_conflict
      ? "複数の繰り返し予定が重複しています。内容の確認が必要です。"
      : calendarStatusDate === selectedDate ? calendarStatusMessage : "";
}

function setReady(ready) {
  dbReady = ready;
  saveDate.disabled = !ready;
  saveNote.disabled = !ready;
  saveButton.disabled = !ready;
  deleteExerciseButton.disabled = !ready;
  addExerciseButton.disabled = !ready;
  byId("record-template-open").disabled = !ready;
  for (const id of ["record-prev-day", "record-next-day", "record-history-open"]) {
    byId(id).disabled = !ready;
  }
  document.querySelectorAll("#exercise-list input, #exercise-list button, #record-editor-host input, #record-editor-host button").forEach(el => { el.disabled = !ready; });
  exerciseList.querySelectorAll(".exercise-card").forEach(card => {
    if (card.renderPrevious) card.renderPrevious();
  });
  document.querySelectorAll("#exercise-list .set-weight, #exercise-list .set-reps, #record-editor-host .set-weight, #record-editor-host .set-reps")
    .forEach(updateInlineStepButtons);
  renderRepeatEditor();
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

function addExercise(name = "", sets = [{ weight_kg: 0, reps: 10 }], note = "", saved = false, unitOverride = null) {
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
  card.unit = unitOverride || (saved && sets[0]?.entry_unit
    ? sets[0].entry_unit : catalogUnitFor(name));
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
  recordDateText.textContent = date.replaceAll("-", "/");
  selectedDate = date;
  saveNote.value = "";
  recordNoteDetails.open = false;
  exerciseList.replaceChildren();
  updateExerciseEmpty();
  renderDayDetail();
  markRecordBaseline();
  byId("record-linked-template").hidden=true;
  byId("record-template-form").hidden=true;
  repeatOccurrence = null;
  repeatReady = false;
  repeatLoading = true;
  ++repeatRequestId;
  repeatFeedback.textContent = "";
  repeatEditorSeriesId = null;
  repeatCadence.value = "weekly";
  repeatEnd.value = "";
  repeatEndEnabled.checked = false;
  repeatScopeFeedback.textContent = "";
  renderRepeatEditor();
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
    workouts.forEach(w => { if (Array.isArray(w.sets) && w.sets.length > 0) completeDates.add(w.performed_on); });
    calendarDays.clear();
    calendarAvailable = false;
    calendarRestReady = false;
    recurrenceReady = false;
    recurrenceRules = [];
    try {
      const calendar = await fetchJSON("/api/calendar?month=" + encodeURIComponent(month));
      if (!authorized || month !== currentMonth() || requestId !== recordsRequestId) return;
      for (const day of calendar.days || []) {
        calendarDays.set(day.on_date, { planned: !!day.planned, attended: !!day.attended, rest: !!day.rest,
          recurring: !!day.recurring, exception: day.exception ?? null,
          source:day.source??null,template_id:day.template_id??null,
          repeated_workout:!!day.repeated_workout,repeat_conflict:!!day.repeat_conflict });
      }
      recurrenceReady = calendar.recurrence_ready === true;
      recurrenceRules = Array.isArray(calendar.rules) ? calendar.rules : [];
      calendarAvailable = true;
      calendarRestReady = !!calendar.rest_ready;
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
    calendarRestReady = false;
    recurrenceReady = false;
    recurrenceRules = [];
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
for (const option of recordPlanOptions) {
  option.addEventListener("click", () => {
    if (!authorized || !calendarAvailable || calendarSaving) return;
    const status = option.dataset.planStatus;
    if (status === "rest" && !calendarRestReady) return;
    const current = dayRest.checked ? "rest" : dayPlanned.checked ? "gym" : "none";
    if (status === current) return;
    dayPlanned.checked = status === "gym";
    dayRest.checked = status === "rest";
    for (const button of recordPlanOptions) {
      button.setAttribute("aria-pressed", String(button === option));
    }
    persistDaySwitches();
  });
}
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
function describeRepeatCadence(cadence, every) {
  if (cadence === "daily") return every === 1 ? "毎日" : every + "日ごと";
  if (cadence === "monthly") return every === 1 ? "毎月" : every + "か月ごと";
  return every === 2 ? "隔週" : every === 1 ? "毎週" : every + "週ごと";
}
function syncRepeatEndField() {
  repeatEndField.hidden = !repeatEndEnabled.checked;
  repeatEnd.disabled = !repeatEndEnabled.checked || !authorized || !repeatReady || repeatBusy;
}
function renderRepeatEditor() {
  const ready = authorized && dbReady && repeatReady && !repeatLoading && !repeatBusy;
  const existing = !!repeatOccurrence;
  // Legacy snapshot repeats remain editable, but new registration uses weekday+menu.
  repeatTrigger.hidden = !existing || calendarDays.get(selectedDate)?.source==="weekly-template";
  repeatTrigger.disabled = !authorized || !dbReady;
  repeatSummary.textContent = repeatLoading ? "読み込み中…" :
    !repeatReady ? "利用不可・要確認" :
    existing ? (repeatOccurrence.kind === "rest" ? "休息日 ・ " : "ジム予定 ・ ") +
      describeRepeatCadence(repeatOccurrence.cadence,repeatOccurrence.every_n) +
      (repeatOccurrence.ends_on ? " ・ " + repeatOccurrence.ends_on.replaceAll("-","/") + "まで" : "") :
    "繰り返しなし";
  const cards = [...exerciseList.querySelectorAll(".exercise-card")];
  const totalSets = cards.reduce((sum,card)=>sum + card.rows.querySelectorAll(".exercise-set").length,0);
  repeatSheetPreview.textContent = !repeatReady
    ? (repeatLoading ? "設定を読み込み中…" : "繰り返し設定を利用できません。D1の0007適用・接続状態を確認してください。")
    : dayRest.checked ? "休息日を繰り返します。種目はコピーされません。"
    : dayPlanned.checked && !cards.length ? "ジムに行く予定を繰り返します（種目未登録）。"
    : cards.length ? selectedDate.replaceAll("-","/") + "の入力内容： " + cards.length + "種目・" + totalSets + "セット"
    : "先に「ジムに行く予定」か「休息日」を設定するか、種目を入力してください。";
  repeatDelete.hidden = !existing;
  repeatCadence.disabled = !ready;
  repeatEndEnabled.disabled = !ready;
  repeatSave.disabled = !ready;
  repeatDelete.disabled = !ready || !existing;
  if (existing && repeatEditorSeriesId !== repeatOccurrence.id) {
    repeatEditorSeriesId = repeatOccurrence.id;
    repeatCadence.value = repeatOccurrence.cadence === "weekly" && repeatOccurrence.every_n === 2
      ? "biweekly" : repeatOccurrence.cadence;
    repeatEnd.value = repeatOccurrence.ends_on || "";
    repeatEndEnabled.checked = !!repeatOccurrence.ends_on;
  }
  repeatSave.textContent = existing ? "変更を保存" : "この内容で繰り返す";
  repeatEnd.min = selectedDate;
  syncRepeatEndField();
}
function setRepeatFeedback(message) {
  repeatFeedback.textContent = message;
  repeatScopeFeedback.textContent = message;
}
function closeRepeatSheet(restoreFocus = true) {
  if (!repeatSheetOpen) return;
  repeatSheetOpen = false;
  repeatScopeMethod = null;
  repeatSheet.hidden = true;
  repeatScopePanel.hidden = true;
  repeatSheetForm.hidden = false;
  if (restoreFocus && authorized && activePage === "record") repeatTrigger.focus();
}
function openRepeatSheet() {
  if (!authorized || !dbReady) return;
  repeatScopeMethod = null;
  repeatSheetForm.hidden = false;
  repeatScopePanel.hidden = true;
  repeatScopeFeedback.textContent = "";
  repeatSheet.hidden = false;
  repeatSheetOpen = true;
  renderRepeatEditor();
  repeatSheetClose.focus();
}
function chooseRepeatScope(method) {
  if (repeatBusy || !repeatOccurrence) return;
  if (method === "PATCH") {
    try { snapshotRepeatDay(); }
    catch(error) {setRepeatFeedback(error.message);return;}
    if (repeatEndEnabled.checked && !repeatEnd.value) {
      setRepeatFeedback("終了日を指定してください。");
      return;
    }
  }
  repeatScopeMethod = method;
  repeatSheetForm.hidden = true;
  repeatScopePanel.hidden = false;
  repeatScopeTitle.textContent = method === "DELETE" ? "削除する範囲" : "変更する範囲";
  repeatScopeDescription.textContent = method === "DELETE"
    ? "指定した範囲の繰り返し予定を削除します。実際の筋トレ記録は残ります。"
    : "登録済みの予定をどこまで変更するか選んでください。「この予定のみ」は周期・終了日を変更しません。";
  for (const button of repeatScopePanel.querySelectorAll("[data-repeat-scope]")) {
    const title = button.querySelector("strong");
    title.textContent = method === "DELETE" ?
      ({only:"今回だけ削除",future:"この予定以降を削除",all:"すべて削除"}[button.dataset.repeatScope]) :
      ({only:"この予定のみ",future:"この予定以降",all:"すべての予定"}[button.dataset.repeatScope]);
    button.classList.toggle("is-delete",method === "DELETE");
  }
  repeatScopeFeedback.textContent = "";
  repeatScopePanel.querySelector('[data-repeat-scope="only"]').focus();
}
repeatTrigger.addEventListener("click",openRepeatSheet);
repeatSheetClose.addEventListener("click",()=>closeRepeatSheet());
repeatSheetBackdrop.addEventListener("click",()=>closeRepeatSheet());
repeatEndEnabled.addEventListener("change",()=>{
  if (!repeatEndEnabled.checked) repeatEnd.value = "";
  syncRepeatEndField();
});
byId("repeat-scope-back").addEventListener("click",()=>{
  repeatScopeMethod = null;
  repeatScopePanel.hidden = true;
  repeatSheetForm.hidden = false;
  repeatSave.focus();
});
repeatScopePanel.querySelectorAll("[data-repeat-scope]").forEach(button=>{
  button.addEventListener("click",()=>{
    if (repeatScopeMethod) submitRepeatChange(repeatScopeMethod,button.dataset.repeatScope);
  });
});
document.addEventListener("keydown",event=>{
  if (!repeatSheetOpen) return;
  if (event.key === "Escape") {
    event.preventDefault(); closeRepeatSheet(); return;
  }
  if (event.key !== "Tab") return;
  const focusable = [...repeatSheet.querySelectorAll('button:not([disabled]), select:not([disabled]), input:not([disabled])')]
    .filter(el=>el.tabIndex>=0 && !el.closest("[hidden]"));
  if (!focusable.length) return;
  const first=focusable[0],last=focusable[focusable.length-1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault();last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault();first.focus(); }
});

// Load the plan separately from performed sessions: previews are never marked as saved workouts.
async function loadRepeatForDate(date) {
  const requestId = ++repeatRequestId;
  const currentState=calendarDays.get(date);
  // A linked weekly plan supplies an unsaved daily draft, not a repeated snapshot.
  repeatTrigger.hidden=currentState?.source==="weekly-template";
  if(currentState?.source==="weekly-template"){
    repeatOccurrence=null;repeatReady=false;repeatLoading=false;
    renderRepeatEditor();
    const label=byId("record-linked-template");
    label.hidden=true;
    if(currentState.planned && currentState.template_id){
      try {
        const data=await fetchJSON("/api/training-setup/day?date="+encodeURIComponent(date));
        if(!authorized||selectedDate!==date||requestId!==repeatRequestId||
           hasRecordChanges()||calendarDays.get(date)?.source!=="weekly-template")return;
        const template=data.template;
        if(!template || template.id!==currentState.template_id)return;
        const existing=new Set([...exerciseList.querySelectorAll(".exercise-card")]
          .map(card=>normalizeExerciseName(card.nameInput.value)));
        for(const item of template.items||[]){
          const name=normalizeExerciseName(item.name);
          if(!name||existing.has(name))continue;
          existing.add(name);
          const rows=Array.from({length:item.sets},()=>({
            weight_kg:0,reps:item.unit==="seconds"?0:10,
            duration_seconds:item.unit==="seconds"?30:0
          }));
          addExercise(name,rows,item.note||"",false,item.unit);
        }
        label.textContent="自動適用： "+template.title+"（重量・回数は前回値を参照）";
        label.hidden=false;
        markRecordBaseline();
      }catch(error){
        if(error.status===401)setAuthenticated(false);
      }
    }
    return;
  }
  byId("record-linked-template").hidden=true;
  repeatOccurrence = null;
  repeatReady = false;
  repeatLoading = true;
  renderRepeatEditor();
  try {
    const response = await fetchJSON("/api/repeat?date=" + encodeURIComponent(date));
    if (!authorized || selectedDate !== date || requestId !== repeatRequestId) return;
    repeatReady = response.ready === true;
    const occurrences = Array.isArray(response.occurrences) ? response.occurrences : [];
    repeatOccurrence = occurrences.length === 1 ? occurrences[0] : null;
    if (occurrences.length > 1) {
      repeatReady = false; // Do not silently overwrite one of multiple overlapping series.
      repeatFeedback.textContent = "複数の繰り返し予定が重複しています。編集はできません。";
    }
    const dayState=calendarDays.get(date);
    if (repeatReady && !hasRecordChanges() &&
        (!dayState || dayState.source==="repeat") &&
        !dayState?.rest && dayState?.exception !== 0) {
      const existingNames = new Set([...exerciseList.querySelectorAll(".exercise-card")]
        .map(card => normalizeExerciseName(card.nameInput.value)));
      for (const instance of occurrences) for (const item of instance.exercises || []) {
        const name = normalizeExerciseName(item.name);
        if (!name || existingNames.has(name)) continue;
        existingNames.add(name);
        addExercise(name,item.sets,item.note,false,item.unit);
      }
      markRecordBaseline();
    }
  } catch (error) {
    if (!authorized || selectedDate !== date || requestId !== repeatRequestId) return;
    if (error.status === 401) { setAuthenticated(false); return; }
    repeatFeedback.textContent = "繰り返し予定を取得できませんでした。";
  } finally {
    if (selectedDate === date && requestId === repeatRequestId) {
      repeatLoading = false;
      renderRepeatEditor();
    }
  }
}

function snapshotRepeatDay() {
  if (activeExerciseCard) closeExerciseEditor();
  if (dayRest.checked) return {kind:"rest",exercises:[]};
  const exercises=[];
  for (const card of exerciseList.querySelectorAll(".exercise-card")) {
    const name=normalizeExerciseName(card.nameInput.value);
    if (!name) throw new Error("種目名を確認してください。");
    exercises.push({name,unit:card.unit,note:card.noteValue || "",
      sets:collectExerciseSets(card)});
  }
  if (!exercises.length && !dayPlanned.checked)
    throw new Error("先にジムの予定・休息日を設定するか、種目を入力してください。");
  return {kind:"gym",exercises};
}
async function submitRepeatChange(method, chosenScope = null) {
  if (!authorized || !dbReady || !repeatReady || repeatBusy || repeatLoading) return;
  let snapshot=null;
  if (method !== "DELETE") {
    try { snapshot=snapshotRepeatDay(); }
    catch (error) {setRepeatFeedback(error.message);return;}
  }
  const date=selectedDate, instance=repeatOccurrence;
  const scope=instance ? chosenScope : null;
  if (instance && !scope) return;
  const rawCadence=repeatCadence.value;
  const cadence=rawCadence==="biweekly" ? "weekly" : rawCadence;
  const every_n=rawCadence==="biweekly" ? 2 : 1;
  const end_on=repeatEndEnabled.checked ? repeatEnd.value || null : null;
  if (method !== "DELETE" && repeatEndEnabled.checked && !end_on) {
    setRepeatFeedback("終了日を指定してください。"); return;
  }
  if (!instance && end_on && end_on < date) {
    setRepeatFeedback("終了日は開始日以降にしてください。");
    return;
  }
  const target = instance ? "/api/repeat/" + instance.id : "/api/repeat";
  repeatBusy=true;
  setRepeatFeedback("保存中…");
  renderRepeatEditor();
  try {
    await fetchJSON(target,{method:instance ? method : "POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(instance ? {date,scope,
        ...(snapshot || {}),
        ...(method !== "DELETE" && scope !== "only" ? {cadence,every_n,end_on} : {})} :
        {start_on:date,cadence,every_n,end_on,...snapshot})});
    if (!authorized || selectedDate !== date) return;
    await loadWorkouts();
    if (authorized && selectedDate === date) {
      hydrateStoredRecordForDate(date);
      closeRepeatSheet(false);
      byId("record-overview-feedback").textContent = method==="DELETE" ?
        "繰り返し予定を削除しました。" : "繰り返し予定を保存しました。";
    }
  } catch (error) {
    if (error.status===401) { setAuthenticated(false); return; }
    setRepeatFeedback(error.status===503 ? "予定テーブルの適用状態を確認してください。" :
      error.status===409 ? "既存の繰り返し予定と重複しています。対象の日付・周期を確認してください。" :
      "繰り返し設定を保存できませんでした。");
  } finally {
    repeatBusy=false;
    if (authorized) renderRepeatEditor();
  }
}
repeatSave.addEventListener("click",()=>repeatOccurrence ? chooseRepeatScope("PATCH") : submitRepeatChange("PATCH"));
repeatDelete.addEventListener("click",()=>chooseRepeatScope("DELETE"));

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
  const rest = calendarRestReady ? dayRest.checked : undefined;
  const canRefreshDraft = !hasRecordChanges();
  calendarSaving = true;
  calendarStatusDate = date;
  calendarStatusMessage = "保存中…";
  calendarError.textContent = calendarStatusMessage;
  dayPlanned.disabled = true;
  dayRest.disabled = true;
  dayAttended.disabled = true;
  for (const option of recordPlanOptions) option.disabled = true;
  try {
    const result = await fetchJSON("/api/calendar/" + encodeURIComponent(date), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planned, attended, ...(rest === undefined ? {} : { rest }) })
    });
    if (date.slice(0, 7) === currentMonth()) {
      if (result.planned || result.attended || result.rest || result.exception !== null ||
          result.repeated_workout) calendarDays.set(date, result);
      else calendarDays.delete(date);
    }
    if (selectedDate===date && canRefreshDraft && !hasRecordChanges()) {
      hydrateStoredRecordForDate(date);
    }
    calendarStatusMessage = "";
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
async function savePlanAction(path, body, successText) {
  if (!authorized || !calendarAvailable || !recurrenceReady || calendarSaving) return false;
  const date = selectedDate;
  calendarSaving = true;
  calendarStatusDate = date;
  calendarStatusMessage = "保存中…";
  renderDayDetail();
  try {
    await fetchJSON(path, {
      method: path.endsWith("/move") ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    // Reload the month's merged occurrences; a move may also affect another month.
    await loadWorkouts();
    calendarStatusMessage = successText;
    return true;
  } catch (error) {
    if (error.status === 401) {
      setAuthenticated(false);
      loginFeedback.textContent = "ログインの有効期限が切れました。もう一度ログインしてください。";
      return false;
    }
    calendarStatusMessage = error.status === 409 ? "変更先に既に予定があるか、元の予定がなくなっています。" :
      error.status === 503 ? "繰り返し予定にはD1の0005マイグレーションが必要です。" :
      "予定を変更できませんでした。";
    return false;
  } finally {
    calendarSaving = false;
    if (authorized) renderCalendar();
  }
}
dayAttended.addEventListener("change", persistDaySwitches);
// 年月表示を押すと年と月を直接選べる。年のプレビューだけではDBの取得を行わない。
const calendarMonthTrigger = byId("calendar-month-trigger");
const calendarMonthPicker = byId("calendar-month-picker");
const calendarYearSelect = byId("calendar-year-select");
const calendarYearPrev = byId("calendar-year-prev");
const calendarYearNext = byId("calendar-year-next");
const calendarMonthOptions = byId("calendar-month-options");
let pickerYear = shownYear;
for (let year = 2000; year <= 2100; year++) {
  const option = document.createElement("option");
  option.value = String(year);
  option.textContent = year + "年";
  calendarYearSelect.appendChild(option);
}
const calendarMonthButtons = [];
for (let month = 0; month < 12; month++) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "calendar-month-option";
  button.textContent = month + 1 + "月";
  button.setAttribute("aria-label", month + 1 + "月を表示");
  button.addEventListener("click", () => {
    const offset = (pickerYear - shownYear) * 12 + month - shownMonth;
    setCalendarMonthPicker(false, true);
    if (offset !== 0) changeMonth(offset);
  });
  calendarMonthOptions.appendChild(button);
  calendarMonthButtons.push(button);
}
function renderCalendarMonthPicker() {
  calendarYearSelect.value = String(pickerYear);
  calendarYearPrev.disabled = pickerYear <= 2000;
  calendarYearNext.disabled = pickerYear >= 2100;
  calendarMonthButtons.forEach((button, month) => {
    const selected = pickerYear === shownYear && month === shownMonth;
    button.setAttribute("aria-pressed", String(selected));
  });
}
function setCalendarMonthPicker(open, restoreFocus = false) {
  if (open && !authorized) return;
  if (open) {
    pickerYear = shownYear;
    renderCalendarMonthPicker();
  }
  calendarMonthPicker.hidden = !open;
  calendarMonthTrigger.setAttribute("aria-expanded", String(open));
  if (open) calendarYearSelect.focus();
  else if (restoreFocus && activePage === "calendar") calendarMonthTrigger.focus();
}
calendarMonthTrigger.addEventListener("click", () => setCalendarMonthPicker(calendarMonthPicker.hidden));
calendarYearSelect.addEventListener("change", () => {
  pickerYear = Number(calendarYearSelect.value);
  renderCalendarMonthPicker();
});
for (const [button, delta] of [[calendarYearPrev, -1], [calendarYearNext, 1]]) {
  button.addEventListener("click", () => {
    pickerYear = Math.max(2000, Math.min(2100, pickerYear + delta));
    renderCalendarMonthPicker();
  });
}
byId("calendar-month-current").addEventListener("click", () => {
  const today = new Date();
  const offset = (today.getFullYear() - shownYear) * 12 + today.getMonth() - shownMonth;
  setCalendarMonthPicker(false, true);
  if (offset !== 0) changeMonth(offset);
});
document.addEventListener("click", (event) => {
  if (!calendarMonthPicker.hidden &&
      !calendarMonthPicker.contains(event.target) &&
      !calendarMonthTrigger.contains(event.target)) setCalendarMonthPicker(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || calendarMonthPicker.hidden) return;
  event.preventDefault();
  setCalendarMonthPicker(false, true);
});

function changeMonth(offset) {
  setCalendarMonthPicker(false);
  calendarDialogueUserOverride = false; // 月移動は新しい明示操作
  const result = new Date(shownYear, shownMonth + offset, 1);
  shownYear = result.getFullYear();
  shownMonth = result.getMonth();
  selectedDate = currentMonth() === todayISO().slice(0, 7) ? todayISO() : currentMonth() + "-01";
  ++recordsRequestId;
  recordsLoaded = false;
  calendarAvailable = false;
  calendarRestReady = false;
  recurrenceReady = false;
  recurrenceRules = [];
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

const pages = new Set(["home", "calendar", "record", "training", "talk", "notices", "analysis", "exercise-settings", "events", "gallery", "settings"]);

// 背景はGitHubの固定素材。場所はログインのたびにランダム選択し、端末には保存しない。
const sceneLocations = ["gym", ...REGULAR_SCENE_LOCATIONS];
const sceneLocationNames = { gym: "ジム", city: "街", campus: "大学", room: "栞の部屋" };
const sceneTimeNames = { morning: "朝", day: "昼", night: "夜" };
const sceneBackground = byId("scene-background");
const sceneLocationSelect = byId("scene-location");
const sceneStatus = byId("scene-status");
const sceneTimeSelect = byId("scene-time");
let sceneTimeOverride = "auto";
let sceneLocation = null;
let sceneTime = null;
// All Wi-Fi state stays in memory; server confirms a renewable 30-minute lease.
let gymPresenceActive = false;
let gymPresenceLeaseUntil = 0;
let gymPresenceRequestId = 0;
let gymPresencePending = null;
let gymPreviewOverride = false;
function currentGymVisuals() {
  return resolveGymVisuals({
    connected: gymPresenceActive,
    preview: gymPreviewOverride,
    scene: sceneLocation
  });
}
function isGymModeActive() { return currentGymVisuals().automatic; }
function startManualGymPreview() {
  const wasAutomatic = isGymModeActive();
  gymPreviewOverride = true;
  if (wasAutomatic) {
    refreshScene();
    refreshOutfit({ reroll: true });
    if (authorized && activePage === "home") showHomeGreeting();
  }
}
function updateGymPresence(connected, leaseMs = 0) {
  const wasAutomatic = isGymModeActive();
  gymPresenceActive = connected === true && leaseMs > 0;
  gymPresenceLeaseUntil = gymPresenceActive ? performance.now() + leaseMs : 0;
  if (wasAutomatic !== isGymModeActive()) {
    refreshScene();
    refreshOutfit({ reroll: true });
    if (authorized && activePage === "home") showHomeGreeting();
  }
}
async function refreshGymPresence() {
  if (!authorized || document.hidden) return;
  if (gymPresencePending) return gymPresencePending;
  const id = ++gymPresenceRequestId;
  const request = (async () => {
    try {
      const response = await fetchJSON("/api/gym-presence");
      if (id !== gymPresenceRequestId || !authorized) return;
      const leaseMs = gymLeaseDuration(response);
      updateGymPresence(leaseMs > 0, leaseMs);
    } catch (error) {
      if (id !== gymPresenceRequestId || !authorized) return;
      if (error.status === 401) {
        setAuthenticated(false);
      } else if (gymPresenceActive && performance.now() >= gymPresenceLeaseUntil) {
        updateGymPresence(false);
      }
    }
  })();
  gymPresencePending = request;
  void request.finally(() => { if (gymPresencePending === request) gymPresencePending = null; });
  return request;
}

function sceneTimeSlot(hour) {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "day";
  return "night";
}
function randomSceneLocation(excludeCurrent = false) {
  const candidates = excludeCurrent
    ? REGULAR_SCENE_LOCATIONS.filter((location) => location !== sceneLocation)
    : REGULAR_SCENE_LOCATIONS;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
function refreshScene() {
  if (!authorized || !sceneLocation) return;
  syncDailyPrivateOutfit();
  const location = currentGymVisuals().scene;
  const time = sceneTimeOverride === "auto" ? sceneTimeSlot(new Date().getHours()) : sceneTimeOverride;
  if (time !== sceneTime || sceneBackground.dataset.location !== location) {
    const url = "/assets/backgrounds/" + location + "-" + time + ".webp";
    sceneBackground.style.backgroundImage = 'url("' + url + '")';
    sceneBackground.dataset.location = location;
    sceneBackground.dataset.time = time;
    sceneTime = time;
  }
  sceneLocationSelect.value = location;
  sceneTimeSelect.value = sceneTimeOverride;
  sceneStatus.textContent = "現在： " + sceneLocationNames[location] + "・" + sceneTimeNames[time] + (isGymModeActive() ? "（ジムWi-Fi連動）" : sceneTimeOverride === "auto" ? "（端末時刻）" : "（テスト固定）");
}
function setSceneLocation(nextLocation) {
  if (!authorized || !sceneLocations.includes(nextLocation)) return;
  sceneLocation = nextLocation;
  if (!["city", "campus"].includes(nextLocation)) {
    privateExpressionMode = "random";
    privateExpressionSelect.value = "random";
  }
  startManualGymPreview();
  refreshScene();
  refreshOutfit({ reroll: true });
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
setInterval(() => {
  if (!authorized) return;
  if (gymPresenceActive && performance.now() >= gymPresenceLeaseUntil) updateGymPresence(false);
  if (!document.hidden) void refreshGymPresence();
}, 30 * 1000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refreshScene();
    void refreshGymPresence();
  }
});
window.addEventListener("focus", () => { refreshScene(); void refreshGymPresence(); });
window.addEventListener("pageshow", () => { refreshScene(); void refreshGymPresence(); });


// ホームの既存セリフ候補を必要時だけ取得する。端末には永続保存しない。
const homeDialogue = byId("shiori-home-dialogue");
const shioriHomeTouch = byId("shiori-home-touch");
const shioriHomeArt = shioriHomeTouch.querySelector(".character-layer__art");

// 衣装種別は場所から、私服Verは日本時間の日付から決定する。検品用には表情だけを一時指定する。
const outfitSelect = byId("shiori-outfit");
const outfitStatus = byId("shiori-outfit-status");
const privateExpressionWrap = byId("shiori-private-expression-wrap");
const privateExpressionSelect = byId("shiori-private-expression");
const privateTrialStatus = byId("shiori-private-trial-status");
// 衣装／表情は既存の固定素材を使用する。
// ジムは第1話の採用済み5表情と追加3表情、部屋着は7表情をホームでもランダム切替する。
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
const trainingVariantDefinitions = [
  { id: "normal", label: "通常", file: "normal-alt1-before" },
  { id: "thinking", label: "考える", file: "thinking-alt1" },
  { id: "surprised", label: "驚き", file: "surprised-alt1" },
  { id: "smile", label: "笑顔", file: "smile-alt1" },
  { id: "playful", label: "いたずら", file: "playful-alt1" },
  { id: "soft_smile", label: "優しい微笑み", file: "soft_smile-alt1" },
  { id: "wry_smile", label: "困り笑い", file: "wry_smile-alt1" },
  { id: "closed_eye_smile", label: "目を閉じた笑顔", file: "closed_eye_smile-alt1" }
];
const homePortraits = {
  training: trainingVariantDefinitions.map(({ id, label, file }) => ({
    id,
    label,
    outfit: "training",
    src: `/assets/shiori/gim/v1/shiori-gim-story-${file}.webp`,
    width: 1086,
    height: 1448,
    layout: trainingLayout
  })),
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
  })),
  // v1 is the original private set stored in home/v2. Preserve the files in place.
  // Both 1086x1448 sets share the same home layout, without per-expression offsets.
  "private-v1": ["normal", "smile", "thinking", "surprised", "playful"].map((id) => ({
    id, label: ({ normal: "通常", smile: "笑顔", thinking: "考える", surprised: "驚き", playful: "いたずら" })[id],
    outfit: "private-v1",
    src: `/assets/shiori/home/v2/shiori-private-home-${id}-r1.webp`,
    width: 1086, height: 1448, layout: null
  })),
  "private-v2": ["normal", "smile", "thinking", "surprised", "playful", "soft_smile", "closed_eye_smile", "sleepy", "shy"].map((id) => ({
    id, label: ({ normal: "通常", smile: "笑顔", thinking: "考える", surprised: "驚き", playful: "いたずら", soft_smile: "優しい微笑み", closed_eye_smile: "目を閉じた笑顔", sleepy: "眠そう", shy: "控えめな照れ" })[id],
    outfit: "private-v2",
    src: `/assets/shiori/town/v2/shiori-town-home-${id}-r1.webp`,
    width: 1086, height: 1448, layout: null
  }))
};
let privateExpressionMode = "random";
let privateTrialReady = null;
let privateTrialCheck = null;
let currentPortrait = null;
let currentHomeExpression = "normal";
const failedHomePortraits = new Set();

function applyHomePortrait(variant) {
  // CSS の個別補正を更新してから画像を切り替え、切り替え時のサイズ跳びを抑える。
  shioriHomeTouch.style.aspectRatio = variant.width + " / " + variant.height;
  shioriHomeTouch.dataset.outfit = variant.outfit;
  shioriHomeTouch.dataset.variant = variant.id;
  for (const size of ["base", "narrow", "short"]) {
    const layout = variant.layout?.[size];
    for (const [key, value] of Object.entries({
      scale: layout?.scale, origin: layout?.origin, bottom: layout?.bottom
    })) {
      const property = `--home-character-${key}-${size}`;
      if (value === undefined) shioriHomeTouch.style.removeProperty(property);
      else shioriHomeTouch.style.setProperty(property, String(value));
    }
  }
  shioriHomeArt.width = variant.width;
  shioriHomeArt.height = variant.height;
  if (shioriHomeArt.getAttribute("src") !== variant.src) shioriHomeArt.src = variant.src;
  outfitSelect.value = currentGymVisuals().outfit;
  outfitStatus.textContent = variant.outfit === "roomwear"
    ? `部屋着・${variant.label}を表示中（セリフ連動）。`
    : isPrivateOutfit(variant.outfit)
      ? `私服${variant.outfit.endsWith("v1") ? "v1" : "v2"}（本日固定）・${variant.label}（表情${privateExpressionMode === "random" ? "セリフ連動" : "検品指定"}）。`
      : `トレーニングウェア・${variant.label}を表示中（${isGymModeActive() ? "ジムWi-Fi連動" : "開発プレビュー"}、表情はセリフ連動）。`;
}

// 表情はセリフに固定し、衣装に差分がなければ代替表情を使う。
function refreshOutfit({ reroll = false } = {}) {
  const activeOutfit = currentGymVisuals().outfit;
  outfitSelect.value = activeOutfit;
  privateExpressionWrap.hidden = !isPrivateOutfit(activeOutfit);
  const candidates = homePortraits[activeOutfit]
    .filter((variant) => !failedHomePortraits.has(variant.src));
  if (!candidates.length) {
    // Never use a different clothing version as an image-error fallback.
    currentPortrait = null;
    shioriHomeArt.removeAttribute("src");
    outfitStatus.textContent = "この衣装の画像を読み込めませんでした。";
    return;
  }
  const fixed = isPrivateOutfit(activeOutfit) && privateExpressionMode !== "random"
    ? candidates.find((variant) => variant.id === privateExpressionMode)
    : null;
  currentPortrait = fixed || resolveDialoguePortrait(currentHomeExpression, activeOutfit, homePortraits, failedHomePortraits);
  applyHomePortrait(currentPortrait);
}

let lastPrivateDayKey = tokyoDateKey();
function syncDailyPrivateOutfit() {
  const today = tokyoDateKey();
  if (today === lastPrivateDayKey) return;
  lastPrivateDayKey = today;
  privateExpressionMode = "random";
  privateExpressionSelect.value = "random";
  privateTrialReady = null;
  if (authorized) refreshOutfit({ reroll: true });
  window.dispatchEvent(new Event("shiori:daily-private-changed"));
}
function scheduleTokyoMidnight() {
  setTimeout(() => {
    syncDailyPrivateOutfit();
    scheduleTokyoMidnight();
  }, millisecondsUntilNextTokyoMidnight() + 100);
}
scheduleTokyoMidnight();

// ギャラリーからの「ホームで試す」は私服に対応する街プレビューへ移る。
function previewPrivateExpression(expression, outfit) {
  if (!authorized || outfit !== dailyPrivateOutfit() ||
      privateTrialReady !== outfit || !homePortraits[outfit]?.some(({ id }) => id === expression)) return;
  if (!["city", "campus"].includes(sceneLocation)) sceneLocation = "city";
  privateExpressionMode = expression;
  privateExpressionSelect.value = expression;
  startManualGymPreview();
  refreshScene();
  refreshOutfit({ reroll: true });
}

function verifyPrivateTrialAssets(outfit = dailyPrivateOutfit()) {
  if (outfit !== dailyPrivateOutfit() || !isPrivateOutfit(outfit)) return Promise.resolve(false);
  if (privateTrialReady === outfit) return Promise.resolve(true);
  if (privateTrialCheck) return privateTrialCheck;
  privateTrialStatus.textContent = "当日の私服素材を確認中…";
  privateTrialCheck = Promise.all(homePortraits[outfit].map(({ src }) => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth === 1086 && image.naturalHeight === 1448);
    image.onerror = () => resolve(false);
    image.src = src;
  }))).then((checks) => {
    const ok = checks.every(Boolean) && outfit === dailyPrivateOutfit();
    privateTrialReady = ok ? outfit : null;
    if (ok) {
      for (const { src } of homePortraits[outfit]) failedHomePortraits.delete(src);
    }
    privateTrialStatus.textContent = ok
      ? `当日の私服${homePortraits[outfit].length}表情を確認しました。衣装Verは日本時間の日付で固定されています。`
      : "私服素材が不足または破損しています。ギャラリーからの試験操作は利用できません。";
    return ok;
  }).finally(() => { privateTrialCheck = null; });
  return privateTrialCheck;
}

privateExpressionSelect.addEventListener("change", () => {
  const activeOutfit = currentGymVisuals().outfit;
  if (!authorized || !isPrivateOutfit(activeOutfit)) return;
  const next = privateExpressionSelect.value;
  if (next !== "random" && !homePortraits[activeOutfit].some(({ id }) => id === next)) return;
  privateExpressionMode = next;
  startManualGymPreview();
  refreshOutfit({ reroll: true });
});
window.addEventListener("shiori:try-private", async (event) => {
  const outfit = event.detail?.outfit;
  const expression = event.detail?.expression;
  if (!authorized || outfit !== dailyPrivateOutfit() ||
      !homePortraits[outfit]?.some(({ id }) => id === expression)) {
    window.dispatchEvent(new CustomEvent("shiori:private-result", { detail: { ok: false } }));
    return;
  }
  const ok = await verifyPrivateTrialAssets(outfit);
  if (!authorized || outfit !== dailyPrivateOutfit()) return;
  window.dispatchEvent(new CustomEvent("shiori:private-result", { detail: { ok } }));
  if (!ok) return;
  previewPrivateExpression(expression, outfit);
  setScreen("home");
});
shioriHomeArt.addEventListener("error", () => {
  const outfit = currentGymVisuals().outfit;
  if (!homePortraits[outfit] || !currentPortrait
    || currentPortrait.outfit !== outfit || currentPortrait.src !== shioriHomeArt.getAttribute("src")) return;
  failedHomePortraits.add(currentPortrait.src);
  const failedOutfit = currentPortrait.outfit;
  if (isPrivateOutfit(failedOutfit)) {
    privateTrialReady = null;
    privateExpressionMode = "random";
    privateExpressionSelect.value = "random";
    privateTrialStatus.textContent = "私服画像の読み込みに失敗しました。同じ衣装の別表情を試します。";
  }
  refreshOutfit({ reroll: true });
  if (!currentPortrait) {
    outfitStatus.textContent = isPrivateOutfit(failedOutfit)
      ? "当日の私服画像を読み込めませんでした。別Verには切り替えません。"
      : failedOutfit === "training"
        ? "トレーニングウェア8表情を読み込めませんでした。"
        : "部屋着の画像を読み込めませんでした。場所に合わない衣装へは切り替えません。";
  }
});
const devPanel = byId("dev-settings-panel");
const devPanelToggle = byId("dev-settings-open");
function setDevPanelOpen(open, restoreFocus = true) {
  if (open && (!authorized || activePage !== "home")) return;
  devPanel.hidden = !open;
  devPanelToggle.setAttribute("aria-expanded", String(open));
  devPanelToggle.setAttribute("aria-label", open ? "開発設定を閉じる" : "開発設定を開く");
  if (open) {
    void verifyPrivateTrialAssets(dailyPrivateOutfit());
    sceneLocationSelect.focus({ preventScroll: true });
  }
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
  gymPreviewOverride = false;
  sceneLocation = randomSceneLocation();
  privateExpressionMode = "random";
  privateExpressionSelect.value = "random";
  privateExpressionWrap.hidden = true;
  refreshScene();
  refreshOutfit({ reroll: true });
  if (activePage === "home") showHomeGreeting();
  byId("dev-settings-feedback").textContent = "自動連動に戻しました。衣装は場所に合わせて切り替わります。";
});
[sceneLocationSelect, sceneTimeSelect].forEach((control) => {
  control.addEventListener("change", () => { byId("dev-settings-feedback").textContent = ""; });
});
byId("scene-reroll").addEventListener("click", () => { byId("dev-settings-feedback").textContent = ""; });
let greetingData = null;
let greetingLoading = null;
let gymGreetingData = null;
let gymGreetingLoading = null;
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

// Wi-Fi接続が確定した場合にだけ使う試験セリフ。正式な台本採用とは区別する。
async function ensureGymGreetingData() {
  if (gymGreetingData) return gymGreetingData;
  if (!gymGreetingLoading) {
    gymGreetingLoading = fetch("/data/shiori-gym-greetings-v0.1.json", { cache: "force-cache" })
      .then(response => {
        if (!response.ok) throw new Error("gym_greetings_unavailable");
        return response.json();
      })
      .then(data => {
        if (!Array.isArray(data?.anytime) || !data.anytime.some(line => typeof line === "string" && line.trim())) {
          throw new Error("invalid_gym_greetings");
        }
        gymGreetingData = data;
        return data;
      })
      .finally(() => { gymGreetingLoading = null; });
  }
  return gymGreetingLoading;
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

let lastHomeGreetingId = "";
let greetingRequestId = 0;

// 画像へのタップ／キーボードの操作で、一言と控えめなリアクションを返す。
shioriHomeTouch.addEventListener("click", () => {
  if (!authorized || activePage !== "home") return;
  shioriHomeTouch.classList.remove("is-poked");
  // 同じアニメーションを連続タップでも先頭から再生する。
  void shioriHomeArt.offsetWidth;
  shioriHomeTouch.classList.add("is-poked");
  syncDailyPrivateOutfit();
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
    const inGym = isGymModeActive();
    if (inGym) await ensureGymGreetingData();
    else await ensureGreetingData();
    if (!authorized || activePage !== "home" || requestId !== greetingRequestId) return;

    const slot = greetingTimeSlot(new Date().getHours());
    const groups = inGym
      ? [["gym_anytime", gymGreetingData?.anytime]]
      : [[slot, greetingData?.[slot]], ["anytime", greetingData?.anytime]];
    const selected = pickDialogue(groups, Math.random, lastHomeGreetingId);
    if (!authorized || activePage !== "home" || requestId !== greetingRequestId) return;
    lastHomeGreetingId = selected?.id || "";
    currentHomeExpression = selected?.expression || "normal";
    homeDialogue.textContent = selected?.text || (inGym ? "あ、来た。今日は何からやる？" : "あ、来た。今日はどうする？");
    homeDialogue.hidden = false;
    refreshOutfit();
  } catch {
    if (!authorized || activePage !== "home" || requestId !== greetingRequestId) return;
    // 読み込み失敗時にも、未確認の実績などを語らない短い一言だけ表示する。
    currentHomeExpression = "normal";
    homeDialogue.textContent = isGymModeActive() ? "あ、来た。今日は何からやる？" : "あ、来た。今日はどうする？";
    homeDialogue.hidden = false;
    refreshOutfit();
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

let trainingRecordNeedsReload = false;
const trainingMode = createTrainingMode(byId("training-mode"), {
  onSaved: () => {
    trainingRecordNeedsReload = true;
    if (!hasRecordChanges()) {
      void loadWorkouts().then(loaded => { if (loaded) trainingRecordNeedsReload = false; });
    }
  },
  onUnauthorized: () => setAuthenticated(false),
  openRecord: () => {
    if (selectRecordDate(todayISO())) void loadWorkouts();
  }
});

function setScreen(screen, pushHistory = true) {
  if (!authorized || !pages.has(screen)) return;
  if (repeatSheetOpen && screen !== "record") closeRepeatSheet(false);
  if (screen !== "settings") closeSettingsPlanReset();
  const previousPage = activePage;
  if (previousPage === "training" && screen !== "training") trainingMode.leave();
  syncDailyPrivateOutfit();
  if (screen !== "calendar") setCalendarMonthPicker(false);
  if (drawerOpen) setDrawerOpen(false);
  if (screen !== "home") setDevPanelOpen(false, false);
  activePage = screen;
  byId("dev-settings-open").hidden = screen !== "home";
  refreshScene();
  document.body.classList.toggle("is-home", screen === "home");
  document.body.classList.toggle("is-record", screen === "record");
  document.body.classList.toggle("is-sd-page", ["record", "calendar", "analysis"].includes(screen));
  if (screen === "home") {
    if (previousPage !== "home" &&
        (["roomwear", "training"].includes(currentGymVisuals().outfit) ||
          (isPrivateOutfit(currentGymVisuals().outfit) && privateExpressionMode === "random"))) {
      refreshOutfit({ reroll: true });
    }
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
  if (screen === "settings" && previousPage !== "settings") loadTrainingSetup();
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
  if (screen === "training" && previousPage !== "training") void trainingMode.open();
  if (screen === "record" && trainingRecordNeedsReload && !hasRecordChanges()) {
    void loadWorkouts().then(loaded => { if (loaded) trainingRecordNeedsReload = false; });
  }
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
  if (!next) { trainingMode.reset(); trainingRecordNeedsReload = false; }
  if (!next) closeSettingsPlanReset(true);
  if (!next) closeRepeatSheet(false);
  const wasAuthorized = authorized;
  if (!next || !wasAuthorized) {
    ++gymPresenceRequestId;
    gymPresencePending = null;
    gymPresenceActive = false;
    gymPresenceLeaseUntil = 0;
    gymPreviewOverride = false;
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
    setCalendarMonthPicker(false);
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
      privateExpressionMode = "random";
      privateExpressionSelect.value = "random";
      privateExpressionWrap.hidden = true;
      currentPortrait = null;
      failedHomePortraits.clear();
    }
    refreshScene();
    refreshOutfit();
    authStatus.textContent = "ログイン済み（自分専用）";
    setScreen("home", false);
    void refreshGymPresence();
  } else {
    sceneLocation = null;
    sceneTime = null;
    sceneBackground.style.backgroundImage = "";
    delete sceneBackground.dataset.location;
    delete sceneBackground.dataset.time;
    sceneStatus.textContent = "";
    privateExpressionMode = "random";
    privateExpressionSelect.value = "random";
    privateExpressionWrap.hidden = true;
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
    calendarRestReady = false;
    recurrenceReady = false;
    recurrenceRules = [];
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

// One-time template registration from the visible draft; linking is configured weekly.
const recordTemplateOpen=byId("record-template-open");
const recordTemplatePanel=byId("record-template-form");
const recordTemplateTitle=byId("record-template-title");
const recordTemplateFeedback=byId("record-template-feedback");
recordTemplateOpen.addEventListener("click",()=>{
  if(!authorized||!dbReady)return;
  recordTemplatePanel.hidden=!recordTemplatePanel.hidden;
  recordTemplateFeedback.textContent="";
  if(!recordTemplatePanel.hidden)recordTemplateTitle.focus();
});
byId("record-template-submit").addEventListener("click",async()=>{
  if(!authorized||!dbReady)return;
  const title=recordTemplateTitle.value.trim();
  const items=[...exerciseList.querySelectorAll(".exercise-card")].map(card=>({
    name:card.nameInput.value.trim(),unit:card.unit,
    sets:card.rows.querySelectorAll(".exercise-set").length,
    note:card.noteValue||""
  }));
  if(!title||title.length>60||!items.length||items.some(x=>!x.name||!x.sets)){
    recordTemplateFeedback.textContent="テンプレート名と種目を確認してください。";
    return;
  }
  const button=byId("record-template-submit");
  button.disabled=true;
  recordTemplateFeedback.textContent="登録中…";
  try{
    await fetchJSON("/api/training-setup/templates",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({title,items})
    });
    recordTemplateFeedback.textContent="登録しました。設定の週間スケジュールから曜日に紐づけられます。";
    recordTemplateTitle.value="";
  }catch(error){
    if(error.status===401){setAuthenticated(false);return;}
    recordTemplateFeedback.textContent=error.status===503
      ? "テンプレートにはD1の0008マイグレーションが必要です。"
      : "登録できませんでした。種目名・セット数・接続を確認してください。";
  }finally{button.disabled=false;}
});

const weekDays=["月","火","水","木","金","土","日"];
const weekContainer=byId("weekly-setup-days");
const weekFeedback=byId("weekly-setup-feedback");
const weekSave=byId("weekly-setup-save");
const menuList=byId("weekly-templates-list");
const menuFeedback=byId("weekly-templates-feedback");
let weeklySetupReady=false,weeklySetupBusy=false,weeklyMenus=[],weeklySlotVersions=[];
const savedTemplateEditor=createSavedTemplateEditor({
  host:byId("weekly-template-editor"),
  request:fetchJSON,
  onUnauthorized:()=>setAuthenticated(false),
  onUpdated:template=>{
    weeklyMenus=weeklyMenus.map(old=>old.id===template.id?template:old);
    // Preserve unsaved weekday choices: only refresh option labels and menu list.
    for(const option of weekContainer.querySelectorAll(".weekly-setup-template option")){
      if(option.value===String(template.id))option.textContent=template.title;
    }
    renderWeeklyTemplateList();
    menuFeedback.textContent="テンプレートを更新しました。曜日の紐づけと筋トレ実績はそのままです。";
  }
});
function weeklySlotForEditor(weekday) {
  return weeklySlotVersions.filter(x=>x.weekday===weekday && x.starts_on<=todayISO())
    .sort((a,b)=>b.starts_on.localeCompare(a.starts_on))[0]??null;
}
function renderTrainingSetup() {
  weekContainer.replaceChildren();
  menuList.replaceChildren();
  weekSave.disabled=!weeklySetupReady||weeklySetupBusy;
  if(!weeklySetupReady){
    weekFeedback.textContent="週間メニューにはD1の0008マイグレーションが必要です。";
    return;
  }
  for(let day=1;day<=7;day++){
    const row=document.createElement("div");
    row.className="weekly-setup-day";
    row.dataset.weekday=String(day);
    const dayLabel=document.createElement("strong");
    dayLabel.textContent=weekDays[day-1]+"曜";
    const kind=document.createElement("select");
    kind.className="weekly-setup-kind";
    kind.setAttribute("aria-label",weekDays[day-1]+"曜日の予定");
    for(const [value,label] of [["none","未設定"],["gym","ジム"],["rest","休息"]]){
      const opt=document.createElement("option");
      opt.value=value;opt.textContent=label;kind.append(opt);
    }
    const menu=document.createElement("select");
    menu.className="weekly-setup-template";
    menu.setAttribute("aria-label",weekDays[day-1]+"曜日のメニュー");
    const empty=document.createElement("option");
    empty.value="";empty.textContent="メニューなし";menu.append(empty);
    for(const template of weeklyMenus){
      const opt=document.createElement("option");
      opt.value=String(template.id);opt.textContent=template.title;menu.append(opt);
    }
    const slot=weeklySlotForEditor(day);
    kind.value=slot?.kind??"none";
    menu.value=slot?.template_id==null?"":String(slot.template_id);
    const sync=()=>{menu.disabled=kind.value!=="gym";if(menu.disabled)menu.value="";};
    kind.addEventListener("change",sync);
    sync();
    row.append(dayLabel,kind,menu);
    weekContainer.append(row);
  }
  renderWeeklyTemplateList();
}
function renderWeeklyTemplateList(){
  menuList.replaceChildren();
  if(!weeklyMenus.length){
    const empty=document.createElement("p");
    empty.className="field-hint";
    empty.textContent="テンプレートは未登録です。記録画面で種目を追加し、テンプレート保存してください。";
    menuList.append(empty);
  }
  for(const template of weeklyMenus){
    const row=document.createElement("div");
    row.className="weekly-template-item";
    const detail=document.createElement("div");
    const name=document.createElement("strong");
    name.textContent=template.title;
    const summary=document.createElement("small");
    summary.textContent=template.items.map(x=>x.name+" "+x.sets+"セット").join("・");
    detail.append(name,summary);
    const actions=document.createElement("div");
    actions.className="weekly-template-actions";
    const edit=document.createElement("button");
    edit.type="button";edit.textContent="編集";edit.className="secondary-action";
    edit.setAttribute("aria-label",template.title+"を編集");
    edit.disabled=weeklySetupBusy;
    edit.addEventListener("click",()=>{
      menuFeedback.textContent="";
      savedTemplateEditor.open(template);
    });
    const remove=document.createElement("button");
    remove.type="button";remove.textContent="削除";remove.className="secondary-action";
    remove.setAttribute("aria-label",template.title+"を削除");
    remove.disabled=weeklySetupBusy;
    remove.addEventListener("click",async()=>{
      if(!confirm("「"+template.title+"」を削除しますか？曜日の紐づけは解除されますが、筋トレ実績は残ります。"))return;
      weeklySetupBusy=true;remove.disabled=true;
      try{
        await fetchJSON("/api/training-setup/templates/"+template.id,{
          method:"DELETE",headers:{"Content-Type":"application/json"}
        });
        menuFeedback.textContent="テンプレートを削除しました。筋トレ記録は残っています。";
        await loadTrainingSetup();
        if(authorized)await loadWorkouts();
      }catch(error){
        if(error.status===401){setAuthenticated(false);return;}
        menuFeedback.textContent="削除できませんでした。";
      }finally{weeklySetupBusy=false;}
    });
    actions.append(edit,remove);
    row.append(detail,actions);menuList.append(row);
  }

}
async function loadTrainingSetup(){
  if(!authorized)return;
  try{
    const data=await fetchJSON("/api/training-setup");
    if(!authorized)return;
    weeklySetupReady=data.ready===true;
    weeklyMenus=data.templates||[];
    weeklySlotVersions=data.slots||[];
    weekFeedback.textContent="";
    renderTrainingSetup();
  }catch(error){
    if(error.status===401){setAuthenticated(false);return;}
    weeklySetupReady=false;weeklyMenus=[];weeklySlotVersions=[];
    renderTrainingSetup();
  }
}
weekSave.addEventListener("click",async()=>{
  if(!authorized||!weeklySetupReady||weeklySetupBusy)return;
  const slots=[...weekContainer.querySelectorAll(".weekly-setup-day")].map(row=>({
    weekday:Number(row.dataset.weekday),
    kind:row.querySelector(".weekly-setup-kind").value,
    template_id:row.querySelector(".weekly-setup-template").value
      ?Number(row.querySelector(".weekly-setup-template").value):null
  }));
  weeklySetupBusy=true;weekSave.disabled=true;
  weekFeedback.textContent="保存中…";
  try{
    await fetchJSON("/api/training-setup/week",{
      method:"PUT",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({starts_on:todayISO(),slots})
    });
    await loadWorkouts();
    await loadTrainingSetup();
    weekFeedback.textContent="週間予定を保存しました。今日以降の該当曜日に自動反映します。";
  }catch(error){
    if(error.status===401){setAuthenticated(false);return;}
    weekFeedback.textContent="週間予定を保存できませんでした。入力と接続を確認してください。";
  }finally{weeklySetupBusy=false;weekSave.disabled=!weeklySetupReady;}
});

// Plans-only reset: changes in-memory UI only after a confirmed server mutation.
// Workout sessions, equipment catalog, and attended days are explicitly excluded.
const settingsPlanResetOpen = byId("settings-plan-reset-open");
const settingsPlanResetConfirm = byId("settings-plan-reset-confirm");
const settingsPlanResetPreview = byId("settings-plan-reset-preview");
const settingsPlanResetCheck = byId("settings-plan-reset-check");
const settingsPlanResetExecute = byId("settings-plan-reset-execute");
const settingsPlanResetCancel = byId("settings-plan-reset-cancel");
const settingsPlanResetFeedback = byId("settings-plan-reset-feedback");
let settingsPlanResetPending = false;
let settingsPlanResetReady = false;

function closeSettingsPlanReset(force = false) {
  if (settingsPlanResetPending && !force) return;
  settingsPlanResetConfirm.hidden = true;
  settingsPlanResetOpen.disabled = false;
  settingsPlanResetCheck.checked = false;
  settingsPlanResetCheck.disabled = true;
  settingsPlanResetExecute.disabled = true;
  settingsPlanResetReady = false;
}
settingsPlanResetCancel.addEventListener("click",closeSettingsPlanReset);
settingsPlanResetCheck.addEventListener("change",()=>{
  settingsPlanResetExecute.disabled = !settingsPlanResetReady ||
    !settingsPlanResetCheck.checked || settingsPlanResetPending;
});
settingsPlanResetOpen.addEventListener("click",async()=>{
  if (!authorized || settingsPlanResetPending) return;
  settingsPlanResetOpen.disabled = true;
  settingsPlanResetConfirm.hidden = false;
  settingsPlanResetFeedback.textContent = "";
  settingsPlanResetPreview.textContent = "削除対象を確認中…";
  settingsPlanResetCheck.checked = false;
  settingsPlanResetCheck.disabled = true;
  settingsPlanResetExecute.disabled = true;
  settingsPlanResetReady = false;
  try {
    const result=await fetchJSON("/api/calendar/reset");
    if (!authorized || settingsPlanResetConfirm.hidden) return;
    const counts=result.counts||{};
    const parts=[
      "単発ジム予定 " + Number(counts.singlePlans||0) + "件",
      "休息日 " + Number(counts.restDays||0) + "件",
      "旧毎週ルール " + Number(counts.legacyRules||0) + "件",
      "繰り返しルール " + Number(counts.repeatSeries||0) + "件",
      "週間スケジュール " + Number(counts.weeklySlots||0) + "件",
      "個別例外 " + (Number(counts.legacyExceptions||0)+
        Number(counts.repeatExceptions||0)) + "件"
    ];
    settingsPlanResetPreview.textContent=parts.join("／");
    settingsPlanResetReady=true;
    settingsPlanResetCheck.disabled=false;
  } catch(error) {
    if (error.status === 401) {setAuthenticated(false);return;}
    settingsPlanResetPreview.textContent="削除対象を取得できませんでした。";
    settingsPlanResetFeedback.textContent="通信・DB接続状態を確認してください。";
  } finally {
    if (!settingsPlanResetPending) settingsPlanResetOpen.disabled=false;
  }
});
settingsPlanResetExecute.addEventListener("click",async()=>{
  if (!authorized || !settingsPlanResetReady || !settingsPlanResetCheck.checked ||
      settingsPlanResetPending) return;
  settingsPlanResetPending=true;
  settingsPlanResetExecute.disabled=true;
  settingsPlanResetCancel.disabled=true;
  settingsPlanResetOpen.disabled=true;
  settingsPlanResetFeedback.textContent="予定を削除中…";
  let cleared=false;
  try {
    await fetchJSON("/api/calendar/reset",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({scope:"plans_only",confirm:"DELETE_ALL_PLANS"})
    });
    cleared=true;
    repeatOccurrence=null;
    repeatEditorSeriesId=null;
    repeatFeedback.textContent="";
    renderRepeatEditor();
    settingsPlanResetFeedback.textContent="予定と休息日の設定をすべて削除しました。筋トレ記録・来館実績は残っています。";
    settingsPlanResetConfirm.hidden=true;
    settingsPlanResetCheck.checked=false;
    settingsPlanResetReady=false;
    try {
      await loadWorkouts();
      if (authorized && !hasRecordChanges()) hydrateStoredRecordForDate(selectedDate);
    } catch {
      settingsPlanResetFeedback.textContent+=" 表示を更新できない場合は画面を開き直してください。";
    }
  } catch(error) {
    if (error.status===401) {setAuthenticated(false);return;}
    settingsPlanResetFeedback.textContent="削除結果を確認できませんでした。接続状態とカレンダーの予定を確認してください。";
  } finally {
    settingsPlanResetPending=false;
    settingsPlanResetCancel.disabled=false;
    settingsPlanResetOpen.disabled=false;
    if (!cleared) settingsPlanResetExecute.disabled=!settingsPlanResetReady ||
      !settingsPlanResetCheck.checked;
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


/* Monogatari scenes: lazy iframe only. No D1, app storage or new auth flow. */
const monogatariTestShell = byId("monogatari-test-shell");
const monogatariTestOpen = byId("monogatari-test-open");
const monogatariTestClose = byId("monogatari-test-close");
const monogatariTestFrame = byId("monogatari-test-frame");
const monogatariTestTitle = byId("monogatari-test-title");
let activeMonogatariEntry = monogatariTestOpen;
function closeMonogatariTest(fromPopstate = false) {
  if (monogatariTestShell.hidden) return;
  monogatariTestShell.hidden = true;
  monogatariTestFrame.src = "about:blank";
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
