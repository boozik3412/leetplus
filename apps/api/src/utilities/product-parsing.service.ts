import { BadRequestException, Injectable } from '@nestjs/common';
import { ProductParsingSuggestionStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

type ProductForParsing = {
  id: string;
  name: string;
  article: string;
  externalDomain: string | null;
  canonicalProductId: string | null;
};

type ParsedProductName = {
  normalizedName: string;
  brand: string | null;
  volumeValue: number | null;
  volumeUnit: string | null;
  flavor: string | null;
  packageType: string | null;
  normalizedKey: string | null;
};

type ProductParsingRationale = {
  brand: string | null;
  volume: string | null;
  flavor: string | null;
  packageType: string | null;
  domains: string[];
  names: string[];
};

const knownFlavors: Record<string, string> = {
  манго: 'манго',
  mango: 'манго',
  клубника: 'клубника',
  strawberry: 'клубника',
  арбуз: 'арбуз',
  watermelon: 'арбуз',
  виноград: 'виноград',
  grape: 'виноград',
  апельсин: 'апельсин',
  orange: 'апельсин',
  лимон: 'лимон',
  lemon: 'лимон',
  лайм: 'лайм',
  lime: 'лайм',
  оригинал: 'original',
  original: 'original',
  'без сахара': 'zero',
  zero: 'zero',
  'sugar free': 'zero',
};

const packageAliases: Record<string, string> = {
  банка: 'банка',
  жб: 'банка',
  'ж/б': 'банка',
  can: 'банка',
  бутылка: 'бутылка',
  пэт: 'бутылка',
  pet: 'бутылка',
  пачка: 'пачка',
  упаковка: 'пачка',
  пакет: 'пакет',
};

const ignoredBrandTokens = new Set([
  'напиток',
  'энергетик',
  'энергетический',
  'вода',
  'газ',
  'газированный',
  'чипсы',
  'батончик',
  'шоколад',
  'жевательная',
  'резинка',
  'вкус',
  'со',
  'с',
]);

@Injectable()
export class ProductParsingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async getOverview(user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const [latestRun, pendingSuggestions, canonicalProductsCount] =
      await Promise.all([
        this.prisma.productParsingRun.findFirst({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          include: {
            suggestions: {
              where: { status: ProductParsingSuggestionStatus.PENDING },
              orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }],
              take: 50,
            },
          },
        }),
        this.prisma.productParsingSuggestion.count({
          where: { tenantId, status: ProductParsingSuggestionStatus.PENDING },
        }),
        this.prisma.canonicalProduct.count({ where: { tenantId } }),
      ]);

    return {
      latestRun,
      pendingSuggestions,
      canonicalProductsCount,
    };
  }

  async analyze(user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const products = await this.prisma.product.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        name: true,
        article: true,
        externalDomain: true,
        canonicalProductId: true,
      },
    });
    const run = await this.prisma.productParsingRun.create({
      data: {
        tenantId,
        status: 'RUNNING',
        totalProducts: products.length,
      },
    });
    const suggestions = this.buildSuggestions(products);

    for (const suggestion of suggestions) {
      await this.prisma.productParsingSuggestion.create({
        data: {
          tenantId,
          runId: run.id,
          suggestedName: suggestion.suggestedName,
          normalizedKey: suggestion.normalizedKey,
          confidence: suggestion.confidence,
          rationale: suggestion.rationale,
          productIds: suggestion.productIds,
          candidateNames: suggestion.candidateNames,
        },
      });
    }

    return this.prisma.productParsingRun.update({
      where: { id: run.id },
      data: {
        status: 'COMPLETED',
        suggestionsCount: suggestions.length,
        finishedAt: new Date(),
      },
      include: {
        suggestions: {
          where: { status: ProductParsingSuggestionStatus.PENDING },
          orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }],
        },
      },
    });
  }

  async applySuggestion(
    user: AuthenticatedUser,
    suggestionId: string,
    dto: { selectedName?: string; productIds?: string[] },
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const suggestion = await this.prisma.productParsingSuggestion.findFirst({
      where: {
        id: suggestionId,
        tenantId,
        status: ProductParsingSuggestionStatus.PENDING,
      },
    });

    if (!suggestion) {
      throw new BadRequestException('Parsing suggestion is not available');
    }

    const productIds = dto.productIds?.length
      ? dto.productIds.filter((id) => suggestion.productIds.includes(id))
      : suggestion.productIds;

    if (productIds.length < 2) {
      throw new BadRequestException('At least two products are required');
    }

    const selectedName = dto.selectedName?.trim() || suggestion.suggestedName;
    const parsed = this.parseName(selectedName);
    const canonicalProduct = await this.prisma.canonicalProduct.upsert({
      where: {
        tenantId_normalizedKey: {
          tenantId,
          normalizedKey: suggestion.normalizedKey,
        },
      },
      create: {
        tenantId,
        name: selectedName,
        normalizedKey: suggestion.normalizedKey,
        brand: parsed.brand,
        volumeValue: parsed.volumeValue,
        volumeUnit: parsed.volumeUnit,
        flavor: parsed.flavor,
        packageType: parsed.packageType,
      },
      update: {
        name: selectedName,
        brand: parsed.brand,
        volumeValue: parsed.volumeValue,
        volumeUnit: parsed.volumeUnit,
        flavor: parsed.flavor,
        packageType: parsed.packageType,
      },
    });

    await this.prisma.product.updateMany({
      where: {
        tenantId,
        id: { in: productIds },
      },
      data: {
        canonicalProductId: canonicalProduct.id,
      },
    });

    await this.prisma.productParsingRun.update({
      where: { id: suggestion.runId },
      data: {
        appliedCount: { increment: 1 },
      },
    });

    return this.prisma.productParsingSuggestion.update({
      where: { id: suggestion.id },
      data: {
        canonicalProductId: canonicalProduct.id,
        selectedName,
        productIds,
        status: ProductParsingSuggestionStatus.APPLIED,
      },
    });
  }

  async rejectSuggestion(user: AuthenticatedUser, suggestionId: string) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const suggestion = await this.prisma.productParsingSuggestion.findFirst({
      where: {
        id: suggestionId,
        tenantId,
        status: ProductParsingSuggestionStatus.PENDING,
      },
      select: { id: true, runId: true },
    });

    if (!suggestion) {
      throw new BadRequestException('Parsing suggestion is not available');
    }

    await this.prisma.productParsingRun.update({
      where: { id: suggestion.runId },
      data: {
        rejectedCount: { increment: 1 },
      },
    });

    return this.prisma.productParsingSuggestion.update({
      where: { id: suggestion.id },
      data: { status: ProductParsingSuggestionStatus.REJECTED },
    });
  }

  private buildSuggestions(products: ProductForParsing[]) {
    const groups = new Map<
      string,
      {
        parsed: ParsedProductName;
        products: ProductForParsing[];
      }
    >();

    products.forEach((product) => {
      const parsed = this.parseName(product.name);

      if (!parsed.normalizedKey) {
        return;
      }

      const current = groups.get(parsed.normalizedKey) ?? {
        parsed,
        products: [],
      };
      current.products.push(product);
      groups.set(parsed.normalizedKey, current);
    });

    return [...groups.entries()]
      .map(([normalizedKey, group]) =>
        this.groupToSuggestion(normalizedKey, group.parsed, group.products),
      )
      .filter((suggestion) => suggestion.productIds.length >= 2)
      .filter((suggestion) => suggestion.confidence >= 70)
      .sort(
        (a, b) =>
          b.confidence - a.confidence ||
          b.productIds.length - a.productIds.length ||
          a.suggestedName.localeCompare(b.suggestedName),
      );
  }

  private groupToSuggestion(
    normalizedKey: string,
    parsed: ParsedProductName,
    products: ProductForParsing[],
  ) {
    const uniqueNames = [...new Set(products.map((product) => product.name))];
    const domains = [
      ...new Set(
        products
          .map((product) => product.externalDomain)
          .filter((domain): domain is string => Boolean(domain)),
      ),
    ];
    const candidateNames = uniqueNames.sort((a, b) => a.length - b.length);
    const suggestedName = candidateNames[0] ?? products[0]?.name ?? '';
    const confidence =
      (parsed.brand ? 30 : 0) +
      (parsed.volumeValue ? 30 : 0) +
      (parsed.flavor ? 20 : 0) +
      (parsed.packageType ? 10 : 0) +
      Math.min(10, products.length * 2);
    const rationale: ProductParsingRationale = {
      brand: parsed.brand,
      volume:
        parsed.volumeValue && parsed.volumeUnit
          ? `${parsed.volumeValue}${parsed.volumeUnit}`
          : null,
      flavor: parsed.flavor,
      packageType: parsed.packageType,
      domains,
      names: uniqueNames,
    };

    return {
      suggestedName,
      normalizedKey,
      confidence,
      rationale,
      productIds: products.map((product) => product.id),
      candidateNames,
    };
  }

  private parseName(name: string): ParsedProductName {
    const normalizedName = this.normalizeName(name);
    const volume = this.extractVolume(normalizedName);
    const flavor = this.extractFlavor(normalizedName);
    const packageType = this.extractPackageType(normalizedName);
    const brand = this.extractBrand(normalizedName);

    if (!brand || !volume) {
      return {
        normalizedName,
        brand,
        volumeValue: volume?.value ?? null,
        volumeUnit: volume?.unit ?? null,
        flavor,
        packageType,
        normalizedKey: null,
      };
    }

    return {
      normalizedName,
      brand,
      volumeValue: volume.value,
      volumeUnit: volume.unit,
      flavor,
      packageType,
      normalizedKey: [
        brand,
        `${volume.value}${volume.unit}`,
        flavor ?? 'no-flavor',
        packageType ?? 'no-package',
      ].join('|'),
    };
  }

  private normalizeName(name: string) {
    return name
      .trim()
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[()[\]{}]/g, ' ')
      .replace(/[;:]/g, ' ')
      .replace(/\s+/g, ' ');
  }

  private extractVolume(normalizedName: string) {
    const match =
      /(\d+(?:[,.]\d+)?)\s?(л|l|литр|литра|мл|ml|г|гр|g|кг|kg)\b/i.exec(
        normalizedName,
      );

    if (!match) {
      return null;
    }

    const rawValue = Number(match[1].replace(',', '.'));
    const rawUnit = match[2].toLowerCase();

    if (['л', 'l', 'литр', 'литра'].includes(rawUnit)) {
      return { value: Math.round(rawValue * 1000), unit: 'ml' };
    }

    if (['мл', 'ml'].includes(rawUnit)) {
      return { value: Math.round(rawValue), unit: 'ml' };
    }

    if (['кг', 'kg'].includes(rawUnit)) {
      return { value: Math.round(rawValue * 1000), unit: 'g' };
    }

    return { value: Math.round(rawValue), unit: 'g' };
  }

  private extractFlavor(normalizedName: string) {
    const found = Object.entries(knownFlavors).find(([token]) =>
      normalizedName.includes(token),
    );

    return found?.[1] ?? null;
  }

  private extractPackageType(normalizedName: string) {
    const found = Object.entries(packageAliases).find(([token]) =>
      normalizedName.includes(token),
    );

    return found?.[1] ?? null;
  }

  private extractBrand(normalizedName: string) {
    const tokens = normalizedName
      .replace(/\d+(?:[,.]\d+)?\s?(л|l|литр|литра|мл|ml|г|гр|g|кг|kg)\b/g, ' ')
      .split(/\s+/)
      .map((token) => token.replace(/[^a-zа-я0-9-]/g, ''))
      .filter(Boolean)
      .filter((token) => !ignoredBrandTokens.has(token))
      .filter((token) => !knownFlavors[token])
      .filter((token) => !packageAliases[token]);

    return tokens[0] ?? null;
  }
}
