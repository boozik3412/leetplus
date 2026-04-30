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
  sourceLabel: string;
  canonicalProductId: string | null;
};

type ParsedProductName = {
  normalizedName: string;
  brand: string | null;
  volumeValue: number | null;
  volumeUnit: string | null;
  flavor: string | null;
  variant: string | null;
  packageType: string | null;
  productKind: string | null;
  residualTokens: string[];
  hardBlockers: string[];
  normalizedKey: string | null;
};

type ProductParsingRationale = {
  brand: string | null;
  volume: string | null;
  flavor: string | null;
  variant: string | null;
  packageType: string | null;
  productKind: string | null;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  warnings: string[];
  hardBlockers: string[];
  domains: string[];
  names: string[];
  products: {
    id: string;
    name: string;
    article: string;
    sourceLabel: string;
    parsed: {
      brand: string | null;
      volume: string | null;
      flavor: string | null;
      variant: string | null;
      packageType: string | null;
      productKind: string | null;
      residualTokens: string[];
    };
  }[];
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
  тропический: 'тропический',
  tropical: 'тропический',
  персик: 'персик',
  peach: 'персик',
  ананас: 'ананас',
  pineapple: 'ананас',
  драгон: 'dragon fruit',
  dragon: 'dragon fruit',
  яблоко: 'яблоко',
  apple: 'яблоко',
  карамель: 'карамель',
  дыня: 'дыня',
  маракуйя: 'маракуйя',
  маракуя: 'маракуйя',
  maracuya: 'маракуйя',
  мохито: 'мохито',
  mojito: 'мохито',
  кокос: 'кокос',
  coconut: 'кокос',
  кола: 'кола',
  cola: 'кола',
  киви: 'киви',
  kiwi: 'киви',
  гранат: 'гранат',
  pomegranate: 'гранат',
  blueberry: 'blueberry',
  черника: 'blueberry',
  donut: 'donut',
  пончик: 'donut',
  feijoa: 'feijoa',
  фейхоа: 'feijoa',
  berry: 'berry',
  raspberry: 'raspberry',
  малина: 'raspberry',
  tropic: 'тропический',
  ирга: 'ирга',
  абрикос: 'абрикос',
  apricot: 'абрикос',
  bubblegum: 'bubblegum',
};

const knownVariants: Record<string, string> = {
  оригинал: 'original',
  original: 'original',
  classic: 'original',
  классик: 'original',
  'без сахара': 'zero',
  zero: 'zero',
  'sugar free': 'zero',
  ultra: 'ultra',
  'blue edition': 'blue edition',
  'sea blue edition': 'sea blue edition',
  'summer edition': 'summer edition',
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
  'лимонад',
  'газировка',
  'напитки',
  'со',
  'с',
]);

const brandAliases: { alias: string; brand: string }[] = [
  { alias: 'добрый coca-cola', brand: 'добрый cola' },
  { alias: 'добрый кока-кола', brand: 'добрый cola' },
  { alias: 'добрый кола', brand: 'добрый cola' },
  { alias: 'добрый cola', brand: 'добрый cola' },
  { alias: 'coca-cola', brand: 'coca-cola' },
  { alias: 'coca cola', brand: 'coca-cola' },
  { alias: 'lit energy', brand: 'lit energy' },
  { alias: 'red bull', brand: 'redbull' },
  { alias: 'redbull', brand: 'redbull' },
  { alias: 'monster energy', brand: 'monster' },
  { alias: 'monster', brand: 'monster' },
  { alias: 'burn', brand: 'burn' },
  { alias: 'gorilla', brand: 'gorilla' },
  { alias: 'adrenaline rush', brand: 'adrenaline' },
  { alias: 'adrenaline', brand: 'adrenaline' },
  { alias: 'mountain dew', brand: 'mountain dew' },
  { alias: 'bonaqua', brand: 'bonaqua' },
  { alias: 'bon aqua', brand: 'bonaqua' },
  { alias: 'lipton', brand: 'lipton' },
  { alias: 'rich', brand: 'rich' },
  { alias: 'j7', brand: 'j7' },
  { alias: 'chupa-chups', brand: 'chupa-chups' },
  { alias: 'chupa chups', brand: 'chupa-chups' },
  { alias: 'fanta', brand: 'fanta' },
  { alias: 'sprite', brand: 'sprite' },
].sort((a, b) => b.alias.length - a.alias.length);

const hardBlockerTokens: Record<string, string[]> = {
  combo: ['комбо', 'combo', 'сет', 'набор', 'акция', 'акции', '2+1'],
  service: [
    'услуга',
    'аренда',
    'депозит',
    'залог',
    'пополнение',
    'скидка',
    'промокод',
    'час',
  ],
  hookah: ['кальян', 'чаша', 'забивка', 'уголь', 'табак'],
  vape: [
    'жидкость',
    'затяжек',
    'затяжки',
    'однораз',
    'pod',
    'вейп',
    'nic',
    'мг',
  ],
};

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
    const [products, stores] = await Promise.all([
      this.prisma.product.findMany({
        where: { tenantId, isActive: true },
        select: {
          id: true,
          name: true,
          article: true,
          externalDomain: true,
          canonicalProductId: true,
        },
      }),
      this.prisma.store.findMany({
        where: { tenantId, externalProvider: 'LANGAME' },
        select: {
          name: true,
          externalDomain: true,
        },
      }),
    ]);
    const sourceNamesByDomain = new Map<string, string[]>();

    stores.forEach((store) => {
      if (!store.externalDomain) {
        return;
      }

      sourceNamesByDomain.set(store.externalDomain, [
        ...(sourceNamesByDomain.get(store.externalDomain) ?? []),
        store.name,
      ]);
    });
    const productsForParsing = products.map((product) => ({
      ...product,
      sourceLabel: this.sourceLabel(
        product.externalDomain,
        sourceNamesByDomain.get(product.externalDomain ?? '') ?? [],
      ),
    }));
    await this.prisma.productParsingSuggestion.updateMany({
      where: { tenantId, status: ProductParsingSuggestionStatus.PENDING },
      data: { status: ProductParsingSuggestionStatus.REJECTED },
    });
    const run = await this.prisma.productParsingRun.create({
      data: {
        tenantId,
        status: 'RUNNING',
        totalProducts: productsForParsing.length,
      },
    });
    const suggestions = this.buildSuggestions(productsForParsing);

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
        variant: parsed.variant,
        packageType: parsed.packageType,
      },
      update: {
        name: selectedName,
        brand: parsed.brand,
        volumeValue: parsed.volumeValue,
        volumeUnit: parsed.volumeUnit,
        flavor: parsed.flavor,
        variant: parsed.variant,
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

      if (!parsed.normalizedKey || parsed.hardBlockers.length > 0) {
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
      .filter((suggestion) => suggestion.rationale.domains.length >= 2)
      .filter((suggestion) => suggestion.rationale.hardBlockers.length === 0)
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
    const parsedProducts = products.map((product) => ({
      product,
      parsed: this.parseName(product.name),
    }));
    const warnings = this.groupWarnings(parsedProducts);
    const hardBlockers = [
      ...new Set(parsedProducts.flatMap((item) => item.parsed.hardBlockers)),
    ];
    const confidence =
      (parsed.brand ? 30 : 0) +
      (parsed.volumeValue ? 25 : 0) +
      (parsed.flavor || parsed.residualTokens.length > 0 ? 20 : 0) +
      (parsed.variant ? 10 : 0) +
      (parsed.packageType ? 10 : 0) +
      (parsed.productKind === 'hookah-service' ? 15 : 0) +
      Math.min(5, products.length) -
      warnings.length * 5;
    const rationale: ProductParsingRationale = {
      brand: parsed.brand,
      volume:
        parsed.volumeValue && parsed.volumeUnit
          ? `${parsed.volumeValue}${parsed.volumeUnit}`
          : null,
      flavor: parsed.flavor,
      variant: parsed.variant,
      packageType: parsed.packageType,
      productKind: parsed.productKind,
      riskLevel: this.riskLevel(confidence, warnings),
      warnings,
      hardBlockers,
      domains,
      names: uniqueNames,
      products: parsedProducts.map(({ product, parsed: parsedProduct }) => ({
        id: product.id,
        name: product.name,
        article: product.article,
        sourceLabel: product.sourceLabel,
        parsed: {
          brand: parsedProduct.brand,
          volume:
            parsedProduct.volumeValue && parsedProduct.volumeUnit
              ? `${parsedProduct.volumeValue}${parsedProduct.volumeUnit}`
              : null,
          flavor: parsedProduct.flavor,
          variant: parsedProduct.variant,
          packageType: parsedProduct.packageType,
          productKind: parsedProduct.productKind,
          residualTokens: parsedProduct.residualTokens,
        },
      })),
    };

    return {
      suggestedName,
      normalizedKey,
      confidence: Math.max(0, Math.min(100, confidence)),
      rationale,
      productIds: products.map((product) => product.id),
      candidateNames,
    };
  }

  private parseName(name: string): ParsedProductName {
    const normalizedName = this.normalizeName(name);
    const volume = this.extractVolume(normalizedName);
    const flavor = this.extractFlavor(normalizedName);
    const variant = this.extractVariant(normalizedName);
    const rawHardBlockers = this.extractHardBlockers(normalizedName);
    const isHookahServiceSku = this.isHookahServiceSku(
      normalizedName,
      volume,
      rawHardBlockers,
    );
    const packageType = isHookahServiceSku
      ? 'услуга'
      : this.extractPackageType(normalizedName);
    const brand = isHookahServiceSku
      ? 'кальян'
      : this.extractBrand(normalizedName);
    const productKind = isHookahServiceSku ? 'hookah-service' : null;
    const residualTokens = this.extractResidualTokens(normalizedName, {
      brand,
      flavor,
      variant,
      productKind,
    });
    const hardBlockers = isHookahServiceSku
      ? rawHardBlockers.filter((blocker) => blocker !== 'hookah')
      : rawHardBlockers;

    if (!brand || !volume) {
      return {
        normalizedName,
        brand,
        volumeValue: volume?.value ?? null,
        volumeUnit: volume?.unit ?? null,
        flavor,
        variant,
        packageType,
        productKind,
        residualTokens,
        hardBlockers,
        normalizedKey: null,
      };
    }

    const flavorKey = (flavor ?? residualTokens.join('+')) || 'no-flavor';
    const variantKey = variant ?? 'regular';

    return {
      normalizedName,
      brand,
      volumeValue: volume.value,
      volumeUnit: volume.unit,
      flavor,
      variant,
      packageType,
      productKind,
      residualTokens,
      hardBlockers,
      normalizedKey: [
        brand,
        `${volume.value}${volume.unit}`,
        flavorKey,
        variantKey,
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
    const explicitMatch =
      /(\d+(?:[,.]\d+)?)\s?(литра|литр|мл|ml|кг|kg|гр|г|g|л|l)(?=$|[^a-zа-я0-9])/i.exec(
        normalizedName,
      );
    const decimalLiterMatch =
      /(^|[^a-zа-я0-9])0[,.](\d{2,3})(?=$|[^a-zа-я0-9])/.exec(normalizedName);

    if (!explicitMatch && !decimalLiterMatch) {
      return null;
    }

    const rawUnit = explicitMatch?.[2].toLowerCase() ?? 'l';
    const rawValue = explicitMatch
      ? Number(explicitMatch[1].replace(',', '.'))
      : Number(`0.${decimalLiterMatch?.[2]}`);

    if (['л', 'l', 'литр', 'литра'].includes(rawUnit)) {
      return { value: Math.round(rawValue * 1000), unit: 'ml' };
    }

    if (['мл', 'ml'].includes(rawUnit)) {
      if (rawValue > 0 && rawValue < 10) {
        return { value: Math.round(rawValue * 1000), unit: 'ml' };
      }

      return { value: Math.round(rawValue), unit: 'ml' };
    }

    if (['кг', 'kg'].includes(rawUnit)) {
      return { value: Math.round(rawValue * 1000), unit: 'g' };
    }

    return { value: Math.round(rawValue), unit: 'g' };
  }

  private extractFlavor(normalizedName: string) {
    const found = [
      ...new Set(
        Object.entries(knownFlavors)
          .filter(([token]) => this.hasToken(normalizedName, token))
          .map(([, flavor]) => flavor),
      ),
    ].sort();

    return found.length > 0 ? found.join('+') : null;
  }

  private extractVariant(normalizedName: string) {
    const found = [
      ...new Set(
        Object.entries(knownVariants)
          .filter(([token]) => this.hasToken(normalizedName, token))
          .map(([, variant]) => variant),
      ),
    ].sort();

    return found.length > 0 ? found.join('+') : null;
  }

  private extractPackageType(normalizedName: string) {
    const found = Object.entries(packageAliases).find(([token]) =>
      this.hasToken(normalizedName, token),
    );

    return found?.[1] ?? null;
  }

  private extractBrand(normalizedName: string) {
    const knownBrand = brandAliases.find(({ alias }) =>
      this.hasToken(normalizedName, alias),
    );

    if (knownBrand) {
      return knownBrand.brand;
    }

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

  private extractResidualTokens(
    normalizedName: string,
    parsed: {
      brand: string | null;
      flavor: string | null;
      variant: string | null;
      productKind: string | null;
    },
  ) {
    const brandTokens = new Set(parsed.brand?.split(/\s+/) ?? []);
    const knownFlavorValues = new Set(Object.values(knownFlavors));
    const knownVariantValues = new Set(Object.values(knownVariants));

    return [
      ...new Set(
        normalizedName
          .replace(
            /\d+(?:[,.]\d+)?\s?(литра|литр|мл|ml|кг|kg|гр|г|g|л|l)(?=$|[^a-zа-я0-9])/g,
            ' ',
          )
          .split(/\s+/)
          .map((token) => token.replace(/[^a-zа-я0-9-]/g, ''))
          .filter(Boolean)
          .filter((token) => token.length > 2)
          .filter((token) => !ignoredBrandTokens.has(token))
          .filter((token) => !brandTokens.has(token))
          .filter(
            (token) =>
              !(parsed.productKind === 'hookah-service' && token === 'кальян'),
          )
          .filter((token) => !knownFlavors[token])
          .filter((token) => !knownFlavorValues.has(token))
          .filter((token) => !knownVariants[token])
          .filter((token) => !knownVariantValues.has(token))
          .filter((token) => !packageAliases[token]),
      ),
    ].sort();
  }

  private extractHardBlockers(normalizedName: string) {
    return Object.entries(hardBlockerTokens)
      .filter(([, tokens]) =>
        tokens.some((token) => this.hasToken(normalizedName, token)),
      )
      .map(([key]) => key);
  }

  private isHookahServiceSku(
    normalizedName: string,
    volume: { value: number; unit: string } | null,
    hardBlockers: string[],
  ) {
    if (!this.hasToken(normalizedName, 'кальян') || !volume) {
      return false;
    }

    if (volume.unit !== 'g') {
      return false;
    }

    const unsafeHookahTokens = ['чаша', 'забивка', 'уголь', 'табак'];
    const hasUnsafeToken = unsafeHookahTokens.some((token) =>
      this.hasToken(normalizedName, token),
    );

    return (
      hardBlockers.every((blocker) => blocker === 'hookah') && !hasUnsafeToken
    );
  }

  private groupWarnings(
    parsedProducts: {
      product: ProductForParsing;
      parsed: ParsedProductName;
    }[],
  ) {
    const warnings: string[] = [];
    const flavors = new Set(parsedProducts.map((item) => item.parsed.flavor));
    const variants = new Set(parsedProducts.map((item) => item.parsed.variant));
    const packages = new Set(
      parsedProducts.map((item) => item.parsed.packageType),
    );
    const residuals = new Set(
      parsedProducts.map((item) => item.parsed.residualTokens.join('+')),
    );
    const hasUnknownFlavor = parsedProducts.some((item) => !item.parsed.flavor);
    const hasCanonical = parsedProducts.some(
      (item) => item.product.canonicalProductId,
    );

    if (flavors.size > 1) {
      warnings.push('Разные распознанные вкусы');
    }

    if (variants.size > 1) {
      warnings.push('Разные варианты товара');
    }

    if (packages.size > 1) {
      warnings.push('Разная или нераспознанная упаковка');
    }

    if (hasUnknownFlavor && residuals.size > 1) {
      warnings.push('Вкус не распознан, но остаточные токены отличаются');
    }

    if (hasCanonical) {
      warnings.push('Часть товаров уже привязана к сетевому SKU');
    }

    return warnings;
  }

  private riskLevel(confidence: number, warnings: string[]) {
    if (warnings.length >= 2 || confidence < 80) {
      return 'HIGH' as const;
    }

    if (warnings.length === 1 || confidence < 90) {
      return 'MEDIUM' as const;
    }

    return 'LOW' as const;
  }

  private hasToken(normalizedName: string, token: string) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-zа-я0-9])${escaped}([^a-zа-я0-9]|$)`, 'i').test(
      normalizedName,
    );
  }

  private sourceLabel(externalDomain: string | null, storeNames: string[]) {
    if (storeNames.length > 0) {
      return `${storeNames.join(', ')} (${externalDomain ?? 'без домена'})`;
    }

    return externalDomain ?? 'Источник не определён';
  }
}
