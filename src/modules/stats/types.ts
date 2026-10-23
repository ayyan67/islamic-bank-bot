export const GLOBAL_GUILD = '';

/** Metrics computed per day. Global-only metrics are marked in the service. */
export type DailyMetric =
  | 'active_users'
  | 'new_users'
  | 'minted'
  | 'burned'
  | 'timely_claims'
  | 'prayer_checkins'
  | 'transfers_count'
  | 'transfers_volume'
  | 'shop_purchases'
  | 'shop_refunds'
  | 'drops_count'
  | 'drops_volume'
  | 'supply_wallets'
  | 'supply_vaults'
  | 'top10_share';

export interface DailyStatPoint {
  date: string;
  value: number;
}
