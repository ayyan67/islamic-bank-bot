export interface UserRecord {
  id: number;
  discordUserId: string;
  username: string | null;
  discriminator: string | null;
  avatarId: string | null;
}

export interface UserProfileInput {
  discordUserId: string;
  username?: string | null;
  discriminator?: string | null;
  avatarId?: string | null;
}

export type TxKind =
  | 'claim_timely'
  | 'claim_prayer'
  | 'claim_tag_reward'
  | 'claim_trivia'
  | 'claim_eid'
  | 'transfer'
  | 'vault_deposit'
  | 'vault_withdraw'
  | 'admin_award'
  | 'admin_take'
  | 'shop_purchase'
  | 'shop_refund'
  | 'drop'
  | 'drop_pick'
  | 'task_bounty_lock'
  | 'task_bounty_payout'
  | 'task_bounty_refund'
  | 'challenge_reward'
  | 'legacy';
