"use client";

import type { CheckInCompletionDialog } from "../types";
import { formatDate } from "../format";

export function CheckInCompletionModal({
  completion,
  onClose,
}: {
  completion: CheckInCompletionDialog;
  onClose: () => void;
}) {
  const titleId = completion.error
    ? "checkInErrorTitle"
    : completion.alreadyCounted
      ? "checkInAlreadyCountedTitle"
      : "checkInCompleteTitle";
  const rewardCaption = completion.error
    ? "Причина"
    : completion.alreadyCounted
      ? completion.rewardLabel
        ? "Ранее получено"
        : "Результат"
      : completion.rewardLabel
        ? "Вы получили"
        : "Результат";
  const rewardValue =
    (completion.error ? completion.note : completion.rewardLabel) ??
    (completion.error
      ? "Проверьте условия чек-ина и попробуйте еще раз."
      : completion.alreadyCounted
        ? "Повторная награда не начисляется"
        : "Чекин засчитан");

  return (
    <div
      className="lp-quest-complete-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          onClose();
        }
      }}
    >
      <div
        className={`lp-quest-complete-dialog${completion.error ? " is-error" : ""}`}
      >
        <button
          type="button"
          className="lp-quest-complete-close"
          aria-label="Закрыть сообщение о чек-ине"
          onClick={onClose}
        >
          ×
        </button>
        <span className="lp-quest-complete-kicker">
          {completion.error
            ? "Чекин недоступен"
            : completion.alreadyCounted
              ? "Чекин уже засчитан"
              : "Чекин успешен"}
        </span>
        <h3 id={titleId}>
          {completion.error
            ? "Не удалось сделать чекин"
            : completion.alreadyCounted
              ? "Сегодня уже отмечались"
              : "Поздравляем!"}
        </h3>
        <div className="lp-quest-complete-reward">
          <span>{rewardCaption}</span>
          <strong>{rewardValue}</strong>
        </div>
        <div className="lp-quest-complete-meta">
          <span>
            {completion.error
              ? "Проверка чек-ина"
              : completion.alreadyCounted
                ? "Последний засчитанный чекин"
                : "Присутствие в клубе засчитано"}
          </span>
          <span>{formatDate(completion.receivedAt)}</span>
        </div>
        {completion.note && !completion.error ? (
          <p className="lp-checkin-complete-note">{completion.note}</p>
        ) : null}
        <button
          type="button"
          className="lp-quest-complete-action"
          onClick={onClose}
        >
          {completion.error
            ? "Понятно"
            : completion.alreadyCounted
              ? "Понятно"
              : "Отлично"}
        </button>
      </div>
    </div>
  );
}
