const now = new Date();
let shownYear = now.getFullYear();
let shownMonth = now.getMonth();
const scheduledDays = new Set([1, 2, 5]); // 月・火・金。正式な予定ではない。

const monthTitle = document.getElementById("month-title");
const calendarGrid = document.getElementById("calendar-grid");
const dateLabel = document.getElementById("today-label");
const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

dateLabel.textContent = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric", month: "long", day: "numeric", weekday: "short"
}).format(now);

function renderCalendar() {
  monthTitle.textContent = `${shownYear}年 ${shownMonth + 1}月`;
  calendarGrid.replaceChildren();
  const startWeekday = new Date(shownYear, shownMonth, 1).getDay();
  const daysInMonth = new Date(shownYear, shownMonth + 1, 0).getDate();

  for (let slot = 0; slot < startWeekday + daysInMonth; slot++) {
    const cell = document.createElement("span");
    cell.className = "calendar-day";

    if (slot < startWeekday) {
      cell.classList.add("is-empty");
      cell.setAttribute("aria-hidden", "true");
    } else {
      const day = slot - startWeekday + 1;
      const date = new Date(shownYear, shownMonth, day);
      cell.textContent = String(day);
      const isScheduled = scheduledDays.has(date.getDay());
      if (isScheduled) cell.classList.add("is-scheduled");
      if (sameDay(date, now)) {
        cell.classList.add("is-today");
        cell.setAttribute("aria-current", "date");
      }
      cell.setAttribute("aria-label", `${shownMonth + 1}月${day}日${isScheduled ? "（仮のトレーニング日）" : ""}`);
    }
    calendarGrid.appendChild(cell);
  }
}
function changeMonth(offset) {
  const result = new Date(shownYear, shownMonth + offset, 1);
  shownYear = result.getFullYear();
  shownMonth = result.getMonth();
  renderCalendar();
}

document.getElementById("prev-month").addEventListener("click", () => changeMonth(-1));
document.getElementById("next-month").addEventListener("click", () => changeMonth(1));
renderCalendar();

const statusLabel = document.getElementById("db-status");
const statusIndicator = document.getElementById("db-indicator");

async function checkDatabase() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) throw new Error("unavailable");
    const result = await response.json();
    if (result.ok && result.database === "connected") {
      statusLabel.textContent = "接続確認済み（D1）";
      statusIndicator.classList.add("ok");
      return;
    }
    throw new Error("unavailable");
  } catch {
    statusLabel.textContent = "未接続・確認待ち";
    statusIndicator.classList.add("error");
  }
}
checkDatabase();
