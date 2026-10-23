import { describe, expect, it } from 'vitest';
import { rewritePrefixContent, injectPositionalFlags } from '../infra/discord/prefixRewrite.js';

const P = '.';
const rw = (content: string) => rewritePrefixContent(content, P);

describe('rewritePrefixContent', () => {
  it('leaves non-prefix content alone', () => {
    expect(rw('hello world')).toBe('hello world');
  });

  it('leaves unknown commands alone', () => {
    expect(rw('.unknowncommand foo')).toBe('.unknowncommand foo');
  });

  it('rewrites simple shorthand aliases', () => {
    expect(rw('.lb')).toBe('.leaderboard wealth');
    expect(rw('.streaks')).toBe('.leaderboard streaks');
    expect(rw('.streak')).toBe('.leaderboard streaks');
    expect(rw('.top')).toBe('.leaderboard wealth');
    expect(rw('.tx')).toBe('.ledger recent');
    expect(rw('.timely')).toBe('.claim timely');
    expect(rw('.daily')).toBe('.claim timely');
  });

  it('is case-insensitive on the command word', () => {
    expect(rw('.LB')).toBe('.leaderboard wealth');
    expect(rw('.Timely')).toBe('.claim timely');
  });

  it('rewrites two-word aliases before one-word aliases', () => {
    expect(rw('.bank d 500')).toBe('.vault deposit -amount 500');
    expect(rw('.bank w all')).toBe('.vault withdraw -amount all');
    expect(rw('.bank bal')).toBe('.vault balance');
    expect(rw('.hm stop')).toBe('.hangman -stop stop');
  });

  it('injects the first flag for shorthand aliases with options', () => {
    expect(rw('.dep 500')).toBe('.vault deposit -amount 500');
    expect(rw('.dep 1.5m')).toBe('.vault deposit -amount 1.5m');
    expect(rw('.give <@123> all')).toBe('.transfer -user <@123> all');
    expect(rw('.buy vip')).toBe('.shop buy -item vip');
    expect(rw('.fajr')).toBe('.prayer checkin -prayer fajr');
    expect(rw('.pray fajr')).toBe('.prayer checkin -prayer fajr');
    expect(rw('.hm animals')).toBe('.hangman -category animals');
  });

  it('maps admin economy shortcuts with positional flag injection', () => {
    expect(rw('.award <@123> 500')).toBe('.admin award -user <@123> -amount 500');
    expect(rw('.award 500 <@123>')).toBe('.admin award -user <@123> -amount 500');
    expect(rw('.take <@123> 250')).toBe('.admin take -user <@123> -amount 250');
    expect(rw('.setbal <@123> 100')).toBe('.admin set-balance -user <@123> -amount 100');
    expect(rw('.setbalance <@123> 100')).toBe('.admin set-balance -user <@123> -amount 100');
  });

  it('preserves explicit trailing flags in admin shortcuts', () => {
    expect(rw('.award <@123> 500 -note weekly bonus')).toBe(
      '.admin award -user <@123> -amount 500 -note weekly bonus'
    );
  });

  it('passes through admin commands already using flags', () => {
    expect(rw('.award -user <@123> -amount 500')).toBe('.admin award -user <@123> -amount 500');
  });

  it('maps admin full form with positional args', () => {
    expect(rw('.admin award <@123> 500')).toBe('.admin award -user <@123> -amount 500');
    expect(rw('.admin take <@123> 250')).toBe('.admin take -user <@123> -amount 250');
  });

  it('maps legacy task names and bounty shorthands', () => {
    expect(rw('.tasks')).toBe('.bounty list');
    expect(rw('.task')).toBe('.bounty list');
    expect(rw('.bounty')).toBe('.bounty list');
    expect(rw('.bounties')).toBe('.bounty list');
    expect(rw('.tasks list')).toBe('.bounty list');
  });

  it('injects positional flags for bounty commands', () => {
    expect(rw('.bounty post 5k fix the club icon')).toBe('.bounty post -amount 5k -title fix the club icon');
    expect(rw('.bounty post 500 quick job')).toBe('.bounty post -amount 500 -title quick job');
    expect(rw('.bounty take 12')).toBe('.bounty take -id 12');
    expect(rw('.bounty pay 12')).toBe('.bounty pay -id 12');
    expect(rw('.tasks take 12')).toBe('.bounty take -id 12');
    expect(rw('.bounty view 3')).toBe('.bounty view -id 3');
  });

  it('rewrites trivia list-name shorthand', () => {
    expect(rw('.trivia worldmap')).toBe('.trivia start -list worldmap');
    expect(rw('.trivia stop')).toBe('.trivia stop');
    expect(rw('.tstart worldmap')).toBe('.trivia start -list worldmap');
  });

  it('expands bare parent commands to their default subcommand', () => {
    expect(rw('.ledger')).toBe('.ledger recent');
    expect(rw('.prayer')).toBe('.prayer status');
    expect(rw('.claim')).toBe('.claim timely');
    expect(rw('.shop')).toBe('.shop list');
    expect(rw('.roles')).toBe('.roles list');
    expect(rw('.rr')).toBe('.roles list');
    expect(rw('.leaderboard')).toBe('.leaderboard wealth');
  });

  it('does not expand parents that already have a subcommand', () => {
    expect(rw('.ledger recent 2')).toBe('.ledger recent 2');
    expect(rw('.shop list 2')).toBe('.shop list 2');
    expect(rw('.claim eid')).toBe('.claim eid');
    expect(rw('.prayer checkin -prayer asr')).toBe('.prayer checkin -prayer asr');
  });
});

describe('injectPositionalFlags', () => {
  const SPEC = ['user', 'amount'] as const;

  it('returns empty for empty rest', () => {
    expect(injectPositionalFlags('', SPEC)).toBe('');
  });

  it('binds mention and number regardless of order', () => {
    expect(injectPositionalFlags('<@1> 5', SPEC)).toBe(' -user <@1> -amount 5');
    expect(injectPositionalFlags('5 <@1>', SPEC)).toBe(' -user <@1> -amount 5');
  });

  it('handles nickname mention format', () => {
    expect(injectPositionalFlags('<@!42> 10', SPEC)).toBe(' -user <@!42> -amount 10');
  });

  it('passes through when flags already present', () => {
    expect(injectPositionalFlags('-user <@1> -amount 5', SPEC)).toBe(' -user <@1> -amount 5');
  });
});
