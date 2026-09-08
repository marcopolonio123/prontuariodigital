import { useEffect, useMemo, useState } from 'react';
import type { HealthEventV1, MyDoctorV1Api, ProfessionalAccessRequestV1, ProfessionalConsultationV1 } from './lib/api-v1';

function submissionStatus(status: string) {
  if (status === 'final') return 'Confirmado pelo paciente';
  if (status === 'rejected_by_patient') return 'Recusado pelo paciente';
  return 'Aguardando confirmação do paciente';
}

export default function ProfessionalConsultationWorkspace({ api }: { api: MyDoctorV1Api }) {
  const [requests, setRequests] = useState<ProfessionalAccessRequestV1[]>([]);
  const [submissions, setSubmissions] = useState<ProfessionalConsultationV1[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [timeline, setTimeline] = useState<HealthEventV1[]>([]);
  const [title, setTitle] = useState('Consulta');
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [organizationName, setOrganizationName] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const authorized = useMemo(() => requests.filter((item) => item.status === 'approved' && !item.grantRevokedAt && (!item.grantValidUntil || new Date(item.grantValidUntil).getTime() > Date.now())), [requests]);
  const selected = authorized.find((item) => item.id === selectedId) ?? null;

  const load = async () => {
    setMessage('');
    try {
      const [access, sent] = await Promise.all([api.listProfessionalAccessRequests(), api.listProfessionalConsultations()]);
      setRequests(access);
      setSubmissions(sent);
      const valid = access.filter((item) => item.status === 'approved' && !item.grantRevokedAt && (!item.grantValidUntil || new Date(item.grantValidUntil).getTime() > Date.now()));
      setSelectedId((current) => valid.some((item) => item.id === current) ? current : valid[0]?.id ?? '');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível carregar a área de atendimento.');
    }
  };

  useEffect(() => { void load(); }, [api]);

  useEffect(() => {
    if (!selected) { setTimeline([]); return; }
    void api.listHealthEvents(selected.patientId)
      .then(setTimeline)
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Não foi possível abrir o prontuário autorizado.'));
  }, [api, selectedId]);

  const submit = async () => {
    if (!selected) return;
    if (!title.trim()) return setMessage('Informe o tipo ou título do atendimento.');
    setBusy(true); setMessage('');
    try {
      await api.createProfessionalConsultation({
        accessRequestId: selected.id,
        title: title.trim(),
        occurredAt: new Date(occurredAt).toISOString(),
        organizationName: organizationName.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setNotes('');
      setMessage('Atendimento registrado. Ele está aguardando a confirmação do paciente antes de entrar definitivamente no prontuário.');
      setSubmissions(await api.listProfessionalConsultations());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível registrar o atendimento.');
    } finally { setBusy(false); }
  };

  return <div className="space-y-5">
    <section className="rounded-2xl border border-line bg-card p-5 shadow-lift">
      <p className="text-xs font-bold uppercase tracking-wide text-moss-700">Área de atendimento</p>
      <h3 className="mt-1 font-display text-xl font-bold text-ink">Prontuário autorizado</h3>
      {authorized.length === 0 ? <p className="mt-3 text-sm text-mute">Nenhum paciente com autorização ativa neste momento.</p> : <>
        <label className="mt-4 block text-xs font-bold text-mute">Paciente autorizado
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="mt-1 block w-full rounded-xl border border-line bg-white px-3 py-3 text-sm outline-none focus:border-moss-500">
            {authorized.map((item) => <option key={item.id} value={item.id}>{item.patientName}{item.grantValidUntil ? ` — até ${new Date(item.grantValidUntil).toLocaleString('pt-BR')}` : ''}</option>)}
          </select>
        </label>

        {selected && <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-line bg-white p-4">
            <h4 className="font-bold text-ink">Resumo do prontuário</h4>
            <p className="mt-1 text-xs text-mute">Somente registros finais já confirmados aparecem aqui.</p>
            {timeline.length === 0 ? <p className="mt-3 text-sm text-mute">Nenhum registro clínico disponível.</p> : <div className="mt-3 max-h-72 divide-y divide-line overflow-auto">
              {timeline.slice(0, 20).map((event) => <div key={event.id} className="py-3"><strong className="text-sm text-ink">{event.title}</strong><p className="mt-1 text-xs text-mute">{new Date(event.occurredAt).toLocaleString('pt-BR')} · {event.type}</p></div>)}
            </div>}
          </div>

          <div className="rounded-xl border border-line bg-white p-4">
            <h4 className="font-bold text-ink">Registrar consulta</h4>
            <div className="mt-3 grid gap-3">
              <label className="text-xs font-bold text-mute">Tipo/descrição<input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 block w-full rounded-xl border border-line px-3 py-3 text-sm" /></label>
              <label className="text-xs font-bold text-mute">Data/Hora<input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} className="mt-1 block w-full rounded-xl border border-line px-3 py-3 text-sm" /></label>
              <label className="text-xs font-bold text-mute">Hospital/Clínica/Consultório<input value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} className="mt-1 block w-full rounded-xl border border-line px-3 py-3 text-sm" /></label>
              <label className="text-xs font-bold text-mute">Atendimento (descrição)<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} className="mt-1 block w-full rounded-xl border border-line px-3 py-3 text-sm" /></label>
              <button type="button" disabled={busy} onClick={() => void submit()} className="rounded-xl bg-pine-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Registrando...' : 'Registrar e enviar ao paciente'}</button>
            </div>
          </div>
        </div>}
      </>}
      {message && <p className="mt-4 rounded-xl border border-line bg-white p-3 text-sm text-mute">{message}</p>}
    </section>

    {submissions.length > 0 && <section className="rounded-2xl border border-line bg-card p-5 shadow-lift">
      <h3 className="font-display text-xl font-bold text-ink">Atendimentos enviados</h3>
      <div className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
        {submissions.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"><div><strong className="text-sm text-ink">{item.patientName} · {item.title}</strong><p className="mt-1 text-xs text-mute">{new Date(item.occurredAt).toLocaleString('pt-BR')}</p></div><span className="rounded-full bg-paper px-3 py-2 text-xs font-bold text-mute">{submissionStatus(item.status)}</span></div>)}
      </div>
    </section>}
  </div>;
}
