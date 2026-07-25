import type { AccessRepo } from '../storage/access-repo';
import type { UsageRepo } from '../storage/usage-repo';
import type { RateLimiter } from './rate-limiter';

export type Ref = { platform: string; platformUserId: string };

export type GateConfig = {
  accessMode: 'allowlist' | 'open';
  ownerRef?: Ref;
  maxInputChars: number;
  dailyMsgQuota: number;
};

export type GateResult = { ok: true } | { ok: false; reply: string };

export class Gate {
  constructor(
    private readonly access: AccessRepo,
    private readonly usage: UsageRepo,
    private readonly limiter: RateLimiter,
    private readonly config: GateConfig,
    private readonly now: () => Date,
  ) {}

  check(ref: Ref, text: string): GateResult {
    const { accessMode, ownerRef, maxInputChars, dailyMsgQuota } = this.config;

    // 1. Length cap — reject before recording any usage.
    if (text.length > maxInputChars) {
      return {
        ok: false,
        reply: `That message is too long — keep it under ${maxInputChars} characters.`,
      };
    }

    const isOwner =
      !!ownerRef &&
      ref.platform === ownerRef.platform &&
      ref.platformUserId === ownerRef.platformUserId;

    // 2. Revoked access (owner is never locked out).
    if (!isOwner && this.access.getStatus(ref.platform, ref.platformUserId) === 'revoked') {
      return { ok: false, reply: 'Your access has been revoked.' };
    }

    // 3. Allowlist mode — non-owners must be explicitly approved.
    if (
      accessMode === 'allowlist' &&
      !isOwner &&
      this.access.getStatus(ref.platform, ref.platformUserId) !== 'approved'
    ) {
      return { ok: false, reply: 'This bot is private. Ask the operator for access.' };
    }

    // 4. Rate limit.
    const key = ref.platform + ':' + ref.platformUserId;
    if (!this.limiter.allow(key)) {
      return { ok: false, reply: 'Slow down a moment and try again.' };
    }

    // 5. Daily quota (owner is exempt).
    const day = this.now().toISOString().slice(0, 10);
    if (!isOwner) {
      const { msgCount } = this.usage.get(ref.platform, ref.platformUserId, day);
      if (msgCount >= dailyMsgQuota) {
        return { ok: false, reply: "You've hit today's limit — try again tomorrow." };
      }
    }

    // 6. Record the message and admit.
    this.usage.increment(ref.platform, ref.platformUserId, day, 'msg_count');
    return { ok: true };
  }
}
