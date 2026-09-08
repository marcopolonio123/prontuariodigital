import { useEffect, useState } from 'react';
import type { IncomingAccessRequestV1, MyDoctorV1Api } from './lib/api-v1';

function statusLabel(status: string) {
  switch (status) {
    case 'approved': return 'Autorizado';
    case 'rejected': return 'Recusado';
    case 'expired': return 'Expirado';
    case 'revoked': return 'Revogado';
    default: return 'Aguardando sua decisão';
  }
}

export default function AccessRequestsPanel({ api }: { api: MyDoctorV1Api }) {
  const [items, setItems] = useState<IncomingAccessRequestV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    setMessage('');
    try {
      setItems(await api.listIncomingAccessRequests());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível carregar as solicitações.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [api]);

  const decide = async (item: IncomingAccessRequestV1, decision: 'approve' | 'reject') => {
    setBusyId(item.id);
    setMessage('');
    try {
      await api.decideAccessRequest(item.id, decision);
      setMessage(decision === 'approve' ? 'Acesso autorizado por 24 horas.' : 'Solicitação recusada.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível registrar sua decisão.');
    } finally {
      setBusyId('');
    }
  };

  if (loading) {
    return <section className="rounded-2xl border border-line bg-card p-5 shadow-lift"><p className="text-sm text-mute">Carregando solicitações de acesso...</p></section>;
  }

  const pending = items.filter((item) => item.status === 'pending');
  const decided = items.filter((item) => item.status !== 'pending');

  return <div className="space-y-5">
    <section className="rounded-2xl border border-line bg-card p-5 shadow-lift">
      <p className="text-xs font-bold uppercase tracking-wide text-moss-700">Privacidade e compartilhamento</p>
      <h2 className="mt-1 font-display text-2xl font-bold text-ink">Solicitações de acesso ao seu prontuário</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-mute">Aqui você decide se um profissional de saúde pode acessar seu prontuário. Nenhum acesso é liberado antes da sua autorização.</p>
    </section>

    <section className="rounded-2xl border border-line bg-card p-5 shadow-lift">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-mute">Pendentes</p>
          <h3 className="mt-1 font-display text-xl font-bold text-ink">Aguardando sua decisão</h3>
        </div>
        <button type="button" onClick={() => void load()} className="rounded-xl border border-moss-500 px-4 py-2 text-sm font-bold text-moss-800">Atualizar</button>
      </div>

      {pending.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-line bg-white p-5 text-sm text-mute">Nenhuma solicitação pendente.</div> : <div className="mt-4 space-y-3">
        {pending.map((item) => <article key={item.id} className="rounded-xl border border-line bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-moss-700">{item.patientName}</p>
              <h4 className="mt-1 break-words text-lg font-bold text-ink">{item.practitionerName || item.requesterName}</h4>
              <p className="mt-1 text-sm text-mute">{item.profession || 'Profissional de saúde'}{item.specialty ? ` · ${item.specialty}` : ''}</p>
            </div>
            <span className="rounded-full bg-paper px-3 py-2 text-xs font-bold text-mute">{statusLabel(item.status)}</span>
          </div>

          {item.registrations?.length > 0 && <div className="mt-3 flex flex-wrap gap-2">
            {item.registrations.map((registration, index) => <span key={`${registration.council}-${registration.registration}-${index}`} className="rounded-lg border border-line bg-paper px-3 py-2 text-xs font-semibold text-ink">{registration.council} {registration.registration}{registration.region ? `/${registration.region}` : ''}</span>)}
          </div>}

          <div className="mt-4 rounded-xl bg-moss-50/50 p-3 text-sm text-mute">
            <p><strong className="text-ink">Solicitado em:</strong> {new Date(item.requestedAt).toLocaleString('pt-BR')}</p>
            <p className="mt-1"><strong className="text-ink">Permissão:</strong> leitura do prontuário e registro de consulta durante o período autorizado.</p>
            <p className="mt-1"><strong className="text-ink">Duração:</strong> 24 horas após sua autorização.</p>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" disabled={busyId === item.id} onClick={() => void decide(item, 'approve')} className="rounded-xl bg-pine-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Autorizar acesso</button>
            <button type="button" disabled={busyId === item.id} onClick={() => void decide(item, 'reject')} className="rounded-xl border border-line px-4 py-3 text-sm font-bold text-danger-600 disabled:opacity-50">Recusar</button>
          </div>
        </article>)}
      </div>}
    </section>

    {decided.length > 0 && <section className="rounded-2xl border border-line bg-card p-5 shadow-lift">
      <h3 className="font-display text-xl font-bold text-ink">Histórico de solicitações</h3>
      <div className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
        {decided.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div><strong className="text-sm text-ink">{item.practitionerName || item.requesterName}</strong><p className="mt-1 text-xs text-mute">{item.patientName} · {new Date(item.requestedAt).toLocaleString('pt-BR')}</p></div>
          <span className="rounded-full bg-paper px-3 py-2 text-xs font-bold text-mute">{statusLabel(item.status)}</span>
        </div>)}
      </div>
    </section>}

    {message && <p className="text-sm text-mute">{message}</p>}
  </div>;
}
