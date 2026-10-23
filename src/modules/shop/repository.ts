import { Database } from '../../infra/db/database.js';
import {
  CreateShopItemInput,
  ShopInventoryEntry,
  ShopItem,
  ShopItemText
} from './types.js';

interface ShopItemRow {
  id: number;
  guild_id: string;
  item_key: string;
  display_name: string;
  description: string | null;
  price: number;
  item_type: 'role' | 'item';
  role_id: string | null;
  role_requirement_id: string | null;
  sort_index: number;
  stock: number | null;
  max_per_user: number | null;
  metadata_json: string | null;
  is_active: number;
  created_by: string | null;
  legacy_shop_entry_id: number | null;
  legacy_type: number | null;
  created_at: string;
  updated_at: string;
}

interface ShopItemTextRow {
  id: number;
  shop_item_id: number;
  text_value: string;
  sort_index: number;
  created_at: string;
}

interface ShopInventoryRow {
  id: number;
  user_id: number;
  guild_id: string | null;
  shop_item_id: number | null;
  item_key: string;
  item_type: 'role' | 'item' | 'xp_item' | 'legacy';
  quantity: number;
  is_using: number;
  legacy_owned_item_id: number | null;
  acquired_at: string;
  updated_at: string;
}

export class ShopRepository {
  constructor(private readonly db: Database) {}

  createItem(input: CreateShopItemInput): ShopItem {
    const result = this.db.sqlite
      .prepare(
        `
        INSERT INTO shop_items (
          guild_id,
          item_key,
          display_name,
          description,
          price,
          item_type,
          role_id,
          role_requirement_id,
          sort_index,
          stock,
          max_per_user,
          metadata_json,
          created_by,
          legacy_shop_entry_id,
          legacy_type,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `
      )
      .run(
        input.guildId,
        input.itemKey,
        input.displayName,
        input.description ?? null,
        input.price,
        input.itemType,
        input.roleId ?? null,
        input.roleRequirementId ?? null,
        input.sortIndex ?? 0,
        input.stock ?? null,
        input.maxPerUser ?? null,
        input.metadataJson ?? null,
        input.createdBy ?? null,
        input.legacyShopEntryId ?? null,
        input.legacyType ?? null
      );

    return this.getItemById(Number(result.lastInsertRowid))!;
  }

  createItemText(shopItemId: number, textValue: string, sortIndex: number): ShopItemText {
    const result = this.db.sqlite
      .prepare(
        `
        INSERT INTO shop_item_texts (shop_item_id, text_value, sort_index)
        VALUES (?, ?, ?)
      `
      )
      .run(shopItemId, textValue, sortIndex);

    return this.getItemTexts(shopItemId).find((row) => row.id === Number(result.lastInsertRowid))!;
  }

  listItemsByGuild(guildId: string, includeInactive: boolean): ShopItem[] {
    const rows = this.db.sqlite
      .prepare(
        `
        SELECT
          id,
          guild_id,
          item_key,
          display_name,
          description,
          price,
          item_type,
          role_id,
          role_requirement_id,
          sort_index,
          stock,
          max_per_user,
          metadata_json,
          is_active,
          created_by,
          legacy_shop_entry_id,
          legacy_type,
          created_at,
          updated_at
        FROM shop_items
        WHERE guild_id = ?
          AND (? = 1 OR is_active = 1)
        ORDER BY sort_index ASC, id ASC
      `
      )
      .all(guildId, includeInactive ? 1 : 0) as ShopItemRow[];

    return rows.map((row) => this.mapShopItemRow(row));
  }

  getItemById(itemId: number): ShopItem | undefined {
    const row = this.db.sqlite
      .prepare(
        `
        SELECT
          id,
          guild_id,
          item_key,
          display_name,
          description,
          price,
          item_type,
          role_id,
          role_requirement_id,
          sort_index,
          stock,
          max_per_user,
          metadata_json,
          is_active,
          created_by,
          legacy_shop_entry_id,
          legacy_type,
          created_at,
          updated_at
        FROM shop_items
        WHERE id = ?
        LIMIT 1
      `
      )
      .get(itemId) as ShopItemRow | undefined;

    return row ? this.mapShopItemRow(row) : undefined;
  }

  getItemByGuildAndKey(guildId: string, itemKey: string): ShopItem | undefined {
    const row = this.db.sqlite
      .prepare(
        `
        SELECT
          id,
          guild_id,
          item_key,
          display_name,
          description,
          price,
          item_type,
          role_id,
          role_requirement_id,
          sort_index,
          stock,
          max_per_user,
          metadata_json,
          is_active,
          created_by,
          legacy_shop_entry_id,
          legacy_type,
          created_at,
          updated_at
        FROM shop_items
        WHERE guild_id = ?
          AND item_key = ?
        LIMIT 1
      `
      )
      .get(guildId, itemKey) as ShopItemRow | undefined;

    return row ? this.mapShopItemRow(row) : undefined;
  }

  getItemByGuildAndSortIndex(guildId: string, sortIndex: number): ShopItem | undefined {
    const row = this.db.sqlite
      .prepare(
        `
        SELECT
          id,
          guild_id,
          item_key,
          display_name,
          description,
          price,
          item_type,
          role_id,
          role_requirement_id,
          sort_index,
          stock,
          max_per_user,
          metadata_json,
          is_active,
          created_by,
          legacy_shop_entry_id,
          legacy_type,
          created_at,
          updated_at
        FROM shop_items
        WHERE guild_id = ?
          AND sort_index = ?
        ORDER BY id ASC
        LIMIT 1
      `
      )
      .get(guildId, sortIndex) as ShopItemRow | undefined;

    return row ? this.mapShopItemRow(row) : undefined;
  }

  getItemTexts(shopItemId: number): ShopItemText[] {
    const rows = this.db.sqlite
      .prepare(
        `
        SELECT id, shop_item_id, text_value, sort_index, created_at
        FROM shop_item_texts
        WHERE shop_item_id = ?
        ORDER BY sort_index ASC, id ASC
      `
      )
      .all(shopItemId) as ShopItemTextRow[];

    return rows.map((row) => ({
      id: row.id,
      shopItemId: row.shop_item_id,
      textValue: row.text_value,
      sortIndex: row.sort_index,
      createdAt: row.created_at
    }));
  }

  setItemPrice(guildId: string, itemKey: string, price: number): boolean {
    const result = this.db.sqlite
      .prepare(
        `
        UPDATE shop_items
        SET price = ?, updated_at = CURRENT_TIMESTAMP
        WHERE guild_id = ? AND item_key = ?
      `
      )
      .run(price, guildId, itemKey);

    return result.changes > 0;
  }

  setItemActive(guildId: string, itemKey: string, isActive: boolean): boolean {
    const result = this.db.sqlite
      .prepare(
        `
        UPDATE shop_items
        SET is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE guild_id = ? AND item_key = ?
      `
      )
      .run(isActive ? 1 : 0, guildId, itemKey);

    return result.changes > 0;
  }

  getInventoryEntry(userId: number, guildId: string | null, itemKey: string): ShopInventoryEntry | undefined {
    const row = this.db.sqlite
      .prepare(
        `
        SELECT
          id,
          user_id,
          guild_id,
          shop_item_id,
          item_key,
          item_type,
          quantity,
          is_using,
          legacy_owned_item_id,
          acquired_at,
          updated_at
        FROM shop_inventory
        WHERE user_id = ?
          AND COALESCE(guild_id, '__global__') = COALESCE(?, '__global__')
          AND item_key = ?
        LIMIT 1
      `
      )
      .get(userId, guildId, itemKey) as ShopInventoryRow | undefined;

    return row ? this.mapInventoryRow(row) : undefined;
  }

  upsertInventory(input: {
    userId: number;
    guildId: string | null;
    shopItemId: number | null;
    itemKey: string;
    itemType: 'role' | 'item' | 'xp_item' | 'legacy';
    quantityDelta: number;
    isUsing?: boolean;
    legacyOwnedItemId?: number | null;
    acquiredAt?: string;
  }): ShopInventoryEntry {
    const existing = this.getInventoryEntry(input.userId, input.guildId, input.itemKey);
    if (!existing) {
      const quantity = Math.max(0, input.quantityDelta);
      const result = this.db.sqlite
        .prepare(
          `
          INSERT INTO shop_inventory (
            user_id,
            guild_id,
            shop_item_id,
            item_key,
            item_type,
            quantity,
            is_using,
            legacy_owned_item_id,
            acquired_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `
        )
        .run(
          input.userId,
          input.guildId,
          input.shopItemId,
          input.itemKey,
          input.itemType,
          quantity,
          input.isUsing ? 1 : 0,
          input.legacyOwnedItemId ?? null,
          input.acquiredAt ?? new Date().toISOString()
        );

      return this.getInventoryById(Number(result.lastInsertRowid))!;
    }

    const newQuantity = Math.max(0, existing.quantity + input.quantityDelta);
    this.db.sqlite
      .prepare(
        `
        UPDATE shop_inventory
        SET
          shop_item_id = COALESCE(?, shop_item_id),
          quantity = ?,
          is_using = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      )
      .run(
        input.shopItemId ?? null,
        newQuantity,
        typeof input.isUsing === 'boolean' ? (input.isUsing ? 1 : 0) : existing.isUsing ? 1 : 0,
        existing.id
      );

    return this.getInventoryById(existing.id)!;
  }

  listInventoryByUser(userId: number, guildId?: string): ShopInventoryEntry[] {
    if (guildId) {
      const rows = this.db.sqlite
        .prepare(
          `
          SELECT
            id,
            user_id,
            guild_id,
            shop_item_id,
            item_key,
            item_type,
            quantity,
            is_using,
            legacy_owned_item_id,
            acquired_at,
            updated_at
          FROM shop_inventory
          WHERE user_id = ?
            AND guild_id = ?
          ORDER BY updated_at DESC, id DESC
        `
        )
        .all(userId, guildId) as ShopInventoryRow[];

      return rows.map((row) => this.mapInventoryRow(row));
    }

    const rows = this.db.sqlite
      .prepare(
        `
        SELECT
          id,
          user_id,
          guild_id,
          shop_item_id,
          item_key,
          item_type,
          quantity,
          is_using,
          legacy_owned_item_id,
          acquired_at,
          updated_at
        FROM shop_inventory
        WHERE user_id = ?
        ORDER BY updated_at DESC, id DESC
      `
      )
      .all(userId) as ShopInventoryRow[];

    return rows.map((row) => this.mapInventoryRow(row));
  }

  private getInventoryById(id: number): ShopInventoryEntry | undefined {
    const row = this.db.sqlite
      .prepare(
        `
        SELECT
          id,
          user_id,
          guild_id,
          shop_item_id,
          item_key,
          item_type,
          quantity,
          is_using,
          legacy_owned_item_id,
          acquired_at,
          updated_at
        FROM shop_inventory
        WHERE id = ?
        LIMIT 1
      `
      )
      .get(id) as ShopInventoryRow | undefined;

    return row ? this.mapInventoryRow(row) : undefined;
  }

  private mapShopItemRow(row: ShopItemRow): ShopItem {
    return {
      id: row.id,
      guildId: row.guild_id,
      itemKey: row.item_key,
      displayName: row.display_name,
      description: row.description,
      price: row.price,
      itemType: row.item_type,
      roleId: row.role_id,
      roleRequirementId: row.role_requirement_id,
      sortIndex: row.sort_index,
      stock: row.stock,
      maxPerUser: row.max_per_user,
      metadataJson: row.metadata_json,
      isActive: row.is_active === 1,
      createdBy: row.created_by,
      legacyShopEntryId: row.legacy_shop_entry_id,
      legacyType: row.legacy_type,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapInventoryRow(row: ShopInventoryRow): ShopInventoryEntry {
    return {
      id: row.id,
      userId: row.user_id,
      guildId: row.guild_id,
      shopItemId: row.shop_item_id,
      itemKey: row.item_key,
      itemType: row.item_type,
      quantity: row.quantity,
      isUsing: row.is_using === 1,
      legacyOwnedItemId: row.legacy_owned_item_id,
      acquiredAt: row.acquired_at,
      updatedAt: row.updated_at
    };
  }
}
