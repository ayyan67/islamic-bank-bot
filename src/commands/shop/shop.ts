import {
  ActionRow,
  Command,
  Declare,
  Group,
  Groups,
  Middlewares,
  Options,
  StringSelectMenu,
  StringSelectOption,
  SubCommand,
  createIntegerOption,
  createRoleOption,
  createStringOption
} from 'seyfert';
import type { AutocompleteInteraction } from 'seyfert';
import type { AppContainer } from '../../app/container.js';
import { env } from '../../config/env.js';
import {
  ADMIN_DEFAULT_MEMBER_PERMISSIONS,
  CONTEXTS_GUILD,
  INTEGRATION_TYPES_GLOBAL
} from '../../infra/discord/commandPolicy.js';
import { formatCurrency } from '../../infra/discord/formatting.js';
import {
  attachPaginationCollector,
  buildPaginationComponents,
  resolveRequestedPage
} from '../../infra/discord/pagination.js';
import {
  buildConfirmationComponents,
  attachConfirmationCollector
} from '../../infra/discord/confirmation.js';
import { profileFromContext } from '../../infra/discord/profile.js';
import { buildReplyPayload, reply, replyEphemeral, replyFields } from '../shared.js';

const SHOP_LIST_PAGE_SIZE = 8;
const SHOP_INVENTORY_PAGE_SIZE = 12;
const SHOP_ADMIN_LIST_PAGE_SIZE = 12;

function parseRoleId(input: unknown): string | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const role = input as Record<string, unknown>;
  if (typeof role.id === 'string') {
    return role.id;
  }

  const nestedRole = role.role;
  if (nestedRole && typeof nestedRole === 'object' && typeof (nestedRole as Record<string, unknown>).id === 'string') {
    return (nestedRole as Record<string, unknown>).id as string;
  }

  return null;
}

function getMemberRoleIds(ctx: any): string[] {
  const memberRoles = ctx.member?.roles;
  if (!memberRoles) {
    return [];
  }

  if (Array.isArray(memberRoles)) {
    return memberRoles.filter((roleId: unknown): roleId is string => typeof roleId === 'string');
  }

  if (Array.isArray(memberRoles.keys)) {
    return memberRoles.keys.filter((roleId: unknown): roleId is string => typeof roleId === 'string');
  }

  return [];
}

interface PaginationSlice<T> {
  entries: T[];
  page: number;
  totalPages: number;
  totalItems: number;
  from: number;
  to: number;
}

function paginateEntries<T>(entries: T[], requestedPage: number, pageSize: number): PaginationSlice<T> {
  const totalItems = entries.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const start = (page - 1) * pageSize;
  const slice = entries.slice(start, start + pageSize);

  const from = totalItems === 0 ? 0 : start + 1;
  const to = totalItems === 0 ? 0 : start + slice.length;

  return {
    entries: slice,
    page,
    totalPages,
    totalItems,
    from,
    to
  };
}

function buildPaginationFooter(commandPath: string, pageInfo: PaginationSlice<unknown>): string {
  const lines = [`Page ${pageInfo.page}/${pageInfo.totalPages} • Items ${pageInfo.from}-${pageInfo.to} of ${pageInfo.totalItems}`];
  if (pageInfo.totalPages <= 1) {
    return lines.join('\n');
  }

  const slashNavigation: string[] = [];
  if (pageInfo.page > 1) {
    slashNavigation.push(`Prev: /${commandPath} page:${pageInfo.page - 1}`);
  }
  if (pageInfo.page < pageInfo.totalPages) {
    slashNavigation.push(`Next: /${commandPath} page:${pageInfo.page + 1}`);
  }
  if (slashNavigation.length > 0) {
    lines.push(slashNavigation.join(' • '));
  }

  if (env.ENABLE_PREFIX_ALIASES) {
    const prefixNavigation: string[] = [];
    if (pageInfo.page > 1) {
      prefixNavigation.push(`Prev: ${env.DEFAULT_PREFIX}${commandPath} ${pageInfo.page - 1}`);
    }
    if (pageInfo.page < pageInfo.totalPages) {
      prefixNavigation.push(`Next: ${env.DEFAULT_PREFIX}${commandPath} ${pageInfo.page + 1}`);
    }
    if (prefixNavigation.length > 0) {
      lines.push(prefixNavigation.join(' • '));
    }
  }

  return lines.join('\n');
}

const SHOP_SELECT_ID = 'shop_quick_buy';

function buildShopSelectMenu(entries: any[]): ActionRow<StringSelectMenu>[] {
  if (entries.length === 0) return [];

  const options = entries.map((item: any) => {
    const desc = `${formatCurrency(item.price)} • ${item.itemType === 'role' ? 'Role' : 'Item'}`;
    return new StringSelectOption()
      .setLabel(item.displayName.slice(0, 100))
      .setValue(item.itemKey)
      .setDescription(desc.slice(0, 100));
  });

  return [
    new ActionRow<StringSelectMenu>().addComponents(
      new StringSelectMenu()
        .setCustomId(SHOP_SELECT_ID)
        .setPlaceholder('Quick Buy — select an item')
        .setOptions(options)
    )
  ];
}

function toShopListFields(entries: any[]): Array<{ name: string; value: string; inline: boolean }> {
  return entries.map((item: any) => {
    const type =
      item.itemType === 'role' && item.roleId ? `Role <@&${item.roleId}>` : item.itemType === 'role' ? 'Role' : 'Item';
    const req = item.roleRequirementId ? ` • Requires <@&${item.roleRequirementId}>` : '';
    return {
      name: `#${item.sortIndex} • ${item.displayName}`,
      value: `\`${item.itemKey}\` • ${formatCurrency(item.price)} • ${type}${req}`,
      inline: false
    };
  });
}

function toInventoryFields(entries: any[]): Array<{ name: string; value: string; inline: boolean }> {
  return entries.map((entry: any) => {
    const use = entry.isUsing ? ' • Equipped' : '';
    return {
      name: entry.itemKey,
      value: `Qty: **${entry.quantity}** • ${entry.itemType}${use}`,
      inline: true
    };
  });
}

function toShopAdminFields(entries: any[]): Array<{ name: string; value: string; inline: boolean }> {
  return entries.map((item: any) => {
    const state = item.isActive ? 'active' : 'inactive';
    return {
      name: `${item.displayName} (${state})`,
      value: `\`${item.itemKey}\` • ${formatCurrency(item.price)} • ${item.itemType}`,
      inline: true
    };
  });
}

@Declare({
  name: 'list',
  description: 'List available shop items',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  page: createIntegerOption({
    description: 'Page number',
    required: false,
    min_value: 1
  })
})
class ShopListSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'Shop is only available in a server.');
      return;
    }

    const items = ctx.app.shopService.listItems(ctx.guildId, false);
    if (items.length === 0) {
      await reply(ctx, 'No shop items configured in this server yet.');
      return;
    }

    const requestedPage = resolveRequestedPage(ctx, ctx.options.page);
    let pageInfo = paginateEntries(items, requestedPage, SHOP_LIST_PAGE_SIZE);
    const renderPayload = (slice: PaginationSlice<any>) => {
      const components: any[] = [
        ...buildShopSelectMenu(slice.entries),
        ...(slice.totalPages > 1
          ? buildPaginationComponents(slice.page > 1, slice.page < slice.totalPages)
          : [])
      ];
      return buildReplyPayload({
        fullCommandName: 'shop list',
        requesterName: ctx.author.username ?? 'user',
        content: '',
        options: {
          title: 'Shop Catalog',
          fields: toShopListFields(slice.entries),
          footer: buildPaginationFooter('shop list', slice),
          compact: true,
          components: components.length > 0 ? components : undefined
        }
      });
    };

    const hasInteractive = items.length > 0;
    const response = await ctx.editOrReply(renderPayload(pageInfo), hasInteractive ? true : undefined);
    if (!hasInteractive || !response) {
      return;
    }

    const messageId = response?.id;
    const channelId = response?.channelId ?? response?.channel_id ?? ctx.channelId;

    if (!messageId) return;

    let currentPage = pageInfo.page;
    const collector = ctx.client.components.createComponentCollector(
      messageId,
      channelId,
      ctx.guildId,
      {
        timeout: 10 * 60 * 1000,
        idle: 10 * 60 * 1000,
        filter: (interaction: any) => interaction.user?.id === ctx.author.id,
        onPass: async (interaction: any) => {
          await interaction.write({
            content: 'Only the user who ran this command can use these controls.',
            flags: 64
          });
        }
      }
    );

    // Pagination buttons
    collector.run('pagination_prev', async (interaction: any, _stop: any, refresh: () => void) => {
      if (currentPage <= 1) {
        await interaction.deferUpdate();
        return;
      }
      pageInfo = paginateEntries(items, currentPage - 1, SHOP_LIST_PAGE_SIZE);
      currentPage = pageInfo.page;
      await interaction.update(renderPayload(pageInfo));
      refresh();
    });

    collector.run('pagination_next', async (interaction: any, _stop: any, refresh: () => void) => {
      pageInfo = paginateEntries(items, currentPage + 1, SHOP_LIST_PAGE_SIZE);
      currentPage = pageInfo.page;
      await interaction.update(renderPayload(pageInfo));
      refresh();
    });

    // Select menu — trigger buy confirmation for selected item
    collector.run(SHOP_SELECT_ID, async (interaction: any, _stop: any, refresh: () => void) => {
      const selectedKey = interaction.values?.[0];
      if (!selectedKey) {
        await interaction.deferUpdate();
        return;
      }

      const item = ctx.app.shopService.lookupItem(ctx.guildId, selectedKey);
      if (!item || !item.isActive) {
        await interaction.write({
          content: 'That item is no longer available.',
          flags: 64
        });
        refresh();
        return;
      }

      // Show ephemeral confirmation for the selected item
      await interaction.write({
        ...buildReplyPayload({
          fullCommandName: 'shop buy',
          requesterName: ctx.author.username ?? 'user',
          content: `Purchase **${item.displayName}** for **${formatCurrency(item.price)}**?\nUse \`/shop buy item:${item.itemKey}\` to confirm.`,
          options: {
            title: 'Item Selected',
            tone: 'info',
            fields: [
              { name: 'Item', value: item.displayName, inline: true },
              { name: 'Price', value: formatCurrency(item.price), inline: true },
              { name: 'Type', value: item.itemType === 'role' ? 'Role' : 'Item', inline: true }
            ],
            compact: true
          }
        }),
        flags: 64
      });
      refresh();
    });
  }
}

@Declare({
  name: 'buy',
  description: 'Buy a shop item by key or index',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  item: createStringOption({
    description: 'Item to buy',
    required: true,
    autocomplete(interaction: AutocompleteInteraction) {
      const app: AppContainer = (interaction.client as any).__app;
      const guildId = (interaction as any).guildId;
      if (!app || !guildId) return interaction.respond([]);
      const focused = String((interaction as any).getInput?.() ?? '').toLowerCase();
      const choices = app.shopService
        .listItems(guildId, false)
        .filter(
          (i: any) =>
            i.itemKey.toLowerCase().includes(focused) || i.displayName.toLowerCase().includes(focused)
        )
        .slice(0, 25)
        .map((i: any) => ({ name: `${i.displayName} — ${formatCurrency(i.price)}`, value: i.itemKey }));
      return interaction.respond(choices);
    }
  })
})
class ShopBuySubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await replyEphemeral(ctx, 'Shop is only available in a server.');
      return;
    }

    const profile = profileFromContext(ctx);
    const memberRoleIds = getMemberRoleIds(ctx);
    const itemQuery = String(ctx.options.item ?? '');

    // Look up the item first to show confirmation
    const item = ctx.app.shopService.lookupItem(ctx.guildId, itemQuery);
    if (!item || !item.isActive) {
      await replyEphemeral(ctx, 'Shop item not found.');
      return;
    }

    // Show confirmation prompt with item details
    const confirmPayload = buildReplyPayload({
      fullCommandName: 'shop buy',
      requesterName: ctx.author.username ?? 'user',
      content: `Purchase **${item.displayName}** for **${formatCurrency(item.price)}**?`,
      options: {
        title: 'Confirm Purchase',
        tone: 'warning',
        fields: [
          { name: 'Item', value: item.displayName, inline: true },
          { name: 'Price', value: formatCurrency(item.price), inline: true },
          { name: 'Type', value: item.itemType === 'role' ? 'Role' : 'Item', inline: true }
        ],
        compact: true,
        components: buildConfirmationComponents()
      }
    });

    const response = await ctx.editOrReply(confirmPayload, true);
    if (!response) return;

    attachConfirmationCollector({
      ctx,
      responseMessage: response,
      ownerUserId: ctx.author.id,
      onConfirm: async (interaction) => {
        await this.executePurchase(ctx, profile, memberRoleIds, itemQuery, interaction);
      }
    });
  }

  private async executePurchase(
    ctx: any,
    profile: any,
    memberRoleIds: string[],
    itemQuery: string,
    interaction: any
  ): Promise<void> {
    const result = ctx.app.shopService.purchase(profile, {
      guildId: ctx.guildId,
      itemQuery,
      memberRoleIds
    });

    if (!result.ok || !result.item) {
      await interaction.update({
        ...buildReplyPayload({
          fullCommandName: 'shop buy',
          requesterName: ctx.author.username ?? 'user',
          content: result.reason ?? 'Unable to complete purchase.',
          options: { tone: 'error', compact: true }
        }),
        components: []
      });
      return;
    }

    if (result.item.itemType === 'role' && result.item.roleId) {
      try {
        await ctx.client.members.addRole(ctx.guildId, ctx.author.id, result.item.roleId);
      } catch {
        const refunded = ctx.app.shopService.refundFailedRolePurchase(
          profile,
          ctx.guildId,
          result.item.itemKey,
          'role_assign_failed'
        );

        await interaction.update({
          ...buildReplyPayload({
            fullCommandName: 'shop buy',
            requesterName: ctx.author.username ?? 'user',
            content: refunded.ok
              ? `Purchase failed to assign role <@&${result.item.roleId}> due to Discord permissions. Refunded ${formatCurrency(refunded.refundedAmount ?? result.item.price)}.`
              : 'Purchase failed to assign role and automatic refund failed. Please contact an admin.',
            options: { tone: 'error', compact: true }
          }),
          components: []
        });
        return;
      }
    }

    await interaction.update({
      ...buildReplyPayload({
        fullCommandName: 'shop buy',
        requesterName: ctx.author.username ?? 'user',
        content: '',
        options: {
          title: 'Purchase Complete',
          tone: 'success',
          fields: [
            { name: 'Item', value: result.item.displayName, inline: true },
            { name: 'Price', value: formatCurrency(result.item.price), inline: true },
            ...(typeof result.newBalance === 'number'
              ? [{ name: 'New Balance', value: formatCurrency(result.newBalance), inline: true }]
              : [])
          ],
          compact: true
        }
      }),
      components: []
    });
  }
}

@Declare({
  name: 'refund',
  description: 'Refund a purchased role item and get your coins back',
  aliases: ['return', 'sellback'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  item: createStringOption({
    description: 'Owned item to refund',
    required: true,
    autocomplete(interaction: AutocompleteInteraction) {
      const app: AppContainer = (interaction.client as any).__app;
      const guildId = (interaction as any).guildId;
      const user = (interaction as any).user;
      if (!app || !guildId || !user?.id) return interaction.respond([]);
      const focused = String((interaction as any).getInput?.() ?? '').toLowerCase();
      const choices = app.shopService
        .listInventory({ discordUserId: String(user.id), username: user.username ?? null }, guildId)
        .filter((entry: any) => entry.itemKey.toLowerCase().includes(focused))
        .slice(0, 25)
        .map((entry: any) => ({ name: entry.itemKey, value: entry.itemKey }));
      return interaction.respond(choices);
    }
  })
})
class ShopRefundSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await replyEphemeral(ctx, 'Shop is only available in a server.');
      return;
    }

    const profile = profileFromContext(ctx);
    const memberRoleIds = getMemberRoleIds(ctx);
    const itemQuery = String(ctx.options.item ?? '');

    const item = ctx.app.shopService.lookupItem(ctx.guildId, itemQuery);
    if (!item) {
      await replyEphemeral(ctx, 'Shop item not found.');
      return;
    }

    if (item.itemType !== 'role') {
      await replyEphemeral(ctx, 'Only role items can be refunded.');
      return;
    }

    const confirmPayload = buildReplyPayload({
      fullCommandName: 'shop refund',
      requesterName: ctx.author.username ?? 'user',
      content: `Refund **${item.displayName}** and receive **${formatCurrency(item.price)}** back?\nThe role will be removed from you.`,
      options: {
        title: 'Confirm Refund',
        tone: 'warning',
        fields: [
          { name: 'Item', value: item.displayName, inline: true },
          { name: 'Refund Amount', value: formatCurrency(item.price), inline: true },
          { name: 'Type', value: 'Role', inline: true }
        ],
        compact: true,
        components: buildConfirmationComponents()
      }
    });

    const response = await ctx.editOrReply(confirmPayload, true);
    if (!response) return;

    attachConfirmationCollector({
      ctx,
      responseMessage: response,
      ownerUserId: ctx.author.id,
      onConfirm: async (interaction) => {
        await this.executeRefund(ctx, profile, memberRoleIds, itemQuery, interaction);
      }
    });
  }

  private async executeRefund(
    ctx: any,
    profile: any,
    memberRoleIds: string[],
    itemQuery: string,
    interaction: any
  ): Promise<void> {
    const result = ctx.app.shopService.refund(profile, ctx.guildId, itemQuery, memberRoleIds);

    if (!result.ok || !result.item) {
      await interaction.update({
        ...buildReplyPayload({
          fullCommandName: 'shop refund',
          requesterName: ctx.author.username ?? 'user',
          content: result.reason ?? 'Unable to complete refund.',
          options: { tone: 'error', compact: true }
        }),
        components: []
      });
      return;
    }

    if (result.item.roleId) {
      try {
        await ctx.client.members.removeRole(ctx.guildId, ctx.author.id, result.item.roleId);
      } catch {
        // Role removal failed but refund already processed — inform user
      }
    }

    await interaction.update({
      ...buildReplyPayload({
        fullCommandName: 'shop refund',
        requesterName: ctx.author.username ?? 'user',
        content: '',
        options: {
          title: 'Refund Complete',
          tone: 'success',
          fields: [
            { name: 'Item', value: result.item.displayName, inline: true },
            { name: 'Refunded', value: formatCurrency(result.refundedAmount ?? result.item.price), inline: true },
            ...(typeof result.newBalance === 'number'
              ? [{ name: 'New Balance', value: formatCurrency(result.newBalance), inline: true }]
              : [])
          ],
          compact: true
        }
      }),
      components: []
    });
  }
}

@Declare({
  name: 'inventory',
  description: 'Show your owned shop items',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  page: createIntegerOption({
    description: 'Page number',
    required: false,
    min_value: 1
  })
})
class ShopInventorySubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await replyEphemeral(ctx, 'Shop inventory is only available in a server.');
      return;
    }

    const entries = ctx.app.shopService.listInventory(profileFromContext(ctx), ctx.guildId);
    if (entries.length === 0) {
      await replyEphemeral(ctx, 'You do not own any shop items yet.');
      return;
    }

    const ownedEntries = entries.filter((entry: any) => entry.quantity > 0);
    if (ownedEntries.length === 0) {
      await replyEphemeral(ctx, 'You do not own any shop items yet.');
      return;
    }

    const requestedPage = resolveRequestedPage(ctx, ctx.options.page);
    let pageInfo = paginateEntries(ownedEntries, requestedPage, SHOP_INVENTORY_PAGE_SIZE);
    const renderPayload = (slice: PaginationSlice<any>) =>
      buildReplyPayload({
        fullCommandName: 'shop inventory',
        requesterName: ctx.author.username ?? 'user',
        content: '',
        options: {
          title: 'Your Inventory',
          fields: toInventoryFields(slice.entries),
          footer: buildPaginationFooter('shop inventory', slice),
          compact: true,
          components:
            slice.totalPages > 1
              ? buildPaginationComponents(slice.page > 1, slice.page < slice.totalPages)
              : undefined
        }
      });

    const response = await ctx.editOrReply(renderPayload(pageInfo), pageInfo.totalPages > 1 ? true : undefined);
    if (pageInfo.totalPages <= 1 || !response) {
      return;
    }

    let currentPage = pageInfo.page;
    attachPaginationCollector({
      ctx,
      responseMessage: response,
      ownerUserId: ctx.author.id,
      getCurrentPage: () => currentPage,
      onPageRequested: async (requestedPageNumber, interaction) => {
        if (requestedPageNumber < 1 || requestedPageNumber > pageInfo.totalPages) {
          await interaction.deferUpdate();
          return;
        }

        pageInfo = paginateEntries(ownedEntries, requestedPageNumber, SHOP_INVENTORY_PAGE_SIZE);
        currentPage = pageInfo.page;
        await interaction.update(renderPayload(pageInfo));
      }
    });
  }
}

@Declare({
  name: 'add-role',
  description: 'Add a role item to the shop',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
  defaultMemberPermissions: ADMIN_DEFAULT_MEMBER_PERMISSIONS
})
@Group('admin')
@Middlewares(['permissionPolicy'])
@Options({
  role: createRoleOption({
    description: 'Role to grant on purchase',
    required: true
  }),
  price: createIntegerOption({
    description: 'Item price',
    required: true,
    min_value: 0
  }),
  key: createStringOption({
    description: 'Optional custom key',
    required: false,
    max_length: 60
  }),
  name: createStringOption({
    description: 'Optional display name',
    required: false,
    max_length: 80
  }),
  required_role: createRoleOption({
    description: 'Optional required role to buy this item',
    required: false
  }),
  description: createStringOption({
    description: 'Optional item description',
    required: false,
    max_length: 200
  })
})
class ShopAdminAddRoleSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'Shop admin commands are guild-only.');
      return;
    }

    const roleId = parseRoleId(ctx.options.role);
    if (!roleId) {
      await reply(ctx, 'Unable to resolve role.');
      return;
    }

    const requiredRoleId = parseRoleId(ctx.options.required_role);
    const displayName = String(ctx.options.name ?? ctx.options.key ?? `role-${roleId}`);
    const result = ctx.app.shopService.addRoleItem({
      guildId: ctx.guildId,
      roleId,
      displayName,
      price: Number(ctx.options.price ?? 0),
      itemKey: ctx.options.key ? String(ctx.options.key) : undefined,
      roleRequirementId: requiredRoleId,
      description: ctx.options.description ? String(ctx.options.description) : undefined,
      createdBy: ctx.author.id
    });

    if (!result.ok || !result.item) {
      await reply(ctx, result.reason ?? 'Unable to add role item.');
      return;
    }

    await replyFields(ctx, {
      title: 'Shop Item Added',
      tone: 'success',
      fields: [
        { name: 'Key', value: `\`${result.item.itemKey}\``, inline: true },
        { name: 'Name', value: result.item.displayName, inline: true },
        { name: 'Price', value: formatCurrency(result.item.price), inline: true }
      ],
      compact: true
    });
  }
}

@Declare({
  name: 'add-item',
  description: 'Add a non-role item to the shop',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
  defaultMemberPermissions: ADMIN_DEFAULT_MEMBER_PERMISSIONS
})
@Group('admin')
@Middlewares(['permissionPolicy'])
@Options({
  key: createStringOption({
    description: 'Item key',
    required: true,
    max_length: 60
  }),
  name: createStringOption({
    description: 'Display name',
    required: true,
    max_length: 80
  }),
  price: createIntegerOption({
    description: 'Item price',
    required: true,
    min_value: 0
  }),
  description: createStringOption({
    description: 'Optional item description',
    required: false,
    max_length: 200
  })
})
class ShopAdminAddItemSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'Shop admin commands are guild-only.');
      return;
    }

    const result = ctx.app.shopService.addTextItem({
      guildId: ctx.guildId,
      itemKey: String(ctx.options.key ?? ''),
      displayName: String(ctx.options.name ?? ''),
      price: Number(ctx.options.price ?? 0),
      description: ctx.options.description ? String(ctx.options.description) : undefined,
      createdBy: ctx.author.id
    });

    if (!result.ok || !result.item) {
      await reply(ctx, result.reason ?? 'Unable to add item.');
      return;
    }

    await replyFields(ctx, {
      title: 'Shop Item Added',
      tone: 'success',
      fields: [
        { name: 'Key', value: `\`${result.item.itemKey}\``, inline: true },
        { name: 'Name', value: result.item.displayName, inline: true },
        { name: 'Price', value: formatCurrency(result.item.price), inline: true }
      ],
      compact: true
    });
  }
}

@Declare({
  name: 'set-price',
  description: 'Update shop item price',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
  defaultMemberPermissions: ADMIN_DEFAULT_MEMBER_PERMISSIONS
})
@Group('admin')
@Middlewares(['permissionPolicy'])
@Options({
  key: createStringOption({
    description: 'Item key',
    required: true
  }),
  price: createIntegerOption({
    description: 'New price',
    required: true,
    min_value: 0
  })
})
class ShopAdminSetPriceSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'Shop admin commands are guild-only.');
      return;
    }

    const result = ctx.app.shopService.setPrice(
      ctx.guildId,
      String(ctx.options.key ?? ''),
      Number(ctx.options.price ?? 0)
    );
    await reply(ctx, result.ok ? 'Price updated.' : result.reason ?? 'Unable to update price.');
  }
}

@Declare({
  name: 'remove',
  description: 'Deactivate a shop item',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
  defaultMemberPermissions: ADMIN_DEFAULT_MEMBER_PERMISSIONS
})
@Group('admin')
@Middlewares(['permissionPolicy'])
@Options({
  key: createStringOption({
    description: 'Item key',
    required: true
  })
})
class ShopAdminRemoveSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'Shop admin commands are guild-only.');
      return;
    }

    const result = ctx.app.shopService.removeItem(ctx.guildId, String(ctx.options.key ?? ''));
    await reply(ctx, result.ok ? 'Shop item deactivated.' : result.reason ?? 'Unable to remove item.');
  }
}

@Declare({
  name: 'list',
  description: 'List all shop items including inactive ones',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
  defaultMemberPermissions: ADMIN_DEFAULT_MEMBER_PERMISSIONS
})
@Group('admin')
@Middlewares(['permissionPolicy'])
@Options({
  page: createIntegerOption({
    description: 'Page number',
    required: false,
    min_value: 1
  })
})
class ShopAdminListSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'Shop admin commands are guild-only.');
      return;
    }

    const items = ctx.app.shopService.listItems(ctx.guildId, true);
    if (items.length === 0) {
      await reply(ctx, 'No shop items configured.');
      return;
    }

    const requestedPage = resolveRequestedPage(ctx, ctx.options.page);
    let pageInfo = paginateEntries(items, requestedPage, SHOP_ADMIN_LIST_PAGE_SIZE);
    const renderPayload = (slice: PaginationSlice<any>) =>
      buildReplyPayload({
        fullCommandName: 'shop admin list',
        requesterName: ctx.author.username ?? 'user',
        content: '',
        options: {
          title: 'Shop Admin View',
          fields: toShopAdminFields(slice.entries),
          footer: buildPaginationFooter('shop admin list', slice),
          compact: true,
          components:
            slice.totalPages > 1
              ? buildPaginationComponents(slice.page > 1, slice.page < slice.totalPages)
              : undefined
        }
      });

    const response = await ctx.editOrReply(renderPayload(pageInfo), pageInfo.totalPages > 1 ? true : undefined);
    if (pageInfo.totalPages <= 1 || !response) {
      return;
    }

    let currentPage = pageInfo.page;
    attachPaginationCollector({
      ctx,
      responseMessage: response,
      ownerUserId: ctx.author.id,
      getCurrentPage: () => currentPage,
      onPageRequested: async (requestedPageNumber, interaction) => {
        if (requestedPageNumber < 1 || requestedPageNumber > pageInfo.totalPages) {
          await interaction.deferUpdate();
          return;
        }

        pageInfo = paginateEntries(items, requestedPageNumber, SHOP_ADMIN_LIST_PAGE_SIZE);
        currentPage = pageInfo.page;
        await interaction.update(renderPayload(pageInfo));
      }
    });
  }
}

@Declare({
  name: 'shop',
  description: 'Guild economy shop',
  aliases: ['s', 'store'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Groups({
  admin: { defaultDescription: 'Shop admin commands' }
})
@Options([
  ShopListSubCommand,
  ShopBuySubCommand,
  ShopRefundSubCommand,
  ShopInventorySubCommand,
  ShopAdminAddRoleSubCommand,
  ShopAdminAddItemSubCommand,
  ShopAdminSetPriceSubCommand,
  ShopAdminRemoveSubCommand,
  ShopAdminListSubCommand
])
export default class ShopCommand extends Command {}
