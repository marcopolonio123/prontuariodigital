/** Idade em anos completos na data corrente do Brasil. Sem depender do fuso do servidor. */
export function isUnder18(birthDate: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return false;
  const parsed = new Date(birthDate + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== birthDate) return false;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value);
  const [year, month, day] = birthDate.split('-').map(Number);
  const currentYear = value('year'), currentMonth = value('month'), currentDay = value('day');
  if (year < 1900 || year > currentYear || (year === currentYear && (month > currentMonth || (month === currentMonth && day > currentDay)))) return false;
  return currentYear - year - (currentMonth < month || (currentMonth === month && currentDay < day) ? 1 : 0) < 18;
}
