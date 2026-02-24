import type { AppRole } from '../enums/app-role';

export type UserDto = {
  id: string;
  email: string;
  name?: string | null;
  role: AppRole;
  roles: AppRole[];
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type CreateUserDto = {
  email: string;
  password: string;
  name?: string;
  role?: AppRole;
};

export type UpdateUserDto = {
  email?: string;
  password?: string;
  name?: string;
  role?: AppRole;
};
