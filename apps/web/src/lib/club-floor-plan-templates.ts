// Halls drawn for «Схема клуба». Each template is a static 3D scene in
// public/club-scheme/<id>/; the saved layout of a club names its template.
// No runtime imports so the node:test suite can load it directly.

export type ClubFloorPlanTemplate = {
  id: string;
  title: string;
  /** Recognises the club before its plan was ever saved. */
  matches: RegExp;
};

export const CLUB_FLOOR_PLAN_TEMPLATES: readonly ClubFloorPlanTemplate[] = [
  {
    id: "apex-holmogorova-17",
    title: "Apex · Холмогорова 17",
    matches: /холмогорова\D{0,4}17(?!\d)/iu,
  },
];

export function clubFloorPlanTemplateFor(
  store: { name: string; address?: string | null },
  savedTemplate?: string | null,
): ClubFloorPlanTemplate | null {
  if (savedTemplate) {
    return (
      CLUB_FLOOR_PLAN_TEMPLATES.find(
        (template) => template.id === savedTemplate,
      ) ?? null
    );
  }

  return (
    CLUB_FLOOR_PLAN_TEMPLATES.find(
      (template) =>
        template.matches.test(store.name) ||
        Boolean(store.address && template.matches.test(store.address)),
    ) ?? null
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
