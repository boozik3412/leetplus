import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

const tenantSlug = "demo";

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

  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "owner@demo.leetplus.ru",
      fullName: "Demo Owner",
      role: UserRole.OWNER,
      passwordHash: "dev_seed_password_hash_not_for_auth",
    },
  });

  await prisma.store.createMany({
    data: [
      {
        tenantId: tenant.id,
        name: "LeetPlus Arena Центр",
        address: "Демо-адрес, центральный клуб",
        isActive: true,
      },
      {
        tenantId: tenant.id,
        name: "LeetPlus Arena Север",
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

    await prisma.product.create({
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
  }

  console.log("Seed completed successfully.");
  console.log(`Tenant: ${tenant.name}`);
  console.log(`Domain: ${tenant.domain}`);
  console.log("Demo user: owner@demo.leetplus.ru");
  console.log(`Products created: ${products.length}`);
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