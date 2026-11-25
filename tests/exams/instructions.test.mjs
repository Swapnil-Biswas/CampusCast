import test from "node:test";
import assert from "node:assert/strict";
import { instructionText } from "../../lib/exams/constants.js";
import { validateNotice } from "../../lib/exams/validate.js";

test("an instruction reads the same as the AI's { text, page } or as a saved string", () => {
  assert.equal(instructionText({ text: "Carry your ID card.", page: 1 }), "Carry your ID card.");
  assert.equal(instructionText("Carry your ID card."), "Carry your ID card.");
  assert.equal(instructionText({ page: 1 }), "");
  assert.equal(instructionText(null), "");
});

test("saving keeps the words, never [object Object]", () => {
  const r = validateNotice({ title: "IA 2 timetable", noticeType: "timetable", category: "ia2", instructions: { examination: [{ text: "Be seated early.", page: 1 }, "Bring a pen."] } });
  assert.deepEqual(r.details?.instructions.examination, ["Be seated early.", "Bring a pen."]);
});
