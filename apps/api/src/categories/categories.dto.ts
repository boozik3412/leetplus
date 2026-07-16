export type CreateCategoryDto = {
  name: string;
};

export type UpdateCategoryDto = {
  name?: string;
};

export type CategorySourceMappingDto = {
  externalDomain: string;
  externalGroupId: string;
  categoryId?: string;
  createCategoryName?: string;
  status?: 'SUGGESTED' | 'CONFIRMED' | 'REJECTED';
  confidence?: number;
  action?: 'MAP' | 'UNMAP';
};

export type PreviewCategorySourceMappingsDto = {
  mappings: CategorySourceMappingDto[];
};

export type CategorySourceProductResolutionDto = {
  productId: string;
  categoryId: string;
  externalDomain: string;
  externalGroupId: string;
};

export type ApplyCategorySourceMappingsDto =
  PreviewCategorySourceMappingsDto & {
    resolutions?: CategorySourceProductResolutionDto[];
  };
