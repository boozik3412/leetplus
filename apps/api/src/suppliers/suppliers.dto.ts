export type CreateSupplierDto = {
  name: string;
  paymentDelayDays?: number | null;
  minOrderAmount?: string | number | null;
  orderMultiplicity?: number | null;
};

export type UpdateSupplierDto = Partial<CreateSupplierDto> & {
  isActive?: boolean;
};
