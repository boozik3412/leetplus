export type CreateCategoryDto = {
  name: string;
};

export type UpdateCategoryDto = {
  name?: string;
};

export type MergeCategoriesDto = {
  /** Categories selected by a user, including the category that remains. */
  categoryIds: string[];
  /** The selected internal LeetPlus category that will remain after the merge. */
  targetCategoryId: string;
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
    /**
     * Applies the mapped internal category only to active products that do not
     * have one yet. Products with an existing category and ambiguous Langame
     * sources are deliberately left untouched.
     */
    assignUncategorized?: boolean;
  };
