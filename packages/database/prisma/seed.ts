import { PrismaClient, StockMovementType, UserRole } from "@prisma/client";
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const prisma = new PrismaClient();
const scryptAsync = promisify(scrypt);

const tenantSlug = "demo";
const testUserEmail = "123@123.ru";
const testUserPassword = "12345678";

const categories = [
  "Энергетики",
  "Газировка",
  "Холодный чай",
  "Вода",
  "Чипсы",
  "Сухарики",
  "Шоколад",
  "Сладости",
  "Готовая еда",
  "Лапша",
  "Горячие напитки",
  "Жвачка",
  "Аксессуары",
];

const suppliers = [
  {
    name: "Напитки Pro",
    paymentDelayDays: 14,
    minOrderAmount: "5000",
    orderMultiplicity: 12,
  },
  {
    name: "Global Drinks",
    paymentDelayDays: 21,
    minOrderAmount: "8000",
    orderMultiplicity: 12,
  },
  {
    name: "Fresh Market",
    paymentDelayDays: 7,
    minOrderAmount: "3000",
    orderMultiplicity: 6,
  },
  {
    name: "Aqua Trade",
    paymentDelayDays: 10,
    minOrderAmount: "2000",
    orderMultiplicity: 12,
  },
  {
    name: "Snack Line",
    paymentDelayDays: 14,
    minOrderAmount: "4000",
    orderMultiplicity: 8,
  },
  {
    name: "Sweet Food",
    paymentDelayDays: 10,
    minOrderAmount: "3500",
    orderMultiplicity: 10,
  },
  {
    name: "City Food",
    paymentDelayDays: 3,
    minOrderAmount: "2500",
    orderMultiplicity: 1,
  },
  {
    name: "Asian Food",
    paymentDelayDays: 14,
    minOrderAmount: "3000",
    orderMultiplicity: 12,
  },
  {
    name: "Internal Bar",
    paymentDelayDays: 0,
    minOrderAmount: "0",
    orderMultiplicity: 1,
  },
  {
    name: "Tech Supply",
    paymentDelayDays: 21,
    minOrderAmount: "5000",
    orderMultiplicity: 1,
  },
];

const products = [
  {
    article: "DRK-001",
    name: "Adrenaline Rush 0.449",
    category: "Энергетики",
    supplier: "Напитки Pro",
    purchasePrice: "62",
    salePrice: "139",
    facing: 4,
    shelfLifeDays: 180,
  },
  {
    article: "DRK-002",
    name: "Red Bull 0.25",
    category: "Энергетики",
    supplier: "Global Drinks",
    purchasePrice: "92",
    salePrice: "179",
    facing: 3,
    shelfLifeDays: 160,
  },
  {
    article: "DRK-003",
    name: "Burn Original 0.449",
    category: "Энергетики",
    supplier: "Global Drinks",
    purchasePrice: "68",
    salePrice: "149",
    facing: 3,
    shelfLifeDays: 200,
  },
  {
    article: "DRK-004",
    name: "Flash Up Energy 0.45",
    category: "Энергетики",
    supplier: "Напитки Pro",
    purchasePrice: "45",
    salePrice: "109",
    facing: 4,
    shelfLifeDays: 220,
  },
  {
    article: "DRK-005",
    name: "Добрый Cola 0.5",
    category: "Газировка",
    supplier: "Fresh Market",
    purchasePrice: "38",
    salePrice: "99",
    facing: 3,
    shelfLifeDays: 120,
  },
  {
    article: "DRK-006",
    name: "Pepsi 0.5",
    category: "Газировка",
    supplier: "Fresh Market",
    purchasePrice: "41",
    salePrice: "109",
    facing: 3,
    shelfLifeDays: 120,
  },
  {
    article: "DRK-007",
    name: "Lipton Ice Tea 0.5",
    category: "Холодный чай",
    supplier: "Fresh Market",
    purchasePrice: "43",
    salePrice: "109",
    facing: 2,
    shelfLifeDays: 150,
  },
  {
    article: "DRK-008",
    name: "Святой Источник 0.5",
    category: "Вода",
    supplier: "Aqua Trade",
    purchasePrice: "22",
    salePrice: "69",
    facing: 3,
    shelfLifeDays: 365,
  },
  {
    article: "SNK-001",
    name: "Lay's Сметана и зелень 140 г",
    category: "Чипсы",
    supplier: "Snack Line",
    purchasePrice: "81",
    salePrice: "179",
    facing: 3,
    shelfLifeDays: 100,
  },
  {
    article: "SNK-002",
    name: "Lay's Краб 140 г",
    category: "Чипсы",
    supplier: "Snack Line",
    purchasePrice: "81",
    salePrice: "179",
    facing: 3,
    shelfLifeDays: 100,
  },
  {
    article: "SNK-003",
    name: "Doritos Nacho 100 г",
    category: "Чипсы",
    supplier: "Snack Line",
    purchasePrice: "72",
    salePrice: "159",
    facing: 2,
    shelfLifeDays: 110,
  },
  {
    article: "SNK-004",
    name: "Хрусteam Багет 60 г",
    category: "Сухарики",
    supplier: "Snack Line",
    purchasePrice: "29",
    salePrice: "79",
    facing: 2,
    shelfLifeDays: 150,
  },
  {
    article: "SNK-005",
    name: "Кириешки Сыр 60 г",
    category: "Сухарики",
    supplier: "Snack Line",
    purchasePrice: "24",
    salePrice: "69",
    facing: 2,
    shelfLifeDays: 170,
  },
  {
    article: "SWT-001",
    name: "Snickers 50.5 г",
    category: "Шоколад",
    supplier: "Sweet Food",
    purchasePrice: "39",
    salePrice: "89",
    facing: 3,
    shelfLifeDays: 250,
  },
  {
    article: "SWT-002",
    name: "Mars 50 г",
    category: "Шоколад",
    supplier: "Sweet Food",
    purchasePrice: "37",
    salePrice: "89",
    facing: 2,
    shelfLifeDays: 250,
  },
  {
    article: "SWT-003",
    name: "Twix 55 г",
    category: "Шоколад",
    supplier: "Sweet Food",
    purchasePrice: "38",
    salePrice: "89",
    facing: 2,
    shelfLifeDays: 250,
  },
  {
    article: "SWT-004",
    name: "Picnic 52 г",
    category: "Шоколад",
    supplier: "Sweet Food",
    purchasePrice: "34",
    salePrice: "79",
    facing: 2,
    shelfLifeDays: 230,
  },
  {
    article: "SWT-005",
    name: "M&M's Peanut 130 г",
    category: "Сладости",
    supplier: "Sweet Food",
    purchasePrice: "96",
    salePrice: "219",
    facing: 2,
    shelfLifeDays: 220,
  },
  {
    article: "FST-001",
    name: "Ролл Цезарь охлажденный",
    category: "Готовая еда",
    supplier: "City Food",
    purchasePrice: "112",
    salePrice: "249",
    facing: 2,
    shelfLifeDays: 3,
  },
  {
    article: "FST-002",
    name: "Сэндвич ветчина-сыр",
    category: "Готовая еда",
    supplier: "City Food",
    purchasePrice: "98",
    salePrice: "219",
    facing: 2,
    shelfLifeDays: 3,
  },
  {
    article: "FST-003",
    name: "Хот-дог классический",
    category: "Готовая еда",
    supplier: "City Food",
    purchasePrice: "74",
    salePrice: "179",
    facing: 2,
    shelfLifeDays: 4,
  },
  {
    article: "FST-004",
    name: "Пицца пепперони кусок",
    category: "Готовая еда",
    supplier: "City Food",
    purchasePrice: "89",
    salePrice: "199",
    facing: 2,
    shelfLifeDays: 3,
  },
  {
    article: "NOO-001",
    name: "Доширак говядина 90 г",
    category: "Лапша",
    supplier: "Asian Food",
    purchasePrice: "42",
    salePrice: "109",
    facing: 3,
    shelfLifeDays: 240,
  },
  {
    article: "NOO-002",
    name: "Доширак курица 90 г",
    category: "Лапша",
    supplier: "Asian Food",
    purchasePrice: "42",
    salePrice: "109",
    facing: 3,
    shelfLifeDays: 240,
  },
  {
    article: "NOO-003",
    name: "Big Bon курица 95 г",
    category: "Лапша",
    supplier: "Asian Food",
    purchasePrice: "48",
    salePrice: "119",
    facing: 2,
    shelfLifeDays: 250,
  },
  {
    article: "COF-001",
    name: "Кофе американо 250 мл",
    category: "Горячие напитки",
    supplier: "Internal Bar",
    purchasePrice: "18",
    salePrice: "99",
    facing: 1,
    shelfLifeDays: 365,
  },
  {
    article: "COF-002",
    name: "Капучино 250 мл",
    category: "Горячие напитки",
    supplier: "Internal Bar",
    purchasePrice: "26",
    salePrice: "139",
    facing: 1,
    shelfLifeDays: 365,
  },
  {
    article: "COF-003",
    name: "Латте 300 мл",
    category: "Горячие напитки",
    supplier: "Internal Bar",
    purchasePrice: "31",
    salePrice: "159",
    facing: 1,
    shelfLifeDays: 365,
  },
  {
    article: "GUM-001",
    name: "Orbit Spearmint",
    category: "Жвачка",
    supplier: "Sweet Food",
    purchasePrice: "29",
    salePrice: "79",
    facing: 1,
    shelfLifeDays: 300,
  },
  {
    article: "ACC-001",
    name: "Кабель Type-C 1 м",
    category: "Аксессуары",
    supplier: "Tech Supply",
    purchasePrice: "92",
    salePrice: "249",
    facing: 1,
    shelfLifeDays: null,
  },
];

function daysAgo(days: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;

  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

async function main() {
  console.log("Start seeding LeetPlus demo data...");

  const tenant = await prisma.tenant.upsert({
    where: {
      slug: tenantSlug,
    },
    update: {
      name: "Demo Cyber Club",
      domain: "demo.leetplus.ru",
    },
    create: {
      name: "Demo Cyber Club",
      slug: tenantSlug,
      domain: "demo.leetplus.ru",
    },
  });

  await prisma.stockMovement.deleteMany({
    where: {
      tenantId: tenant.id,
    },
  });

  await prisma.salesFact.deleteMany({
    where: {
      tenantId: tenant.id,
    },
  });

  await prisma.inventorySnapshot.deleteMany({
    where: {
      tenantId: tenant.id,
    },
  });

  await prisma.importJob.deleteMany({
    where: {
      tenantId: tenant.id,
    },
  });

  await prisma.product.deleteMany({
    where: {
      tenantId: tenant.id,
    },
  });

  await prisma.store.deleteMany({
    where: {
      tenantId: tenant.id,
    },
  });

  await prisma.user.deleteMany({
    where: {
      tenantId: tenant.id,
    },
  });
  await prisma.user.deleteMany({
    where: {
      email: testUserEmail,
    },
  });

  await prisma.category.deleteMany({
    where: {
      tenantId: tenant.id,
    },
  });

  await prisma.supplier.deleteMany({
    where: {
      tenantId: tenant.id,
    },
  });

  const createdCategories = new Map<string, string>();
  const createdSuppliers = new Map<string, string>();
  const createdProducts = new Map<
    string,
    {
      id: string;
      purchasePrice: string;
      salePrice: string;
    }
  >();

  for (const categoryName of categories) {
    const category = await prisma.category.create({
      data: {
        tenantId: tenant.id,
        name: categoryName,
      },
    });

    createdCategories.set(categoryName, category.id);
  }

  for (const supplierData of suppliers) {
    const supplier = await prisma.supplier.create({
      data: {
        tenantId: tenant.id,
        name: supplierData.name,
        paymentDelayDays: supplierData.paymentDelayDays,
        minOrderAmount: supplierData.minOrderAmount,
        orderMultiplicity: supplierData.orderMultiplicity,
      },
    });

    createdSuppliers.set(supplierData.name, supplier.id);
  }

  const testUserPasswordHash = await hashPassword(testUserPassword);

  await prisma.user.createMany({
    data: [
      {
        tenantId: tenant.id,
        email: "owner@demo.leetplus.ru",
        fullName: "Demo Owner",
        role: UserRole.OWNER,
        passwordHash: "dev_seed_password_hash_not_for_auth",
      },
      {
        tenantId: tenant.id,
        email: testUserEmail,
        fullName: "Тестовый пользователь",
        role: UserRole.OWNER,
        isPlatformAdmin: true,
        passwordHash: testUserPasswordHash,
        emailVerifiedAt: new Date(),
      },
    ],
  });

  await prisma.store.createMany({
    data: [
      {
        tenantId: tenant.id,
        name: "LeetPlus Arena Центр",
        publicSlug: "arena-center",
        address: "Демо-адрес, центральный клуб",
        isActive: true,
      },
      {
        tenantId: tenant.id,
        name: "LeetPlus Arena Север",
        publicSlug: "arena-north",
        address: "Демо-адрес, северный клуб",
        isActive: true,
      },
    ],
  });

  for (const product of products) {
    const categoryId = createdCategories.get(product.category);
    const supplierId = createdSuppliers.get(product.supplier);

    if (!categoryId) {
      throw new Error(`Category not found: ${product.category}`);
    }

    if (!supplierId) {
      throw new Error(`Supplier not found: ${product.supplier}`);
    }

    const createdProduct = await prisma.product.create({
      data: {
        tenantId: tenant.id,
        article: product.article,
        name: product.name,
        categoryId,
        supplierId,
        purchasePrice: product.purchasePrice,
        salePrice: product.salePrice,
        facing: product.facing,
        shelfLifeDays: product.shelfLifeDays,
        isActive: true,
      },
    });
    createdProducts.set(product.article, {
      id: createdProduct.id,
      purchasePrice: product.purchasePrice,
      salePrice: product.salePrice,
    });
  }

  const stores = await prisma.store.findMany({
    where: { tenantId: tenant.id },
    orderBy: { name: "asc" },
  });
  const primaryStore = stores[0];
  const secondaryStore = stores[1];

  if (!primaryStore || !secondaryStore) {
    throw new Error("Demo stores were not created");
  }

  const fastArticles = ["DRK-001", "DRK-004", "SNK-001", "COF-002", "FST-003"];
  const steadyArticles = ["DRK-005", "SWT-001", "NOO-001", "SNK-004", "COF-001"];

  await prisma.salesFact.createMany({
    data: products.flatMap((product, productIndex) => {
      const createdProduct = createdProducts.get(product.article);

      if (!createdProduct) {
        throw new Error(`Product not found: ${product.article}`);
      }

      return Array.from({ length: 14 }, (_, dayIndex) => {
        const store = dayIndex % 3 === 0 ? secondaryStore : primaryStore;
        const speedFactor = fastArticles.includes(product.article)
          ? 2.4
          : steadyArticles.includes(product.article)
            ? 1.5
            : 0.8;
        const quantity = Math.max(
          1,
          Math.round(((productIndex % 4) + 1) * speedFactor + (dayIndex % 3)),
        );
        const revenue = quantity * Number(product.salePrice);
        const cost = quantity * Number(product.purchasePrice);

        return {
          tenantId: tenant.id,
          storeId: store.id,
          productId: createdProduct.id,
          saleDate: daysAgo(13 - dayIndex),
          quantity: String(quantity),
          revenue: String(revenue),
          cost: String(cost),
        };
      });
    }),
  });

  await prisma.inventorySnapshot.createMany({
    data: products.flatMap((product, productIndex) => {
      const createdProduct = createdProducts.get(product.article);

      if (!createdProduct) {
        throw new Error(`Product not found: ${product.article}`);
      }

      const riskyStock = fastArticles.includes(product.article);
      const primaryQuantity = riskyStock ? (productIndex % 3) + 1 : 10 + productIndex;
      const secondaryQuantity = riskyStock ? productIndex % 2 : 6 + (productIndex % 5);

      return [
        {
          tenantId: tenant.id,
          storeId: primaryStore.id,
          productId: createdProduct.id,
          snapshotDate: daysAgo(0),
          quantity: String(primaryQuantity),
        },
        {
          tenantId: tenant.id,
          storeId: secondaryStore.id,
          productId: createdProduct.id,
          snapshotDate: daysAgo(0),
          quantity: String(secondaryQuantity),
        },
      ];
    }),
  });

  const movementArticles = ["FST-001", "FST-002", "DRK-001", "SNK-001", "COF-002"];

  await prisma.stockMovement.createMany({
    data: movementArticles.flatMap((article, index) => {
      const createdProduct = createdProducts.get(article);

      if (!createdProduct) {
        throw new Error(`Product not found: ${article}`);
      }

      const writeOffQuantity = index + 1;
      const returnQuantity = index % 2 === 0 ? 1 : 0;
      const movements = [
        {
          tenantId: tenant.id,
          storeId: primaryStore.id,
          productId: createdProduct.id,
          movementDate: daysAgo(5 + index),
          type: StockMovementType.WRITEOFF,
          quantity: String(writeOffQuantity),
          amount: String(writeOffQuantity * Number(createdProduct.purchasePrice)),
          reason: index < 2 ? "Истёк срок годности" : "Повреждение упаковки",
        },
      ];

      if (returnQuantity > 0) {
        movements.push({
          tenantId: tenant.id,
          storeId: secondaryStore.id,
          productId: createdProduct.id,
          movementDate: daysAgo(3 + index),
          type: StockMovementType.RETURN,
          quantity: String(returnQuantity),
          amount: String(returnQuantity * Number(createdProduct.salePrice)),
          reason: "Возврат гостя",
        });
      }

      return movements;
    }),
  });

  console.log("Seed completed successfully.");
  console.log(`Tenant: ${tenant.name}`);
  console.log(`Domain: ${tenant.domain}`);
  console.log("Demo user: owner@demo.leetplus.ru");
  console.log(`Test user: ${testUserEmail} / ${testUserPassword}`);
  console.log(`Products created: ${products.length}`);
  console.log("Sales, inventory and stock movements created for reports.");
}

main()
  .catch((error) => {
    console.error("Seed failed.");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
