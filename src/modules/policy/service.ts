import { normalizeCommandName, normalizeSubcommandName } from './normalization.js';
import { PolicyRepository } from './repository.js';
import {
  AddPolicyInput,
  CommandPolicyEntry,
  CommandPolicyScope,
  PolicyEvaluationInput,
  PolicyEvaluationResult,
  RemovePolicyInput
} from './types.js';

export class PolicyService {
  constructor(private readonly policyRepo: PolicyRepository) {}

  addPolicy(input: AddPolicyInput): { ok: boolean; reason?: string } {
    const command = normalizeCommandName(input.command);
    const subcommand = normalizeSubcommandName(input.subcommand);

    if (command.length === 0) {
      return { ok: false, reason: 'Command is required.' };
    }

    const targetId = this.normalizeTarget(input.scope, input.targetId);
    if (targetId === undefined) {
      return { ok: false, reason: `Target is required for scope ${input.scope}.` };
    }

    const inserted = this.policyRepo.addPolicy({
      ...input,
      command,
      subcommand,
      targetId
    });

    if (!inserted) {
      return { ok: false, reason: 'Policy already exists.' };
    }

    return { ok: true };
  }

  removePolicy(input: RemovePolicyInput): { ok: boolean; reason?: string } {
    const command = normalizeCommandName(input.command);
    const subcommand = normalizeSubcommandName(input.subcommand);

    if (command.length === 0) {
      return { ok: false, reason: 'Command is required.' };
    }

    const targetId = this.normalizeTarget(input.scope, input.targetId);
    if (targetId === undefined) {
      return { ok: false, reason: `Target is required for scope ${input.scope}.` };
    }

    const removed = this.policyRepo.removePolicy({
      ...input,
      command,
      subcommand,
      targetId
    });

    return removed ? { ok: true } : { ok: false, reason: 'Policy not found.' };
  }

  listPolicies(guildId: string, command?: string, subcommand?: string | null): CommandPolicyEntry[] {
    const normalizedCommand = command ? normalizeCommandName(command) : undefined;
    const normalizedSubcommand =
      typeof subcommand === 'undefined' ? undefined : normalizeSubcommandName(subcommand);

    return this.policyRepo.listPolicies(guildId, normalizedCommand, normalizedSubcommand);
  }

  evaluate(input: PolicyEvaluationInput): PolicyEvaluationResult {
    const command = normalizeCommandName(input.command);
    const subcommand = normalizeSubcommandName(input.subcommand);

    if (command.length === 0) {
      return { allowed: true };
    }

    const policies = this.policyRepo.getApplicablePolicies(input.guildId, command, subcommand);
    if (policies.length === 0) {
      return { allowed: true };
    }

    const matches = (policy: CommandPolicyEntry): boolean => {
      switch (policy.scope) {
        case 'guild':
          return true;
        case 'channel':
          return Boolean(policy.targetId) && policy.targetId === input.channelId;
        case 'user':
          return Boolean(policy.targetId) && policy.targetId === input.userId;
        case 'role':
          return policy.targetId ? input.roleIds.includes(policy.targetId) : false;
      }
    };

    const denyMatched = policies.some((policy) => policy.action === 'deny' && matches(policy));
    if (denyMatched) {
      return { allowed: false, reason: 'deny_match' };
    }

    const allowPolicies = policies.filter((policy) => policy.action === 'allow');
    if (allowPolicies.length === 0) {
      return { allowed: true };
    }

    const allowMatched = allowPolicies.some(matches);
    if (!allowMatched) {
      return { allowed: false, reason: 'allow_required' };
    }

    return { allowed: true };
  }

  private normalizeTarget(scope: CommandPolicyScope, targetId: string | null): string | null | undefined {
    if (scope === 'guild') {
      return null;
    }

    const normalized = targetId?.trim() ?? '';
    if (normalized.length === 0) {
      return undefined;
    }

    return normalized;
  }
}
