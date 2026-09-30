import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import prisma from './db.js';

export interface ConsultantPolicy { limit: number; windowHours: number; }
export interface UsageRow { status: string; completedAt: Date | null; leaseUntil: Date; }
export function usageSummary(rows: UsageRow[], policy: ConsultantPolicy, now = new Date()) {
  const cutoff = now.getTime() - policy.windowHours * 3_600_000;
  const completed = rows.filter(row => row.status === 'completed' && row.completedAt && row.completedAt.getTime() > cutoff);
  const pending = rows.filter(row => row.status === 'pending' && row.leaseUntil > now);
  const releases = [...completed.map(row => row.completedAt!.getTime() + policy.windowHours * 3_600_000), ...pending.map(row => row.leaseUntil.getTime())];
  return { ...policy, used: completed.length, pending: pending.length, remaining: Math.max(0, policy.limit - completed.length - pending.length),
    nextAvailableAt: releases.length ? new Date(Math.min(...releases)).toISOString() : null,
    countingRule: 'answered_messages', scope: 'account', renewal: 'rolling' };
}

function positiveInt(value: unknown, fallback: number, maximum: number) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= maximum ? number : fallback;
}

export async function consultantPolicy(userId: string): Promise<ConsultantPolicy> {
  const now = new Date();
  const subscription = await prisma.subscription.findFirst({
    where: { userId, status: { in: ['active', 'trialing'] }, plan: { active: true },
      AND: [{ OR: [{ currentPeriodEndsAt: null }, { currentPeriodEndsAt: { gt: now } }] },
        { OR: [{ status: 'active' }, { trialEndsAt: null }, { trialEndsAt: { gt: now } }] }] },
    orderBy: { createdAt: 'desc' }, include: { plan: { include: { entitlements: true } } },
  });
  const entitlements = new Map(subscription?.plan.entitlements.map(item => [item.key, item.value]));
  return {
    limit: positiveInt(entitlements.get('consultant.responses.max'), positiveInt(process.env.CONSULTANT_RESPONSE_LIMIT, 20, 10000), 10000),
    windowHours: positiveInt(entitlements.get('consultant.window.hours'), positiveInt(process.env.CONSULTANT_WINDOW_HOURS, 24, 720), 720),
  };
}

async function currentRows(tx: Prisma.TransactionClient, userId: string, policy: ConsultantPolicy, now: Date) {
  return tx.consultantUsage.findMany({ where: { userId, OR: [
    { status: 'completed', completedAt: { gt: new Date(now.getTime() - policy.windowHours * 3_600_000) } },
    { status: 'pending', leaseUntil: { gt: now } },
  ] }, select: { status: true, completedAt: true, leaseUntil: true } });
}

export async function getConsultantUsage(userId: string, policy: ConsultantPolicy) {
  const now = new Date();
  return usageSummary(await currentRows(prisma, userId, policy, now), policy, now);
}

export async function reserveConsultantResponse(userId: string, policy: ConsultantPolicy) {
  return prisma.$transaction(async tx => {
    // Serializa reservas entre processos/dispositivos usando um lock por conta.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))::text AS locked`;
    const now = new Date();
    const usage = usageSummary(await currentRows(tx, userId, policy, now), policy, now);
    if (!usage.remaining) return { reservationId: null, usage };
    const id = randomUUID();
    await tx.consultantUsage.create({ data: { id, userId, leaseUntil: new Date(now.getTime() + 120_000) } });
    // Remove somente metadados já expirados; preserva até a maior janela suportada.
    await tx.consultantUsage.deleteMany({ where: { userId, OR: [
      { status: 'pending', leaseUntil: { lte: now } },
      { status: 'completed', completedAt: { lte: new Date(now.getTime() - 720 * 3_600_000) } },
    ] } });
    return { reservationId: id, usage };
  });
}

export async function completeConsultantResponse(id: string) {
  await prisma.consultantUsage.update({ where: { id }, data: { status: 'completed', completedAt: new Date() } });
}
export async function releaseConsultantResponse(id: string) {
  await prisma.consultantUsage.deleteMany({ where: { id, status: 'pending' } });
}
