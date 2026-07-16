import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  CategorySourceMappingStatus,
  IntegrationProvider,
  Prisma,
  UserRole,
} from '@prisma/client';
import { hasCapability } from '../auth/capabilities';
import type { AuthenticatedUser } from '../auth/auth.types';
import { LangameSyncService } from '../integrations/langame-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type {
  ApplyCategorySourceMappingsDto,
  CategorySourceMappingDto,
  PreviewCategorySourceMappingsDto,
} from './categories.dto';

const MAX_MAPPING_PROPOSALS = 100;
const MAX_PRODUCT_RESOLUTIONS = 500;

type MappingTarget = {
  externalDomain: string;
  externalGroupId: string;
  action: 'MAP' | 'UNMAP';
  categoryId: string | null;
  categoryName: string | null;
  createCategoryName: string | null;
  status: CategorySourceMappingStatus;
  confidence: number | null;
};

type PreviewCategoryTarget = {
  id: string | null;
  name: string;
  isNew: boolean;
};

type BulkAssignmentTarget = {
  categoryId: string;
  externalDomain: string;
  externalGroupId: string;
};

@Injectable()
export class ProductCategoryCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
    private readonly langameSyncService: LangameSyncService,
  ) {}

  async getLangameOverview(user?: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const [groups, configurations, categories, mappings] = await Promise.all([
      this.prisma.langameProductGroup.findMany({
        where: { tenantId },
        orderBy: [
          { externalDomain: 'asc' },
          { isActive: 'desc' },
          { name: 'asc' },
        ],
      }),
      this.prisma.langameClubProductConfiguration.findMany({
        where: { tenantId, isActive: true },
        select: {
          externalDomain: true,
          externalGroupId: true,
          externalProductId: true,
          productId: true,
          storeId: true,
          product: {
            select: {
              categoryId: true,
            },
          },
        },
      }),
      this.prisma.category.findMany({
        where: { tenantId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.categorySourceMapping.findMany({
        where: { tenantId, source: IntegrationProvider.LANGAME },
        include: {
          category: {
            select: { id: true, name: true },
          },
        },
      }),
    ]);

    const groupsByKey = new Map(
      groups.map((group) => [this.externalKey(group.externalDomain, group.externalGroupId), group]),
    );
    const mappingsByKey = new Map(
      mappings.map((mapping) => [
        this.externalKey(mapping.externalDomain, mapping.externalGroupId),
        mapping,
      ]),
    );
    const categoriesByNormalizedName = this.indexCategoriesByNormalizedName(categories);
    const statsByKey = new Map<
      string,
      {
        productKeys: Set<string>;
        linkedProductIds: Set<string>;
        uncategorizedProductIds: Set<string>;
        storeIds: Set<string>;
        unmatchedProductCount: number;
        conflictProductIds: Set<string>;
      }
    >();
    let configurationsWithoutGroup = 0;
    let configurationsWithUnavailableGroup = 0;

    for (const configuration of configurations) {
      if (!configuration.externalGroupId) {
        configurationsWithoutGroup += 1;
        continue;
      }

      const key = this.externalKey(
        configuration.externalDomain,
        configuration.externalGroupId,
      );
      const group = groupsByKey.get(key);

      if (!group) {
        configurationsWithUnavailableGroup += 1;
        continue;
      }

      const stats =
        statsByKey.get(key) ??
        {
          productKeys: new Set<string>(),
          linkedProductIds: new Set<string>(),
          uncategorizedProductIds: new Set<string>(),
          storeIds: new Set<string>(),
          unmatchedProductCount: 0,
          conflictProductIds: new Set<string>(),
        };
      const productKey =
        configuration.productId ??
        `${configuration.externalDomain}:${configuration.externalProductId}`;
      const mapping = mappingsByKey.get(key);

      stats.productKeys.add(productKey);
      stats.storeIds.add(configuration.storeId);

      if (!configuration.productId) {
        stats.unmatchedProductCount += 1;
      } else {
        stats.linkedProductIds.add(configuration.productId);

        if (!configuration.product?.categoryId) {
          stats.uncategorizedProductIds.add(configuration.productId);
        }

        if (
          mapping?.status === CategorySourceMappingStatus.CONFIRMED &&
          configuration.product?.categoryId &&
          configuration.product.categoryId !== mapping.categoryId
        ) {
          stats.conflictProductIds.add(configuration.productId);
        }
      }

      statsByKey.set(key, stats);
    }

    const latestSyncedAt = groups.reduce<Date | null>((latest, group) => {
      if (!latest || group.syncedAt > latest) {
        return group.syncedAt;
      }

      return latest;
    }, null);
    const warnings: string[] = [];

    if (groups.length === 0) {
      warnings.push('Группы Langame ещё не синхронизированы.');
    }

    if (configurationsWithoutGroup > 0) {
      warnings.push(
        `${configurationsWithoutGroup} конфигураций Langame не содержат группу.`,
      );
    }

    if (configurationsWithUnavailableGroup > 0) {
      warnings.push(
        `${configurationsWithUnavailableGroup} конфигураций ссылаются на недоступную или неактивную группу Langame.`,
      );
    }

    return {
      source: 'LANGAME' as const,
      latestSyncedAt: latestSyncedAt?.toISOString() ?? null,
      warnings,
      summary: {
        groups: groups.length,
        activeGroups: groups.filter((group) => group.isActive && !group.isDeleted)
          .length,
        configurationsWithoutGroup,
        configurationsWithUnavailableGroup,
        unlinkedProducts: [...statsByKey.values()].reduce(
          (total, stats) => total + stats.unmatchedProductCount,
          0,
        ),
        uncategorizedProducts: new Set(
          [...statsByKey.values()].flatMap((stats) => [
            ...stats.uncategorizedProductIds,
          ]),
        ).size,
      },
      groups: groups.map((group) => {
        const key = this.externalKey(group.externalDomain, group.externalGroupId);
        const stats = statsByKey.get(key);
        const mapping = mappingsByKey.get(key);
        const suggestedCategories =
          categoriesByNormalizedName.get(this.normalizeName(group.name)) ?? [];

        return {
          externalDomain: group.externalDomain,
          externalGroupId: group.externalGroupId,
          name: group.name,
          isActive: group.isActive,
          isDeleted: group.isDeleted,
          syncedAt: group.syncedAt.toISOString(),
          productCount: stats?.productKeys.size ?? 0,
          linkedProductCount: stats?.linkedProductIds.size ?? 0,
          uncategorizedProductCount: stats?.uncategorizedProductIds.size ?? 0,
          unmatchedProductCount: stats?.unmatchedProductCount ?? 0,
          conflictProductCount: stats?.conflictProductIds.size ?? 0,
          storesCount: stats?.storeIds.size ?? 0,
          mapping: mapping
            ? {
                id: mapping.id,
                categoryId: mapping.categoryId,
                categoryName: mapping.category.name,
                status: mapping.status,
                confidence: mapping.confidence,
                updatedAt: mapping.updatedAt.toISOString(),
              }
            : null,
          suggestedCategory:
            suggestedCategories.length === 1
              ? suggestedCategories[0]
              : null,
        };
      }),
    };
  }

  async previewLangameMappings(
    dto: PreviewCategorySourceMappingsDto,
    user: AuthenticatedUser,
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const mappings = await this.prepareMappings(dto.mappings, tenantId);
    const mappedTargets = mappings.filter((mapping) => mapping.action === 'MAP');

    if (mappedTargets.length === 0) {
      return {
        summary: { matched: 0, uncategorized: 0, conflicts: 0, ambiguous: 0 },
        items: [],
      };
    }

    const targetByKey = new Map(
      mappedTargets.map((mapping) => [
        this.externalKey(mapping.externalDomain, mapping.externalGroupId),
        this.toPreviewTarget(mapping),
      ]),
    );
    const configurations = await this.prisma.langameClubProductConfiguration.findMany({
      where: { tenantId, isActive: true, productId: { not: null } },
      select: {
        externalDomain: true,
        externalGroupId: true,
        store: { select: { id: true, name: true } },
        product: {
          select: {
            id: true,
            name: true,
            categoryId: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
    });
    const candidatesByProduct = new Map<
      string,
      {
        product: NonNullable<(typeof configurations)[number]['product']>;
        candidates: Map<string, PreviewCategoryTarget>;
        sources: Map<
          string,
          { externalDomain: string; externalGroupId: string; storeName: string }
        >;
      }
    >();

    for (const configuration of configurations) {
      if (!configuration.product || !configuration.externalGroupId) {
        continue;
      }

      const target = targetByKey.get(
        this.externalKey(
          configuration.externalDomain,
          configuration.externalGroupId,
        ),
      );

      if (!target) {
        continue;
      }

      const entry = candidatesByProduct.get(configuration.product.id) ?? {
        product: configuration.product,
        candidates: new Map<string, PreviewCategoryTarget>(),
        sources: new Map(),
      };
      entry.candidates.set(this.previewTargetKey(target), target);
      entry.sources.set(
        `${configuration.externalDomain}:${configuration.externalGroupId}:${configuration.store.id}`,
        {
          externalDomain: configuration.externalDomain,
          externalGroupId: configuration.externalGroupId,
          storeName: configuration.store.name,
        },
      );
      candidatesByProduct.set(configuration.product.id, entry);
    }

    const summary = { matched: 0, uncategorized: 0, conflicts: 0, ambiguous: 0 };
    const items = [...candidatesByProduct.values()]
      .map((entry) => {
        const candidates = [...entry.candidates.values()];
        const status = this.previewStatus(entry.product.categoryId, candidates);

        if (status === 'MATCH') {
          summary.matched += 1;
          return null;
        }

        if (status === 'UNASSIGNED') {
          summary.uncategorized += 1;
        } else if (status === 'CONFLICT') {
          summary.conflicts += 1;
        } else {
          summary.ambiguous += 1;
        }

        return {
          productId: entry.product.id,
          productName: entry.product.name,
          status,
          currentCategory: entry.product.category
            ? {
                id: entry.product.category.id,
                name: entry.product.category.name,
              }
            : null,
          candidateCategories: candidates,
          sources: [...entry.sources.values()].sort((left, right) =>
            `${left.externalDomain}:${left.storeName}`.localeCompare(
              `${right.externalDomain}:${right.storeName}`,
            ),
          ),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((left, right) => {
        const order = { AMBIGUOUS: 0, CONFLICT: 1, UNASSIGNED: 2 };
        return order[left.status] - order[right.status] || left.productName.localeCompare(right.productName);
      });

    return { summary, items };
  }

  async applyLangameMappings(
    dto: ApplyCategorySourceMappingsDto,
    user: AuthenticatedUser,
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const mappings = await this.prepareMappings(dto.mappings, tenantId);
    const resolutions = this.normalizeResolutions(dto.resolutions ?? []);

    if (resolutions.length > 0 && !this.canEditProducts(user)) {
      throw new ForbiddenException(
        'Product editing permission is required to change LeetPlus categories',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const mappingKeys = mappings
        .filter((mapping) => mapping.action === 'MAP')
        .map((mapping) =>
          this.externalKey(mapping.externalDomain, mapping.externalGroupId),
        );
      const existingMappings = await tx.categorySourceMapping.findMany({
        where: {
          tenantId,
          source: IntegrationProvider.LANGAME,
          OR: mappings.map((mapping) => ({
            externalDomain: mapping.externalDomain,
            externalGroupId: mapping.externalGroupId,
          })),
        },
      });
      const existingByKey = new Map(
        existingMappings.map((mapping) => [
          this.externalKey(mapping.externalDomain, mapping.externalGroupId),
          mapping,
        ]),
      );
      const materializedCategories = await this.materializeRequestedCategories(
        tx,
        tenantId,
        mappings,
      );
      const categoryIdsByCreateName = materializedCategories.idsByCreateName;
      const mappingIdsByKey = new Map<string, string>();
      let mappingsChanged = 0;

      for (const mapping of mappings) {
        const key = this.externalKey(mapping.externalDomain, mapping.externalGroupId);
        const existing = existingByKey.get(key);

        if (mapping.action === 'UNMAP') {
          if (!existing) {
            continue;
          }

          await tx.categorySourceMapping.delete({ where: { id: existing.id } });
          await tx.categorySourceMappingEvent.create({
            data: {
              tenantId,
              mappingId: null,
              action: 'UNMAP',
              source: IntegrationProvider.LANGAME,
              externalDomain: mapping.externalDomain,
              externalGroupId: mapping.externalGroupId,
              previousValue: this.mappingSnapshot(existing),
              nextValue: Prisma.JsonNull,
              createdByUserId: user.id,
            },
          });
          mappingsChanged += 1;
          continue;
        }

        const categoryId =
          mapping.categoryId ??
          categoryIdsByCreateName.get(mapping.createCategoryName ?? '');

        if (!categoryId) {
          throw new BadRequestException('Category target is required');
        }

        const mappingData = {
          categoryId,
          status: mapping.status,
          confidence: mapping.confidence,
          confirmedByUserId:
            mapping.status === CategorySourceMappingStatus.CONFIRMED
              ? user.id
              : null,
        };
        const unchanged =
          existing &&
          existing.categoryId === mappingData.categoryId &&
          existing.status === mappingData.status &&
          existing.confidence === mappingData.confidence &&
          existing.confirmedByUserId === mappingData.confirmedByUserId;
        const saved = unchanged
          ? existing
          : existing
            ? await tx.categorySourceMapping.update({
                where: { id: existing.id },
                data: mappingData,
              })
            : await tx.categorySourceMapping.create({
                data: {
                  tenantId,
                  source: IntegrationProvider.LANGAME,
                  externalDomain: mapping.externalDomain,
                  externalGroupId: mapping.externalGroupId,
                  ...mappingData,
                },
              });

        mappingIdsByKey.set(key, saved.id);

        if (unchanged) {
          continue;
        }

        await tx.categorySourceMappingEvent.create({
          data: {
            tenantId,
            mappingId: saved.id,
            action: existing ? 'UPDATE' : 'CREATE',
            source: IntegrationProvider.LANGAME,
            externalDomain: mapping.externalDomain,
            externalGroupId: mapping.externalGroupId,
            previousValue: existing ? this.mappingSnapshot(existing) : Prisma.JsonNull,
            nextValue: this.mappingSnapshot(saved),
            createdByUserId: user.id,
          },
        });
        mappingsChanged += 1;
      }

      const updatedProducts = await this.applyProductResolutions(
        tx,
        tenantId,
        resolutions,
        mappingKeys,
        mappingIdsByKey,
        user.id,
      );
      const autoAssignedProducts = dto.assignUncategorized
        ? await this.assignUncategorizedProducts(
            tx,
            tenantId,
            mappings,
            categoryIdsByCreateName,
            mappingIdsByKey,
            user.id,
          )
        : 0;

      return {
        mappingsChanged,
        categoriesCreated: materializedCategories.createdCount,
        productsUpdated: updatedProducts + autoAssignedProducts,
        autoAssignedProducts,
      };
    });
  }

  async refreshLangameCatalog(user: AuthenticatedUser) {
    return this.langameSyncService.syncTenant(user, {
      mode: 'CATEGORIES',
      trigger: 'MANUAL',
    });
  }

  private async prepareMappings(
    entries: CategorySourceMappingDto[],
    tenantId: string,
  ): Promise<MappingTarget[]> {
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new BadRequestException('Select at least one Langame group');
    }

    if (entries.length > MAX_MAPPING_PROPOSALS) {
      throw new BadRequestException(
        `Select no more than ${MAX_MAPPING_PROPOSALS} Langame groups`,
      );
    }

    const mappings = entries.map((entry) => this.normalizeMapping(entry));
    const seen = new Set<string>();

    for (const mapping of mappings) {
      const key = this.externalKey(mapping.externalDomain, mapping.externalGroupId);

      if (seen.has(key)) {
        throw new BadRequestException('Each Langame group can be selected once');
      }

      seen.add(key);
    }

    const categoryIds = mappings
      .map((mapping) => mapping.categoryId)
      .filter((categoryId): categoryId is string => Boolean(categoryId));
    const [knownGroups, categories] = await Promise.all([
      this.prisma.langameProductGroup.findMany({
        where: {
          tenantId,
          OR: mappings.map((mapping) => ({
            externalDomain: mapping.externalDomain,
            externalGroupId: mapping.externalGroupId,
          })),
        },
        select: { externalDomain: true, externalGroupId: true },
      }),
      this.prisma.category.findMany({
        where: { tenantId, id: { in: categoryIds } },
        select: { id: true, name: true },
      }),
    ]);
    const knownGroupKeys = new Set(
      knownGroups.map((group) =>
        this.externalKey(group.externalDomain, group.externalGroupId),
      ),
    );
    const categoriesById = new Map<string, { id: string; name: string }>(
      categories.map((category) => [category.id, category] as const),
    );

    for (const mapping of mappings) {
      if (!knownGroupKeys.has(this.externalKey(mapping.externalDomain, mapping.externalGroupId))) {
        throw new BadRequestException('Langame group is unavailable or belongs to another tenant');
      }

      if (mapping.categoryId && !categoriesById.has(mapping.categoryId)) {
        throw new BadRequestException('LeetPlus category is unavailable or belongs to another tenant');
      }

      if (mapping.categoryId) {
        mapping.categoryName = categoriesById.get(mapping.categoryId)?.name ?? null;
      }
    }

    return mappings;
  }

  private normalizeMapping(entry: CategorySourceMappingDto): MappingTarget {
    const externalDomain = this.requiredText(entry.externalDomain, 'Langame domain');
    const externalGroupId = this.requiredText(entry.externalGroupId, 'Langame group');
    const action = entry.action ?? 'MAP';

    if (action !== 'MAP' && action !== 'UNMAP') {
      throw new BadRequestException('Invalid mapping action');
    }

    if (action === 'UNMAP') {
      return {
        externalDomain,
        externalGroupId,
        action,
        categoryId: null,
        categoryName: null,
        createCategoryName: null,
        status: CategorySourceMappingStatus.REJECTED,
        confidence: null,
      };
    }

    const categoryId = entry.categoryId?.trim() || null;
    const createCategoryName = entry.createCategoryName
      ? this.requiredText(entry.createCategoryName, 'New LeetPlus category name')
      : null;

    if (Boolean(categoryId) === Boolean(createCategoryName)) {
      throw new BadRequestException(
        'Select an existing LeetPlus category or explicitly create one',
      );
    }

    const status = entry.status ?? 'CONFIRMED';

    if (!Object.values(CategorySourceMappingStatus).includes(status)) {
      throw new BadRequestException('Invalid mapping status');
    }

    const confidence =
      entry.confidence === undefined || entry.confidence === null
        ? status === CategorySourceMappingStatus.CONFIRMED
          ? 100
          : null
        : this.normalizeConfidence(entry.confidence);

    return {
      externalDomain,
      externalGroupId,
      action,
      categoryId,
      categoryName: null,
      createCategoryName,
      status,
      confidence,
    };
  }

  private async materializeRequestedCategories(
    tx: Prisma.TransactionClient,
    tenantId: string,
    mappings: MappingTarget[],
  ) {
    const idsByCreateName = new Map<string, string>();
    let createdCount = 0;
    const names = [
      ...new Set(
        mappings
          .map((mapping) => mapping.createCategoryName)
          .filter((name): name is string => Boolean(name)),
      ),
    ];

    for (const name of names) {
      const existing = await tx.category.findFirst({
        where: { tenantId, name },
        select: { id: true },
      });
      const category = existing ?? (await tx.category.create({
        data: { tenantId, name },
        select: { id: true },
      }));

      if (!existing) {
        createdCount += 1;
      }

      idsByCreateName.set(name, category.id);
    }

    return { idsByCreateName, createdCount };
  }

  private async applyProductResolutions(
    tx: Prisma.TransactionClient,
    tenantId: string,
    resolutions: ReturnType<ProductCategoryCatalogService['normalizeResolutions']>,
    mappingKeys: string[],
    mappingIdsByKey: Map<string, string>,
    userId: string,
  ) {
    if (resolutions.length === 0) {
      return 0;
    }

    const allowedSourceKeys = new Set(mappingKeys);
    const [products, categories] = await Promise.all([
      tx.product.findMany({
        where: {
          tenantId,
          id: { in: resolutions.map((resolution) => resolution.productId) },
          isActive: true,
        },
        select: { id: true, categoryId: true },
      }),
      tx.category.findMany({
        where: {
          tenantId,
          id: { in: resolutions.map((resolution) => resolution.categoryId) },
        },
        select: { id: true },
      }),
    ]);
    const productsById = new Map(products.map((product) => [product.id, product]));
    const categoryIds = new Set(categories.map((category) => category.id));
    let updated = 0;

    for (const resolution of resolutions) {
      const sourceKey = this.externalKey(
        resolution.externalDomain,
        resolution.externalGroupId,
      );
      const product = productsById.get(resolution.productId);

      if (!allowedSourceKeys.has(sourceKey)) {
        throw new BadRequestException('Product resolution is not part of this preview');
      }

      if (!product || !categoryIds.has(resolution.categoryId)) {
        throw new BadRequestException('Product or LeetPlus category is unavailable');
      }

      if (product.categoryId === resolution.categoryId) {
        continue;
      }

      await tx.product.update({
        where: { id: product.id },
        data: { categoryId: resolution.categoryId },
      });
      await tx.categorySourceMappingEvent.create({
        data: {
          tenantId,
          mappingId: mappingIdsByKey.get(sourceKey) ?? null,
          productId: product.id,
          action: 'PRODUCT_CATEGORY_ASSIGNED',
          source: IntegrationProvider.LANGAME,
          externalDomain: resolution.externalDomain,
          externalGroupId: resolution.externalGroupId,
          previousValue: { categoryId: product.categoryId },
          nextValue: { categoryId: resolution.categoryId },
          createdByUserId: userId,
        },
      });
      updated += 1;
    }

    return updated;
  }

  private async assignUncategorizedProducts(
    tx: Prisma.TransactionClient,
    tenantId: string,
    mappings: MappingTarget[],
    categoryIdsByCreateName: Map<string, string>,
    mappingIdsByKey: Map<string, string>,
    userId: string,
  ) {
    const targetsBySourceKey = new Map<string, BulkAssignmentTarget>();

    for (const mapping of mappings) {
      if (mapping.action !== 'MAP') {
        continue;
      }

      const categoryId =
        mapping.categoryId ??
        categoryIdsByCreateName.get(mapping.createCategoryName ?? '');

      if (!categoryId) {
        throw new BadRequestException('Category target is required');
      }

      targetsBySourceKey.set(
        this.externalKey(mapping.externalDomain, mapping.externalGroupId),
        {
          categoryId,
          externalDomain: mapping.externalDomain,
          externalGroupId: mapping.externalGroupId,
        },
      );
    }

    if (targetsBySourceKey.size === 0) {
      return 0;
    }

    const configurations = await tx.langameClubProductConfiguration.findMany({
      where: {
        tenantId,
        isActive: true,
        productId: { not: null },
      },
      select: {
        externalDomain: true,
        externalGroupId: true,
        productId: true,
        product: {
          select: { categoryId: true, isActive: true },
        },
      },
    });
    const candidatesByProduct = new Map<
      string,
      {
        productId: string;
        productCategoryId: string | null;
        productIsActive: boolean;
        targets: Map<string, BulkAssignmentTarget>;
      }
    >();

    for (const configuration of configurations) {
      if (
        !configuration.productId ||
        !configuration.product ||
        !configuration.externalGroupId
      ) {
        continue;
      }

      const target = targetsBySourceKey.get(
        this.externalKey(
          configuration.externalDomain,
          configuration.externalGroupId,
        ),
      );

      if (!target) {
        continue;
      }

      const candidate = candidatesByProduct.get(configuration.productId) ?? {
        productId: configuration.productId,
        productCategoryId: configuration.product.categoryId,
        productIsActive: configuration.product.isActive,
        targets: new Map(),
      };
      candidate.targets.set(target.categoryId, target);
      candidatesByProduct.set(configuration.productId, candidate);
    }

    let updated = 0;

    for (const candidate of candidatesByProduct.values()) {
      // Existing internal categories are never overwritten by the bulk action.
      // A product that receives different Langame targets in different clubs is
      // ambiguous and must be handled through the preview by a user.
      if (
        !candidate.productIsActive ||
        candidate.productCategoryId ||
        candidate.targets.size !== 1
      ) {
        continue;
      }

      const target = [...candidate.targets.values()][0];

      await tx.product.update({
        where: { id: candidate.productId },
        data: { categoryId: target.categoryId },
      });
      await tx.categorySourceMappingEvent.create({
        data: {
          tenantId,
          mappingId: mappingIdsByKey.get(
            this.externalKey(target.externalDomain, target.externalGroupId),
          ) ?? null,
          productId: candidate.productId,
          action: 'PRODUCT_CATEGORY_ASSIGNED',
          source: IntegrationProvider.LANGAME,
          externalDomain: target.externalDomain,
          externalGroupId: target.externalGroupId,
          previousValue: { categoryId: null },
          nextValue: { categoryId: target.categoryId, assignedBy: 'bulk-import' },
          createdByUserId: userId,
        },
      });
      updated += 1;
    }

    return updated;
  }

  private normalizeResolutions(
    entries: ApplyCategorySourceMappingsDto['resolutions'],
  ) {
    if (!Array.isArray(entries)) {
      throw new BadRequestException('Invalid product resolutions');
    }

    if (entries.length > MAX_PRODUCT_RESOLUTIONS) {
      throw new BadRequestException(
        `Select no more than ${MAX_PRODUCT_RESOLUTIONS} products`,
      );
    }

    const seen = new Set<string>();

    return entries.map((entry) => {
      const productId = this.requiredText(entry.productId, 'Product');

      if (seen.has(productId)) {
        throw new BadRequestException('Each product can be resolved once');
      }

      seen.add(productId);

      return {
        productId,
        categoryId: this.requiredText(entry.categoryId, 'LeetPlus category'),
        externalDomain: this.requiredText(entry.externalDomain, 'Langame domain'),
        externalGroupId: this.requiredText(entry.externalGroupId, 'Langame group'),
      };
    });
  }

  private toPreviewTarget(mapping: MappingTarget): PreviewCategoryTarget {
    return {
      id: mapping.categoryId,
      name: mapping.categoryName ?? mapping.createCategoryName ?? '',
      isNew: Boolean(mapping.createCategoryName),
    };
  }

  private previewStatus(
    currentCategoryId: string | null,
    candidates: PreviewCategoryTarget[],
  ) {
    if (candidates.length > 1) {
      return 'AMBIGUOUS' as const;
    }

    const candidate = candidates[0];

    if (!currentCategoryId) {
      return 'UNASSIGNED' as const;
    }

    return candidate?.id === currentCategoryId
      ? ('MATCH' as const)
      : ('CONFLICT' as const);
  }

  private previewTargetKey(target: PreviewCategoryTarget) {
    return target.id ?? `new:${this.normalizeName(target.name)}`;
  }

  private indexCategoriesByNormalizedName(
    categories: { id: string; name: string }[],
  ) {
    const index = new Map<string, { id: string; name: string }[]>();

    for (const category of categories) {
      const key = this.normalizeName(category.name);
      const current = index.get(key) ?? [];
      current.push(category);
      index.set(key, current);
    }

    return index;
  }

  private mappingSnapshot(mapping: {
    categoryId: string;
    status: CategorySourceMappingStatus;
    confidence: number | null;
    confirmedByUserId: string | null;
  }) {
    return {
      categoryId: mapping.categoryId,
      status: mapping.status,
      confidence: mapping.confidence,
      confirmedByUserId: mapping.confirmedByUserId,
    };
  }

  private canEditProducts(user: AuthenticatedUser) {
    if (!user.customRoleId && !user.hasRoleOverride && user.role !== UserRole.TRAINEE) {
      return (
        user.role === UserRole.OWNER ||
        user.role === UserRole.ADMIN ||
        user.role === UserRole.MANAGER
      );
    }

    return hasCapability(user, 'edit_products');
  }

  private normalizeConfidence(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      throw new BadRequestException('Confidence must be an integer from 0 to 100');
    }

    return value;
  }

  private normalizeName(value: string) {
    return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');
  }

  private requiredText(value: unknown, field: string) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${field} is required`);
    }

    return value.trim();
  }

  private externalKey(externalDomain: string, externalGroupId: string) {
    return `${externalDomain}:${externalGroupId}`;
  }
}
