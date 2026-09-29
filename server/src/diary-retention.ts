import prisma from './db.js';

export const DIARY_RETENTION_MS = 60 * 24 * 60 * 60 * 1000;
export type DiaryEntry = { at: string; text: string };

export function retainedDiaryEntries(payload: unknown, now = Date.now()): DiaryEntry[] {
  const entries = (payload as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(entries)) return [];
  const cutoff = now - DIARY_RETENTION_MS;
  return entries.filter((entry): entry is DiaryEntry => typeof entry?.at === 'string' && typeof entry?.text === 'string' && Number.isFinite(Date.parse(entry.at)) && Date.parse(entry.at) >= cutoff);
}

/** Remove texto expirado e snapshots antigos; updatedAt evita sobrescrever uma edição concorrente. */
export async function purgeExpiredDiary(patientId?: string, now = Date.now()) {
  const events = await prisma.healthEvent.findMany({ where: { type: 'wellbeing_diary', ...(patientId ? { patientId } : {}) }, select: { id: true, payload: true, updatedAt: true, provenance: true } });
  for (const event of events) {
    const entries = retainedDiaryEntries(event.payload, now);
    if (!entries.length) {
      await prisma.healthEvent.deleteMany({ where: { id: event.id, updatedAt: event.updatedAt } });
    } else {
      const payload = event.payload as Record<string, unknown>;
      if (JSON.stringify(entries) !== JSON.stringify(payload.entries) || event.provenance) {
        await prisma.healthEvent.updateMany({ where: { id: event.id, updatedAt: event.updatedAt }, data: { payload: { ...payload, entries }, provenance: {} } });
      }
    }
  }
}
