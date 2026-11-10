import assert from "node:assert/strict";
import test from "node:test";
import {
  clubFloorPlanSceneUrl,
  clubFloorPlanTemplateFor,
} from "./club-floor-plan-templates.ts";

test("finds the hall of a club by its name or address", () => {
  assert.equal(
    clubFloorPlanTemplateFor({ name: "Холмогорова 17" })?.id,
    "apex-holmogorova-17",
  );
  assert.equal(
    clubFloorPlanTemplateFor({
      name: "Apex",
      address: "Пермь, ул. Холмогорова, 17",
    })?.id,
    "apex-holmogorova-17",
  );
  assert.equal(clubFloorPlanTemplateFor({ name: "Холмогорова 171" }), null);
  assert.equal(clubFloorPlanTemplateFor({ name: "Ленина 5" }), null);
});

test("a saved plan keeps its own hall", () => {
  assert.equal(
    clubFloorPlanTemplateFor({ name: "Ленина 5" }, "apex-holmogorova-17")?.id,
    "apex-holmogorova-17",
  );
  assert.equal(
    clubFloorPlanTemplateFor({ name: "Холмогорова 17" }, "unknown-hall"),
    null,
  );
});

test("the scene opens for one club and edits only when allowed", () => {
  const template = clubFloorPlanTemplateFor({ name: "Холмогорова 17" });
  assert.ok(template);
  assert.equal(
    clubFloorPlanSceneUrl(template, "store 1", false),
    "/club-scheme/apex-holmogorova-17/index.html?store=store+1",
  );
  assert.equal(
    clubFloorPlanSceneUrl(template, "s1", true),
    "/club-scheme/apex-holmogorova-17/index.html?store=s1&edit=1",
  );
});
