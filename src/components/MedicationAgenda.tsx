import { useEffect, useState } from 'react';
import type { MedicationAgendaV1, MedicationScheduleInput, MedicationScheduleV1, MyDoctorV1Api, PatientProfile } from '../lib/api-v1';

const days: Array<[number, string]> = [[1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb'], [0, 'Dom']];
const inputClass = 'mt-1 block w-full rounded-xl border border-line bg-white px-3 py-3 text-sm';
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
  return <div className="space-y-4">
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <p className="text-xs font-bold uppercase text-moss-700">Agenda de medicamentos</p>
      <h2 className="mt-1 font-display text-2xl font-bold text-ink">{profile.name}</h2>
      <p className="mt-2 text-sm text-mute">Cadastre os dias e horários conforme a prescrição. Cada perfil, inclusive dependentes, tem sua própria agenda.</p>
      {agenda && <>
        <label className="mt-4 flex items-start gap-3 rounded-xl border border-line bg-paper p-3 text-sm"><input type="checkbox" className="mt-1" checked={agenda.alertsEnabled} disabled={busy || !agenda.canEdit} onChange={e => { const enabled = e.target.checked; void run(async () => { await api.setMedicationAlerts(profile.id, enabled); await refresh(); setFeedback(enabled ? 'Avisos deste perfil ligados.' : 'Todos os avisos deste perfil desligados.'); }); }} /><span><strong>Avisos deste perfil {agenda.alertsEnabled ? 'ligados' : 'desligados'}</strong><br /><span className="text-mute">Desligar interrompe os lembretes para todas as pessoas selecionadas e mantém os horários cadastrados.</span></span></label>
        <p className="mt-3 text-sm text-mute">Nesta versão, os lembretes são por e-mail. O envio é feito pelo servidor, mesmo com o site fechado. Notificações no celular serão integradas na etapa mobile.</p>
        {!agenda.deliveryAvailable && <p className="mt-2 rounded-xl bg-warn-100 p-3 text-sm text-warn-600">O envio de avisos aguarda ativação pelo administrador. Você pode salvar a agenda, mas os e-mails ainda não serão enviados.</p>}
        {agenda.canEdit && <button className={`${buttonClass} mt-4`} disabled={busy} onClick={() => { setEditing(null); setForm(blank()); setFeedback(''); }}>+ Cadastrar medicamento</button>}
        {!agenda.canEdit && <p className="mt-3 text-sm text-mute">Você pode consultar esta agenda. O titular/responsável pelo cadastro gerencia os horários e avisos.</p>}
      </>}
      {!agenda && !error && <p className="mt-4 text-sm text-mute">Carregando agenda...</p>}
      {(error || feedback) && <p role="status" className="mt-3 rounded-xl border border-line bg-paper p-3 text-sm">{error || feedback}</p>}
    </section>
    {!!agenda?.registeredMedications?.length && <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <h3 className="font-display text-xl font-bold">Medicamentos do prontuário</h3>
      <p className="mt-2 text-sm text-mute">Use o cadastro existente para iniciar uma agenda e confirme os dias e horários da prescrição. Editar ou remover a agenda não altera o cadastro do prontuário.</p>
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
    </section>}
    {form && agenda?.canEdit && <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <h3 className="font-display text-xl font-bold">{editing ? 'Editar medicamento' : 'Novo medicamento'}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-mute">Medicamento<input value={form.name} maxLength={150} onChange={e => setForm({ ...form, name: e.target.value })} className={inputClass} /></label>
        <label className="text-xs font-bold text-mute">Dose conforme a prescrição (opcional)<input value={form.dose} maxLength={150} onChange={e => setForm({ ...form, dose: e.target.value })} className={inputClass} /></label>
        <fieldset className="sm:col-span-2"><legend className="text-xs font-bold text-mute">Dias da semana</legend><div className="mt-2 flex flex-wrap gap-2">{days.map(([day, label]) => <label key={day} className="flex gap-2 rounded-lg border border-line p-2 text-sm"><input type="checkbox" checked={form.weekdays.includes(day)} onChange={e => setForm({ ...form, weekdays: e.target.checked ? [...form.weekdays, day] : form.weekdays.filter(value => value !== day) })} />{label}</label>)}</div></fieldset>
        <fieldset className="sm:col-span-2"><legend className="text-xs font-bold text-mute">Horários</legend><div className="mt-2 flex flex-wrap gap-2">{form.times.map((time, index) => <div key={index} className="flex items-center gap-1"><input aria-label={`Horário ${index + 1}`} type="time" value={time} className="rounded-lg border border-line p-2" onChange={e => setForm({ ...form, times: form.times.map((value, i) => i === index ? e.target.value : value) })} /><button type="button" aria-label={`Remover horário ${index + 1}`} disabled={form.times.length === 1} className={secondaryClass} onClick={() => setForm({ ...form, times: form.times.filter((_, i) => i !== index) })}>×</button></div>)}{form.times.length < 12 && <button type="button" className={secondaryClass} onClick={() => setForm({ ...form, times: [...form.times, '12:00'] })}>+ Horário</button>}</div></fieldset>
        <label className="text-xs font-bold text-mute">Início<input type="date" value={form.startsOn} className={inputClass} onChange={e => setForm({ ...form, startsOn: e.target.value })} /></label>
        <label className="text-xs font-bold text-mute">Término (opcional)<input type="date" value={form.endsOn ?? ''} min={form.startsOn} className={inputClass} onChange={e => setForm({ ...form, endsOn: e.target.value || null })} /></label>
        <label className="text-xs font-bold text-mute sm:col-span-2">Fuso dos horários<select className={inputClass} value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })}>{[...new Set([form.timezone, 'America/Sao_Paulo', 'America/Manaus', 'America/Cuiaba', 'America/Porto_Velho', 'America/Rio_Branco', 'America/Noronha'])].map(zone => <option key={zone} value={zone}>{zone.replace('America/', '').replace(/_/g, ' ')}</option>)}</select></label>
        <label className="flex gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={form.alertsEnabled} onChange={e => setForm({ ...form, alertsEnabled: e.target.checked })} />Enviar lembretes deste medicamento</label>
        <fieldset className="sm:col-span-2"><legend className="text-xs font-bold text-mute">Quem recebe os avisos?</legend><p className="mt-1 text-xs text-mute">Selecione a conta da pessoa e/ou as pessoas responsáveis. São exibidas contas com acesso ao perfil e e-mail confirmado.</p><div className="mt-2 space-y-2">{agenda.recipients.map(person => <label key={person.id} className="flex items-start gap-2 rounded-lg border border-line p-3 text-sm"><input className="mt-1" type="checkbox" checked={form.recipientIds.includes(person.id)} onChange={e => setForm({ ...form, recipientIds: e.target.checked ? [...form.recipientIds, person.id] : form.recipientIds.filter(id => id !== person.id) })} /><span>{person.name}{person.owner ? ' — titular/responsável pelo cadastro' : ''}<br /><span className="text-xs text-mute">{person.emailMasked}</span></span></label>)}</div><p className="mt-2 text-xs text-mute">Se a pessoa não aparece, ela precisa de uma conta com acesso vigente ao perfil e confirmar o e-mail pelo login. O dependente pode ter uma conta própria; não basta cadastrar apenas o nome.</p></fieldset>
        <div className="flex flex-wrap gap-2 sm:col-span-2"><button className={buttonClass} disabled={busy} onClick={() => void save()}>{busy ? 'Salvando...' : 'Salvar agenda'}</button><button className={secondaryClass} disabled={busy} onClick={() => { setForm(null); setEditing(null); }}>Cancelar</button></div>
      </div>
    </section>}
    {agenda?.schedules.length === 0 && <section className="rounded-2xl border border-dashed border-line p-5 text-sm text-mute">Nenhum medicamento agendado neste perfil.</section>}
    {agenda?.schedules.map(schedule => <section key={schedule.id} className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <h3 className="font-display text-xl font-bold text-ink">{schedule.name}</h3>
      {schedule.dose && <p className="mt-1 text-sm">Dose registrada: {schedule.dose}</p>}
      <p className="mt-2 text-sm">{days.filter(([day]) => schedule.weekdays.includes(day)).map(([, label]) => label).join(', ')} — {schedule.times.join(', ')}</p>
      <p className="mt-1 text-xs text-mute">{schedule.startsOn.split('-').reverse().join('/')}{schedule.endsOn ? ' até ' + schedule.endsOn.split('-').reverse().join('/') : ' — sem data de término'} · {schedule.timezone.replace('America/', '').replace(/_/g, ' ')}</p>
      <p className="mt-2 text-sm text-mute">{schedule.alertsEnabled && agenda.alertsEnabled ? (agenda.deliveryAvailable ? 'Avisos habilitados' : 'Avisos configurados; aguardando ativação do serviço') : 'Avisos desligados'}</p>
      <p className="mt-1 text-xs text-mute">Destinatários: {schedule.recipientIds.map(id => agenda.recipients.find(person => person.id === id)?.name ?? 'Conta sem acesso ou e-mail confirmado').join(', ') || 'Nenhum selecionado'}</p>
      {agenda.canEdit && <div className="mt-3 flex flex-wrap gap-2"><button className={secondaryClass} disabled={busy} onClick={() => { setEditing(schedule); setForm({ name: schedule.name, dose: schedule.dose, weekdays: schedule.weekdays, times: schedule.times, timezone: schedule.timezone, startsOn: schedule.startsOn, endsOn: schedule.endsOn, recipientIds: schedule.recipientIds, alertsEnabled: schedule.alertsEnabled }); }}>Editar</button><button className={secondaryClass} disabled={busy} onClick={() => void run(async () => { if (!window.confirm(`Remover ${schedule.name} da agenda e interromper seus avisos?`)) return; await api.removeMedicationSchedule(profile.id, schedule.id); await refresh(); if (editing?.id === schedule.id) { setEditing(null); setForm(null); } setFeedback('Medicamento removido da agenda.'); })}>Remover da agenda</button></div>}
    </section>)}
  </div>;
}

