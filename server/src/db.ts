import { PrismaClient } from '@prisma/client';

/**
 * Um único PrismaClient por processo.
 * Em hospedagens compartilhadas/restritas, múltiplas instâncias podem criar
 * engines/threads adicionais e provocar PANIC "timer has gone away".
 */
export const prisma = new PrismaClient();

/**
 * Patch aditivo e idempotente para instalações antigas que ainda não receberam
 * a coluna de autoria do HealthEvent. Não remove nem altera dados existentes.
 * Mantemos isto temporariamente enquanto o deploy de produção não executa
 * migrações Prisma automaticamente.
 */
export async function ensureRuntimeSchema(): Promise<void> {
  await prisma.$executeRawUnsafe('ALTER TABLE "HealthEvent" ADD COLUMN IF NOT EXISTS "authoredByUserId" TEXT');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "HealthEvent_authoredByUserId_occurredAt_idx" ON "HealthEvent"("authoredByUserId", "occurredAt")');
}

export default prisma;
