import { NATIVE_PREFIX_ALIASES } from '../../generated/commandManifest.js';

/**
 * Manual overrides and shorthand expansions layered on top of native aliases.
 * Keep this map focused on:
 * - subcommand shortcuts
 * - flag-injection bridges for positional prefix usage
 * - legacy compatibility shortcuts
 */
export const PREFIX_ALIAS_OVERRIDES: Record<string, string> = {
  // Bank / vault shorthands — two-word keys checked before one-word keys
  'bank d': 'vault deposit -amount',
  'bank w': 'vault withdraw -amount',
  'bank b': 'vault balance',
  'bank bal': 'vault balance',

  // Economy
  eid: 'claim eid',
  timely: 'claim timely',
  daily: 'claim timely',
  transfer: 'transfer -user',
  pay: 'transfer -user',
  send: 'transfer -user',
  give: 'transfer -user',
  award: 'admin award -user',
  take: 'admin take -user',
  setbal: 'admin set-balance -user',
  setbalance: 'admin set-balance -user',

  // Vault
  dep: 'vault deposit -amount',
  wd: 'vault withdraw -amount',
  vbal: 'vault balance',

  // Community
  reward: 'community tag-reward',

  // Bounty board (formerly tasks marketplace — legacy names still work)
  bounties: 'bounty',
  tasks: 'bounty',
  task: 'bounty',
  tasklist: 'bounty list',
  tmarket: 'bounty list',

  // Worship
  pray: 'prayer checkin -prayer',
  salah: 'prayer checkin -prayer',
  pstatus: 'prayer status',
  fajr: 'prayer checkin -prayer fajr',
  dhuhr: 'prayer checkin -prayer dhuhr',
  zuhr: 'prayer checkin -prayer dhuhr',
  zohr: 'prayer checkin -prayer dhuhr',
  zohar: 'prayer checkin -prayer dhuhr',
  asr: 'prayer checkin -prayer asr',
  maghrib: 'prayer checkin -prayer maghrib',
  isha: 'prayer checkin -prayer isha',
  taraweeh: 'prayer checkin -prayer taraweeh',

  // Trivia
  tstart: 'trivia start -list',
  tstop: 'trivia stop',
  tlist: 'trivia list',
  tlb: 'trivia leaderboard',

  // Shop
  buy: 'shop buy -item',
  refund: 'shop refund -item',
  inv: 'shop inventory',

  // Clubs
  clb: 'club leaderboard',
  ci: 'club info',

  // Drops
  drop: 'drop -amount',

  // Games
  'hangman stop': 'hangman -stop stop',
  'hm stop': 'hangman -stop stop',
  hangman: 'hangman -category',
  hm: 'hangman -category',
  hmstop: 'hangman -stop stop',

  // Utility
  remind: 'remind set -time',
  remindlist: 'remind list',
  remindclear: 'remind delete -id',
  clear: 'clear -count',
  notify: 'notify view',
  nset: 'notify set -event -mode',
  nreset: 'notify reset -event',
  ntest: 'notify test -event',
  ndefaults: 'admin notify defaults-view',
  nhealth: 'admin notify health',

  // Suggest / feature request
  suggest: 'suggest submit -description',
  idea: 'suggest submit -description',
  feature: 'suggest submit -description',
  requestfeature: 'suggest submit -description',
  suggestions: 'suggest list',

  // Daily challenges
  dailychallenge: 'dailychallenge view',
  dc: 'dailychallenge view',
  challenge: 'dailychallenge view',

  // Leaderboard + ledger shortcuts
  lb: 'leaderboard wealth',
  top: 'leaderboard wealth',
  streaks: 'leaderboard streaks',
  streak: 'leaderboard streaks',
  tx: 'ledger recent'
};

export const PREFIX_ALIASES: Record<string, string> = {
  ...NATIVE_PREFIX_ALIASES,
  ...PREFIX_ALIAS_OVERRIDES
};
