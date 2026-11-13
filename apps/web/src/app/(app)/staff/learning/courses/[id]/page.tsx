import { notFound } from "next/navigation";
import { StaffCourseDocumentEditor } from "@/components/staff-course-document-editor";
import { requirePageAccess } from "@/lib/auth";
import type { CourseDraft } from "@/lib/learning-course-editor";
import { canAccessPath } from "@/lib/permissions";
import {
  getStaffKnowledgeBaseReport,
  type StaffKnowledgeBaseReport,
} from "@/lib/staff-knowledge-base";
import { getStaffTrainingCoursesReport } from "@/lib/staff-training-courses";

type Params = Promise<{ id: string }>;

export default async function StaffLearningCoursePage({
  params,
}: {
  params: Params;
}) {
  const user = await requirePageAccess("/staff/learning/courses");
  const { id } = await params;

  const [training, knowledge] = await Promise.all([
    getStaffTrainingCoursesReport({ status: "all" }),
    canAccessPath(user, "/staff/knowledge-base")
      ? getStaffKnowledgeBaseReport({ status: "all" }).catch(
          () => null as StaffKnowledgeBaseReport | null,
        )
      : Promise.resolve(null),
  ]);

  const course = training.rows.find((row) => row.id === id);

  if (!course) {
    notFound();
  }

  const initialDraft: CourseDraft = {
    title: course.title,
    description: course.description ?? "",
    roleScope: course.roleScope,
    status: course.status,
    required: course.required,
    dueDays: course.dueDays === null ? "" : String(course.dueDays),
    storeId: course.store?.id ?? "",
    steps: course.steps.map((step) => ({
      id: step.id,
      title: step.title,
      type: step.type,
      articleId: step.articleId,
      content: step.content,
      url: step.url,
      required: step.required,
    })),
  };

  const articleIds = new Set(
    course.steps.flatMap((step) => (step.articleId ? [step.articleId] : [])),
  );
  const articleOptions = training.knowledgeArticles.map((article) => ({
    id: article.id,
    title: article.title,
    category: article.category,
  }));
  const articleContents = (knowledge?.rows ?? []).map((article) => ({
    id: article.id,
    title: article.title,
    folder: article.folder,
    content: article.content,
    summary: article.summary,
  }));

  // Keep course articles readable even when the knowledge base report is
  // unavailable: they still appear by title from the training report.
  for (const option of articleOptions) {
    if (
      articleIds.has(option.id) &&
      !articleContents.some((article) => article.id === option.id)
    ) {
      articleContents.push({
        id: option.id,
        title: option.title,
        folder: option.category,
        content: null,
        summary: null,
      });
    }
  }

  return (
    <StaffCourseDocumentEditor
      courseId={course.id}
      initialDraft={initialDraft}
      initialUpdatedAt={course.updatedAt}
      canManage={course.canManage && training.canManageTraining}
      accessScope={training.accessScope}
      stores={training.stores.map((store) => ({
        id: store.id,
        name: store.name,
      }))}
      articleOptions={articleOptions}
      articleContents={articleContents}
    />
  );
}
