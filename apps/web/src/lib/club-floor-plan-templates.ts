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
  {
    id: "1337-radishcheva-12",
    title: "1337 · Радищева 12",
    matches: /радищев/iu,
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

/**
 * Roles that work in the hall (administrators and the managers above them)
 * get the calm scene: no cars and passers-by in the street, guests do not
 * walk in, and the map turns only when the viewer turns it (user, 14.11).
 */
export const CALM_CLUB_FLOOR_PLAN_ROLES: readonly string[] = [
  "TRAINEE",
  "CLUB_ADMINISTRATOR",
  "SENIOR_ADMINISTRATOR",
  "STANDARDS_MANAGER",
  "CLUB_MANAGER",
  "MANAGER",
];

export function clubFloorPlanCalmFor(role: string | null | undefined) {
  return !!role && CALM_CLUB_FLOOR_PLAN_ROLES.includes(role);
}

/**
 * `embed: "shift"` is the calm hall on «Моя смена»: no street traffic, no
 * auto-rotation, hints over the guests and the guests' messages in the panel.
 * `calm` is the same quiet hall on the full scene (see the roles above).
 */
export function clubFloorPlanSceneUrl(
  template: ClubFloorPlanTemplate,
  storeId: string,
  canEdit: boolean,
  embed?: "shift",
  calm = false,
) {
  const params = new URLSearchParams({ store: storeId });
  if (canEdit) {
    params.set("edit", "1");
  }
  if (embed) {
    params.set("embed", embed);
  } else if (calm) {
    params.set("calm", "1");
  }
  return `/club-scheme/${template.id}/index.html?${params.toString()}`;
}

/** Night still of the hall for the «Сейчас в клубах» banner on «Сводка». */
export function clubFloorPlanPreviewUrl(templateId: string) {
  return `/club-scheme/${encodeURIComponent(templateId)}/preview-dark.jpg`;
}

/**
 * Clubs for the switcher of the full-screen scene: only clubs with a hall,
 * resolved the same way as on /visualization (saved plan, then name or
 * address). Unknown or malformed rows are dropped.
 */
export function clubFloorPlanSwitcher(body: unknown) {
  const rows =
    body &&
    typeof body === "object" &&
    Array.isArray((body as { clubs?: unknown }).clubs)
      ? (body as { clubs: unknown[] }).clubs
      : [];
  const clubs: {
    id: string;
    name: string;
    address: string | null;
    template: string;
  }[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const { id, name, address, template } = row as Record<string, unknown>;
    if (typeof id !== "string" || typeof name !== "string") {
      continue;
    }
    const hall = clubFloorPlanTemplateFor(
      { name, address: typeof address === "string" ? address : null },
      typeof template === "string" ? template : null,
    );
    if (hall) {
      clubs.push({
        id,
        name,
        address: typeof address === "string" ? address : null,
        template: hall.id,
      });
    }
  }
  return { clubs };
}

/**
 * The hall on «Моя смена»: the club of the employee, then the club of the
 * open shift, then the only club with a hall in the viewer's scope. Several
 * clubs and none of them his own: no hall, the full scene stays one click away.
 */
export function clubFloorPlanForShift(
  body: unknown,
  staffStoreId: string | null,
  shiftStoreName: string | null,
) {
  const { clubs } = clubFloorPlanSwitcher(body);
  const club =
    (staffStoreId ? clubs.find((row) => row.id === staffStoreId) : null) ??
    (shiftStoreName
      ? clubs.find((row) => row.name === shiftStoreName)
      : null) ??
    (clubs.length === 1 ? clubs[0] : null);
  const template = club ? clubFloorPlanTemplateById(club.template) : null;
  return club && template
    ? {
        storeId: club.id,
        name: club.name,
        sceneUrl: clubFloorPlanSceneUrl(template, club.id, false, "shift"),
        fullUrl: `/visualization?store=${encodeURIComponent(club.id)}`,
      }
    : null;
}
