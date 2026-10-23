import { Database } from '../../infra/db/database.js';
import { IdentityRepository } from '../../infra/db/repositories/identityRepository.js';
import { UserProfileInput } from '../../infra/db/types.js';
import { EconomyRepository } from '../economy/repository.js';
import { LedgerService } from '../ledger/service.js';
import { normalizeCommandName } from '../policy/normalization.js';
import {
  PurchaseShopItemInput,
  PurchaseShopItemResult,
  RefundShopItemResult,
  ShopInventoryEntry,
  ShopItem
} from './types.js';
import { ShopRepository } from './repository.js';

const SHOP_KEY_CORRECTIONS: Record<string, string> = {
  ayyubud: 'ayyubid'
};

function normalizeItemKey(raw: string): string {
  const value = raw.trim().toLowerCase();
  const normalized = value
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');

  if (normalized.length === 0) {
    return 'item';
  }

  return SHOP_KEY_CORRECTIONS[normalized] ?? normalized;
}

export class ShopService {
  constructor(
    private readonly db: Database,
    private readonly shopRepo: ShopRepository,
    private readonly identityRepo: IdentityRepository,
    private readonly economyRepo: EconomyRepository,
    private readonly ledgerService: LedgerService
  ) {}

  normalizeKey(raw: string): string {
    return normalizeItemKey(normalizeCommandName(raw));
  }

  listItems(guildId: string, includeInactive = false): ShopItem[] {
    return this.shopRepo.listItemsByGuild(guildId, includeInactive);
  }

  listInventory(profile: UserProfileInput, guildId?: string): ShopInventoryEntry[] {
    const user = this.identityRepo.ensureUser(profile);
    return this.shopRepo.listInventoryByUser(user.id, guildId);
  }

  addRoleItem(input: {
    guildId: string;
    roleId: string;
    displayName: string;
    price: number;
    itemKey?: string;
    roleRequirementId?: string | null;
    description?: string | null;
    createdBy?: string;
  }): { ok: boolean; reason?: string; item?: ShopItem } {
    if (input.price < 0) {
      return { ok: false, reason: 'Price must be zero or greater.' };
    }

    const key = this.normalizeKey(input.itemKey ?? input.displayName ?? input.roleId);
    if (this.shopRepo.getItemByGuildAndKey(input.guildId, key)) {
      return { ok: false, reason: `Item key "${key}" already exists in this guild.` };
    }

    const nextSortIndex = this.nextSortIndex(input.guildId);
    const item = this.shopRepo.createItem({
      guildId: input.guildId,
      itemKey: key,
      displayName: input.displayName,
      description: input.description ?? null,
      price: input.price,
      itemType: 'role',
      roleId: input.roleId,
      roleRequirementId: input.roleRequirementId ?? null,
      sortIndex: nextSortIndex,
      createdBy: input.createdBy ?? null
    });

    return { ok: true, item };
  }

  addTextItem(input: {
    guildId: string;
    itemKey: string;
    displayName: string;
    price: number;
    description?: string | null;
    payloadTexts?: string[];
    createdBy?: string;
  }): { ok: boolean; reason?: string; item?: ShopItem } {
    if (input.price < 0) {
      return { ok: false, reason: 'Price must be zero or greater.' };
    }

    const key = this.normalizeKey(input.itemKey);
    if (this.shopRepo.getItemByGuildAndKey(input.guildId, key)) {
      return { ok: false, reason: `Item key "${key}" already exists in this guild.` };
    }

    const item = this.shopRepo.createItem({
      guildId: input.guildId,
      itemKey: key,
      displayName: input.displayName,
      description: input.description ?? null,
      price: input.price,
      itemType: 'item',
      sortIndex: this.nextSortIndex(input.guildId),
      createdBy: input.createdBy ?? null
    });

    if (Array.isArray(input.payloadTexts) && input.payloadTexts.length > 0) {
      for (let index = 0; index < input.payloadTexts.length; index += 1) {
        const textValue = input.payloadTexts[index]?.trim();
        if (!textValue) {
          continue;
        }
        this.shopRepo.createItemText(item.id, textValue, index);
      }
    }

    return { ok: true, item };
  }

  setPrice(guildId: string, itemKey: string, newPrice: number): { ok: boolean; reason?: string } {
    if (newPrice < 0) {
      return { ok: false, reason: 'Price must be zero or greater.' };
    }

    const updated = this.shopRepo.setItemPrice(guildId, this.normalizeKey(itemKey), newPrice);
    return updated ? { ok: true } : { ok: false, reason: 'Shop item not found.' };
  }

  removeItem(guildId: string, itemKey: string): { ok: boolean; reason?: string } {
    const updated = this.shopRepo.setItemActive(guildId, this.normalizeKey(itemKey), false);
    return updated ? { ok: true } : { ok: false, reason: 'Shop item not found.' };
  }

  purchase(profile: UserProfileInput, input: PurchaseShopItemInput): PurchaseShopItemResult {
    const user = this.identityRepo.ensureUser(profile);
    const resolved = this.resolveShopItem(input.guildId, input.itemQuery);
    if (!resolved) {
      return { ok: false, reason: 'Shop item not found.' };
    }

    const item = resolved;
    if (!item.isActive) {
      return { ok: false, reason: 'That shop item is not currently active.' };
    }

    if (item.roleRequirementId && !input.memberRoleIds.includes(item.roleRequirementId)) {
      return { ok: false, reason: `You need role <@&${item.roleRequirementId}> to buy this item.` };
    }

    if (item.itemType === 'role' && item.roleId && input.memberRoleIds.includes(item.roleId)) {
      return { ok: false, reason: 'You already have this role.' };
    }

    const existingInventory = this.shopRepo.getInventoryEntry(user.id, input.guildId, item.itemKey);
    if (item.maxPerUser !== null && existingInventory && existingInventory.quantity >= item.maxPerUser) {
      return { ok: false, reason: 'You already own the maximum allowed quantity for this item.' };
    }

    const previousBalance = this.economyRepo.getWalletBalance(user.id);
    if (previousBalance < item.price) {
      return { ok: false, reason: 'Insufficient wallet balance.' };
    }

    let inventory!: ShopInventoryEntry;

    this.db.transaction(() => {
      const success = this.economyRepo.subtractWalletBalance(user.id, item.price);
      if (!success) {
        throw new Error('INSUFFICIENT_FUNDS');
      }

      inventory = this.shopRepo.upsertInventory({
        userId: user.id,
        guildId: input.guildId,
        shopItemId: item.id,
        itemKey: item.itemKey,
        itemType: item.itemType,
        quantityDelta: 1,
        isUsing: item.itemType === 'role',
        acquiredAt: new Date().toISOString()
      });

      this.ledgerService.createTransaction({
        userId: user.id,
        amount: -item.price,
        kind: 'shop_purchase',
        subtype: item.itemType,
        note: `shop:${item.itemKey}`,
        otherUserId: null
      });
    });

    return {
      ok: true,
      item,
      inventory,
      previousBalance,
      newBalance: previousBalance - item.price
    };
  }

  refund(
    profile: UserProfileInput,
    guildId: string,
    itemQuery: string,
    memberRoleIds: readonly string[]
  ): RefundShopItemResult {
    const user = this.identityRepo.ensureUser(profile);
    const item = this.resolveShopItem(guildId, itemQuery);
    if (!item) {
      return { ok: false, reason: 'Shop item not found.' };
    }

    if (item.itemType !== 'role') {
      return { ok: false, reason: 'Only role items can be refunded.' };
    }

    const existingInventory = this.shopRepo.getInventoryEntry(user.id, guildId, item.itemKey);
    const hasInventoryRecord = existingInventory && existingInventory.quantity > 0;
    const hasDiscordRole = item.roleId != null && memberRoleIds.includes(item.roleId);

    if (!hasInventoryRecord && !hasDiscordRole) {
      return { ok: false, reason: 'You do not own this item.' };
    }

    if (item.roleId && !hasDiscordRole) {
      return { ok: false, reason: 'You no longer have this role. Contact an admin for assistance.' };
    }

    const previousBalance = this.economyRepo.getWalletBalance(user.id);

    this.db.transaction(() => {
      if (hasInventoryRecord) {
        this.shopRepo.upsertInventory({
          userId: user.id,
          guildId,
          shopItemId: item.id,
          itemKey: item.itemKey,
          itemType: item.itemType,
          quantityDelta: -1,
          isUsing: false
        });
      }

      this.economyRepo.addWalletBalance(user.id, item.price);
      this.ledgerService.createTransaction({
        userId: user.id,
        amount: item.price,
        kind: 'shop_refund',
        subtype: item.itemType,
        note: `shop_refund:${item.itemKey}:${hasInventoryRecord ? 'user_refund' : 'legacy_refund'}`
      });
    });

    return {
      ok: true,
      item,
      refundedAmount: item.price,
      newBalance: previousBalance + item.price
    };
  }

  refundFailedRolePurchase(
    profile: UserProfileInput,
    guildId: string,
    itemKey: string,
    reason: string
  ): { ok: boolean; refundedAmount?: number } {
    const user = this.identityRepo.ensureUser(profile);
    const item = this.shopRepo.getItemByGuildAndKey(guildId, this.normalizeKey(itemKey));
    if (!item) {
      return { ok: false };
    }

    const existingInventory = this.shopRepo.getInventoryEntry(user.id, guildId, item.itemKey);
    if (!existingInventory || existingInventory.quantity <= 0) {
      return { ok: false };
    }

    this.db.transaction(() => {
      this.shopRepo.upsertInventory({
        userId: user.id,
        guildId,
        shopItemId: item.id,
        itemKey: item.itemKey,
        itemType: item.itemType,
        quantityDelta: -1,
        isUsing: false
      });

      this.economyRepo.addWalletBalance(user.id, item.price);
      this.ledgerService.createTransaction({
        userId: user.id,
        amount: item.price,
        kind: 'shop_refund',
        subtype: item.itemType,
        note: `shop_refund:${item.itemKey}:${reason}`
      });
    });

    return { ok: true, refundedAmount: item.price };
  }

  lookupItem(guildId: string, itemQuery: string): ShopItem | undefined {
    return this.resolveShopItem(guildId, itemQuery);
  }

  private resolveShopItem(guildId: string, itemQuery: string): ShopItem | undefined {
    const trimmed = itemQuery.trim();
    if (!trimmed) {
      return undefined;
    }

    const maybeIndex = Number(trimmed);
    if (Number.isInteger(maybeIndex) && maybeIndex >= 0) {
      return this.shopRepo.getItemByGuildAndSortIndex(guildId, maybeIndex);
    }

    return this.shopRepo.getItemByGuildAndKey(guildId, this.normalizeKey(trimmed));
  }

  private nextSortIndex(guildId: string): number {
    const items = this.shopRepo.listItemsByGuild(guildId, true);
    if (items.length === 0) {
      return 0;
    }

    return items[items.length - 1]!.sortIndex + 1;
  }
}
