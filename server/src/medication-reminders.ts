import { randomUUID } from 'node:crypto';
import prisma from './db.js';
import { dueSlots, parseSchedule } from './medication-schedule.js';
import { medicationRecipients } from './medication-agenda.js';
import { medicationEmailConfigured, sendMedicationReminderEmail } from './email.js';

/** Injetar sender nos testes: nunca usa contas/serviços reais em CI. */
export async function dispatchMedicationReminders(now = new Date(), sender = sendMedicationReminderEmail) {
  const schedules = await prisma.medicationSchedule.findMany({ where: { active: true, alertsEnabled: true, patient: { archived: false, medicationAlertsEnabled: true } }, include: { patient: true } });
  let accepted = 0;
  for (const schedule of schedules) {
    let input;
    try { input = parseSchedule(schedule); } catch { continue; }
    const recipients = (await medicationRecipients(schedule.patientId)).filter(user => input.recipientIds.includes(user.id));
    for (const slot of dueSlots(input, now)) for (const recipient of recipients) {
      const delivery = await prisma.$transaction(async tx => {
        const key = `${schedule.id}:${recipient.id}:${slot.slotKey}`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text AS locked`;
        const existing = await tx.medicationReminderDelivery.findUnique({ where: { scheduleId_userId_slotKey: { scheduleId: schedule.id, userId: recipient.id, slotKey: slot.slotKey } } });
        if (existing && (existing.status === 'sent' || existing.status === 'skipped' || existing.attempts >= 3 || existing.leaseUntil > now)) return null;
        const leaseUntil = new Date(now.getTime() + 120000);
        if (existing) return tx.medicationReminderDelivery.update({ where: { id: existing.id }, data: { status: 'pending', leaseUntil, attempts: { increment: 1 } } });
        return tx.medicationReminderDelivery.create({ data: { id: randomUUID(), scheduleId: schedule.id, userId: recipient.id, slotKey: slot.slotKey, dueAt: slot.dueAt, leaseUntil } });
      });
      if (!delivery) continue;
      try {
        // Revalida desligamento/edição e acesso antes de enviar, inclusive após reserva.
        const current = await prisma.medicationSchedule.findUnique({ where: { id: schedule.id }, include: { patient: true } });
        const currentRecipient = (await medicationRecipients(schedule.patientId)).find(user => user.id === recipient.id);
        if (!current || !current.active || !current.alertsEnabled || !current.patient.medicationAlertsEnabled || current.patient.archived || current.updatedAt.getTime() !== schedule.updatedAt.getTime() || !currentRecipient) {
          await prisma.medicationReminderDelivery.update({ where: { id: delivery.id }, data: { status: 'skipped' } });
          continue;
        }
        await sender({ to: currentRecipient!.email, patientName: current.patient.name, name: current.name, dose: current.dose, date: slot.localDate, time: slot.time, timezone: current.timezone });
        await prisma.medicationReminderDelivery.update({ where: { id: delivery.id }, data: { status: 'sent', sentAt: now } });
        accepted++;
      } catch {
        await prisma.medicationReminderDelivery.update({ where: { id: delivery.id }, data: { status: 'failed', leaseUntil: new Date(now.getTime() + 60000) } });
        console.warn('MyDoctor: falha em lembrete; tentativa será repetida dentro da janela.', { deliveryId: delivery.id });
      }
    }
  }
  // Metadados de entrega não mantêm conteúdo de e-mails; retenção de 90 dias.
  await prisma.medicationReminderDelivery.deleteMany({ where: { dueAt: { lt: new Date(now.getTime() - 90 * 86400000) } } });
  return accepted;
}

export function startMedicationReminders() {
  if (process.env.MEDICATION_REMINDERS_ENABLED !== 'true' || process.env.NODE_ENV !== 'production') return;
  if (!medicationEmailConfigured()) { console.warn('MyDoctor: lembretes aguardam configuração de e-mail.'); return; }
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await dispatchMedicationReminders(); }
    catch { console.warn('MyDoctor: serviço de lembretes indisponível neste ciclo.'); }
    finally { running = false; }
  };
  void tick();
  setInterval(() => void tick(), 60000).unref();
}
