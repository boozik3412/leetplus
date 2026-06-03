export type CreateStoreDto = {
  name: string;
  publicSlug?: string | null;
  address?: string | null;
};

export type UpdateStoreDto = Partial<CreateStoreDto> & {
  isActive?: boolean;
};
