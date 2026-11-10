// Halls drawn for «Схема клуба». Each template is a static 3D scene in
// public/club-scheme/<id>/; the saved layout of a club names its template.
// No runtime imports so the node:test suite can load it directly.

export type ClubFloorPlanTemplate = {
  id: string;
  title: string;
  /** Recognises the club by its name or address before a plan is saved. */
  matches: RegExp;
};

export const CLUB_FLOOR_PLAN_TEMPLATES: readonly ClubFloorPlanTemplate[] = [
  {
    id: "apex-holmogorova-17",
    title: "Apex · Холмогорова 17б",
    matches: /холмогоров/iu,
  },
  {
    id: "1337-pushkinskaya-217",
    title: "1337 · Пушкинская 217",
    matches: /пушкинск/iu,
  },
];

export function clubFloorPlanTemplateById(id: string | null | undefined) {
  return id
    ? (CLUB_FLOOR_PLAN_TEMPLATES.find((template) => template.id === id) ?? null)
    : null;
}

/**
 * The hall of a club: the saved plan wins, then a hall the editor picked on
 * the page, then a hall recognised by the club name or address.
 */
export function clubFloorPlanTemplateFor(
  store: { name: string; address?: string | null },
  savedTemplate?: string | null,
  chosenTemplate?: string | null,
): ClubFloorPlanTemplate | null {
  if (savedTemplate) {
    return clubFloorPlanTemplateById(savedTemplate);
  }

  return (
    clubFloorPlanTemplateById(chosenTemplate) ??
    CLUB_FLOOR_PLAN_TEMPLATES.find(
      (template) =>
        template.matches.test(store.name) ||
        Boolean(store.address && template.matches.test(store.address)),
    ) ??
    null
  );
}

export function clubFloorPlanSceneUrl(
  template: ClubFloorPlanTemplate,
  storeId: string,
  canEdit: boolean,
) {
  const params = new URLSearchParams({ store: storeId });
  if (canEdit) {
    params.set("edit", "1");
  }
  return `/club-scheme/${template.id}/index.html?${params.toString()}`;
}
