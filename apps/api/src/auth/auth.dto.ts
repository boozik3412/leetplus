export type RegisterDto = {
  email: string;
  password: string;
  confirmPassword?: string;
  organizationName: string;
  tenantSlug: string;
  fullName?: string;
};

export type AcceptUserInviteDto = {
  email?: string;
  password?: string;
  confirmPassword?: string;
  fullName?: string;
};

export type LoginDto = {
  email: string;
  password: string;
};

export type ConfirmEmailDto = {
  token: string;
};

export type ResendEmailVerificationDto = {
  email: string;
};
