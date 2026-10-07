import PaginatedList from './PaginatedList';
import { useEffect, useState } from 'react';
import type { MedicationAgendaV1, MedicationScheduleInput, MedicationScheduleV1, MyDoctorV1Api, PatientProfile } from '../lib/api-v1';

const days: Array<[number, string]> = [[1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb'], [0, 'Dom']];
const inputClass = 'mt-1 block w-full min-w-0 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-moss-500 focus:ring-2 focus:ring-moss-100';
const buttonClass = 'min-h-11 rounded-lg bg-pine-900 px-3 py-2 md:min-h-0 text-sm font-bold text-white disabled:opacity-50';
const secondaryClass = 'min-h-11 rounded-lg border border-line px-3 py-2 md:min-h-0 text-sm font-bold text-moss-800 disabled:opacity-50';
const checkboxStyle = { width: 16, minWidth: 16, maxWidth: 16, height: 16, padding: 0, flex: '0 0 16px' };
function normalized(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' '); }
const emptyFilters=()=>({text:'',weekday:'',fromTime:'',toTime:'',use:'',alerts:'',recipient:'',date:''});
function blank(): MedicationScheduleInput {
  const now = new Date();
  const date = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return { name: '', dose: '', continuousUse: false, weekdays: [0, 1, 2, 3, 4, 5, 6], times: ['08:00'], timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo', startsOn: date, endsOn: null, recipientIds: [], alertsEnabled: false };
}
export default function MedicationAgenda({ api, profile }: { api: MyDoctorV1Api; profile: PatientProfile }) {
  const [agenda, setAgenda] = useState<MedicationAgendaV1 | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<MedicationScheduleV1 | null>(null);
  const [form, setForm] = useState<MedicationScheduleInput | null>(null);
  const [feedback, setFeedback] = useState('');
  const [filterDraft,setFilterDraft]=useState(emptyFilters);
  const [filters,setFilters]=useState(emptyFilters);
  const [filterError,setFilterError]=useState('');
  const activeFilter=Object.values(filters).some(Boolean);
  const filteredSchedules=(agenda?.schedules??[]).filter(schedule=>{
    const recipientNames=schedule.recipientIds.map(id=>agenda?.recipients.find(person=>person.id===id)?.name??'').join(' ');
    if(filters.text&&!normalized(schedule.name+' '+schedule.dose+' '+recipientNames).includes(normalized(filters.text)))return false;
    if(filters.weekday!==''&&!schedule.weekdays.includes(Number(filters.weekday)))return false;
    if((filters.fromTime||filters.toTime)&&!schedule.times.some(time=>(!filters.fromTime||time>=filters.fromTime)&&(!filters.toTime||time<=filters.toTime)))return false;
    if(filters.use==='continuous'&&!schedule.continuousUse||filters.use==='period'&&schedule.continuousUse)return false;
    const configured=schedule.alertsEnabled&&agenda?.alertsEnabled;
    if(filters.alerts==='on'&&!configured||filters.alerts==='off'&&configured)return false;
    if(filters.recipient&&!schedule.recipientIds.includes(filters.recipient))return false;
    if(filters.date&&!schedule.continuousUse&&(schedule.startsOn>filters.date||!!schedule.endsOn&&schedule.endsOn<filters.date))return false;
    return true;
  });
  const applyFilters=()=>{
    if(filterDraft.fromTime&&filterDraft.toTime&&filterDraft.fromTime>filterDraft.toTime){setFilterError('O horário final deve ser igual ou posterior ao inicial.');return;}
    setFilters({...filterDraft,text:filterDraft.text.trim()});setFilterError('');
  };
  const clearFilters=()=>{setFilterDraft(emptyFilters());setFilters(emptyFilters());setFilterError('')};
  useEffect(()=>{setFilterDraft(emptyFilters());setFilters(emptyFilters());setFilterError('')},[profile.id]);
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
    await api.saveMedicationSchedule(profile.id, form.continuousUse ? { ...form, startsOn: '', endsOn: null } : form, editing ?? undefined);
    await refresh(); setForm(null); setEditing(null); setFeedback('Agenda salva.');
  });
  return <div className="w-full min-w-0 space-y-3">
    <section className="rounded-xl border border-line bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="font-display text-xl font-bold text-ink">Agenda de medicamentos</h2><p className="mt-1 text-xs text-mute">{profile.name}</p></div>
        {agenda?.canEdit && <button className={buttonClass} disabled={busy} onClick={() => { setEditing(null); setForm(blank()); setFeedback(''); }}>+ Novo medicamento</button>}
      </div>
      {agenda && <>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
          <p className="text-sm text-mute"><strong className="text-ink">{agenda.schedules.length}</strong> {agenda.schedules.length === 1 ? 'medicamento agendado' : 'medicamentos agendados'}</p>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-paper px-2 py-1.5 text-xs font-semibold text-moss-800">
            <input style={checkboxStyle} type="checkbox" checked={agenda.alertsEnabled} disabled={busy || !agenda.canEdit} onChange={e => { const enabled = e.target.checked; void run(async () => { await api.setMedicationAlerts(profile.id, enabled); await refresh(); setFeedback(enabled ? 'Preferência de alertas ativada.' : 'Preferência de alertas desativada.'); }); }} />
            Alertas no app {agenda.alertsEnabled ? 'ativados' : 'desativados'}
          </label>
        </div>
        <p className="mt-2 text-xs leading-4 text-mute">Alertas no celular serão disponibilizados com o aplicativo mobile.</p>
        {!agenda.canEdit && <p className="mt-2 text-xs text-mute">Agenda compartilhada para consulta. O responsável pelo cadastro gerencia os horários.</p>}
      </>}
      {!agenda && !error && <p className="mt-4 text-sm text-mute">Carregando agenda...</p>}
      {(error || feedback) && <p role="status" className="mt-3 rounded-xl border border-line bg-paper p-3 text-sm">{error || feedback}</p>}
    </section>
    {agenda&&<details className="rounded-xl border border-line bg-card p-3 sm:p-4">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-bold text-moss-800"><span>Filtros de pesquisa</span>{activeFilter&&<span className="rounded-md bg-moss-50 px-2 py-1 text-xs">Filtro ativo</span>}<span className="ml-auto text-xs font-normal text-mute">{filteredSchedules.length} de {agenda.schedules.length} medicamentos</span></summary>
      <form className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={e=>{e.preventDefault();applyFilters()}}>
        <label className="min-w-0 text-xs font-bold text-mute sm:col-span-2">Pesquisar medicamento, dose ou responsável<input value={filterDraft.text} onChange={e=>setFilterDraft({...filterDraft,text:e.target.value})} className={inputClass}/></label>
        <label className="min-w-0 text-xs font-bold text-mute">Dia da semana<select value={filterDraft.weekday} onChange={e=>setFilterDraft({...filterDraft,weekday:e.target.value})} className={inputClass}><option value="">Todos os dias</option>{days.map(([day,label])=><option key={day} value={day}>{label}</option>)}</select></label>
        <label className="min-w-0 text-xs font-bold text-mute">Tipo de uso<select value={filterDraft.use} onChange={e=>setFilterDraft({...filterDraft,use:e.target.value})} className={inputClass}><option value="">Todos</option><option value="continuous">Uso contínuo</option><option value="period">Com período informado</option></select></label>
        <label className="min-w-0 text-xs font-bold text-mute">Horário a partir de<input type="time" value={filterDraft.fromTime} onChange={e=>setFilterDraft({...filterDraft,fromTime:e.target.value})} className={inputClass}/></label>
        <label className="min-w-0 text-xs font-bold text-mute">Horário até<input type="time" value={filterDraft.toTime} onChange={e=>setFilterDraft({...filterDraft,toTime:e.target.value})} className={inputClass}/></label>
        <label className="min-w-0 text-xs font-bold text-mute">Alertas configurados<select value={filterDraft.alerts} onChange={e=>setFilterDraft({...filterDraft,alerts:e.target.value})} className={inputClass}><option value="">Todos</option><option value="on">Configurados</option><option value="off">Desativados</option></select></label>
        <label className="min-w-0 text-xs font-bold text-mute">Destinatário dos alertas<select value={filterDraft.recipient} onChange={e=>setFilterDraft({...filterDraft,recipient:e.target.value})} className={inputClass}><option value="">Todos</option>{agenda.recipients.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        <label className="min-w-0 text-xs font-bold text-mute">Data no período de uso<input type="date" value={filterDraft.date} onChange={e=>setFilterDraft({...filterDraft,date:e.target.value})} className={inputClass}/></label>
        <p className="self-center text-xs text-mute sm:col-span-2 lg:col-span-3">Os filtros são combinados. A data verifica o período cadastrado e inclui medicamentos de uso contínuo; use Dia da semana para restringir os dias.</p>
        {filterError&&<p role="alert" className="text-sm text-danger-600 sm:col-span-2 lg:col-span-4">{filterError}</p>}
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4"><button type="submit" className={buttonClass}>Aplicar filtros</button><button type="button" className={secondaryClass} onClick={clearFilters}>Limpar filtros</button></div>
      </form>
    </details>}
    {!!agenda?.registeredMedications?.length && <details className="rounded-xl border border-line bg-card p-3 sm:p-4">
      <summary className="cursor-pointer text-sm font-bold text-moss-800">Usar medicamentos do prontuário ({agenda.registeredMedications.length})</summary>
      <p className="mt-2 text-sm text-mute">Escolha um medicamento já registrado para preencher nome e dose. Depois, confirme os horários da prescrição.</p>
      <div className="mt-2 space-y-2">{agenda.registeredMedications.map((medicine, index) => {
        const matching = agenda.schedules.filter(schedule => normalized(schedule.name) === normalized(medicine.name));
        const differentDose = matching.some(schedule => normalized(schedule.dose) !== normalized(medicine.dose));
        return <div key={index} className="rounded-lg border border-line p-2 text-sm">
          <strong>{medicine.name}</strong><p>{medicine.dose || 'Dose não registrada'}{medicine.frequency ? ' · ' + medicine.frequency : ''}</p>
          {matching.length > 0 && <p className="mt-1 text-mute">Já possui {matching.length} agenda(s). Consulte os horários abaixo antes de criar outra.</p>}
          {differentDose && <p className="mt-1 text-warn-600">A dose na agenda difere do prontuário. Confira a prescrição com o profissional antes de ajustar os registros.</p>}
          {agenda.canEdit && matching.length === 0 && <button className={secondaryClass + ' mt-2'} disabled={busy} onClick={() => { setEditing(null); setForm({ ...blank(), name: medicine.name, dose: medicine.dose }); setFeedback('Confirme os dias e horários conforme a prescrição antes de salvar.'); }}>Agendar este medicamento</button>}
        </div>;
      })}</div>
    </details>}
    {form && agenda?.canEdit && <section className="rounded-xl border border-line bg-card p-3 sm:p-4">
      <h3 className="font-display text-lg font-bold">{editing ? 'Editar medicamento' : 'Novo medicamento'}</h3>
      <div className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2">
        
        <label className="text-xs font-bold text-mute">Medicamento<input value={form.name} maxLength={150} onChange={e => setForm({ ...form, name: e.target.value })} className={inputClass} /></label>
        <label className="text-xs font-bold text-mute">Dose prescrita (opcional)<input value={form.dose} maxLength={150} onChange={e => setForm({ ...form, dose: e.target.value })} className={inputClass} /></label>
        <fieldset className="sm:col-span-2"><legend className="text-xs font-bold text-mute">Dias da semana</legend><button type="button" className="mt-2 text-xs font-bold text-moss-700 underline" onClick={() => setForm({ ...form, weekdays: [0, 1, 2, 3, 4, 5, 6] })}>Todos os dias</button><div className="mt-2 flex flex-wrap gap-2">{days.map(([day, label]) => <label key={day} className={`flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border px-3 focus-within:ring-2 focus-within:ring-moss-500 py-2 text-sm font-bold transition-colors ${form.weekdays.includes(day) ? 'border-moss-500 bg-moss-50 text-moss-800' : 'border-line bg-white text-mute'}`}><input className="sr-only" type="checkbox" checked={form.weekdays.includes(day)} onChange={e => setForm({ ...form, weekdays: e.target.checked ? [...form.weekdays, day] : form.weekdays.filter(value => value !== day) })} />{label}</label>)}</div></fieldset>
        <fieldset className="sm:col-span-2"><legend className="text-xs font-bold text-mute">Horários</legend><div className="mt-2 flex flex-wrap gap-2">{form.times.map((time, index) => <div key={index} className="flex items-center gap-1"><input aria-label={`Horário ${index + 1}`} type="time" value={time} className="min-w-0 rounded-lg border border-line bg-paper px-2 py-2 text-sm font-bold text-ink" onChange={e => setForm({ ...form, times: form.times.map((value, i) => i === index ? e.target.value : value) })} /><button type="button" aria-label={`Remover horário ${index + 1}`} disabled={form.times.length === 1} className={secondaryClass} onClick={() => setForm({ ...form, times: form.times.filter((_, i) => i !== index) })}>×</button></div>)}{form.times.length < 12 && <button type="button" className={secondaryClass} onClick={() => setForm({ ...form, times: [...form.times, '12:00'] })}>+ Horário</button>}</div></fieldset>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-paper p-2.5 text-sm sm:col-span-2"><input className="mt-0.5" style={checkboxStyle} type="checkbox" checked={form.continuousUse === true} onChange={e => setForm({ ...form, continuousUse: e.target.checked, endsOn: e.target.checked ? null : form.endsOn })} /><span><strong>Uso contínuo</strong><span className="mt-1 block text-xs text-mute">Repete nos dias e horários escolhidos, sem datas de início ou término.</span></span></label>{!form.continuousUse && <><label className="text-xs font-bold text-mute">Início<input type="date" value={form.startsOn} className={inputClass} onChange={e => setForm({ ...form, startsOn: e.target.value })} /></label>
        <label className="text-xs font-bold text-mute">Término (opcional)<input type="date" value={form.endsOn ?? ''} min={form.startsOn} className={inputClass} onChange={e => setForm({ ...form, endsOn: e.target.value || null })} /></label></>}
        <label className="text-xs font-bold text-mute sm:col-span-2">Fuso dos horários<select className={inputClass} value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })}>{[...new Set([form.timezone, 'America/Sao_Paulo', 'America/Manaus', 'America/Cuiaba', 'America/Porto_Velho', 'America/Rio_Branco', 'America/Noronha'])].map(zone => <option key={zone} value={zone}>{zone.replace('America/', '').replace(/_/g, ' ')}</option>)}</select></label>
        <label className="flex items-center gap-2 rounded-lg bg-paper p-2.5 text-sm sm:col-span-2"><input style={checkboxStyle} type="checkbox" checked={form.alertsEnabled} onChange={e => setForm({ ...form, alertsEnabled: e.target.checked })} />Ativar alertas deste medicamento no aplicativo</label>
        {form.alertsEnabled && <fieldset className="sm:col-span-2"><legend className="text-xs font-bold text-mute">Quem receberá os alertas?</legend><p className="mt-1 text-xs text-mute">Selecione o paciente e/ou as pessoas responsáveis.</p><div className="mt-2 space-y-2">{agenda.recipients.map(person => <label key={person.id} className="flex items-start gap-2 rounded-lg border border-line p-3 text-sm"><input className="mt-0.5" style={checkboxStyle} type="checkbox" checked={form.recipientIds.includes(person.id)} onChange={e => setForm({ ...form, recipientIds: e.target.checked ? [...form.recipientIds, person.id] : form.recipientIds.filter(id => id !== person.id) })} /><span>{person.name}{person.owner ? ' — titular/responsável pelo cadastro' : ''}<br /><span className="text-xs text-mute">{person.emailMasked}</span></span></label>)}</div><p className="mt-2 text-xs text-mute">Para incluir outra pessoa, compartilhe o acesso a este perfil com a conta dela.</p></fieldset>}
        <div className="flex flex-wrap gap-2 border-t border-line pt-3 sm:col-span-2"><button className={buttonClass} disabled={busy} onClick={() => void save()}>{busy ? 'Salvando...' : editing ? 'Salvar alterações' : 'Adicionar à agenda'}</button><button className={secondaryClass} disabled={busy} onClick={() => { setForm(null); setEditing(null); }}>Cancelar</button></div>
      </div>
    </section>}
    {agenda?.schedules.length === 0 && <section className="rounded-2xl border border-dashed border-line p-5 text-sm text-mute">Sua agenda está vazia. Toque em “Novo medicamento” para incluir os dias e horários.</section>}
    {!!agenda?.schedules.length && <section className="overflow-hidden rounded-xl border border-line bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h3 className="text-sm font-bold text-ink">Medicamentos agendados</h3>
        <p className="text-xs text-mute sm:hidden">Deslize a tabela para ver todas as colunas.</p>
      </div>
      {filteredSchedules.length===0?<p role="status" className="p-4 text-sm text-mute">Nenhum medicamento encontrado. Revise ou limpe os filtros.</p>:<div className="overflow-x-auto" role="region" aria-label="Tabela da agenda de medicamentos" tabIndex={0}>
        <PaginatedList items={filteredSchedules} resetKey={profile.id+JSON.stringify(filters)} label="Registros">{pageRows=>(<table className="w-full min-w-[740px] border-collapse text-left text-sm">
          <caption className="sr-only">Agenda de medicamentos de {profile.name}</caption>
          <thead className="border-b border-line bg-paper text-xs font-bold uppercase tracking-wide text-mute">
            <tr>{['Medicamento e dose', 'Dias', 'Horários', 'Período', 'Alertas', 'Ações'].map(title => <th key={title} scope="col" className="px-3 py-2">{title}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {pageRows.map(schedule => <tr key={schedule.id} className="align-middle transition-colors even:bg-paper/40 hover:bg-moss-50/50">
              <th scope="row" className="max-w-[200px] px-3 py-2 font-normal">
                <span className="block break-words font-bold text-ink">{schedule.name}</span>
                <span className="mt-1 block text-xs text-mute">{schedule.dose || 'Dose não informada'}</span>
                {agenda.registeredMedications?.some(medicine => normalized(medicine.name) === normalized(schedule.name) && normalized(medicine.dose) !== normalized(schedule.dose)) && <span className="mt-2 block text-xs text-warn-600">Dose diferente do prontuário. Confira a prescrição.</span>}
              </th>
              <td className="max-w-[140px] px-3 py-2 text-ink">{schedule.weekdays.length === 7 ? 'Todos os dias' : days.filter(([day]) => schedule.weekdays.includes(day)).map(([, label]) => label).join(', ')}</td>
              <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{schedule.times.map(time => <span key={time} className="rounded-md bg-moss-50 px-1.5 py-0.5 text-xs font-bold tabular-nums text-moss-800">{time}</span>)}</div></td>
              <td className="px-3 py-2 text-xs text-mute">{schedule.continuousUse ? <span className="inline-block rounded-md bg-moss-50 px-1.5 py-0.5 font-semibold text-moss-800">Uso contínuo</span> : <><span className="block whitespace-nowrap">{schedule.startsOn.split('-').reverse().join('/')}</span><span className="mt-1 block whitespace-nowrap">{schedule.endsOn ? 'até ' + schedule.endsOn.split('-').reverse().join('/') : 'Sem término'}</span><span className="mt-1 block">{schedule.timezone.replace('America/', '').replace(/_/g, ' ')}</span></>}</td>
              <td className="max-w-[180px] px-3 py-2"><span className={`inline-block rounded-md px-1.5 py-0.5 text-xs font-semibold ${schedule.alertsEnabled && agenda.alertsEnabled ? 'bg-moss-50 text-moss-800' : 'bg-paper text-mute'}`}>{schedule.alertsEnabled && agenda.alertsEnabled ? 'Configurados' : 'Desativados'}</span><p className="mt-1 text-xs text-mute">{schedule.recipientIds.map(id => agenda.recipients.find(person => person.id === id)?.name ?? 'Conta sem acesso vigente').join(', ') || 'Sem destinatários'}</p></td>
              <td className="px-3 py-2">{agenda.canEdit ? <div className="flex items-center gap-1 whitespace-nowrap">
                <button className="inline-flex min-h-11 items-center rounded-md border border-line px-2 py-1.5 text-xs font-semibold text-moss-800 hover:bg-moss-50 disabled:opacity-50 md:min-h-0" disabled={busy} aria-label={`Editar ${schedule.name}`} onClick={() => { setEditing(schedule); setForm({ name: schedule.name, dose: schedule.dose, continuousUse: schedule.continuousUse === true, weekdays: schedule.weekdays, times: schedule.times, timezone: schedule.timezone, startsOn: schedule.startsOn, endsOn: schedule.endsOn, recipientIds: schedule.recipientIds, alertsEnabled: schedule.alertsEnabled }); }}>Editar</button>
                <button className="inline-flex min-h-11 items-center rounded-md px-2 py-1.5 text-xs font-semibold text-mute hover:bg-paper disabled:opacity-50 md:min-h-0" disabled={busy} aria-label={`Remover ${schedule.name}`} onClick={() => void run(async () => { if (!window.confirm(`Remover ${schedule.name} da agenda e interromper seus alertas?`)) return; await api.removeMedicationSchedule(profile.id, schedule.id); await refresh(); if (editing?.id === schedule.id) { setEditing(null); setForm(null); } setFeedback('Medicamento removido da agenda.'); })}>Remover</button>
              </div> : <span className="text-xs text-mute">Consulta</span>}</td>
            </tr>)}
          </tbody>
        </table>)}</PaginatedList>
      </div>}
    </section>}
  </div>;
}




