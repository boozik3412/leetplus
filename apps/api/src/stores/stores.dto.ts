export type CreateStoreDto = {
  name: string;
  address?: string | null;
};

export type UpdateStoreDto = Partial<CreateStoreDto> & {
  isActive?: boolean;
};
