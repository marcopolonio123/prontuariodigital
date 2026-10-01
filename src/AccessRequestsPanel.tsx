import { useEffect, useState } from 'react';
import type { IncomingAccessRequestV1, MyDoctorV1Api } from './lib/api-v1';
const field = 'mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm';
function statusLabel(status: string) { return ({ approved: 'Autorizado', rejected: 'Recusado', expired: 'Expirado', revoked: 'Revogado', pending: 'Aguardando sua decisão' } as Record<string,string>)[status] || status; }
function tomorrow() { const date = new Date(Date.now() + 86400000); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0,16); }
export default function AccessRequestsPanel({ api }: { api: MyDoctorV1Api }) {
  const [items, setItems] = useState<IncomingAccessRequestV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const [choices, setChoices] = useState<Record<string, { duration: 'indefinite' | 'until'; until: string }>>({});
  const [errors, setErrors] = useState<Record<string,string>>({});
  const load = async () => { setLoading(true); try { setItems(await api.listIncomingAccessRequests()); } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar as solicitações.'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, [api]);
  const choice = (id: string) => choices[id] ?? { duration: 'until' as const, until: tomorrow() };
  const decide = async (item: IncomingAccessRequestV1, decision: 'approve' | 'reject') => {
    if (busyId) return;
    const selected = choice(item.id); const end = new Date(selected.until);
    if (decision === 'approve' && selected.duration === 'until' && (!Number.isFinite(end.getTime()) || end.getTime() <= Date.now())) { setErrors(previous => ({ ...previous, [item.id]: 'Escolha uma data e horário no futuro.' })); return; }
    setBusyId(item.id); setMessage(''); setErrors(previous => ({ ...previous, [item.id]: '' }));
    try {
      await api.decideAccessRequest(item.id, decision, undefined, decision === 'approve' ? selected.duration : undefined, decision === 'approve' && selected.duration === 'until' ? end.toISOString() : undefined);
      setMessage(decision === 'reject' ? 'Solicitação recusada.' : selected.duration === 'indefinite' ? 'Acesso autorizado por tempo indeterminado. Você pode revogá-lo a qualquer momento.' : `Acesso autorizado até ${end.toLocaleString('pt-BR')}.`);
      await load();
    } catch (error) { setErrors(previous => ({ ...previous, [item.id]: error instanceof Error ? error.message : 'Não foi possível registrar sua decisão.' })); }
    finally { setBusyId(''); }
  };
  const revoke = async (item: IncomingAccessRequestV1) => {
    if (busyId || !window.confirm(`Revogar agora o acesso de ${item.practitionerName || item.requesterName}?`)) return;
    setBusyId(item.id); setErrors(previous => ({ ...previous, [item.id]: '' }));
    try { await api.revokePatientAccess(item.id); setMessage('Acesso revogado. O profissional não pode mais acessar este prontuário por esta autorização.'); await load(); }
    catch (error) { setErrors(previous => ({ ...previous, [item.id]: error instanceof Error ? error.message : 'Não foi possível revogar.' })); }
    finally { setBusyId(''); }
  };
  const pending = items.filter(item => item.status === 'pending'); const decided = items.filter(item => item.status !== 'pending');
  return <div className="space-y-4">
    <section className="rounded-xl border border-line bg-card p-4">
      <h2 className="text-xl font-bold">Solicitações de acesso ao seu prontuário</h2>
      <p className="mt-2 text-sm text-mute">Você decide quem pode consultar e registrar atendimentos. Escolha a duração ao autorizar e revogue o acesso quando desejar.</p>
      <button disabled={loading || Boolean(busyId)} type="button" onClick={() => void load()} className="mt-3 rounded-lg border border-line px-3 py-2 text-sm">Atualizar</button>
      {message && <p role="status" className="mt-3 rounded-lg bg-paper p-3 text-sm">{message}</p>}
      {loading && <p role="status" className="mt-3 text-sm text-mute">Carregando solicitações...</p>}
    </section>
    <section className="rounded-xl border border-line bg-card p-4"><h3 className="font-bold">Aguardando sua decisão</h3>
      {!loading && !pending.length && <p className="mt-3 text-sm text-mute">Nenhuma solicitação pendente.</p>}
      {pending.map(item => <article key={item.id} className="mt-3 rounded-lg border border-line bg-white p-4">
        <strong>{item.practitionerName || item.requesterName}</strong><p className="mt-1 text-sm text-mute">Paciente: {item.patientName} · {item.profession || 'Profissional de saúde'}</p>
        <p className="mt-1 text-xs text-mute">{item.registrations.map(reg => `${reg.council} ${reg.registration}/${reg.region || '—'}`).join(' · ')}</p>
        <p className="mt-2 text-xs text-mute">Solicitado em {new Date(item.requestedAt).toLocaleString('pt-BR')}. Permite leitura do prontuário e registro de consulta.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold">Duração do acesso<select value={choice(item.id).duration} onChange={event => setChoices(previous => ({ ...previous, [item.id]: { ...choice(item.id), duration: event.target.value as 'indefinite' | 'until' } }))} className={field}><option value="until">Até data e horário</option><option value="indefinite">Tempo indeterminado</option></select></label>
          {choice(item.id).duration === 'until' && <label className="text-xs font-bold">Autorizar até (seu horário local)<input type="datetime-local" value={choice(item.id).until} onChange={event => setChoices(previous => ({ ...previous, [item.id]: { ...choice(item.id), until: event.target.value } }))} className={field} /></label>}
        </div>
        <p className="mt-2 text-xs text-mute">{choice(item.id).duration === 'indefinite' ? 'O acesso continuará ativo até você revogá-lo ou o profissional perder a validação.' : 'O acesso será bloqueado automaticamente no horário escolhido. Você também pode revogar antes.'}</p>
        {errors[item.id] && <p role="alert" className="mt-3 rounded-lg bg-paper p-3 text-sm">{errors[item.id]}</p>}
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={Boolean(busyId)} onClick={() => void decide(item,'approve')} className="rounded-lg bg-pine-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busyId === item.id ? 'Processando...' : 'Autorizar acesso'}</button><button type="button" disabled={Boolean(busyId)} onClick={() => void decide(item,'reject')} className="rounded-lg border border-line px-4 py-2 text-sm text-danger-600 disabled:opacity-50">Recusar</button></div>
      </article>)}
    </section>
    {decided.length > 0 && <section className="rounded-xl border border-line bg-card p-4"><h3 className="font-bold">Autorizações e histórico</h3>
      {decided.map(item => <article key={item.id} className="mt-3 rounded-lg border border-line p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-sm">{item.practitionerName || item.requesterName}</strong><p className="mt-1 text-xs text-mute">Paciente: {item.patientName} · {statusLabel(item.status)}</p>{item.status === 'approved' && <p className="mt-1 text-xs text-mute">{item.grantValidUntil ? `Até ${new Date(item.grantValidUntil).toLocaleString('pt-BR')}` : 'Tempo indeterminado'}</p>}</div>{item.status === 'approved' && <button type="button" disabled={Boolean(busyId)} onClick={() => void revoke(item)} className="rounded-lg border border-line px-3 py-2 text-sm text-danger-600 disabled:opacity-50">{busyId === item.id ? 'Revogando...' : 'Revogar acesso'}</button>}</div>
        {errors[item.id] && <p role="alert" className="mt-2 text-sm text-danger-600">{errors[item.id]}</p>}
      </article>)}
    </section>}
  </div>;
}
