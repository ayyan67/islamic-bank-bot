export interface ReactionRoleBinding {
  id: number;
  guildId: string;
  channelId: string;
  messageId: string;
  /** Normalised emoji identity: `c:<id>` for custom emoji, `u:<unicode>` otherwise. */
  emojiKey: string;
  /** Renderable form: the unicode character or `<:name:id>` / `<a:name:id>`. */
  emojiDisplay: string;
  roleId: string;
  createdBy: string | null;
  createdAt: string;
}

export interface BindInput {
  guildId: string;
  channelId: string;
  messageId: string;
  emojiKey: string;
  emojiDisplay: string;
  roleId: string;
  createdBy: string;
}

export interface ReactionEventInput {
  guildId: string | null | undefined;
  messageId: string;
  emojiKey: string;
  userId: string;
  isBot: boolean;
  botId: string | null | undefined;
}

export type ReactionDecision =
  | { action: 'ignore'; reason: 'no_guild' | 'bot' | 'unbound' }
  | { action: 'apply'; binding: ReactionRoleBinding };
