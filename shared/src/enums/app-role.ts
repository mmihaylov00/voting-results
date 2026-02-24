export const APP_ROLE = {
  ADMIN: 'admin',
  CAMPAIGN_MANAGER: 'campaign_manager',
  VIEWER: 'viewer',
} as const;

export type AppRole = (typeof APP_ROLE)[keyof typeof APP_ROLE];

export const APP_ROLES: readonly AppRole[] = [APP_ROLE.ADMIN, APP_ROLE.CAMPAIGN_MANAGER, APP_ROLE.VIEWER];

export const ROLE_NAME: Record<AppRole, string> = {
  [APP_ROLE.ADMIN]: 'Админ',
  [APP_ROLE.CAMPAIGN_MANAGER]: 'Мениджър',
  [APP_ROLE.VIEWER]: 'Потребител',
};

export function isAppRole(value: string): value is AppRole {
  return (APP_ROLES as readonly string[]).includes(value);
}

export function getRoleName(role: AppRole): string {
  return ROLE_NAME[role];
}
