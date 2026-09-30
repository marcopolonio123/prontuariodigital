import { useEffect, useState } from 'react';
import type { MedicationAgendaV1, MedicationScheduleInput, MedicationScheduleV1, MyDoctorV1Api, PatientProfile } from '../lib/api-v1';

const days: Array<[number, string]> = [[1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb'], [0, 'Dom']];
const inputClass = 'mt-2 block w-full min-w-0 rounded-xl border border-line bg-white px-3 py-3 text-sm text-ink outline-none focus:border-moss-500 focus:ring-2 focus:ring-moss-100';
const buttonClass = 'rounded-xl bg-pine-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50';
const secondaryClass = 'rounded-xl border border-line px-3 py-2 text-sm font-bold text-moss-800 disabled:opacity-50';
function normalized(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' '); }
function blank(): MedicationScheduleInput {
  const now = new Date();
  const date = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return { name: '', dose: '', weekdays: [0, 1, 2, 3, 4, 5, 6], times: ['08:00'], timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo', startsOn: date, endsOn: null, recipientIds: [], alertsEnabled: false };
}
export default function MedicationAgenda({ api, profile }: { api: MyDoctorV1Api; profile: PatientProfile }) {
  const [agenda, setAgenda] = useState<MedicationAgendaV1 | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<MedicationScheduleV1 | null>(null);
  const [form, setForm] = useState<MedicationScheduleInput | null>(null);
  const [feedback, setFeedback] = useState('');
  const refresh = async () => setAgenda(await api.getMedicationAgenda(profile.id));
  useEffect(() => {
    let current = true;
    api.getMedicationAgenda(profile.id).then(value => { if (current) setAgenda(value); }).catch(() => { if (current) setError('A agenda ainda não está disponível neste servidor. Tente novamente após a atualização do serviço.'); });
    return () => { current = false; };
  }, [api, profile.id]);
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(''); setFeedback('');
    try { await work(); } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  };
  const save = () => run(async () => {
    if (!form) return;
    await api.saveMedicationSchedule(profile.id, form, editing ?? undefined);
    await refresh(); setForm(null); setEditing(null); setFeedback('Agenda salva.');
  });
  return <div className="mx-auto max-w-4xl space-y-5">
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-widest text-moss-700">Medicamentos</p>
          <h2 className="mt-1 font-display text-3xl font-bold text-ink">Sua agenda</h2>
          <p className="mt-2 text-sm text-mute">{profile.name} · dias e horários conforme a prescrição</p></div>
        {agenda?.canEdit && <button className={buttonClass} disabled={busy} onClick={() => { setEditing(null); setForm(blank()); setFeedback(''); }}>+ Novo medicamento</button>}
      </div>
      {agenda && <>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-sm text-mute"><strong className="text-ink">{agenda.schedules.length}</strong> {agenda.schedules.length === 1 ? 'medicamento agendado' : 'medicamentos agendados'}</p>
          <label className="flex cursor-pointer items-center gap-2 rounded-full bg-paper px-3 py-2 text-sm font-semibold text-moss-800">
            <input type="checkbox" checked={agenda.alertsEnabled} disabled={busy || !agenda.canEdit} onChange={e => { const enabled = e.target.checked; void run(async () => { await api.setMedicationAlerts(profile.id, enabled); await refresh(); setFeedback(enabled ? 'Preferência de alertas ativada.' : 'Preferência de alertas desativada.'); }); }} />
            Alertas no app {agenda.alertsEnabled ? 'ativados' : 'desativados'}
          </label>
        </div>
        <p className="mt-3 text-xs leading-5 text-mute">Os alertas no celular serão disponibilizados com o aplicativo mobile. Por enquanto, salve sua agenda e escolha quem receberá as notificações.</p>
        {!agenda.canEdit && <p className="mt-2 text-xs text-mute">Agenda compartilhada para consulta. O responsável pelo cadastro gerencia os horários.</p>}
      </>}
      {!agenda && !error && <p className="mt-4 text-sm text-mute">Carregando agenda...</p>}
      {(error || feedback) && <p role="status" className="mt-3 rounded-xl border border-line bg-paper p-3 text-sm">{error || feedback}</p>}
    </section>
    {!!agenda?.registeredMedications?.length && <details className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <summary className="cursor-pointer text-sm font-bold text-moss-800">Usar medicamentos do prontuário ({agenda.registeredMedications.length})</summary>
      <p className="mt-2 text-sm text-mute">Escolha um medicamento já registrado para preencher nome e dose. Depois, confirme os horários da prescrição.</p>
      <div className="mt-3 space-y-3">{agenda.registeredMedications.map((medicine, index) => {
        const matching = agenda.schedules.filter(schedule => normalized(schedule.name) === normalized(medicine.name));
        const differentDose = matching.some(schedule => normalized(schedule.dose) !== normalized(medicine.dose));
        return <div key={index} className="rounded-xl border border-line p-3 text-sm">
          <strong>{medicine.name}</strong><p>{medicine.dose || 'Dose não registrada'}{medicine.frequency ? ' · ' + medicine.frequency : ''}</p>
          {matching.length > 0 && <p className="mt-1 text-mute">Já possui {matching.length} agenda(s). Consulte os horários abaixo antes de criar outra.</p>}
          {differentDose && <p className="mt-1 text-warn-600">A dose na agenda difere do prontuário. Confira a prescrição com o profissional antes de ajustar os registros.</p>}
          {agenda.canEdit && matching.length === 0 && <button className={secondaryClass + ' mt-2'} disabled={busy} onClick={() => { setEditing(null); setForm({ ...blank(), name: medicine.name, dose: medicine.dose }); setFeedback('Confirme os dias e horários conforme a prescrição antes de salvar.'); }}>Agendar este medicamento</button>}
        </div>;
      })}</div>
    </details>}
    {form && agenda?.canEdit && <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-moss-700">Organize seu tratamento</p><h3 className="mt-1 font-display text-2xl font-bold">{editing ? 'Editar medicamento' : 'Novo medicamento'}</h3>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <p className="border-b border-line pb-2 text-sm font-bold text-ink sm:col-span-2">1. Medicamento e dose</p>
        <label className="text-xs font-bold text-mute">Medicamento<input value={form.name} maxLength={150} onChange={e => setForm({ ...form, name: e.target.value })} className={inputClass} /></label>
        <label className="text-xs font-bold text-mute">Dose prescrita (opcional)<input value={form.dose} maxLength={150} onChange={e => setForm({ ...form, dose: e.target.value })} className={inputClass} /></label>
        <p className="border-b border-line pb-2 pt-2 text-sm font-bold text-ink sm:col-span-2">2. Dias e horários</p><fieldset className="sm:col-span-2"><legend className="text-xs font-bold text-mute">Dias da semana</legend><button type="button" className="mt-2 text-xs font-bold text-moss-700 underline" onClick={() => setForm({ ...form, weekdays: [0, 1, 2, 3, 4, 5, 6] })}>Todos os dias</button><div className="mt-2 flex flex-wrap gap-2">{days.map(([day, label]) => <label key={day} className={`flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border px-3 focus-within:ring-2 focus-within:ring-moss-500 py-2 text-sm font-bold transition-colors ${form.weekdays.includes(day) ? 'border-moss-500 bg-moss-50 text-moss-800' : 'border-line bg-white text-mute'}`}><input className="sr-only" type="checkbox" checked={form.weekdays.includes(day)} onChange={e => setForm({ ...form, weekdays: e.target.checked ? [...form.weekdays, day] : form.weekdays.filter(value => value !== day) })} />{label}</label>)}</div></fieldset>
        <fieldset className="sm:col-span-2"><legend className="text-xs font-bold text-mute">Horários</legend><div className="mt-2 flex flex-wrap gap-2">{form.times.map((time, index) => <div key={index} className="flex items-center gap-1"><input aria-label={`Horário ${index + 1}`} type="time" value={time} className="min-w-0 rounded-xl border border-line bg-paper px-3 py-3 text-lg font-bold text-ink" onChange={e => setForm({ ...form, times: form.times.map((value, i) => i === index ? e.target.value : value) })} /><button type="button" aria-label={`Remover horário ${index + 1}`} disabled={form.times.length === 1} className={secondaryClass} onClick={() => setForm({ ...form, times: form.times.filter((_, i) => i !== index) })}>×</button></div>)}{form.times.length < 12 && <button type="button" className={secondaryClass} onClick={() => setForm({ ...form, times: [...form.times, '12:00'] })}>+ Horário</button>}</div></fieldset>
        <p className="border-b border-line pb-2 pt-2 text-sm font-bold text-ink sm:col-span-2">3. Período do tratamento</p><label className="text-xs font-bold text-mute">Início<input type="date" value={form.startsOn} className={inputClass} onChange={e => setForm({ ...form, startsOn: e.target.value })} /></label>
        <label className="text-xs font-bold text-mute">Término (opcional)<input type="date" value={form.endsOn ?? ''} min={form.startsOn} className={inputClass} onChange={e => setForm({ ...form, endsOn: e.target.value || null })} /></label>
        <label className="text-xs font-bold text-mute sm:col-span-2">Fuso dos horários<select className={inputClass} value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })}>{[...new Set([form.timezone, 'America/Sao_Paulo', 'America/Manaus', 'America/Cuiaba', 'America/Porto_Velho', 'America/Rio_Branco', 'America/Noronha'])].map(zone => <option key={zone} value={zone}>{zone.replace('America/', '').replace(/_/g, ' ')}</option>)}</select></label>
        <p className="border-b border-line pb-2 pt-2 text-sm font-bold text-ink sm:col-span-2">4. Alertas no aplicativo</p><label className="flex items-center gap-3 rounded-xl bg-paper p-4 text-sm sm:col-span-2"><input type="checkbox" checked={form.alertsEnabled} onChange={e => setForm({ ...form, alertsEnabled: e.target.checked })} />Ativar alertas deste medicamento no aplicativo</label>
        {form.alertsEnabled && <fieldset className="sm:col-span-2"><legend className="text-xs font-bold text-mute">Quem receberá os alertas?</legend><p className="mt-1 text-xs text-mute">Selecione o paciente e/ou as pessoas responsáveis.</p><div className="mt-2 space-y-2">{agenda.recipients.map(person => <label key={person.id} className="flex items-start gap-2 rounded-lg border border-line p-3 text-sm"><input className="mt-1" type="checkbox" checked={form.recipientIds.includes(person.id)} onChange={e => setForm({ ...form, recipientIds: e.target.checked ? [...form.recipientIds, person.id] : form.recipientIds.filter(id => id !== person.id) })} /><span>{person.name}{person.owner ? ' — titular/responsável pelo cadastro' : ''}<br /><span className="text-xs text-mute">{person.emailMasked}</span></span></label>)}</div><p className="mt-2 text-xs text-mute">Para incluir outra pessoa, compartilhe o acesso a este perfil com a conta dela.</p></fieldset>}
        <div className="flex flex-wrap gap-3 border-t border-line pt-5 sm:col-span-2"><button className={buttonClass} disabled={busy} onClick={() => void save()}>{busy ? 'Salvando...' : editing ? 'Salvar alterações' : 'Adicionar à agenda'}</button><button className={secondaryClass} disabled={busy} onClick={() => { setForm(null); setEditing(null); }}>Cancelar</button></div>
      </div>
    </section>}
    {agenda?.schedules.length === 0 && <section className="rounded-2xl border border-dashed border-line p-5 text-sm text-mute">Sua agenda está vazia. Toque em “Novo medicamento” para incluir os dias e horários.</section>}
    <div className="grid gap-4 sm:grid-cols-2">{agenda?.schedules.map(schedule => <section key={schedule.id} className="min-w-0 overflow-hidden rounded-2xl border border-line bg-card p-5 shadow-sm">
      <div className="mb-4 h-1 w-10 rounded-full bg-moss-500" /><h3 className="break-words font-display text-xl font-bold text-ink">{schedule.name}</h3>
      {schedule.dose && <p className="mt-1 text-sm">{schedule.dose}</p>}
      <div className="mt-4 flex flex-wrap gap-2">{schedule.times.map(time => <span key={time} className="rounded-xl bg-moss-50 px-3 py-2 text-xl font-bold tracking-tight text-moss-800">{time}</span>)}</div><p className="mt-3 text-sm font-semibold text-ink">{schedule.weekdays.length === 7 ? 'Todos os dias' : days.filter(([day]) => schedule.weekdays.includes(day)).map(([, label]) => label).join(', ')}</p>
      <p className="mt-1 text-xs text-mute">{schedule.startsOn.split('-').reverse().join('/')}{schedule.endsOn ? ' até ' + schedule.endsOn.split('-').reverse().join('/') : ' — sem data de término'} · {schedule.timezone.replace('America/', '').replace(/_/g, ' ')}</p>
      <p className="mt-4 border-t border-line pt-3 text-xs text-mute">{schedule.alertsEnabled && agenda.alertsEnabled ? 'Alertas no app · preferência ativada' : 'Alertas desligados'}</p>
      <p className="mt-1 text-xs text-mute">Destinatários: {schedule.recipientIds.map(id => agenda.recipients.find(person => person.id === id)?.name ?? 'Conta sem acesso vigente').join(', ') || 'Nenhum selecionado'}</p>
      {agenda.canEdit && <div className="mt-4 flex flex-wrap gap-2"><button className={secondaryClass} disabled={busy} onClick={() => { setEditing(schedule); setForm({ name: schedule.name, dose: schedule.dose, weekdays: schedule.weekdays, times: schedule.times, timezone: schedule.timezone, startsOn: schedule.startsOn, endsOn: schedule.endsOn, recipientIds: schedule.recipientIds, alertsEnabled: schedule.alertsEnabled }); }}>Editar</button><button className={secondaryClass} disabled={busy} onClick={() => void run(async () => { if (!window.confirm(`Remover ${schedule.name} da agenda e interromper seus alertas?`)) return; await api.removeMedicationSchedule(profile.id, schedule.id); await refresh(); if (editing?.id === schedule.id) { setEditing(null); setForm(null); } setFeedback('Medicamento removido da agenda.'); })}>Remover</button></div>}
    </section>)}</div>
  </div>;
}


