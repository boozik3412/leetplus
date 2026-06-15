export type CreateStoreDto = {
  name: string;
  publicSlug?: string | null;
  address?: string | null;
  city?: string | null;
  cityFiasId?: string | null;
  cityKladrId?: string | null;
  timeZone?: string | null;
  gamificationEnabled?: boolean;
};

export type UpdateStoreDto = Partial<CreateStoreDto> & {
  isActive?: boolean;
};
