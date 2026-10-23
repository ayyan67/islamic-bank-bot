export interface ClubSummary {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  xp: number;
  ownerUserId: number;
  ownerDiscordUserId: string | null;
  ownerUsername: string | null;
  memberCount: number;
}

export interface ClubMembership {
  clubId: number;
  userId: number;
  isAdmin: boolean;
  isOwner: boolean;
}

export interface ClubMemberView {
  userId: number;
  discordUserId: string;
  username: string | null;
  isAdmin: boolean;
  joinedAt: string;
}

export interface ClubApplicationView {
  clubId: number;
  userId: number;
  discordUserId: string;
  username: string | null;
  appliedAt: string;
}

export interface ClubServiceResult {
  ok: boolean;
  reason?: string;
}
