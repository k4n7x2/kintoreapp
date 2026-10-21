// One fixed expression per dialogue position. IDs remain stable even if text is edited.
// Arrays mirror the order in shiori-greetings.json and shiori-gym-greetings-v0.1.json.
export const dialogueExpressions = Object.freeze({
  morning: ["normal","soft_smile","smile","normal","wry_smile","smile"],
  afternoon: ["normal","normal","soft_smile","soft_smile","smile","wry_smile"],
  evening: ["soft_smile","normal","smile","normal","thinking","soft_smile"],
  night: ["soft_smile","wry_smile","sleepy","soft_smile","soft_smile","playful"],
  anytime: ["normal","soft_smile","normal","soft_smile","normal","playful"],
  gym_anytime: ["smile","thinking","normal","normal","soft_smile","wry_smile","smile","soft_smile","wry_smile","normal"]
});
const fallbackByOutfit = Object.freeze({
  training: { sleepy:"normal", shy:"normal" },
  "private-v1": { soft_smile:"smile", closed_eye_smile:"smile", wry_smile:"normal", sleepy:"normal", shy:"normal" },
  "private-v2": { wry_smile:"normal" },
  roomwear: {
    smile:"joy", soft_smile:"normal", closed_eye_smile:"joy", thinking:"normal",
    surprised:"joy", playful:"mischievous", wry_smile:"normal", sleepy:"normal"
  }
});
export function expressionForDialogue(group, index) {
  return dialogueExpressions[group]?.[index] || "normal";
}
export function resolveDialoguePortrait(expression, outfit, portraits, failed = new Set()) {
  const candidates = (portraits[outfit] || []).filter(({src}) => !failed.has(src));
  if (!candidates.length) return null;
  const target = candidates.find(({id}) => id === expression)
    || candidates.find(({id}) => id === fallbackByOutfit[outfit]?.[expression])
    || candidates.find(({id}) => id === "normal");
  return target || candidates[0];
}
export function pickDialogue(groups, random = Math.random, previousId = "") {
  const entries = groups.flatMap(([group, lines]) => Array.isArray(lines)
    ? lines.map((text, index) => ({ id:`${group}_${String(index+1).padStart(3,"0")}`, text, expression: expressionForDialogue(group,index) }))
      .filter(({text}) => typeof text === "string" && text.trim())
    : []);
  const pool = entries.filter(({id}) => id !== previousId);
  const choices = pool.length ? pool : entries;
  return choices.length ? choices[Math.max(0,Math.min(choices.length-1,Math.floor(random()*choices.length)))] : null;
}
