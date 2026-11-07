// Guest game tutorial ("Как играть"). Raise the version when a step is added
// or a mechanic changes enough that every guest should see the tour again.
export const GAME_TUTORIAL_VERSION = 1;

export type GameTutorialStep = {
  id: string;
  title: string;
  body: (clubName: string) => string;
  // CSS selectors inside `.lp-club-home`; the spotlight covers every visible
  // match. `null` is a centered card without a spotlight. A step whose
  // targets are all missing (the club has no such block) is skipped.
  targets: readonly string[] | null;
};

// Selectors use the existing ids/classes of the game screen instead of new
// markup, so moving components between files does not break the tour. The
// tutorial-selectors test pins that every selector still exists in the code.
export const GAME_TUTORIAL_STEPS: readonly GameTutorialStep[] = [
  {
    id: "welcome",
    title: "Добро пожаловать в игру",
    body: (clubName) =>
      `Это игра клуба ${clubName}. Выполняйте задания в клубе, поднимайте уровень и забирайте награды. Покажем, что где, за минуту.`,
    targets: null,
  },
  {
    id: "profile",
    title: "Профиль и уровень",
    body: () =>
      "Это вы. Никнейм можно поменять, его видят в рейтинге. За задания начисляется XP, он поднимает уровень.",
    targets: [".lp-club-profile-logo", ".lp-club-profile-section"],
  },
  {
    id: "check-in",
    title: "Чекин",
    body: () =>
      "Пришли в клуб? Отметьтесь здесь. Чекин засчитывает визит и может дать награду.",
    targets: [".lp-club-checkin-card"],
  },
  {
    id: "quests",
    title: "Задания",
    body: () =>
      "Ваши быстрые задачи. Нажмите на задание, чтобы увидеть условие и награду. Все задания открываются кнопкой «Открыть все».",
    targets: [".lp-club-quest-widget"],
  },
  {
    id: "cases",
    title: "Кейсы",
    body: () =>
      "Кейс открывается, когда выполнено его условие. Если он закрыт, нажмите «почему?». В карточке видно, что может выпасть и с каким шансом.",
    targets: ["#lootBoxes"],
  },
  {
    id: "battle-pass",
    title: "Боевой пропуск",
    body: () =>
      "Сезонная цепочка наград. Выполняйте шаг с пометкой «Сейчас», чтобы двигаться дальше. Подробные правила в кнопке «Как работает».",
    targets: ["#battlePass"],
  },
  {
    id: "rewards",
    title: "Награды",
    body: () =>
      "Всё выигранное копится здесь. Нажмите «Забрать», чтобы получить награду, а если появится код, покажите его кассиру в клубе. Ниже история полученных наград.",
    targets: [".lp-club-reward-wallet", ".lp-club-reward-wallet-history"],
  },
  {
    id: "promo",
    title: "Промокод",
    body: () =>
      "Есть промокод от клуба? Введите его здесь и нажмите «Активировать».",
    targets: [".lp-club-promo"],
  },
  {
    // Hidden on phones, where the club name is not in the top bar; the step
    // is then skipped.
    id: "club",
    title: "Другой клуб",
    body: () =>
      "Нажмите на название клуба, чтобы перейти в игру другого клуба сети.",
    targets: [".lp-club-switch"],
  },
  {
    id: "menu",
    title: "Меню",
    body: () =>
      "В меню рейтинг игроков и выход. Пункт «Как играть» снова покажет это обучение.",
    targets: [".lp-club-menu-button"],
  },
];
