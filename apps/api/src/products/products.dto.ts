import type { ProductAssortmentRole } from '@prisma/client';

export type CreateProductDto = {
  article: string;
  name: string;
  purchasePrice: string | number;
  salePrice: string | number;
  facing?: number;
  shelfLifeDays?: number | null;
  categoryId?: string | null;
  supplierId?: string | null;
  assortmentRole?: ProductAssortmentRole;
  isMandatory?: boolean;
};

export type UpdateProductDto = Partial<CreateProductDto> & {
  isActive?: boolean;
};
