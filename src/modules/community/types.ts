export type TagRewardClaimResult =
  | { ok: true; phase: 'initiated' }
  | { ok: true; phase: 'collected'; amount: number }
  | { ok: false; reason: string };
