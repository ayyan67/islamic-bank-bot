export interface AdminUserEntry {
  guildId: string | null;
  userId: string;
  createdBy: string;
  createdAt: string;
}

export interface AdminRoleEntry {
  guildId: string;
  roleId: string;
  createdBy: string;
  createdAt: string;
}

export interface EffectiveAdminsView {
  globalUsers: AdminUserEntry[];
  guildUsers: AdminUserEntry[];
  guildRoles: AdminRoleEntry[];
}
