export interface ScheduleInput {
  name: string; dose: string; weekdays: number[]; times: string[]; timezone: string;
  continuousUse?: boolean; startsOn: string; endsOn: string | null; recipientIds: string[]; alertsEnabled: boolean;
}
function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function parseSchedule(body: any): ScheduleInput {
  const name = String(body?.name ?? '').trim();
  const dose = String(body?.dose ?? '').trim();
  const weekdays = Array.isArray(body?.weekdays) ? [...new Set(body.weekdays)] as number[] : [];
  const times = Array.isArray(body?.times) ? [...new Set(body.times)] as string[] : [];
  const recipientIds = Array.isArray(body?.recipientIds) ? [...new Set(body.recipientIds)] as string[] : [];
  const timezone = String(body?.timezone ?? 'America/Sao_Paulo');
  const continuousUse = body?.continuousUse === true;
  let startsOn = String(body?.startsOn ?? '');
  const endsOn = continuousUse ? null : body?.endsOn ? String(body.endsOn) : null;
  if (!name || name.length > 150 || dose.length > 150) throw new Error('Informe o medicamento e uma descrição com até 150 caracteres.');
  if (!weekdays.length || weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error('Escolha os dias da semana.');
  if (!times.length || times.length > 12 || times.some(time => typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) throw new Error('Informe de 1 a 12 horários válidos.');
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); } catch { throw new Error('Fuso horário inválido.'); }
  if (continuousUse) {
    // Data técnica gerada no servidor; uso contínuo não exige datas do usuário.
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value]));
    startsOn = validDate(startsOn) ? startsOn : `${parts.year}-${parts.month}-${parts.day}`;
  }
  if (!validDate(startsOn) || (endsOn && (!validDate(endsOn) || endsOn < startsOn))) throw new Error('Informe datas de início e término válidas.');
  if (recipientIds.length > 10 || recipientIds.some(id => typeof id !== 'string' || !id)) throw new Error('Destinatários inválidos.');
  if (body?.alertsEnabled === true && !recipientIds.length) throw new Error('Escolha quem receberá os alertas.');
  return { name, dose, continuousUse, weekdays: weekdays.sort(), times: times.sort(), timezone, startsOn, endsOn, recipientIds, alertsEnabled: body?.alertsEnabled === true };
}

/** A ocorrência segue o horário local do perfil, independentemente do relógio do servidor. */
export function dueSlots(schedule: ScheduleInput, now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: schedule.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const slots: Array<{ slotKey: string; dueAt: Date; localDate: string; time: string }> = [];
  for (let minute = 0; minute < 15; minute++) {
    const dueAt = new Date(Math.floor(now.getTime() / 60000) * 60000 - minute * 60000);
    const parts = Object.fromEntries(formatter.formatToParts(dueAt).map(part => [part.type, part.value]));
    const localDate = `${parts.year}-${parts.month}-${parts.day}`;
    const time = `${parts.hour}:${parts.minute}`;
    const weekday = new Date(localDate + 'T12:00:00Z').getUTCDay();
    if ((!schedule.continuousUse && (localDate < schedule.startsOn || (schedule.endsOn && localDate > schedule.endsOn))) || !schedule.weekdays.includes(weekday) || !schedule.times.includes(time)) continue;
    // Data/hora local como chave: uma única ocorrência mesmo em repetição de hora por DST.
    slots.push({ slotKey: `${localDate}T${time}@${schedule.timezone}`, dueAt, localDate, time });
  }
  return slots;
}

