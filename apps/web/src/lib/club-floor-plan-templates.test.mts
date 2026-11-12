import assert from "node:assert/strict";
import test from "node:test";
import {
  clubFloorPlanForShift,
  clubFloorPlanSceneUrl,
  clubFloorPlanSwitcher,
  clubFloorPlanTemplateFor,
} from "./club-floor-plan-templates.ts";

test("finds the hall of a club by its name or address", () => {
  assert.equal(
    clubFloorPlanTemplateFor({ name: "Холмогорова 17" })?.id,
    "apex-holmogorova-17",
  );
  assert.equal(
    clubFloorPlanTemplateFor({
      name: "APEKS",
      address: "Пермь, ул. Холмогорова, д. 17Б",
    })?.id,
    "apex-holmogorova-17",
  );
  assert.equal(
    clubFloorPlanTemplateFor({ name: "1337 Пушкинская" })?.id,
    "1337-pushkinskaya-217",
  );
  assert.equal(
    clubFloorPlanTemplateFor({ name: "1337", address: "ул. Пушкина, 217" }),
    null,
  );
  assert.equal(
    clubFloorPlanTemplateFor({ name: "1337", address: "Пушкинская ул., 217" })
      ?.id,
    "1337-pushkinskaya-217",
  );
  assert.equal(clubFloorPlanTemplateFor({ name: "APEKS" }), null);
  assert.equal(clubFloorPlanTemplateFor({ name: "Ленина 5" }), null);
});

test("an editor can open a known hall for any club", () => {
  assert.equal(
    clubFloorPlanTemplateFor({ name: "APEKS" }, null, "apex-holmogorova-17")
      ?.id,
    "apex-holmogorova-17",
  );
  assert.equal(
    clubFloorPlanTemplateFor({ name: "APEKS" }, null, "../other"),
    null,
  );
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
  assert.equal(
    clubFloorPlanSceneUrl(template, "s1", false, "shift"),
    "/club-scheme/apex-holmogorova-17/index.html?store=s1&embed=shift",
  );
});

test("lists only clubs with a hall for the scene switcher", () => {
  assert.deepEqual(
    clubFloorPlanSwitcher({
      clubs: [
        {
          id: "a",
          name: "1337-Пушкинская",
          address: "г. Ижевск, ул. Пушкинская, 217",
          template: "1337-pushkinskaya-217",
        },
        {
          id: "b",
          name: "1337 Радищева",
          address: "г. Екатеринбург, ул. Радищева, 12",
          template: null,
        },
        {
          id: "c",
          name: "APEKS",
          address: "г. Ижевск, ул. Холмогорова, 43",
          template: null,
        },
        {
          id: "d",
          name: "Старый зал",
          address: null,
          template: "removed-hall",
        },
        { id: 7, name: "broken" },
        null,
      ],
    }),
    {
      clubs: [
        {
          id: "a",
          name: "1337-Пушкинская",
          address: "г. Ижевск, ул. Пушкинская, 217",
          template: "1337-pushkinskaya-217",
        },
        {
          id: "c",
          name: "APEKS",
          address: "г. Ижевск, ул. Холмогорова, 43",
          template: "apex-holmogorova-17",
        },
      ],
    },
  );
  assert.deepEqual(clubFloorPlanSwitcher(null), { clubs: [] });
  assert.deepEqual(clubFloorPlanSwitcher({ clubs: "x" }), { clubs: [] });
});

test("puts the hall of the employee's club on «Моя смена»", () => {
  const body = {
    clubs: [
      { id: "s1", name: "Apex", address: "Холмогорова 17б", template: null },
      { id: "s2", name: "1337", address: "Пушкинская 217", template: null },
      { id: "s3", name: "Без зала", address: null, template: null },
    ],
  };
  assert.deepEqual(clubFloorPlanForShift(body, "s2", null), {
    storeId: "s2",
    name: "1337",
    sceneUrl:
      "/club-scheme/1337-pushkinskaya-217/index.html?store=s2&embed=shift",
    fullUrl: "/visualization?store=s2",
  });
  assert.equal(clubFloorPlanForShift(body, null, "Apex")?.storeId, "s1");
  // Several clubs and none of them the employee's: no hall on the page.
  assert.equal(clubFloorPlanForShift(body, "s3", null), null);
  assert.equal(clubFloorPlanForShift(body, null, null), null);
  assert.equal(
    clubFloorPlanForShift({ clubs: [body.clubs[0]] }, null, null)?.storeId,
    "s1",
  );
  assert.equal(clubFloorPlanForShift(null, "s1", null), null);
});
