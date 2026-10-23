import { Database } from '../../infra/db/database.js';
import { IdentityRepository } from '../../infra/db/repositories/identityRepository.js';
import { UserProfileInput } from '../../infra/db/types.js';
import { ClubsRepository } from './repository.js';
import { ClubApplicationView, ClubMemberView, ClubServiceResult, ClubSummary } from './types.js';

export interface ClubInfoResult extends ClubServiceResult {
  club?: ClubSummary;
  members?: ClubMemberView[];
  applications?: ClubApplicationView[];
}

export interface ClubLeaderboardResult {
  clubs: ClubSummary[];
}

export class ClubsService {
  constructor(
    private readonly db: Database,
    private readonly clubsRepo: ClubsRepository,
    private readonly identityRepo: IdentityRepository
  ) {}

  createClub(profile: UserProfileInput, name: string, description?: string): ClubInfoResult {
    const cleanName = name.trim();
    if (cleanName.length < 3 || cleanName.length > 40) {
      return { ok: false, reason: 'Club name must be between 3 and 40 characters.' };
    }

    const user = this.identityRepo.ensureUser(profile);
    const membership = this.clubsRepo.getClubMembershipForUser(user.id);
    if (membership) {
      return { ok: false, reason: 'You are already in a club. Leave it first.' };
    }

    if (this.clubsRepo.getClubByName(cleanName)) {
      return { ok: false, reason: 'A club with that name already exists.' };
    }

    const nowIso = new Date().toISOString();

    try {
      const clubId = this.db.transaction(() =>
        this.clubsRepo.createClub(user.id, cleanName, description?.trim() || null, nowIso)
      );

      const club = this.clubsRepo.getClubById(clubId);
      return {
        ok: true,
        club,
        members: this.clubsRepo.listMembers(clubId),
        applications: []
      };
    } catch {
      return { ok: false, reason: 'Unable to create club right now.' };
    }
  }

  getClubInfo(profile: UserProfileInput, clubName?: string): ClubInfoResult {
    const actor = this.identityRepo.ensureUser(profile);

    let club: ClubSummary | undefined;
    if (clubName?.trim()) {
      club = this.clubsRepo.getClubByName(clubName.trim());
    } else {
      const membership = this.clubsRepo.getClubMembershipForUser(actor.id);
      if (membership) {
        club = this.clubsRepo.getClubById(membership.clubId);
      }
    }

    if (!club) {
      return { ok: false, reason: 'Club not found.' };
    }

    return {
      ok: true,
      club,
      members: this.clubsRepo.listMembers(club.id),
      applications: this.clubsRepo.listApplications(club.id)
    };
  }

  applyToClub(profile: UserProfileInput, clubName: string): ClubServiceResult {
    const actor = this.identityRepo.ensureUser(profile);
    const membership = this.clubsRepo.getClubMembershipForUser(actor.id);
    if (membership) {
      return { ok: false, reason: 'You are already in a club.' };
    }

    const club = this.clubsRepo.getClubByName(clubName.trim());
    if (!club) {
      return { ok: false, reason: 'Club not found.' };
    }

    if (this.clubsRepo.isBanned(club.id, actor.id)) {
      return { ok: false, reason: 'You are banned from this club.' };
    }

    const added = this.clubsRepo.addApplication(club.id, actor.id);
    if (!added) {
      return { ok: false, reason: 'You already applied to this club.' };
    }

    return { ok: true };
  }

  acceptApplicant(actorProfile: UserProfileInput, applicantProfile: UserProfileInput): ClubServiceResult {
    const actor = this.identityRepo.ensureUser(actorProfile);
    const applicant = this.identityRepo.ensureUser(applicantProfile);

    const permission = this.getActorPermission(actor.id);
    if (!permission.ok) {
      return permission;
    }

    if (!permission.canModerate) {
      return { ok: false, reason: 'Only club moderators can accept applicants.' };
    }

    if (this.clubsRepo.getClubMembershipForUser(applicant.id)) {
      return { ok: false, reason: 'That user is already in a club.' };
    }

    if (this.clubsRepo.isBanned(permission.club.id, applicant.id)) {
      return { ok: false, reason: 'That user is banned from this club.' };
    }

    if (!this.clubsRepo.hasApplication(permission.club.id, applicant.id)) {
      return { ok: false, reason: 'No application from that user was found.' };
    }

    this.db.transaction(() => {
      this.clubsRepo.removeApplication(permission.club.id, applicant.id);
      this.clubsRepo.removeAllApplicationsForUser(applicant.id);
      this.clubsRepo.addMember(permission.club.id, applicant.id, false, new Date().toISOString());
    });

    return { ok: true };
  }

  rejectApplicant(actorProfile: UserProfileInput, applicantProfile: UserProfileInput): ClubServiceResult {
    const actor = this.identityRepo.ensureUser(actorProfile);
    const applicant = this.identityRepo.ensureUser(applicantProfile);

    const permission = this.getActorPermission(actor.id);
    if (!permission.ok) {
      return permission;
    }

    if (!permission.canModerate) {
      return { ok: false, reason: 'Only club moderators can reject applicants.' };
    }

    if (!this.clubsRepo.hasApplication(permission.club.id, applicant.id)) {
      return { ok: false, reason: 'No application from that user was found.' };
    }

    this.clubsRepo.removeApplication(permission.club.id, applicant.id);
    return { ok: true };
  }

  leaveClub(profile: UserProfileInput): ClubServiceResult {
    const actor = this.identityRepo.ensureUser(profile);
    const membership = this.clubsRepo.getClubMembershipForUser(actor.id);

    if (!membership) {
      return { ok: false, reason: 'You are not in a club.' };
    }

    if (membership.isOwner) {
      const memberCount = this.clubsRepo.countMembers(membership.clubId);
      if (memberCount > 1) {
        return {
          ok: false,
          reason: 'Transfer ownership or disband the club before leaving as owner.'
        };
      }

      this.clubsRepo.disband(membership.clubId);
      return { ok: true };
    }

    this.clubsRepo.removeMember(membership.clubId, actor.id);
    return { ok: true };
  }

  kickMember(actorProfile: UserProfileInput, targetProfile: UserProfileInput): ClubServiceResult {
    const actor = this.identityRepo.ensureUser(actorProfile);
    const target = this.identityRepo.ensureUser(targetProfile);

    if (actor.id === target.id) {
      return { ok: false, reason: 'Use /club leave if you want to leave your club.' };
    }

    const permission = this.getActorPermission(actor.id);
    if (!permission.ok) {
      return permission;
    }

    if (!permission.canModerate) {
      return { ok: false, reason: 'Only club moderators can kick members.' };
    }

    const targetMembership = this.clubsRepo.getClubMembershipForUser(target.id);
    if (!targetMembership || targetMembership.clubId !== permission.club.id) {
      return { ok: false, reason: 'That user is not in your club.' };
    }

    if (targetMembership.isOwner) {
      return { ok: false, reason: 'You cannot kick the club owner.' };
    }

    if (targetMembership.isAdmin && !permission.isOwner) {
      return { ok: false, reason: 'Only the owner can kick another club admin.' };
    }

    this.clubsRepo.removeMember(permission.club.id, target.id);
    return { ok: true };
  }

  banMember(actorProfile: UserProfileInput, targetProfile: UserProfileInput): ClubServiceResult {
    const actor = this.identityRepo.ensureUser(actorProfile);
    const target = this.identityRepo.ensureUser(targetProfile);

    const permission = this.getActorPermission(actor.id);
    if (!permission.ok) {
      return permission;
    }

    if (!permission.canModerate) {
      return { ok: false, reason: 'Only club moderators can ban users.' };
    }

    const targetMembership = this.clubsRepo.getClubMembershipForUser(target.id);
    if (targetMembership && targetMembership.clubId === permission.club.id) {
      if (targetMembership.isOwner) {
        return { ok: false, reason: 'You cannot ban the club owner.' };
      }

      if (targetMembership.isAdmin && !permission.isOwner) {
        return { ok: false, reason: 'Only the owner can ban another club admin.' };
      }
    }

    this.db.transaction(() => {
      if (targetMembership && targetMembership.clubId === permission.club.id) {
        this.clubsRepo.removeMember(permission.club.id, target.id);
      }
      this.clubsRepo.removeApplication(permission.club.id, target.id);
      this.clubsRepo.addBan(permission.club.id, target.id);
    });

    return { ok: true };
  }

  unbanMember(actorProfile: UserProfileInput, targetProfile: UserProfileInput): ClubServiceResult {
    const actor = this.identityRepo.ensureUser(actorProfile);
    const target = this.identityRepo.ensureUser(targetProfile);

    const permission = this.getActorPermission(actor.id);
    if (!permission.ok) {
      return permission;
    }

    if (!permission.canModerate) {
      return { ok: false, reason: 'Only club moderators can unban users.' };
    }

    if (!this.clubsRepo.isBanned(permission.club.id, target.id)) {
      return { ok: false, reason: 'That user is not banned from your club.' };
    }

    this.clubsRepo.removeBan(permission.club.id, target.id);
    return { ok: true };
  }

  transferOwnership(actorProfile: UserProfileInput, targetProfile: UserProfileInput): ClubServiceResult {
    const actor = this.identityRepo.ensureUser(actorProfile);
    const target = this.identityRepo.ensureUser(targetProfile);

    const permission = this.getActorPermission(actor.id);
    if (!permission.ok) {
      return permission;
    }

    if (!permission.isOwner) {
      return { ok: false, reason: 'Only the club owner can transfer ownership.' };
    }

    const targetMembership = this.clubsRepo.getClubMembershipForUser(target.id);
    if (!targetMembership || targetMembership.clubId !== permission.club.id) {
      return { ok: false, reason: 'Target user must be a member of your club.' };
    }

    if (targetMembership.isOwner) {
      return { ok: false, reason: 'That user is already the owner.' };
    }

    this.clubsRepo.updateOwner(permission.club.id, target.id);
    return { ok: true };
  }

  setAdmin(actorProfile: UserProfileInput, targetProfile: UserProfileInput, makeAdmin: boolean): ClubServiceResult {
    const actor = this.identityRepo.ensureUser(actorProfile);
    const target = this.identityRepo.ensureUser(targetProfile);

    const permission = this.getActorPermission(actor.id);
    if (!permission.ok) {
      return permission;
    }

    if (!permission.isOwner) {
      return { ok: false, reason: 'Only the club owner can manage club admins.' };
    }

    const targetMembership = this.clubsRepo.getClubMembershipForUser(target.id);
    if (!targetMembership || targetMembership.clubId !== permission.club.id) {
      return { ok: false, reason: 'That user is not in your club.' };
    }

    if (targetMembership.isOwner) {
      return { ok: false, reason: 'Owner admin status cannot be changed.' };
    }

    this.clubsRepo.setAdmin(permission.club.id, target.id, makeAdmin);
    return { ok: true };
  }

  updateDescription(actorProfile: UserProfileInput, description: string): ClubServiceResult {
    const actor = this.identityRepo.ensureUser(actorProfile);
    const permission = this.getActorPermission(actor.id);

    if (!permission.ok) {
      return permission;
    }

    if (!permission.isOwner) {
      return { ok: false, reason: 'Only the club owner can update description.' };
    }

    const trimmed = description.trim();
    if (trimmed.length > 300) {
      return { ok: false, reason: 'Description must be 300 characters or less.' };
    }

    this.clubsRepo.updateDescription(permission.club.id, trimmed || null);
    return { ok: true };
  }

  updateIcon(actorProfile: UserProfileInput, imageUrl: string): ClubServiceResult {
    const actor = this.identityRepo.ensureUser(actorProfile);
    const permission = this.getActorPermission(actor.id);

    if (!permission.ok) {
      return permission;
    }

    if (!permission.isOwner) {
      return { ok: false, reason: 'Only the club owner can update icon.' };
    }

    const trimmed = imageUrl.trim();
    if (trimmed.length > 0 && !/^https?:\/\//i.test(trimmed)) {
      return { ok: false, reason: 'Icon URL must start with http:// or https://.' };
    }

    this.clubsRepo.updateIcon(permission.club.id, trimmed || null);
    return { ok: true };
  }

  disbandClub(actorProfile: UserProfileInput): ClubServiceResult {
    const actor = this.identityRepo.ensureUser(actorProfile);
    const permission = this.getActorPermission(actor.id);

    if (!permission.ok) {
      return permission;
    }

    if (!permission.isOwner) {
      return { ok: false, reason: 'Only the club owner can disband the club.' };
    }

    this.clubsRepo.disband(permission.club.id);
    return { ok: true };
  }

  leaderboard(page: number, pageSize = 10): ClubLeaderboardResult {
    return { clubs: this.clubsRepo.getLeaderboard(page, pageSize) };
  }

  private getActorPermission(userId: number):
    | {
        ok: true;
        club: ClubSummary;
        isOwner: boolean;
        canModerate: boolean;
      }
    | {
        ok: false;
        reason: string;
      } {
    const membership = this.clubsRepo.getClubMembershipForUser(userId);
    if (!membership) {
      return { ok: false, reason: 'You are not in a club.' };
    }

    const club = this.clubsRepo.getClubById(membership.clubId);
    if (!club) {
      return { ok: false, reason: 'Your club no longer exists.' };
    }

    const isOwner = membership.isOwner;
    const canModerate = membership.isAdmin || isOwner;

    return {
      ok: true,
      club,
      isOwner,
      canModerate
    };
  }
}
