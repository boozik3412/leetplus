export type RegisterDto = {
  email: string;
  password: string;
  organizationName: string;
  tenantSlug: string;
  fullName?: string;
};

export type LoginDto = {
  email: string;
  password: string;
};
