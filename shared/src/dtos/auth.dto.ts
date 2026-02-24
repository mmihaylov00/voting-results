import type { AppRole } from '../enums/app-role';

export type AuthUserDto = {
  id: string;
  email: string;
  name?: string | null;
  role: AppRole;
  roles: AppRole[];
};

export type AuthSessionDto = {
  accessToken: string;
  user: AuthUserDto;
};

export type JwtPayloadDto = {
  sub: string;
  email: string;
  roles: AppRole[];
};
