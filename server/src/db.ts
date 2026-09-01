import { PrismaClient } from '@prisma/client';

/**
 * Um único PrismaClient por processo.
 * Em hospedagens compartilhadas/restritas, múltiplas instâncias podem criar
 * engines/threads adicionais e provocar PANIC "timer has gone away".
 */
export const prisma = new PrismaClient();
