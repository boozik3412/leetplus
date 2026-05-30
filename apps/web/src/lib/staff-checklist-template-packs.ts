import type { StaffChecklistShiftKind } from "./staff-checklists";
import type {
  StaffChecklistTemplateRoleScope,
  StaffChecklistTemplateSection,
} from "./staff-checklist-templates";

export type StaffChecklistTemplatePack = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  shiftKind: StaffChecklistShiftKind;
  roleScope: StaffChecklistTemplateRoleScope;
  sections: StaffChecklistTemplateSection[];
};

export const staffChecklistTemplatePacks: StaffChecklistTemplatePack[] = [
  {
    id: "cash-desk-control",
    title: "Касса и деньги",
    subtitle: "Стартовый остаток, терминал, возвраты, инкассация",
    description:
      "Ежедневный контроль кассовой зоны: наличные, терминал, возвраты, инкассация и фиксация расхождений.",
    shiftKind: "CASH",
    roleScope: "ADMINISTRATOR",
    sections: [
      {
        id: "cash-open",
        title: "Открытие кассы",
        description: "Проверка готовности кассы и платежных инструментов.",
        items: [
          {
            id: "cash-start-balance",
            title: "Сверить стартовый остаток",
            instruction:
              "Укажите фактический остаток наличных и сравните его с предыдущей сменой.",
            valueType: "NUMBER",
            required: true,
            evidenceRequired: true,
            score: 3,
          },
          {
            id: "cash-terminal-ready",
            title: "Проверить терминал и QR-оплату",
            instruction:
              "Убедитесь, что терминал, QR-оплата и чековая лента готовы к работе.",
            valueType: "CHECKBOX",
            required: true,
            evidenceRequired: false,
            score: 2,
          },
          {
            id: "cash-price-display",
            title: "Проверить цены и кассовые сценарии",
            instruction:
              "Проверьте доступность тарифов, барных позиций и промо-сценариев на кассе.",
            valueType: "CHECKBOX",
            required: true,
            evidenceRequired: false,
            score: 2,
          },
        ],
      },
      {
        id: "cash-close",
        title: "Закрытие кассы",
        description: "Финальная сверка денег, возвратов и инкассации.",
        items: [
          {
            id: "cash-refunds-review",
            title: "Сверить возвраты и отмены",
            instruction:
              "Проверьте возвраты, отмены и нестандартные операции за смену, приложите комментарий при расхождении.",
            valueType: "TEXT",
            required: true,
            evidenceRequired: true,
            score: 3,
          },
          {
            id: "cash-incassation",
            title: "Зафиксировать инкассацию",
            instruction:
              "Укажите сумму инкассации или причину, почему инкассация не проводилась.",
            valueType: "NUMBER",
            required: true,
            evidenceRequired: true,
            score: 3,
          },
          {
            id: "cash-shortage-note",
            title: "Описать расхождения",
            instruction:
              "Если есть недостача, излишек или спорная операция, опишите причину и кому передана информация.",
            valueType: "TEXT",
            required: false,
            evidenceRequired: false,
            score: 1,
          },
        ],
      },
    ],
  },
  {
    id: "pc-zone-readiness",
    title: "PC-зона",
    subtitle: "ПК, периферия, бронь, порядок в игровом зале",
    description:
      "Проверка готовности игровой зоны: рабочие места, периферия, бронь, чистота и проблемные места.",
    shiftKind: "PC_ZONE",
    roleScope: "ADMINISTRATOR",
    sections: [
      {
        id: "pc-equipment",
        title: "Готовность оборудования",
        description: "Проверка рабочих мест и периферии перед пиковыми часами.",
        items: [
          {
            id: "pc-random-check",
            title: "Проверить выборочные ПК",
            instruction:
              "Проверьте запуск, звук, сеть и периферию минимум на нескольких рабочих местах.",
            valueType: "CHECKBOX",
            required: true,
            evidenceRequired: false,
            score: 3,
          },
          {
            id: "pc-broken-places",
            title: "Зафиксировать неисправные места",
            instruction:
              "Перечислите номера мест с проблемами или укажите, что неисправностей нет.",
            valueType: "TEXT",
            required: true,
            evidenceRequired: false,
            score: 2,
          },
          {
            id: "pc-booking-check",
            title: "Сверить брони и занятость",
            instruction:
              "Проверьте ближайшие брони, VIP/буткемп-зоны и доступность мест для гостей.",
            valueType: "CHECKBOX",
            required: true,
            evidenceRequired: false,
            score: 2,
          },
        ],
      },
      {
        id: "pc-guest-zone",
        title: "Зал и гостевой опыт",
        description: "Порядок, проходы, столы и видимые проблемы в зале.",
        items: [
          {
            id: "pc-clean-tables",
            title: "Проверить столы и кресла",
            instruction:
              "Столы, кресла, гарнитуры и коврики должны быть готовы к посадке гостя.",
            valueType: "CHECKBOX",
            required: true,
            evidenceRequired: false,
            score: 2,
          },
          {
            id: "pc-free-passages",
            title: "Проверить проходы и безопасность",
            instruction:
              "Уберите мусор, провода и любые препятствия в проходах игровой зоны.",
            valueType: "CHECKBOX",
            required: true,
            evidenceRequired: false,
            score: 2,
          },
          {
            id: "pc-photo-problem",
            title: "Фото проблемной зоны",
            instruction:
              "Если есть проблема, приложите фото или ссылку на фото. Если проблем нет, оставьте поле пустым.",
            valueType: "PHOTO_LINK",
            required: false,
            evidenceRequired: false,
            score: 1,
          },
        ],
      },
    ],
  },
  {
    id: "inventory-handover",
    title: "Передача ТМЦ",
    subtitle: "Бар, расходники, техника, опись и расхождения",
    description:
      "Передача материальных ценностей между сменами: бар, расходники, техника, документы и расхождения.",
    shiftKind: "INVENTORY",
    roleScope: "SENIOR_ADMINISTRATOR",
    sections: [
      {
        id: "inventory-count",
        title: "Остатки и расходники",
        description: "Сверка ключевых запасов, которые влияют на смену.",
        items: [
          {
            id: "inventory-bar-count",
            title: "Сверить барные остатки",
            instruction:
              "Проверьте ключевые позиции бара, витрину, холодильник и расходники.",
            valueType: "CHECKBOX",
            required: true,
            evidenceRequired: false,
            score: 3,
          },
          {
            id: "inventory-service-stock",
            title: "Проверить расходники и сервисные материалы",
            instruction:
              "Чековая лента, салфетки, стаканы, уборочные средства и прочие расходники на смену.",
            valueType: "CHECKBOX",
            required: true,
            evidenceRequired: false,
            score: 2,
          },
          {
            id: "inventory-difference",
            title: "Описать расхождения по остаткам",
            instruction:
              "Укажите недостачи, излишки, повреждения или спорные позиции. Если расхождений нет, напишите «нет».",
            valueType: "TEXT",
            required: true,
            evidenceRequired: false,
            score: 2,
          },
        ],
      },
      {
        id: "inventory-documents",
        title: "Фиксация передачи",
        description: "Подтверждение, что смена получила понятную картину по ТМЦ.",
        items: [
          {
            id: "inventory-file-link",
            title: "Приложить опись или фото",
            instruction:
              "Добавьте ссылку на фото полки, опись, акт или другой документ передачи.",
            valueType: "FILE_LINK",
            required: true,
            evidenceRequired: true,
            score: 3,
          },
          {
            id: "inventory-storage-place",
            title: "Проверить места хранения",
            instruction:
              "Подсобка, сейф, склад и холодильники закрыты и понятны следующей смене.",
            valueType: "CHECKBOX",
            required: true,
            evidenceRequired: false,
            score: 2,
          },
          {
            id: "inventory-responsible-note",
            title: "Передать комментарий ответственному",
            instruction:
              "Если есть проблема, укажите кому она передана: управляющий, старший администратор, закупщик.",
            valueType: "TEXT",
            required: false,
            evidenceRequired: false,
            score: 1,
          },
        ],
      },
    ],
  },
  {
    id: "administrator-training",
    title: "Обучение администратора",
    subtitle: "Стажировка, касса, Langame, гостевые ситуации",
    description:
      "Проверка готовности администратора после обучения или стажировки: регламент, касса, Langame, сервис и допуск.",
    shiftKind: "CUSTOM",
    roleScope: "MANAGER",
    sections: [
      {
        id: "training-basics",
        title: "Базовая подготовка",
        description: "Что сотрудник должен понимать до самостоятельной смены.",
        items: [
          {
            id: "training-regulations",
            title: "Ознакомлен с регламентами смены",
            instruction:
              "Проверьте, что сотрудник знает дневной/ночной регламент, порядок передачи смены и правила эскалации.",
            valueType: "CHECKBOX",
            required: true,
            evidenceRequired: false,
            score: 3,
          },
          {
            id: "training-cash",
            title: "Понимает кассовые сценарии",
            instruction:
              "Продажа, возврат, отмена, инкассация, закрытие смены и фиксация расхождений.",
            valueType: "CHECKBOX",
            required: true,
            evidenceRequired: false,
            score: 3,
          },
          {
            id: "training-langame",
            title: "Понимает рабочие сценарии Langame/LGS",
            instruction:
              "Посадка гостя, бронь, пополнение, списание, барная продажа и базовые ошибки.",
            valueType: "CHECKBOX",
            required: true,
            evidenceRequired: false,
            score: 3,
          },
        ],
      },
      {
        id: "training-approval",
        title: "Допуск к работе",
        description: "Решение наставника или управляющего по готовности сотрудника.",
        items: [
          {
            id: "training-conflict-case",
            title: "Разобран гостевой конфликт",
            instruction:
              "Смоделируйте спорную ситуацию с гостем и зафиксируйте, как сотрудник ее решает.",
            valueType: "TEXT",
            required: true,
            evidenceRequired: false,
            score: 3,
          },
          {
            id: "training-mentor-note",
            title: "Комментарий наставника",
            instruction:
              "Что получается хорошо, что нужно доработать, какие риски есть перед самостоятельной сменой.",
            valueType: "TEXT",
            required: true,
            evidenceRequired: false,
            score: 2,
          },
          {
            id: "training-ready",
            title: "Допустить к самостоятельной смене",
            instruction:
              "Отметьте только если сотрудник готов работать без постоянного контроля наставника.",
            valueType: "CHECKBOX",
            required: true,
            evidenceRequired: true,
            score: 4,
          },
        ],
      },
    ],
  },
];
