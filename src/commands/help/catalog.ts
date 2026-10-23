export interface HelpSection {
  name: string;
  lines: string[];
}

export interface HelpTopic {
  id: string;
  title: string;
  summary: string;
  usage: string[];
  examples: string[];
  permissions: string;
  notes?: string;
  aliases?: string[];
}

export const HELP_SECTIONS: HelpSection[] = [
  {
    name: 'Utility',
    lines: ['`/help` - command directory', '`/help topic:<command>` - detailed usage']
  },
  {
    name: 'Economy',
    lines: [
      '`/balance` - show wallet balance',
      '`/transfer` - send currency to another user',
      '`/leaderboard wealth` - richest users',
      '`/leaderboard streaks` - top claim streaks (`.streaks`)'
    ]
  },
  {
    name: 'Vault',
    lines: [
      '`/vault deposit` - move wallet to vault',
      '`/vault withdraw` - move vault to wallet',
      '`/vault balance` - show vault balance'
    ]
  },
  {
    name: 'Shop',
    lines: [
      '`/shop list` - browse items',
      '`/shop buy` - purchase by key/index',
      '`/shop refund` - refund a role item',
      '`/shop inventory` - show owned items',
      '`/shop admin ...` - manage catalog (admins)'
    ]
  },
  {
    name: 'Worship',
    lines: [
      '`/claim timely` - periodic claim',
      '`/claim eid` - one-time Eid al-Adha bonus (limited event)',
      '`/prayer checkin` - check in prayer reward',
      '`/prayer status` - today prayer status',
      '`/community tag-reward` - guild tag reward'
    ]
  },
  {
    name: 'Clubs',
    lines: [
      '`/club create|info|apply|leave`',
      '`/club accept|reject|kick|ban|unban`',
      '`/club admin|transfer|description|icon|disband`',
      '`/club leaderboard`'
    ]
  },
  {
    name: 'Drops',
    lines: [
      '`/drop` - drop currency in chat for others to pick up',
      '`/pick` - pick up dropped currency (or type `.pick`)'
    ]
  },
  {
    name: 'Daily Challenges',
    lines: [
      '`/dailychallenge view` - see today\'s recitation challenge',
      '`/dailychallenge admin set-channel` - set challenge channel (admin)',
      '`/dailychallenge admin disable` - disable challenges (admin)',
      '`/dailychallenge admin ban|unban|bans` - manage challenge bans (admin)',
      'Send a **voice note** in the challenge channel to complete it'
    ]
  },
  {
    name: 'Tasks',
    lines: [
      '`/bounty list` - browse open bounties',
      '`/bounty post` - post a bounty (amount escrowed)',
      '`/bounty take` - take an open bounty, first come first served',
      '`/bounty pay` - release payment when the work is done',
      '`/bounty cancel` - cancel and refund your bounty'
    ]
  },
  {
    name: 'Ledger',
    lines: [
      '`/ledger recent` - recent transactions',
      '`/ledger detail` - specific transaction detail'
    ]
  },
  {
    name: 'Trivia',
    lines: [
      '`/trivia start|stop` - game control',
      '`/trivia list` - available lists',
      '`/trivia leaderboard` - guild trivia ranking'
    ]
  },
  {
    name: 'Games',
    lines: [
      '`/hangman` - guess letters to reveal the word (type letters in chat)',
      '`/connect4 @user` - challenge someone to Connect 4 (type 1–7 to play)',
      '`/race` + `/joinrace` - animal racing game',
      '`/games` - list all games'
    ]
  },
  {
    name: 'Utility',
    lines: [
      '`/remind set` - set a personal reminder (DM delivery)',
      '`/remind list` - view pending reminders',
      '`/remind delete` - cancel a reminder',
      '`/notify view|set|reset|test` - DM notification preferences',
      '`/clear` - delete recent bot messages in channel (ManageMessages)',
      '`/suggest submit|list` - submit or browse feature requests'
    ]
  },
  {
    name: 'Admin & Policy',
    lines: [
      '`/admin award|take|set-balance|vault set`',
      '`/admin notify defaults-view|defaults-set|defaults-reset|health`',
      '`/admin role/user add/remove`',
      '`/roles bind|unbind|list|import|sync` - reaction roles (`.rr`)',
      '`/policy allow|deny|clear|list`'
    ]
  }
];

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'help',
    title: 'Help',
    summary: 'Discover commands and usage examples.',
    usage: ['/help', '/help topic:<command|module>'],
    examples: ['/help', '/help topic:shop admin', '/help topic:policy'],
    permissions: 'Everyone',
    aliases: ['h', 'commands', 'cmds', 'manual']
  },
  {
    id: 'balance',
    title: 'Balance',
    summary: 'Show your current wallet funds, or another user\'s balance.',
    usage: ['/balance', '/balance user:<@user>'],
    examples: ['/balance', '.$ @Bilal', '.bal @Bilal'],
    permissions: 'Everyone',
    aliases: ['bal', 'b', 'wallet']
  },
  {
    id: 'status',
    title: 'Status',
    summary: 'Your wallet, vault, timely cooldown, and prayer checklist in one view.',
    usage: ['/status'],
    examples: ['/status', '.status', '.st'],
    permissions: 'Everyone',
    aliases: ['st']
  },
  {
    id: 'transfer',
    title: 'Transfer',
    summary: 'Transfer wallet funds to another user.',
    usage: ['/transfer user:<@user> amount:<number|"all">'],
    examples: ['/transfer @Bilal 250', '/transfer @Bilal all', '.give @Bilal all'],
    permissions: 'Everyone',
    aliases: ['pay', 'send', 'give']
  },
  {
    id: 'vault',
    title: 'Vault',
    summary: 'Move funds between wallet and vault.',
    usage: ['/vault deposit amount:<number>', '/vault withdraw amount:<number>', '/vault balance'],
    examples: ['/vault deposit 500', '/vault withdraw 200', '/vault balance'],
    permissions: 'Everyone',
    aliases: ['v', 'bank', 'vault deposit', 'vault withdraw', 'vault balance']
  },
  {
    id: 'shop',
    title: 'Shop',
    summary: 'Browse and buy server shop items.',
    usage: ['/shop list [page]', '/shop buy item:<key|index>', '/shop refund item:<key|index>', '/shop inventory [page]'],
    examples: ['/shop list', '/shop buy husaam', '/shop buy 3', '/shop refund husaam'],
    permissions: 'Everyone',
    notes: 'Role items require the bot to have role management permissions and proper hierarchy. Only role items can be refunded.',
    aliases: ['s', 'store', 'shop list', 'shop buy', 'shop refund', 'shop inventory']
  },
  {
    id: 'shop admin',
    title: 'Shop Admin',
    summary: 'Manage shop catalog entries and prices.',
    usage: [
      '/shop admin add-role role:<@role> price:<number> [key] [name] [required_role]',
      '/shop admin add-item key:<text> name:<text> price:<number>',
      '/shop admin set-price key:<text> price:<number>',
      '/shop admin remove key:<text>',
      '/shop admin list [page]'
    ],
    examples: ['/shop admin add-role @Mamluk 10000 key:husaam', '/shop admin set-price husaam 15000'],
    permissions: 'ManageGuild/Admin policy',
    aliases: ['shop admin add-role', 'shop admin add-item', 'shop admin set-price', 'shop admin remove', 'shop admin list']
  },
  {
    id: 'claim timely',
    title: 'Claim Timely',
    summary: 'Claim periodic timely reward.',
    usage: ['/claim timely'],
    examples: ['/claim timely'],
    permissions: 'Everyone',
    aliases: ['claim', 'timely', 'daily']
  },
  {
    id: 'claim eid',
    title: 'Claim Eid Bonus',
    summary: 'Claim one-time Eid al-Adha 1447 bonus (40,000 Dinar). 48-hour event ending May 28, 2026.',
    usage: ['/claim eid'],
    examples: ['/claim eid', '.eid'],
    permissions: 'Everyone',
    notes: 'One-time claim per user. Available for 48 hours, until May 28, 2026 ~4:54 PM EST.',
    aliases: ['eid']
  },
  {
    id: 'prayer',
    title: 'Prayer',
    summary: 'Check in prayers and view your daily checklist. Taraweeh is available during Ramadan.',
    usage: ['/prayer checkin prayer:<fajr|dhuhr|asr|maghrib|isha|taraweeh>', '/prayer status'],
    examples: ['/prayer checkin fajr', '/prayer checkin taraweeh', '/prayer status'],
    permissions: 'Everyone',
    notes:
      'The checklist and all-five bonus reset at midnight UTC (shown as "resets in …"). Streaks only need one check-in per UTC day, so your time zone cannot break them. Taraweeh check-in is only available during Ramadan; then the all-prayers bonus requires all 6 prayers.',
    aliases: ['pray', 'salah', 'taraweeh', 'prayer checkin', 'prayer status']
  },
  {
    id: 'community',
    title: 'Community Tag Reward',
    summary: 'Claim one-time tag reward (two-phase: initiate → collect after 24h).',
    usage: ['/community tag-reward'],
    examples: ['/community tag-reward'],
    permissions: 'Everyone',
    notes: 'Keep server tag active for 24 hours, then run the command again to collect. One-time reward.',
    aliases: ['tag-reward', 'community tag-reward', 'reward']
  },
  {
    id: 'club',
    title: 'Club',
    summary: 'Create and manage clubs and members.',
    usage: [
      '/club create name:<text> [description]',
      '/club info [name]',
      '/club apply name:<text>',
      '/club accept|reject|kick|ban|unban user:<@user>',
      '/club leaderboard [page]'
    ],
    examples: ['/club create name:Shura', '/club apply name:Shura', '/club leaderboard'],
    permissions: 'Varies by action (owner/admin checks in service layer)',
    aliases: ['clubs', 'club info', 'club leaderboard']
  },
  {
    id: 'drop',
    title: 'Drop',
    summary: 'Drop currency in a channel for someone to pick up.',
    usage: ['/drop amount:<number|"all">'],
    examples: ['/drop 500', '.drop 200', '.drop all'],
    permissions: 'Everyone',
    notes: 'Guild-only. Deducts from your wallet. Only one active drop per channel at a time. After a successful `.drop`, the bot removes your command message to keep chat tidy (needs Manage Messages; admins can turn this off with the dropDeleteCommand setting).',
    aliases: ['drop']
  },
  {
    id: 'roles',
    title: 'Reaction Roles',
    summary: 'Let members self-assign roles by reacting to a message.',
    usage: [
      '/roles bind message:<link> emoji:<emoji> role:<@role>',
      '/roles unbind message:<link> [emoji:<emoji>]',
      '/roles list [message:<link>]',
      '/roles import message:<link>',
      '/roles sync message:<link>'
    ],
    examples: [
      '/roles import message:https://discord.com/channels/…/…/…',
      '/roles bind message:<link> emoji:💻 role:@Computer-Programming',
      '.rr'
    ],
    permissions: 'Admins (Manage Server or configured admin roles)',
    notes:
      'Guild-only. `import` reads an existing "Role-Name emoji" panel and binds every line to the role with that name; `sync` then grants roles to everyone who already reacted. The bot needs Manage Roles and its top role must sit above every bound role. Removing your reaction removes the role.',
    aliases: ['rr']
  },
  {
    id: 'pick',
    title: 'Pick',
    summary: 'Pick up currency that was dropped in the channel.',
    usage: ['/pick', '.pick'],
    examples: ['/pick', '.pick', '.grab'],
    permissions: 'Everyone',
    notes: 'First person to pick wins the dropped amount. Guild-only.',
    aliases: ['p', 'grab', 'claim-drop']
  },
  {
    id: 'bounty',
    title: 'Bounty Board',
    summary: 'Post a bounty, someone takes it, you pay when done. Simple.',
    usage: [
      '/bounty post amount:<number|5k|1m> title:<text>',
      '/bounty list [page]',
      '/bounty take id:<number>',
      '/bounty pay id:<number>',
      '/bounty cancel id:<number>',
      '/bounty view id:<number>',
      '/bounty admin refund id:<number>',
      '/bounty admin pay id:<number>'
    ],
    examples: [
      '.bounty post 5k design a club banner',
      '.bounty take 12',
      '.bounty pay 12',
      '.bounty list'
    ],
    permissions: 'Everyone (admin refund/pay require admin policy)',
    notes: 'The amount is escrowed when you post. First come, first served — no applications or approvals. Max 5 posts per 24h.',
    aliases: ['bounties', 'tasks', 'task']
  },
  {
    id: 'ledger',
    title: 'Ledger',
    summary: 'View your transaction history and details.',
    usage: ['/ledger recent [page]', '/ledger detail id:<number>'],
    examples: ['/ledger recent', '/ledger detail 92431'],
    permissions: 'Everyone',
    aliases: ['tx', 'ledger recent', 'ledger detail']
  },
  {
    id: 'trivia',
    title: 'Trivia',
    summary: 'Run trivia games and view trivia leaderboard.',
    usage: ['/trivia start list:<name>', '/trivia stop', '/trivia list', '/trivia leaderboard [list]'],
    examples: ['/trivia list', '/trivia start list:islamic', '/trivia leaderboard'],
    permissions: 'Everyone (stop can be privileged in service checks)',
    notes: 'Rewards are paid out at the end of the game. By default, 2+ players must participate to earn rewards (configurable via `/admin config set key:triviaRequireMultiplePlayers value:false`). Reward amounts are also admin-configurable.',
    aliases: ['t', 'trivia start', 'trivia stop', 'trivia list', 'trivia leaderboard']
  },
  {
    id: 'admin',
    title: 'Admin Economy',
    summary: 'Admin moderation actions for economy and admin assignment.',
    usage: [
      '/admin award user:<@user> amount:<number> [note]',
      '/admin take user:<@user> amount:<number> [note]',
      '/admin set-balance user:<@user> amount:<number> [note]',
      '/admin vault set user:<@user> amount:<number> [note]',
      '/admin role add/remove role:<@role>',
      '/admin user add/remove user:<@user>',
      '/admin config set/view/reset',
      '/admin notify defaults-view/defaults-set/defaults-reset/health',
      '/admin reset-cooldown user:<@user> type:<...>',
      '/admin reset-server-timely',
      '/admin list'
    ],
    examples: ['/admin award @Bilal 500 note:weekly bonus', '/admin role add @Moderators'],
    permissions: 'ManageGuild/Admin policy (owner required for role/user assignment)',
    aliases: [
      'admin award',
      'admin take',
      'admin set-balance',
      'admin vault set',
      'admin role add',
      'admin role remove',
      'admin user add',
      'admin user remove',
      'admin config set',
      'admin config view',
      'admin config reset',
      'admin notify defaults-view',
      'admin notify defaults-set',
      'admin notify defaults-reset',
      'admin notify health',
      'admin reset-cooldown',
      'admin reset-server-timely',
      'award',
      'take',
      'setbal',
      'setbalance'
    ]
  },
  {
    id: 'notify',
    title: 'Notifications',
    summary: 'Manage DM-first notification preferences per event.',
    usage: [
      '/notify view [event]',
      '/notify set event:<...> mode:<inherit|off|dm_only|dm_fallback>',
      '/notify reset [event]',
      '/notify test [event]'
    ],
    examples: ['/notify view', '/notify set event:task_submission_received mode:dm_only', '/notify test'],
    permissions: 'Everyone',
    notes: 'DMs are attempted first. If enabled and DMs fail, channel fallback sends only minimal non-sensitive hints.',
    aliases: ['notify', 'nset', 'nreset', 'ntest']
  },
  {
    id: 'admin notify',
    title: 'Admin Notify',
    summary: 'Manage guild-wide notification defaults and inspect outbox health.',
    usage: [
      '/admin notify defaults-view [event]',
      '/admin notify defaults-set event:<...> mode:<off|dm_only|dm_fallback>',
      '/admin notify defaults-reset [event]',
      '/admin notify health'
    ],
    examples: [
      '/admin notify defaults-set event:transfer_received mode:dm_only',
      '/admin notify defaults-view',
      '/admin notify health'
    ],
    permissions: 'ManageGuild/Admin policy',
    aliases: ['admin notify defaults-view', 'admin notify defaults-set', 'admin notify defaults-reset', 'admin notify health']
  },
  {
    id: 'hangman',
    title: 'Hangman',
    summary: 'Play hangman in the channel. Guess letters by typing them.',
    usage: ['/hangman', '/hangman stop:<stop>'],
    examples: ['.hangman', '.hm', '.hangman stop:stop'],
    permissions: 'Everyone',
    notes: 'Type a single letter in chat to guess. Game host or admin can stop it.',
    aliases: ['hm']
  },
  {
    id: 'connect4',
    title: 'Connect 4',
    summary: 'Challenge someone to Connect 4. Type 1–7 in chat to drop a piece.',
    usage: ['/connect4 opponent:<@user>'],
    examples: ['.c4 @User', '.connect4 @User'],
    permissions: 'Everyone',
    notes: 'Type a column number (1–7) in chat to play. 60s turn timer.',
    aliases: ['c4']
  },
  {
    id: 'race',
    title: 'Race',
    summary: 'Start an animal race. Others join with /joinrace within 30 seconds.',
    usage: ['/race', '/joinrace'],
    examples: ['.race', '.joinrace', '.jr'],
    permissions: 'Everyone',
    aliases: ['jr', 'joinrace']
  },
  {
    id: 'remind',
    title: 'Remind',
    summary: 'Set personal reminders. Delivered via DM (or channel if DMs disabled).',
    usage: ['/remind set time:<duration> message:<text>', '/remind list', '/remind delete id:<number>'],
    examples: ['/remind set time:30m message:Check the oven', '/remind list', '/remind delete id:3'],
    permissions: 'Everyone',
    notes: 'Duration formats: 30m, 2h, 1d, 1d6h30m. Max 30 days. Max 10 pending reminders.',
    aliases: ['remind set', 'remind list', 'remind delete']
  },
  {
    id: 'clear',
    title: 'Clear',
    summary: "Delete the bot's recent messages in this channel.",
    usage: ['/clear [count]'],
    examples: ['/clear', '/clear 20', '.clear 5'],
    permissions: 'ManageMessages',
    notes: 'Searches last 100 messages. Max 50 deletions. Messages older than 14 days cannot be bulk-deleted.',
    aliases: ['clear']
  },
  {
    id: 'policy',
    title: 'Command Policy',
    summary: 'Allowlist and denylist commands by guild/channel/role/user scope.',
    usage: [
      '/policy allow command:<name> [subcommand] scope:<guild|channel|role|user> [target]',
      '/policy deny command:<name> [subcommand] scope:<...> [target]',
      '/policy clear command:<name> [subcommand] scope:<...> [target]',
      '/policy list [command] [subcommand]'
    ],
    examples: ['/policy deny command:trivia scope:channel target:#off-topic', '/policy list command:shop'],
    permissions: 'ManageGuild/Admin policy',
    aliases: ['allowlist', 'denylist', 'policy allow', 'policy deny', 'policy clear', 'policy list']
  },
  {
    id: 'dailychallenge',
    title: 'Daily Recitation Challenge',
    summary: 'Daily Quran recitation challenges with voice note completion. The bot posts a surah to recite, and users send a voice note to earn a reward (honor system).',
    usage: [
      '/dailychallenge view',
      '/dailychallenge admin set-channel',
      '/dailychallenge admin disable',
      '/dailychallenge admin ban user:<@user> [duration:<hours>] [reason:<text>]',
      '/dailychallenge admin unban user:<@user>',
      '/dailychallenge admin bans'
    ],
    examples: [
      '/dailychallenge view',
      '/dailychallenge admin ban user:@someone duration:24 reason:Honor code violation',
      '/dailychallenge admin unban user:@someone',
      '/dailychallenge admin bans',
      '.dailychallenge',
      '.dc'
    ],
    permissions: 'Everyone (admin commands require ManageGuild/Admin)',
    notes: 'Challenges rotate daily with a new random surah. The same challenge is reposted every 3 hours as a reminder. Each user can complete the challenge once per day. Reward is configurable via `/admin settings set challengeReward <amount>` (default: 1000). Admins can ban users who violate the honor code — banned users are notified when they try to send a voice note.',
    aliases: ['dc', 'challenge']
  },
  {
    id: 'suggest',
    title: 'Suggest',
    summary: 'Submit or browse feature suggestions for the bot.',
    usage: [
      '/suggest submit description:<text> [category:<choice>]',
      '/suggest list [page:<number>]'
    ],
    examples: [
      '/suggest submit description:Add a daily quiz feature category:trivia',
      '.suggest Add an inventory trading system',
      '.idea Let users customize their profile',
      '.suggestions'
    ],
    permissions: 'Everyone',
    notes:
      'Categories: economy, games, worship, trivia, community, utility, other. One suggestion per hour per user. Description must be 10–500 characters.',
    aliases: ['idea', 'feature', 'requestfeature', 'suggestions']
  }
];
