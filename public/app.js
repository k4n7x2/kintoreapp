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
  addExerciseButton.disabled = !ready;
  for (const id of ["record-prev-day", "record-next-day", "record-history-open"]) {
    byId(id).disabled = !ready;
  }
  document.querySelectorAll("#exercise-list input, #exercise-list button, #record-editor-host input, #record-editor-host button").forEach(el => { el.disabled = !ready; });
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
  const card = container.exerciseCard;
  if (card?.renderPrevious) card.renderPrevious();
  if (card?.renderSummary) card.renderSummary();
}


function analysisDateSummary(sets) {
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
    const names = [...new Set((result.exercises || []).map(normalizeExerciseName).filter(Boolean))];
    analysisExerciseFeedback.textContent = names.length ? "" : "まだ記録した種目がありません。";
    for (const name of names) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "analysis-link-card";
      const title = document.createElement("strong");
      title.textContent = name;
      const chevron = document.createElement("span");
      chevron.setAttribute("aria-hidden", "true");
      chevron.textContent = "›";
      button.append(title, chevron);
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
    note: card.noteValue || "",
    sets: [...card.rows.querySelectorAll(".exercise-set")].map(row => [
      row.querySelector(".set-weight").value, row.querySelector(".set-reps").value
    ])
  });
}
function markRecordBaseline() {
  exerciseList.querySelectorAll(".exercise-card").forEach(card => {
    card.savedSnapshot = cardDraftSnapshot(card);
  });
}
function hasRecordChanges() {
  if (activeExerciseCard) activeExerciseCard.noteValue = saveNote.value;
  return [...exerciseList.querySelectorAll(".exercise-card")].some(card =>
    card.savedSnapshot !== cardDraftSnapshot(card));
}
function closeExerciseEditor({ focus = false } = {}) {
  if (!activeExerciseCard) return;
  const card = activeExerciseCard;
  card.noteValue = saveNote.value;
  card.append(card.editorBody);
  card.editorBody.hidden = true;
  activeExerciseCard = null;
  editorEntry = "record";
  recordEditor.hidden = true;
  recordOverview.hidden = false;
  card.renderSummary();
  byId("record-scroll").scrollTop = 0;
  if (focus && card.isConnected) card.overviewButton.focus();
}
function openExerciseEditor(card, origin = "record") {
  if (!card || !dbReady) return;
  if (activeExerciseCard && activeExerciseCard !== card) closeExerciseEditor();
  activeExerciseCard = card;
  editorEntry = origin;
  byId("record-editor-back").textContent = origin === "analysis"
    ? "‹ 実施日一覧へ戻る" : "‹ その日の種目一覧へ戻る";
  byId("record-editor-date").textContent = saveDate.value + " の記録";
  exercisePicker.hidden = true;
  recordOverview.hidden = true;
  recordEditor.hidden = false;
  card.editorBody.hidden = false;
  recordEditorHost.appendChild(card.editorBody);
  byId("record-editor-title").textContent = card.nameInput.value.trim() || "種目を編集";
  saveNote.value = card.noteValue || "";
  recordNoteDetails.open = !!saveNote.value;
  saveFeedback.textContent = "";
  byId("record-scroll").scrollTop = 0;
  byId("record-editor-back").focus();
}
byId("record-editor-back").addEventListener("click", returnFromExerciseEditor);
byId("record-editor-done").addEventListener("click", returnFromExerciseEditor);

function showExercisePicker() {
  if (!dbReady) return;
  closeExerciseEditor();
  recordOverview.hidden = true;
  recordEditor.hidden = true;
  exercisePicker.hidden = false;
  pickerInput.value = "";
  pickerFeedback.textContent = "";
  renderExerciseChoices();
  byId("record-scroll").scrollTop = 0;
  pickerInput.focus();
}
function closeExercisePicker() {
  exercisePicker.hidden = true;
  recordOverview.hidden = false;
  byId("record-scroll").scrollTop = 0;
}
function renderExerciseChoices() {
  pickerList.replaceChildren();
  const query = normalizeExerciseName(pickerInput.value);
  for (const name of knownExerciseNames.filter(item => item.includes(query)).slice(0, 50)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "exercise-choice";
    button.textContent = name;
    button.addEventListener("click", () => chooseExercise(name));
    pickerList.appendChild(button);
  }
}
async function loadExerciseNames() {
  try {
    const data = await fetchJSON("/api/exercises");
    if (!authorized) return;
    knownExerciseNames = [...new Set([...starterExercises, ...(data.exercises || [])]
      .map(normalizeExerciseName).filter(Boolean))];
    renderExerciseChoices();
  } catch { /* 候補取得に失敗しても固定候補と手入力は利用可能 */ }
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
  const heading = document.createElement("strong");
  heading.className = "exercise-overview-name";
  const current = document.createElement("span");
  current.className = "exercise-overview-current";
  const previousSummary = document.createElement("span");
  previousSummary.className = "exercise-overview-previous";
  summary.append(heading, current, previousSummary);
  const body = document.createElement("div");
  body.className = "exercise-editor";
  body.hidden = true;
  card.nameInput = null;
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
  nameInput.readOnly = true; // 種目名をキーにするため、記録済み名称は直接書き換えない。
  label.appendChild(nameInput);
  const remove = document.createElement("button");
  remove.type = "button"; remove.className = "secondary-action";
  remove.textContent = "種目を削除";
  remove.addEventListener("click", () => {
    if (saved || card.savedOnServer) {
      feedback.textContent = "保存済みの種目は履歴から削除できます。";
      return;
    }
    if (!confirm("この未保存の種目入力を破棄しますか？")) return;
    closeExerciseEditor();
    card.remove();
    updateExerciseEmpty();
  });
  head.append(label, remove);
  const rows = document.createElement("div");
  rows.className = "exercise-sets";
  rows.exerciseCard = card;
  card.rows = rows;
  card.nameInput = nameInput;
  card.editorBody = body;
  card.overviewButton = summary;
  card.noteValue = note;
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
    const chosen = nameInput.value.trim();
    heading.textContent = chosen || "新しい種目";
    summary.setAttribute("aria-label", (chosen || "新しい種目") + "のセットを編集");
    const currentSets = [...rows.querySelectorAll(".exercise-set")];
    const values = currentSets.map(row => {
      const kg = row.querySelector(".set-weight").value;
      const reps = row.querySelector(".set-reps").value;
      return (kg || "—") + "kg × " + (reps || "—") + "回";
    });
    const uniform = values.length && values.every(value => value === values[0]);
    current.textContent = !values.length ? "セットなし" :
      uniform ? values[0] + " × " + values.length + "セット" :
      values.join(" / ");
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
    byId("record-editor-title").textContent = nameInput.value.trim() || "新しい種目";
  });
  nameInput.addEventListener("change", () => card.refreshPrevious());
  rows.addEventListener("input", card.renderSummary);
  recent.addEventListener("click", () => {
    if (!previous.length || !dbReady) return;
    if (rows.querySelector(".exercise-set") &&
        !confirm("入力中のセットを前回の内容に置き換えますか？")) return;
    rows.replaceChildren();
    for (const set of previous) newSetRow(rows, set);
    card.renderPrevious();
    card.renderSummary();
    feedback.textContent = "前回のセットを反映しました。";
  });
  summary.addEventListener("click", () => openExerciseEditor(card));
  actions.append(addSet, recent);
  body.append(head, previousLabel, rows, actions, feedback);
  card.append(summary, body);
  exerciseList.appendChild(card);
  for (const set of sets) newSetRow(rows, set);
  card.renderSummary();
  card.renderPrevious();
  card.querySelectorAll("input, button").forEach(el => { el.disabled = !dbReady; });
  if (name && dbReady) card.refreshPrevious();
  if (saved) {
    card.savedSnapshot = cardDraftSnapshot(card);
    card.savedOnServer = true;
  }
  updateExerciseEmpty();
  return card;
}
function resetWorkoutForm(date = todayISO()) {
  closeExerciseEditor();
  exercisePicker.hidden = true;
  recordOverview.hidden = false;
  editingWorkoutId = null;
  byId("record-form-title").textContent = date === todayISO() ? "今日のトレーニング" : "この日のトレーニング";
  cancelWorkoutEdit.hidden = true;
  saveButton.textContent = "この種目を保存";
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
    const repsInput = row.querySelector(".set-reps");
    const weight = Number(weightInput.value), reps = Number(repsInput.value);
    if (!weightInput.value || !repsInput.value ||
        !Number.isFinite(weight) || weight < 0 || weight > 2000 ||
        !Number.isInteger(reps) || reps < 0 || reps > 1000 ||
        !weightInput.validity.valid || !repsInput.validity.valid) {
      (weightInput.value && weightInput.validity.valid ? repsInput : weightInput).focus();
      throw new Error("重量・回数を確認してください。");
    }
    sets.push({ weight_kg: weight, reps });
  }
  return sets;
}
byId("workout-form").addEventListener("submit", async event => {
  event.preventDefault();
  const card = activeExerciseCard;
  if (!authorized || !dbReady || !card) return;
  let sets;
  try { sets = collectExerciseSets(card); }
  catch (error) { saveFeedback.textContent = error.message; return; }
  const date = saveDate.value;
  const name = normalizeExerciseName(card.nameInput.value);
  if (!name || name.length > 60) {
    saveFeedback.textContent = "種目名を確認してください。";
    return;
  }
  card.noteValue = saveNote.value;
  const returnToAnalysis = editorEntry === "analysis";
  if (card.noteValue.length > 300) {
    saveFeedback.textContent = "メモは300文字以内です。";
    return;
  }
  setReady(false);
  saveFeedback.textContent = "この種目を保存中…";
  try {
    const result = await fetchJSON("/api/exercises/log", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ performed_on: date, exercise_name: name,
        sets, note: card.noteValue })
    });
    if (!card.isConnected || !authorized) return;
    card.nameInput.value = result.exercise_name;
    card.savedSnapshot = cardDraftSnapshot(card);
    card.savedOnServer = true;
    closeExerciseEditor();
    overviewFeedback.textContent = result.exercise_name + "を保存しました。";
    pendingRecordDate = "";
    // ほかの種目の入力DOMは維持し、月間データだけ更新。
    await loadWorkouts();
    loadExerciseNames();
    if (returnToAnalysis && authorized && activePage === "record") {
      analysisSaveNotice = "記録を保存しました。";
      returnToAnalysisDays(result.exercise_name);
    } else if (activePage === "record") {
      showSideDialogue("record", "saved");
    }
  } catch (error) {
    if (error.status === 401) {
      setAuthenticated(false);
      loginFeedback.textContent = "ログイン期限が切れました。";
      return;
    }
    setReady(true);
    saveFeedback.textContent = "保存できませんでした。接続状態を確認してください。";
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
  if (screen === "analysis" && previousPage !== "analysis") showAnalysisExerciseList();
  if (screen === "record" || screen === "calendar") {
    if (screen !== previousPage) {
      byId("record-scroll").scrollTop = 0;
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
  if (!next) document.body.classList.remove("is-home", "is-record");
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

