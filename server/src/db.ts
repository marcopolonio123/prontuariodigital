import { PrismaClient } from '@prisma/client';

/**
 * Um único PrismaClient por processo.
 * Em hospedagens compartilhadas/restritas, múltiplas instâncias podem criar
 * engines/threads adicionais e provocar PANIC "timer has gone away".
 */
export const prisma = new PrismaClient();

/**
 * Patch aditivo e idempotente para instalações antigas que ainda não receberam
 * as colunas relacionais mais recentes de HealthEvent. Não remove nem altera
 * dados existentes. Mantemos isto temporariamente enquanto o deploy de produção
 * não executa migrações Prisma automaticamente.
 *
 * IMPORTANTE: lock_timeout/statement_timeout evitam que um lock de DDL deixe
 * a aplicação presa durante o startup na hospedagem.
 */
export async function ensureRuntimeSchema(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '10s'");
    await tx.$executeRawUnsafe('ALTER TABLE "HealthEvent" ADD COLUMN IF NOT EXISTS "authoredByUserId" TEXT');
    await tx.$executeRawUnsafe('ALTER TABLE "HealthEvent" ADD COLUMN IF NOT EXISTS "accessGrantId" TEXT');
    await tx.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "HealthEvent_authoredByUserId_occurredAt_idx" ON "HealthEvent"("authoredByUserId", "occurredAt")');
    await tx.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "HealthEvent_accessGrantId_occurredAt_idx" ON "HealthEvent"("accessGrantId", "occurredAt")');
  });
}

export default prisma;
