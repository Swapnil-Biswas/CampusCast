import test from "node:test";
import assert from "node:assert/strict";
import { isIeee, organiserAfterClubChange, organiserLine } from "../../lib/hackathons/organiser.js";

const CODING = { name: "Coding Club" }, GENAI = { name: "GenAI Club" }, IEEE_CS = { name: "IEEE Computer Society" }, IEEE_RAS = { name: "IEEE Robotics and Automation Society" };

test("IEEE societies are recognised by name", () => {
  assert.equal(isIeee("IEEE Computer Society"), true);
  assert.equal(isIeee("  ieee Signal Processing Society"), true);
  assert.equal(isIeee("Coding Club"), false);
  assert.equal(isIeee("NODE – Network of Decentralised Engineers"), false);
  assert.equal(isIeee(""), false);
  assert.equal(isIeee(null), false);
});

test("the organiser follows the club for ordinary clubs", () => {
  assert.equal(organiserAfterClubChange("", null, CODING), "Coding Club");
  assert.equal(organiserAfterClubChange("Coding Club", CODING, GENAI), "GenAI Club");
  assert.equal(organiserAfterClubChange("coding club", CODING, GENAI), "GenAI Club", "case does not matter");
});

test("a name the admin typed is never overwritten", () => {
  assert.equal(organiserAfterClubChange("Coding Club, BMSIT&M", CODING, GENAI), "Coding Club, BMSIT&M");
  assert.equal(organiserAfterClubChange("Dr. Rao's office", null, CODING), "Dr. Rao's office");
});

test("for an IEEE society the organiser is left for the admin to type", () => {
  assert.equal(organiserAfterClubChange("", null, IEEE_CS), "");
  assert.equal(organiserAfterClubChange("Coding Club", CODING, IEEE_RAS), "", "the previous club's name is cleared");
  assert.equal(organiserAfterClubChange("IEEE BMSIT Student Branch", IEEE_CS, IEEE_RAS), "IEEE BMSIT Student Branch");
});

test("choosing 'out of college' clears an automatic organiser but keeps a typed one", () => {
  assert.equal(organiserAfterClubChange("Coding Club", CODING, null), "");
  assert.equal(organiserAfterClubChange("CMR Institute of Technology", null, null), "CMR Institute of Technology");
});

test("the organiser shown to students: the club, the IEEE branch with it, or another college", () => {
  assert.equal(organiserLine({ club: CODING, organizer_name: "Coding Club" }), "Coding Club");
  assert.equal(organiserLine({ club: CODING, organizer_name: "Coding Club, BMSIT&M" }), "Coding Club", "the same club written longer is not shown twice");
  assert.equal(organiserLine({ club: IEEE_CS, organizer_name: "IEEE BMSIT Student Branch" }), "IEEE Computer Society · IEEE BMSIT Student Branch");
  assert.equal(organiserLine({ club: null, organizer_name: "CMR Institute of Technology" }), "CMR Institute of Technology");
  assert.equal(organiserLine({ club: CODING, organizer_name: null }), "Coding Club");
  assert.equal(organiserLine({}), "");
  assert.equal(organiserLine(), "");
});
