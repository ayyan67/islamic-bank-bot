export interface DropRow {
  id: number;
  guild_id: string;
  channel_id: string;
  dropper_user_id: number;
  picker_user_id: number | null;
  amount: number;
  created_at: string;
  picked_at: string | null;
}

export interface DropResult {
  ok: true;
  dropId: number;
  amount: number;
}

export interface DropFailure {
  ok: false;
  reason: string;
}

export interface PickResult {
  ok: true;
  amount: number;
  dropperDiscordUserId: string;
}

export interface PickFailure {
  ok: false;
  reason: string;
}
