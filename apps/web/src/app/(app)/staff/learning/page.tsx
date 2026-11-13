import { StaffLearningHome } from "@/components/staff-learning-home";
import { requirePageAccess } from "@/lib/auth";
import {
  buildLearningDocuments,
  countLearningDocuments,
  filterLearningDocuments,
  isLearningFilter,
  learningTemplates,
} from "@/lib/learning-documents";
import { canAccessPath } from "@/lib/permissions";
import {
  getStaffAssessmentsReport,
  type StaffAssessmentsReport,
} from "@/lib/staff-assessments";
import {
  getStaffKnowledgeBaseReport,
  type StaffKnowledgeBaseReport,
} from "@/lib/staff-knowledge-base";
import {
  getStaffTrainingCoursesReport,
  type StaffTrainingCoursesReport,
} from "@/lib/staff-training-courses";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function StaffLearningPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requirePageAccess("/staff/learning");
  const params = await searchParams;
  const filterParam = searchParam(params.type);
  const filter = isLearningFilter(filterParam) ? filterParam : "all";
  const search = searchParam(params.q)?.trim() ?? "";
  const view = searchParam(params.view) === "list" ? "list" : "grid";

  const canSeeCourses = canAccessPath(user, "/staff/training-courses");
  const canSeeArticles = canAccessPath(user, "/staff/knowledge-base");
  const canSeeTests = canAccessPath(user, "/staff/assessments");

  const [training, knowledge, assessments] = await Promise.all([
    canSeeCourses
      ? getStaffTrainingCoursesReport({ status: "all" }).catch(
          () => null as StaffTrainingCoursesReport | null,
        )
      : Promise.resolve(null),
    canSeeArticles
      ? getStaffKnowledgeBaseReport({ status: "all" }).catch(
          () => null as StaffKnowledgeBaseReport | null,
        )
      : Promise.resolve(null),
    canSeeTests
      ? getStaffAssessmentsReport({ status: "all" }).catch(
          () => null as StaffAssessmentsReport | null,
        )
      : Promise.resolve(null),
  ]);

  const documents = buildLearningDocuments(
    training?.rows ?? [],
    knowledge?.rows ?? [],
    new Date(),
    assessments?.rows ?? [],
  );
  const counts = countLearningDocuments(documents);
  const visible = filterLearningDocuments(documents, filter, search);

  const canCreateCourses = training?.canManageTraining === true;
  const canCreateArticles = knowledge?.canEditKnowledge === true;
  const canCreateTests = assessments?.canManageAssessments === true;
  const templates = learningTemplates.filter((template) =>
    template.kind === "COURSE"
      ? canCreateCourses
      : template.kind === "TEST"
        ? canCreateTests
        : canCreateArticles,
  );
  const accessScope = training?.accessScope ?? knowledge?.accessScope;
  const stores = training?.stores ?? knowledge?.stores ?? [];
  const defaultStoreId =
    accessScope === "STORES" ? (stores[0]?.id ?? null) : null;

  return (
    <StaffLearningHome
      documents={visible}
      counts={counts}
      filter={filter}
      search={search}
      view={view}
      templates={templates}
      defaultStoreId={defaultStoreId}
      loadFailed={
        (canSeeCourses && training === null) ||
        (canSeeArticles && knowledge === null) ||
        (canSeeTests && assessments === null)
      }
    />
  );
}
