export type CreateStoreDto = {
  name: string;
  publicSlug?: string | null;
  address?: string | null;
  city?: string | null;
  cityFiasId?: string | null;
  cityKladrId?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  yandexMapsUrl?: string | null;
  timeZone?: string | null;
  gamificationEnabled?: boolean;
};

export type UpdateStoreDto = Partial<CreateStoreDto> & {
  isActive?: boolean;
};
