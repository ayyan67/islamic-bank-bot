/* AUTO-GENERATED FILE. DO NOT EDIT.
 * Run `pnpm aliases:generate` to regenerate.
 */

export interface CommandSubcommandManifestEntry {
  readonly name: string;
  readonly group: string | null;
  readonly path: string;
  readonly aliases: readonly string[];
  readonly file: string;
}

export interface CommandManifestEntry {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly file: string;
  readonly subcommands: readonly CommandSubcommandManifestEntry[];
}

export const COMMAND_MANIFEST: readonly CommandManifestEntry[] = [
  {
    "name": "admin",
    "aliases": [],
    "file": "src/commands/admin/admin.ts",
    "subcommands": [
      {
        "name": "award",
        "group": null,
        "path": "admin award",
        "aliases": [],
        "file": "src/commands/admin/admin.ts"
      },
      {
        "name": "reset",
        "group": "config",
        "path": "admin config reset",
        "aliases": [],
        "file": "src/commands/admin/admin.ts"
      },
      {
        "name": "set",
        "group": "config",
        "path": "admin config set",
        "aliases": [],
        "file": "src/commands/admin/admin.ts"
      },
      {
        "name": "view",
        "group": "config",
        "path": "admin config view",
        "aliases": [],
        "file": "src/commands/admin/admin.ts"
      },
      {
        "name": "list",
        "group": null,
        "path": "admin list",
        "aliases": [],
        "file": "src/commands/admin/admin.ts"
      },
      {
        "name": "defaults-reset",
        "group": "notify",
        "path": "admin notify defaults-reset",
        "aliases": [],
        "file": "src/commands/admin/admin.ts"
      },
      {
        "name": "defaults-set",
        "group": "notify",
        "path": "admin notify defaults-set",
        "aliases": [],
        "file": "src/commands/admin/admin.ts"
      },
      {
        "name": "defaults-view",
        "group": "notify",
        "path": "admin notify defaults-view",
        "aliases": [],
        "file": "src/commands/admin/admin.ts"
      },
      {
        "name": "health",
        "group": "notify",
        "path": "admin notify health",
        "aliases": [],
        "file": "src/commands/admin/admin.ts"
      },
      {
        "name": "reset-cooldown",
        "group": null,
        "path": "admin reset-cooldown",
        "aliases": [],
        "file": "src/commands/admin/admin.ts"
      },
      {
        "name": "reset-server-timely",
        "group": null,
        "path": "admin reset-server-timely",
        "aliases": [],
        "file": "src/commands/admin/admin.ts"
      },
      {
        "name": "add",
        "group": "role",
        "path": "admin role add",
        "aliases": [],
        "file": "src/commands/admin/admin.ts"
      },
      {
        "name": "remove",
        "group": "role",
        "path": "admin role remove",
        "aliases": [],
        "file": "src/commands/admin/admin.ts"
      },
      {
        "name": "set-balance",
        "group": null,
        "path": "admin set-balance",
        "aliases": [],
        "file": "src/commands/admin/admin.ts"
      },
      {
        "name": "take",
        "group": null,
        "path": "admin take",
        "aliases": [],
        "file": "src/commands/admin/admin.ts"
      },
      {
        "name": "add",
        "group": "user",
        "path": "admin user add",
        "aliases": [],
        "file": "src/commands/admin/admin.ts"
      },
      {
        "name": "remove",
        "group": "user",
        "path": "admin user remove",
        "aliases": [],
        "file": "src/commands/admin/admin.ts"
      },
      {
        "name": "set",
        "group": "vault",
        "path": "admin vault set",
        "aliases": [],
        "file": "src/commands/admin/admin.ts"
      }
    ]
  },
  {
    "name": "balance",
    "aliases": [
      "$",
      "b",
      "bal"
    ],
    "file": "src/commands/economy/balance.ts",
    "subcommands": []
  },
  {
    "name": "bounty",
    "aliases": [],
    "file": "src/commands/bounty/bounty.ts",
    "subcommands": [
      {
        "name": "pay",
        "group": "admin",
        "path": "bounty admin pay",
        "aliases": [],
        "file": "src/commands/bounty/bounty.ts"
      },
      {
        "name": "refund",
        "group": "admin",
        "path": "bounty admin refund",
        "aliases": [],
        "file": "src/commands/bounty/bounty.ts"
      },
      {
        "name": "cancel",
        "group": null,
        "path": "bounty cancel",
        "aliases": [],
        "file": "src/commands/bounty/bounty.ts"
      },
      {
        "name": "list",
        "group": null,
        "path": "bounty list",
        "aliases": [
          "l"
        ],
        "file": "src/commands/bounty/bounty.ts"
      },
      {
        "name": "pay",
        "group": null,
        "path": "bounty pay",
        "aliases": [
          "approve",
          "release"
        ],
        "file": "src/commands/bounty/bounty.ts"
      },
      {
        "name": "post",
        "group": null,
        "path": "bounty post",
        "aliases": [
          "p"
        ],
        "file": "src/commands/bounty/bounty.ts"
      },
      {
        "name": "take",
        "group": null,
        "path": "bounty take",
        "aliases": [
          "claim",
          "t"
        ],
        "file": "src/commands/bounty/bounty.ts"
      },
      {
        "name": "view",
        "group": null,
        "path": "bounty view",
        "aliases": [
          "v"
        ],
        "file": "src/commands/bounty/bounty.ts"
      }
    ]
  },
  {
    "name": "changelog",
    "aliases": [
      "cl",
      "patchnotes",
      "updates"
    ],
    "file": "src/commands/utility/changelog.ts",
    "subcommands": []
  },
  {
    "name": "claim",
    "aliases": [],
    "file": "src/commands/worship/claim.ts",
    "subcommands": [
      {
        "name": "eid",
        "group": null,
        "path": "claim eid",
        "aliases": [],
        "file": "src/commands/worship/claim.ts"
      },
      {
        "name": "timely",
        "group": null,
        "path": "claim timely",
        "aliases": [],
        "file": "src/commands/worship/claim.ts"
      }
    ]
  },
  {
    "name": "clear",
    "aliases": [],
    "file": "src/commands/utility/clear.ts",
    "subcommands": []
  },
  {
    "name": "club",
    "aliases": [],
    "file": "src/commands/clubs/club.ts",
    "subcommands": [
      {
        "name": "accept",
        "group": null,
        "path": "club accept",
        "aliases": [],
        "file": "src/commands/clubs/club.ts"
      },
      {
        "name": "admin",
        "group": null,
        "path": "club admin",
        "aliases": [],
        "file": "src/commands/clubs/club.ts"
      },
      {
        "name": "apply",
        "group": null,
        "path": "club apply",
        "aliases": [],
        "file": "src/commands/clubs/club.ts"
      },
      {
        "name": "ban",
        "group": null,
        "path": "club ban",
        "aliases": [],
        "file": "src/commands/clubs/club.ts"
      },
      {
        "name": "create",
        "group": null,
        "path": "club create",
        "aliases": [],
        "file": "src/commands/clubs/club.ts"
      },
      {
        "name": "description",
        "group": null,
        "path": "club description",
        "aliases": [],
        "file": "src/commands/clubs/club.ts"
      },
      {
        "name": "disband",
        "group": null,
        "path": "club disband",
        "aliases": [],
        "file": "src/commands/clubs/club.ts"
      },
      {
        "name": "icon",
        "group": null,
        "path": "club icon",
        "aliases": [],
        "file": "src/commands/clubs/club.ts"
      },
      {
        "name": "info",
        "group": null,
        "path": "club info",
        "aliases": [],
        "file": "src/commands/clubs/club.ts"
      },
      {
        "name": "kick",
        "group": null,
        "path": "club kick",
        "aliases": [],
        "file": "src/commands/clubs/club.ts"
      },
      {
        "name": "leaderboard",
        "group": null,
        "path": "club leaderboard",
        "aliases": [],
        "file": "src/commands/clubs/club.ts"
      },
      {
        "name": "leave",
        "group": null,
        "path": "club leave",
        "aliases": [],
        "file": "src/commands/clubs/club.ts"
      },
      {
        "name": "reject",
        "group": null,
        "path": "club reject",
        "aliases": [],
        "file": "src/commands/clubs/club.ts"
      },
      {
        "name": "transfer",
        "group": null,
        "path": "club transfer",
        "aliases": [],
        "file": "src/commands/clubs/club.ts"
      },
      {
        "name": "unban",
        "group": null,
        "path": "club unban",
        "aliases": [],
        "file": "src/commands/clubs/club.ts"
      }
    ]
  },
  {
    "name": "community",
    "aliases": [],
    "file": "src/commands/community/community.ts",
    "subcommands": [
      {
        "name": "tag-reward",
        "group": null,
        "path": "community tag-reward",
        "aliases": [],
        "file": "src/commands/community/community.ts"
      }
    ]
  },
  {
    "name": "connect4",
    "aliases": [
      "c4"
    ],
    "file": "src/commands/games/connect4.ts",
    "subcommands": []
  },
  {
    "name": "dailychallenge",
    "aliases": [
      "challenge",
      "dc"
    ],
    "file": "src/commands/challenges/dailychallenge.ts",
    "subcommands": [
      {
        "name": "ban",
        "group": "admin",
        "path": "dailychallenge admin ban",
        "aliases": [],
        "file": "src/commands/challenges/dailychallenge.ts"
      },
      {
        "name": "bans",
        "group": "admin",
        "path": "dailychallenge admin bans",
        "aliases": [],
        "file": "src/commands/challenges/dailychallenge.ts"
      },
      {
        "name": "disable",
        "group": "admin",
        "path": "dailychallenge admin disable",
        "aliases": [],
        "file": "src/commands/challenges/dailychallenge.ts"
      },
      {
        "name": "set-channel",
        "group": "admin",
        "path": "dailychallenge admin set-channel",
        "aliases": [],
        "file": "src/commands/challenges/dailychallenge.ts"
      },
      {
        "name": "unban",
        "group": "admin",
        "path": "dailychallenge admin unban",
        "aliases": [],
        "file": "src/commands/challenges/dailychallenge.ts"
      },
      {
        "name": "view",
        "group": null,
        "path": "dailychallenge view",
        "aliases": [],
        "file": "src/commands/challenges/dailychallenge.ts"
      }
    ]
  },
  {
    "name": "digest",
    "aliases": [],
    "file": "src/commands/community/digest.ts",
    "subcommands": [
      {
        "name": "disable",
        "group": null,
        "path": "digest disable",
        "aliases": [],
        "file": "src/commands/community/digest.ts"
      },
      {
        "name": "now",
        "group": null,
        "path": "digest now",
        "aliases": [],
        "file": "src/commands/community/digest.ts"
      },
      {
        "name": "set-channel",
        "group": null,
        "path": "digest set-channel",
        "aliases": [],
        "file": "src/commands/community/digest.ts"
      }
    ]
  },
  {
    "name": "drop",
    "aliases": [
      "d"
    ],
    "file": "src/commands/drops/drop.ts",
    "subcommands": []
  },
  {
    "name": "games",
    "aliases": [],
    "file": "src/commands/games/games.ts",
    "subcommands": []
  },
  {
    "name": "hangman",
    "aliases": [
      "hm"
    ],
    "file": "src/commands/games/hangman.ts",
    "subcommands": []
  },
  {
    "name": "help",
    "aliases": [
      "cmds",
      "commands",
      "h",
      "manual"
    ],
    "file": "src/commands/help/help.ts",
    "subcommands": []
  },
  {
    "name": "joinrace",
    "aliases": [
      "jr"
    ],
    "file": "src/commands/games/joinrace.ts",
    "subcommands": []
  },
  {
    "name": "leaderboard",
    "aliases": [
      "lb",
      "top"
    ],
    "file": "src/commands/economy/leaderboard.ts",
    "subcommands": [
      {
        "name": "streaks",
        "group": null,
        "path": "leaderboard streaks",
        "aliases": [],
        "file": "src/commands/economy/leaderboard.ts"
      },
      {
        "name": "wealth",
        "group": null,
        "path": "leaderboard wealth",
        "aliases": [],
        "file": "src/commands/economy/leaderboard.ts"
      }
    ]
  },
  {
    "name": "ledger",
    "aliases": [
      "tx"
    ],
    "file": "src/commands/ledger/ledger.ts",
    "subcommands": [
      {
        "name": "detail",
        "group": null,
        "path": "ledger detail",
        "aliases": [],
        "file": "src/commands/ledger/ledger.ts"
      },
      {
        "name": "recent",
        "group": null,
        "path": "ledger recent",
        "aliases": [],
        "file": "src/commands/ledger/ledger.ts"
      }
    ]
  },
  {
    "name": "notify",
    "aliases": [],
    "file": "src/commands/notifications/notify.ts",
    "subcommands": [
      {
        "name": "reset",
        "group": null,
        "path": "notify reset",
        "aliases": [],
        "file": "src/commands/notifications/notify.ts"
      },
      {
        "name": "set",
        "group": null,
        "path": "notify set",
        "aliases": [],
        "file": "src/commands/notifications/notify.ts"
      },
      {
        "name": "test",
        "group": null,
        "path": "notify test",
        "aliases": [],
        "file": "src/commands/notifications/notify.ts"
      },
      {
        "name": "view",
        "group": null,
        "path": "notify view",
        "aliases": [],
        "file": "src/commands/notifications/notify.ts"
      }
    ]
  },
  {
    "name": "pick",
    "aliases": [
      "claim-drop",
      "grab",
      "p"
    ],
    "file": "src/commands/drops/pick.ts",
    "subcommands": []
  },
  {
    "name": "policy",
    "aliases": [],
    "file": "src/commands/policy/policy.ts",
    "subcommands": [
      {
        "name": "allow",
        "group": null,
        "path": "policy allow",
        "aliases": [],
        "file": "src/commands/policy/policy.ts"
      },
      {
        "name": "clear",
        "group": null,
        "path": "policy clear",
        "aliases": [],
        "file": "src/commands/policy/policy.ts"
      },
      {
        "name": "deny",
        "group": null,
        "path": "policy deny",
        "aliases": [],
        "file": "src/commands/policy/policy.ts"
      },
      {
        "name": "list",
        "group": null,
        "path": "policy list",
        "aliases": [],
        "file": "src/commands/policy/policy.ts"
      }
    ]
  },
  {
    "name": "prayer",
    "aliases": [
      "pray"
    ],
    "file": "src/commands/worship/prayer.ts",
    "subcommands": [
      {
        "name": "checkin",
        "group": null,
        "path": "prayer checkin",
        "aliases": [],
        "file": "src/commands/worship/prayer.ts"
      },
      {
        "name": "status",
        "group": null,
        "path": "prayer status",
        "aliases": [],
        "file": "src/commands/worship/prayer.ts"
      }
    ]
  },
  {
    "name": "race",
    "aliases": [],
    "file": "src/commands/games/race.ts",
    "subcommands": []
  },
  {
    "name": "remind",
    "aliases": [],
    "file": "src/commands/utility/remind.ts",
    "subcommands": [
      {
        "name": "delete",
        "group": null,
        "path": "remind delete",
        "aliases": [],
        "file": "src/commands/utility/remind.ts"
      },
      {
        "name": "list",
        "group": null,
        "path": "remind list",
        "aliases": [],
        "file": "src/commands/utility/remind.ts"
      },
      {
        "name": "set",
        "group": null,
        "path": "remind set",
        "aliases": [],
        "file": "src/commands/utility/remind.ts"
      }
    ]
  },
  {
    "name": "roles",
    "aliases": [
      "rr"
    ],
    "file": "src/commands/roles/roles.ts",
    "subcommands": [
      {
        "name": "bind",
        "group": null,
        "path": "roles bind",
        "aliases": [],
        "file": "src/commands/roles/roles.ts"
      },
      {
        "name": "import",
        "group": null,
        "path": "roles import",
        "aliases": [],
        "file": "src/commands/roles/roles.ts"
      },
      {
        "name": "list",
        "group": null,
        "path": "roles list",
        "aliases": [],
        "file": "src/commands/roles/roles.ts"
      },
      {
        "name": "sync",
        "group": null,
        "path": "roles sync",
        "aliases": [],
        "file": "src/commands/roles/roles.ts"
      },
      {
        "name": "unbind",
        "group": null,
        "path": "roles unbind",
        "aliases": [],
        "file": "src/commands/roles/roles.ts"
      }
    ]
  },
  {
    "name": "shop",
    "aliases": [
      "s",
      "store"
    ],
    "file": "src/commands/shop/shop.ts",
    "subcommands": [
      {
        "name": "add-item",
        "group": "admin",
        "path": "shop admin add-item",
        "aliases": [],
        "file": "src/commands/shop/shop.ts"
      },
      {
        "name": "add-role",
        "group": "admin",
        "path": "shop admin add-role",
        "aliases": [],
        "file": "src/commands/shop/shop.ts"
      },
      {
        "name": "list",
        "group": "admin",
        "path": "shop admin list",
        "aliases": [],
        "file": "src/commands/shop/shop.ts"
      },
      {
        "name": "remove",
        "group": "admin",
        "path": "shop admin remove",
        "aliases": [],
        "file": "src/commands/shop/shop.ts"
      },
      {
        "name": "set-price",
        "group": "admin",
        "path": "shop admin set-price",
        "aliases": [],
        "file": "src/commands/shop/shop.ts"
      },
      {
        "name": "buy",
        "group": null,
        "path": "shop buy",
        "aliases": [],
        "file": "src/commands/shop/shop.ts"
      },
      {
        "name": "inventory",
        "group": null,
        "path": "shop inventory",
        "aliases": [],
        "file": "src/commands/shop/shop.ts"
      },
      {
        "name": "list",
        "group": null,
        "path": "shop list",
        "aliases": [],
        "file": "src/commands/shop/shop.ts"
      },
      {
        "name": "refund",
        "group": null,
        "path": "shop refund",
        "aliases": [
          "return",
          "sellback"
        ],
        "file": "src/commands/shop/shop.ts"
      }
    ]
  },
  {
    "name": "status",
    "aliases": [
      "st"
    ],
    "file": "src/commands/economy/status.ts",
    "subcommands": []
  },
  {
    "name": "suggest",
    "aliases": [],
    "file": "src/commands/utility/suggest.ts",
    "subcommands": [
      {
        "name": "done",
        "group": null,
        "path": "suggest done",
        "aliases": [
          "resolve"
        ],
        "file": "src/commands/utility/suggest.ts"
      },
      {
        "name": "list",
        "group": null,
        "path": "suggest list",
        "aliases": [
          "l"
        ],
        "file": "src/commands/utility/suggest.ts"
      },
      {
        "name": "submit",
        "group": null,
        "path": "suggest submit",
        "aliases": [
          "s"
        ],
        "file": "src/commands/utility/suggest.ts"
      }
    ]
  },
  {
    "name": "transfer",
    "aliases": [
      "give",
      "pay",
      "send"
    ],
    "file": "src/commands/economy/transfer.ts",
    "subcommands": []
  },
  {
    "name": "trivia",
    "aliases": [
      "t"
    ],
    "file": "src/commands/trivia/trivia.ts",
    "subcommands": [
      {
        "name": "leaderboard",
        "group": null,
        "path": "trivia leaderboard",
        "aliases": [],
        "file": "src/commands/trivia/trivia.ts"
      },
      {
        "name": "list",
        "group": null,
        "path": "trivia list",
        "aliases": [],
        "file": "src/commands/trivia/trivia.ts"
      },
      {
        "name": "start",
        "group": null,
        "path": "trivia start",
        "aliases": [],
        "file": "src/commands/trivia/trivia.ts"
      },
      {
        "name": "stop",
        "group": null,
        "path": "trivia stop",
        "aliases": [],
        "file": "src/commands/trivia/trivia.ts"
      }
    ]
  },
  {
    "name": "vault",
    "aliases": [
      "bank",
      "v"
    ],
    "file": "src/commands/vault/vault.ts",
    "subcommands": [
      {
        "name": "balance",
        "group": null,
        "path": "vault balance",
        "aliases": [
          "b",
          "bal"
        ],
        "file": "src/commands/vault/vault.ts"
      },
      {
        "name": "deposit",
        "group": null,
        "path": "vault deposit",
        "aliases": [
          "d"
        ],
        "file": "src/commands/vault/vault.ts"
      },
      {
        "name": "withdraw",
        "group": null,
        "path": "vault withdraw",
        "aliases": [
          "w"
        ],
        "file": "src/commands/vault/vault.ts"
      }
    ]
  }
] as const;

export const NATIVE_PREFIX_ALIASES: Readonly<Record<string, string>> = {
  "$": "balance",
  "admin": "admin",
  "b": "balance",
  "bal": "balance",
  "balance": "balance",
  "bank": "vault",
  "bounty": "bounty",
  "c4": "connect4",
  "challenge": "dailychallenge",
  "changelog": "changelog",
  "cl": "changelog",
  "claim": "claim",
  "claim-drop": "pick",
  "clear": "clear",
  "club": "club",
  "cmds": "help",
  "commands": "help",
  "community": "community",
  "connect4": "connect4",
  "d": "drop",
  "dailychallenge": "dailychallenge",
  "dc": "dailychallenge",
  "digest": "digest",
  "drop": "drop",
  "games": "games",
  "give": "transfer",
  "grab": "pick",
  "h": "help",
  "hangman": "hangman",
  "help": "help",
  "hm": "hangman",
  "joinrace": "joinrace",
  "jr": "joinrace",
  "lb": "leaderboard",
  "leaderboard": "leaderboard",
  "ledger": "ledger",
  "manual": "help",
  "notify": "notify",
  "p": "pick",
  "patchnotes": "changelog",
  "pay": "transfer",
  "pick": "pick",
  "policy": "policy",
  "pray": "prayer",
  "prayer": "prayer",
  "race": "race",
  "remind": "remind",
  "roles": "roles",
  "rr": "roles",
  "s": "shop",
  "send": "transfer",
  "shop": "shop",
  "st": "status",
  "status": "status",
  "store": "shop",
  "suggest": "suggest",
  "t": "trivia",
  "top": "leaderboard",
  "transfer": "transfer",
  "trivia": "trivia",
  "tx": "ledger",
  "updates": "changelog",
  "v": "vault",
  "vault": "vault"
} as const;

export const NATIVE_ROOT_ALIAS_COLLISIONS: Readonly<Record<string, readonly string[]>> = {} as const;
