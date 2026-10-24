import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");

test("training saves preserve the pending record sync after background refresh",()=>{
  assert.match(app,/onSaved: \(\) => \{\s*trainingRecordNeedsReload = true;/);
  assert.match(app,/void loadWorkouts\(\);\s*\},\s*onUnauthorized:/);
  assert.doesNotMatch(app,/loadWorkouts\(\)\.then\(loaded => \{ if \(loaded\) trainingRecordNeedsReload = false;/);
});

test("record screen fetches a fresh month and only hydrates clean drafts",()=>{
  assert.match(app,/if \(screen === "record" && trainingRecordNeedsReload\) \{/);
  assert.match(app,/if \(hasRecordChanges\(\)\) \{/);
  assert.match(app,/pendingRecordDate = selectedDate;\s*void loadWorkouts\(\);/);
  assert.match(app,/activePage === "record" && selectedDate === pendingRecordDate &&\s*!hasRecordChanges\(\)/);
  assert.match(app,/hydrateStoredRecordForDate\(date\);\s*if \(trainingRecordNeedsReload && date === todayISO\(\)\) \{\s*trainingRecordNeedsReload = false;/);
});

test("stale record drafts cannot overwrite new training-mode sets",()=>{
  assert.match(app,/if \(trainingRecordNeedsReload && saveDate.value === todayISO\(\)\) \{\s*saveFeedback\.textContent/);
  assert.match(app,/未保存の入力を保持/);
});

test("app entrypoint cache is invalidated",()=>{
  assert.match(html,/\/app\.js\?v=20261024-record-sync-v02/);
});
