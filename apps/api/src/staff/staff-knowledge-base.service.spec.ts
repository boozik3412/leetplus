import {
  StaffKnowledgeBaseService,
  type StaffKnowledgeArticleDto,
} from './staff-knowledge-base.service';

type NormalizeArticleData = (
  tenantId: string,
  dto: StaffKnowledgeArticleDto,
  options: { requireTitle: boolean },
) => Promise<{ content?: string | null }>;

describe('StaffKnowledgeBaseService', () => {
  it('preserves an explicit null content update so native attachments can be unbound', async () => {
    const service = new StaffKnowledgeBaseService(
      {} as never,
      {} as never,
      {} as never,
    );
    const subject = service as unknown as {
      normalizeArticleData: NormalizeArticleData;
    };

    await expect(
      subject.normalizeArticleData(
        'tenant-a',
        { content: null },
        { requireTitle: false },
      ),
    ).resolves.toEqual({ content: null });
  });
});
