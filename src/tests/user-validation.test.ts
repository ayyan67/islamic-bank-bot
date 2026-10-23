import { describe, expect, it } from 'vitest';
import { isDeletedDiscordAccount } from '../infra/discord/userValidation.js';

describe('isDeletedDiscordAccount', () => {
  it('detects the standard deleted-user profile shape', () => {
    expect(
      isDeletedDiscordAccount({
        id: 'user-1',
        username: 'deleted_user_abcd1234',
        avatar: null,
        global_name: null
      })
    ).toBe(true);
  });

  it('treats stripped spammer-flagged profiles as deleted-like ghosts', () => {
    expect(
      isDeletedDiscordAccount({
        id: 'user-2',
        username: 'someuser',
        avatar: null,
        global_name: null,
        public_flags: 1 << 20
      })
    ).toBe(true);
  });

  it('keeps normal users', () => {
    expect(
      isDeletedDiscordAccount({
        id: 'user-3',
        username: 'valid-user',
        avatar: 'hash',
        global_name: 'Valid User'
      })
    ).toBe(false);
  });
});
