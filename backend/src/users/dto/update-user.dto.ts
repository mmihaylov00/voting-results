import { AppRole } from '@votes/shared';

export type UpdateUserDto = {
  email?: string;
  password?: string;
  name?: string;
  role?: AppRole;
};
