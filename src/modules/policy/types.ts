export type CommandPolicyAction = 'allow' | 'deny';
export type CommandPolicyScope = 'guild' | 'channel' | 'role' | 'user';

export interface CommandPolicyEntry {
  id: number;
  guildId: string;
  command: string;
  subcommand: string | null;
  action: CommandPolicyAction;
  scope: CommandPolicyScope;
  targetId: string | null;
  createdBy: string;
  createdAt: string;
}

export interface AddPolicyInput {
  guildId: string;
  command: string;
  subcommand: string | null;
  action: CommandPolicyAction;
  scope: CommandPolicyScope;
  targetId: string | null;
  createdBy: string;
}

export interface RemovePolicyInput {
  guildId: string;
  command: string;
  subcommand: string | null;
  action: CommandPolicyAction;
  scope: CommandPolicyScope;
  targetId: string | null;
}

export interface PolicyEvaluationInput {
  guildId: string;
  command: string;
  subcommand: string | null;
  channelId: string;
  userId: string;
  roleIds: readonly string[];
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  reason?: 'deny_match' | 'allow_required';
}
