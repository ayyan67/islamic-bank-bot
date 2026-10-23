export type ShopItemType = 'role' | 'item';

export interface ShopItem {
  id: number;
  guildId: string;
  itemKey: string;
  displayName: string;
  description: string | null;
  price: number;
  itemType: ShopItemType;
  roleId: string | null;
  roleRequirementId: string | null;
  sortIndex: number;
  stock: number | null;
  maxPerUser: number | null;
  metadataJson: string | null;
  isActive: boolean;
  createdBy: string | null;
  legacyShopEntryId: number | null;
  legacyType: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShopItemText {
  id: number;
  shopItemId: number;
  textValue: string;
  sortIndex: number;
  createdAt: string;
}

export interface ShopInventoryEntry {
  id: number;
  userId: number;
  guildId: string | null;
  shopItemId: number | null;
  itemKey: string;
  itemType: 'role' | 'item' | 'xp_item' | 'legacy';
  quantity: number;
  isUsing: boolean;
  legacyOwnedItemId: number | null;
  acquiredAt: string;
  updatedAt: string;
}

export interface CreateShopItemInput {
  guildId: string;
  itemKey: string;
  displayName: string;
  description?: string | null;
  price: number;
  itemType: ShopItemType;
  roleId?: string | null;
  roleRequirementId?: string | null;
  sortIndex?: number;
  stock?: number | null;
  maxPerUser?: number | null;
  metadataJson?: string | null;
  createdBy?: string | null;
  legacyShopEntryId?: number | null;
  legacyType?: number | null;
}

export interface PurchaseShopItemInput {
  guildId: string;
  itemQuery: string;
  memberRoleIds: readonly string[];
}

export interface PurchaseShopItemResult {
  ok: boolean;
  reason?: string;
  item?: ShopItem;
  inventory?: ShopInventoryEntry;
  previousBalance?: number;
  newBalance?: number;
}

export interface RefundShopItemResult {
  ok: boolean;
  reason?: string;
  item?: ShopItem;
  refundedAmount?: number;
  newBalance?: number;
}
