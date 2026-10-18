import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const added = read("migrations/0006_gym_machine_catalog.sql");
const initial = read("migrations/0003_exercise_catalog.sql");
const html = read("public/index.html");
const app = read("public/app.js");
const machines = [
  [
    "レッグプレス",
    "脚"
  ],
  [
    "チェストプレス",
    "胸"
  ],
  [
    "ヴァーティカルトラクション",
    "背中"
  ],
  [
    "アブドミナルクランチ",
    "腹筋"
  ],
  [
    "ローワーバック",
    "背中"
  ],
  [
    "ロータリートーソ",
    "腹筋"
  ],
  [
    "アームカール",
    "腕"
  ],
  [
    "アームエクステンション",
    "腕"
  ],
  [
    "アダクター",
    "脚"
  ],
  [
    "アブダクター",
    "脚"
  ],
  [
    "ペクトラル",
    "胸"
  ],
  [
    "ショルダープレス",
    "肩"
  ],
  [
    "ローロー",
    "背中"
  ],
  [
    "レッグカール",
    "脚"
  ],
  [
    "レッグエクステンション",
    "脚"
  ],
  [
    "マルチヒップ",
    "脚"
  ]
];
function entries(sql) {
  return [...sql.matchAll(/\('([^']+)','([^']+)','([^']+)'\)/g)]
    .map(([, name, bodyPart, unit]) => [name, bodyPart, unit]);
}

test("16 machines have unique catalog names and compatible units and body parts", () => {
  const entriesAdded = entries(added);
  assert.equal(entriesAdded.length, 16);
  assert.equal(new Set(entriesAdded.map(([name]) => name)).size, 16);
  assert.deepEqual(entriesAdded, machines.map(([name, part]) => [name, part, "kg_reps"]));
});

test("new migration is additive and preserves pre-existing exercise preferences", () => {
  assert.match(added, /INSERT OR IGNORE INTO exercise_catalog/);
  assert.doesNotMatch(added, /\b(?:UPDATE|DELETE|DROP|ALTER)\b\s+(?:TABLE\s+)?exercise_catalog/i);
  assert.doesNotMatch(added, /\b(?:UPDATE|DELETE|DROP|ALTER)\b\s+(?:TABLE\s+)?workout_/i);
  const existing = new Set(entries(initial).map(([name]) => name));
  const overlap = machines.map(([name]) => name).filter(name => existing.has(name));
  assert.deepEqual(overlap, ["レッグプレス","チェストプレス","アームカール","ショルダープレス","レッグカール"]);
});

test("fallback picker has all machines with the same primary body part", () => {
  for (const [name, part] of machines) {
    assert.ok(html.includes('<option value="' + name + '"></option>'), name + " missing from options");
    assert.ok(app.includes('"' + name + '":"' + part + '"'), name + " missing from parts");
  }
});
