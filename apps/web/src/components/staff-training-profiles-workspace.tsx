"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  type StaffTrainingProfileAssessment,
  type StaffTrainingProfileCourse,
  type StaffTrainingProfileRow,
  type StaffTrainingProfilesReport,
  type StaffTrainingProgressStatus,
} from "@/lib/staff-training-profiles";
import { getRoleLabel } from "@/lib/roles";

const progressStatusLabels: Record<StaffTrainingProgressStatus, string> = {
  NOT_STARTED: "Не начато",
  IN_PROGRESS: "В работе",
  COMPLETED: "Завершено",
  WAIVED: "Снято",
};

const assessmentStatusLabels: Record<
  StaffTrainingProfileAssessment["status"],
  string
> = {
  PASSED: "Сдано",
  FAILED: "Не сдано",
  PENDING: "Ожидает",
  EXPIRED: "Истекло",
};

export function StaffTrainingProfilesWorkspace({
  report,
}: {
  report: StaffTrainingProfilesReport;
}) {
  const router = useRouter();
  const [selectedUserId, setSelectedUserId] = useState(
    report.rows[0]?.user.id ?? "",
  );
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedProfile = useMemo(
    () =>
      report.rows.find((row) => row.user.id === selectedUserId) ??
      report.rows[0] ??
      null,
    [report.rows, selectedUserId],
  );

  async function updateProgress(
    profile: StaffTrainingProfileRow,
    course: StaffTrainingProfileCourse,
    status: StaffTrainingProgressStatus,
    progressPercent?: number,
  ) {
    setError(null);
    setPendingKey(`${profile.user.id}:${course.id}:${status}`);

    try {
      const response = await fetch("/api/staff/training-profiles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: profile.user.id,
          courseId: course.id,
          status,
          progressPercent,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(data?.message ?? "Не удалось обновить прогресс");
      }

      startTransition(() => router.refresh());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка запроса");
    } finally {
      setPendingKey(null);
    }
  }

  if (report.rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
        По текущим фильтрам нет сотрудников с назначенными курсами или
        аттестациями.
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <section className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
              Сотрудники
            </p>
            <h2 className="text-lg font-semibold">Профили обучения</h2>
          </div>
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
            {report.rows.length}
          </span>
        </div>

        <div className="mt-3 space-y-2">
          {report.rows.map((row) => (
            <button
              key={row.user.id}
              type="button"
              onClick={() => setSelectedUserId(row.user.id)}
              className={[
                "w-full rounded-lg border p-3 text-left transition hover:-translate-y-0.5 hover:border-emerald-500/60 hover:bg-emerald-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70",
                selectedProfile?.user.id === row.user.id
                  ? "border-emerald-500 bg-emerald-500/10"
                  : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {row.user.fullName ?? row.user.email}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {getRoleLabel(row.user.role)}
                  </p>
                </div>
                {row.overdueCoursesCount > 0 ? (
                  <span className="rounded-full bg-rose-500/10 px-2 py-1 text-xs font-semibold text-rose-600 dark:text-rose-300">
                    {row.overdueCoursesCount}
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    {row.progressPercent}%
                  </span>
                )}
              </div>
              <ProgressBar value={row.progressPercent} className="mt-3" />
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500">
                <span>{row.completedCoursesCount}/{row.assignedCoursesCount} курсов</span>
                <span>{row.pendingAssessmentsCount} аттестаций</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="min-w-0 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        {selectedProfile ? (
          <>
            <ProfileHeader profile={selectedProfile} />

            {error ? (
              <div className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-200">
                {error}
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold">Курсы</h3>
                  <span className="text-xs text-zinc-500">
                    {selectedProfile.completedCoursesCount}/
                    {selectedProfile.assignedCoursesCount} завершено
                  </span>
                </div>
                {selectedProfile.courses.length > 0 ? (
                  selectedProfile.courses.map((course) => {
                    const disabled = Boolean(pendingKey) || isPending;

                    return (
                      <article
                        key={course.id}
                        className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:border-zinc-700"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-semibold">{course.title}</h4>
                              {course.required ? (
                                <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                                  Обязательный
                                </span>
                              ) : null}
                              {course.progress.overdue ? (
                                <span className="rounded-full bg-rose-500/10 px-2 py-1 text-xs font-semibold text-rose-700 dark:text-rose-300">
                                  Просрочен
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                              {course.store?.name ?? "Вся сеть"} · {course.stepsCount} шагов
                            </p>
                          </div>
                          <StatusPill status={course.progress.status} />
                        </div>

                        <div className="mt-4">
                          <div className="flex items-center justify-between text-xs text-zinc-500">
                            <span>Прогресс</span>
                            <span>{course.progress.progressPercent}%</span>
                          </div>
                          <ProgressBar
                            value={course.progress.progressPercent}
                            className="mt-2"
                          />
                        </div>

                        <div className="mt-3 grid gap-2 text-xs text-zinc-500 sm:grid-cols-3">
                          <span>Срок: {formatDate(course.progress.dueAt) ?? "не задан"}</span>
                          <span>
                            Завершено:{" "}
                            {formatDate(course.progress.completedAt) ?? "нет"}
                          </span>
                          <span>
                            Сертификат:{" "}
                            {formatDate(course.progress.certificateExpiresAt) ??
                              "без срока"}
                          </span>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <ActionButton
                            disabled={disabled}
                            activeKey={pendingKey}
                            actionKey={`${selectedProfile.user.id}:${course.id}:IN_PROGRESS`}
                            onClick={() =>
                              updateProgress(
                                selectedProfile,
                                course,
                                "IN_PROGRESS",
                                Math.max(course.progress.progressPercent, 10),
                              )
                            }
                          >
                            Начать
                          </ActionButton>
                          <ActionButton
                            disabled={disabled}
                            activeKey={pendingKey}
                            actionKey={`${selectedProfile.user.id}:${course.id}:IN_PROGRESS`}
                            onClick={() =>
                              updateProgress(
                                selectedProfile,
                                course,
                                "IN_PROGRESS",
                                50,
                              )
                            }
                          >
                            50%
                          </ActionButton>
                          <ActionButton
                            disabled={disabled}
                            activeKey={pendingKey}
                            actionKey={`${selectedProfile.user.id}:${course.id}:COMPLETED`}
                            onClick={() =>
                              updateProgress(selectedProfile, course, "COMPLETED")
                            }
                          >
                            Завершить
                          </ActionButton>
                          {report.canManageTraining ? (
                            <ActionButton
                              disabled={disabled}
                              activeKey={pendingKey}
                              actionKey={`${selectedProfile.user.id}:${course.id}:WAIVED`}
                              onClick={() =>
                                updateProgress(selectedProfile, course, "WAIVED")
                              }
                              muted
                            >
                              Снять
                            </ActionButton>
                          ) : null}
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <EmptyState text="Курсы для роли и клуба сотрудника пока не назначены." />
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold">Аттестации</h3>
                  <span className="text-xs text-zinc-500">
                    {selectedProfile.pendingAssessmentsCount} ожидают
                  </span>
                </div>
                {selectedProfile.assessments.length > 0 ? (
                  selectedProfile.assessments.map((assessment) => (
                    <AssessmentCard
                      key={assessment.id}
                      assessment={assessment}
                    />
                  ))
                ) : (
                  <EmptyState text="Активных тестов или аттестаций для сотрудника нет." />
                )}
              </div>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

function ProfileHeader({ profile }: { profile: StaffTrainingProfileRow }) {
  const metrics = [
    { label: "Прогресс", value: `${profile.progressPercent}%` },
    { label: "Курсы", value: `${profile.completedCoursesCount}/${profile.assignedCoursesCount}` },
    { label: "Просрочки", value: profile.overdueCoursesCount },
    { label: "Сертификаты", value: profile.validCertificatesCount },
  ];

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
            Профиль
          </p>
          <h2 className="mt-1 text-2xl font-semibold">
            {profile.user.fullName ?? profile.user.email}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {getRoleLabel(profile.user.role)} ·{" "}
            {profile.user.stores.length > 0
              ? profile.user.stores.map((store) => store.name).join(", ")
              : "вся сеть"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <p className="text-xs text-zinc-500">{metric.label}</p>
              <p className="text-lg font-semibold">{metric.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AssessmentCard({
  assessment,
}: {
  assessment: StaffTrainingProfileAssessment;
}) {
  return (
    <article className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:border-zinc-700">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold">{assessment.title}</h4>
            <span className="rounded-full bg-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {assessment.assessmentKind === "TEST" ? "Тест" : "Аттестация"}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {assessment.store?.name ?? "Вся сеть"} · порог {assessment.passThreshold}%
          </p>
        </div>
        <AssessmentStatusPill status={assessment.status} />
      </div>
      {assessment.latestResult ? (
        <div className="mt-3 grid gap-2 text-xs text-zinc-500 sm:grid-cols-3">
          <span>Попытка: {assessment.latestResult.attemptNumber}</span>
          <span>Баллы: {assessment.latestResult.score}%</span>
          <span>
            До: {formatDate(assessment.latestResult.expiresAt) ?? "без срока"}
          </span>
        </div>
      ) : null}
    </article>
  );
}

function ProgressBar({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  return (
    <div
      className={[
        "h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800",
        className,
      ].join(" ")}
    >
      <div
        className="h-full rounded-full bg-emerald-500 transition-all"
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
      />
    </div>
  );
}

function StatusPill({ status }: { status: StaffTrainingProgressStatus }) {
  const palette =
    status === "COMPLETED"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : status === "WAIVED"
        ? "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300"
        : status === "IN_PROGRESS"
          ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
          : "bg-amber-500/10 text-amber-700 dark:text-amber-300";

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${palette}`}>
      {progressStatusLabels[status]}
    </span>
  );
}

function AssessmentStatusPill({
  status,
}: {
  status: StaffTrainingProfileAssessment["status"];
}) {
  const palette =
    status === "PASSED"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : status === "FAILED" || status === "EXPIRED"
        ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
        : "bg-amber-500/10 text-amber-700 dark:text-amber-300";

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${palette}`}>
      {assessmentStatusLabels[status]}
    </span>
  );
}

function ActionButton({
  children,
  disabled,
  activeKey,
  actionKey,
  onClick,
  muted = false,
}: {
  children: ReactNode;
  disabled: boolean;
  activeKey: string | null;
  actionKey: string;
  onClick: () => void;
  muted?: boolean;
}) {
  const active = activeKey === actionKey;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "rounded-md border px-3 py-2 text-sm font-semibold transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60",
        muted
          ? "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          : "border-zinc-950 bg-zinc-950 text-white hover:bg-zinc-800 dark:border-emerald-400 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300",
      ].join(" ")}
    >
      {active ? "Сохраняю..." : children}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-800">
      {text}
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}
