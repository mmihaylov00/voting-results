import { AppRole } from '@votes/shared';

export type CreateUserDto = {
  email: string;
  password: string;
  name?: string;
  role?: AppRole;
};
