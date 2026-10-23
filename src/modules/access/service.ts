import { env } from '../../config/env.js';
import { AccessRepository } from './repository.js';
import { EffectiveAdminsView } from './types.js';

export class AccessService {
  private readonly ownerIdSet = new Set(env.OWNER_IDS);

  constructor(private readonly accessRepo: AccessRepository) {}

  isOwner(userId: string): boolean {
    return this.ownerIdSet.has(userId);
  }

  isAdmin(userId: string, guildId: string | undefined, memberRoleIds: readonly string[]): boolean {
    if (this.isOwner(userId)) {
      return true;
    }

    if (!guildId) {
      return false;
    }

    if (this.accessRepo.isGlobalAdminUser(userId)) {
      return true;
    }

    if (this.accessRepo.isGuildAdminUser(guildId, userId)) {
      return true;
    }

    return this.accessRepo.hasGuildAdminRole(guildId, memberRoleIds);
  }

  addGlobalAdminUser(userId: string, createdBy: string): boolean {
    return this.accessRepo.addAdminUser(null, userId, createdBy);
  }

  removeGlobalAdminUser(userId: string): boolean {
    return this.accessRepo.removeAdminUser(null, userId);
  }

  addGuildAdminUser(guildId: string, userId: string, createdBy: string): boolean {
    return this.accessRepo.addAdminUser(guildId, userId, createdBy);
  }

  removeGuildAdminUser(guildId: string, userId: string): boolean {
    return this.accessRepo.removeAdminUser(guildId, userId);
  }

  addGuildAdminRole(guildId: string, roleId: string, createdBy: string): boolean {
    return this.accessRepo.addAdminRole(guildId, roleId, createdBy);
  }

  removeGuildAdminRole(guildId: string, roleId: string): boolean {
    return this.accessRepo.removeAdminRole(guildId, roleId);
  }

  listEffectiveAdmins(guildId: string): EffectiveAdminsView {
    return {
      globalUsers: this.accessRepo.listGlobalAdminUsers(),
      guildUsers: this.accessRepo.listGuildAdminUsers(guildId),
      guildRoles: this.accessRepo.listGuildAdminRoles(guildId)
    };
  }
}
