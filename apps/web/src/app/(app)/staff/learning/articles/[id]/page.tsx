import { notFound, redirect } from "next/navigation";
import { StaffArticleDocumentEditor } from "@/components/staff-article-document-editor";
import { requirePageAccess } from "@/lib/auth";
import { getStaffKnowledgeBaseReport } from "@/lib/staff-knowledge-base";

type Params = Promise<{ id: string }>;

export default async function StaffLearningArticlePage({
  params,
}: {
  params: Params;
}) {
  await requirePageAccess("/staff/learning/articles");
  const { id } = await params;
  const report = await getStaffKnowledgeBaseReport({ status: "all" });
  const article = report.rows.find((row) => row.id === id);

  if (!article) {
    notFound();
  }

  // Information messages are posted to the team chat; they keep their own
  // editor.
  if (article.kind === "INFORMATION") {
    redirect(
      `/staff/knowledge-base?articleId=${encodeURIComponent(article.id)}`,
    );
  }

  const attachments = [
    ...article.materials.map((material) => ({
      id: `material-${material.id}`,
      title: material.title,
      url: material.url,
      note: material.note,
    })),
    ...article.relatedLinks.map((link) => ({
      id: `link-${link.id}`,
      title: link.title,
      url: link.url,
      note: link.note,
    })),
  ];

  return (
    <StaffArticleDocumentEditor
      articleId={article.id}
      initialDraft={{
        title: article.title,
        summary: article.summary ?? "",
        content: article.content ?? "",
        folder: article.folder,
        roleScope: article.roleScope,
        storeId: article.store?.id ?? "",
        requiresReading: article.requiresReading,
      }}
      initialStatus={article.status}
      initialUpdatedAt={article.updatedAt}
      version={article.version}
      // The latest publication: approvedAt moves with every new version.
      publishedAt={article.approvedAt ?? article.publishedAt}
      rights={{
        canManage: report.canManageKnowledge && article.canManage,
        canEdit: report.canEditKnowledge,
        canReview: report.canReviewKnowledge,
        canPublish: report.canPublishKnowledge,
      }}
      accessScope={report.accessScope}
      stores={report.stores.map((store) => ({
        id: store.id,
        name: store.name,
      }))}
      folders={report.folders}
      attachments={attachments}
      reading={{
        requiresReading: article.requiresReading,
        requiredCount: article.readingSummary.requiredCount,
        readCount: article.readingSummary.readCount,
        requiredByMe: article.readingSummary.requiredByMe,
        readByMe: article.readingSummary.readByMe,
      }}
    />
  );
}
