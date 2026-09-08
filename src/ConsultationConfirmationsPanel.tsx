import { useEffect, useState } from 'react';
import type { IncomingConsultationV1, MyDoctorV1Api } from './lib/api-v1';

export default function ConsultationConfirmationsPanel({ api }: { api: MyDoctorV1Api }) {
  const [items, setItems] = useState<IncomingConsultationV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true); setMessage('');
    try { setItems(await api.listIncomingConsultations()); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar os atendimentos.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [api]);

  const decide = async (item: IncomingConsultationV1, decision: 'confirm' | 'reject') => {
    setBusyId(item.id); setMessage('');
    try {
      await api.decideConsultation(item.id, decision);
      setMessage(decision === 'confirm' ? 'Atendimento confirmado e incluído no prontuário.' : 'Atendimento recusado e não incluído no prontuário.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível registrar sua decisão.');
    } finally { setBusyId(''); }
  };

  if (loading) return <section className="rounded-2xl border border-line bg-card p-5 shadow-lift"><p className="text-sm text-mute">Carregando atendimentos para confirmação...</p></section>;

  return <div className="space-y-5">
    <section className="rounded-2xl border border-line bg-card p-5 shadow-lift">
      <p className="text-xs font-bold uppercase tracking-wide text-moss-700">Confirmação do paciente</p>
      <h2 className="mt-1 font-display text-2xl font-bold text-ink">Atendimentos aguardando sua confirmação</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-mute">O profissional pode registrar o atendimento somente durante uma autorização válida. O registro entra definitivamente no seu prontuário apenas depois da sua confirmação.</p>
    </section>

    <section className="rounded-2xl border border-line bg-card p-5 shadow-lift">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-xl font-bold text-ink">Pendentes</h3>
        <button type="button" onClick={() => void load()} className="rounded-xl border border-moss-500 px-4 py-2 text-sm font-bold text-moss-800">Atualizar</button>
      </div>

      {items.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-line bg-white p-5 text-sm text-mute">Nenhum atendimento aguardando confirmação.</div> : <div className="mt-4 space-y-3">
        {items.map((item) => <article key={item.id} className="rounded-xl border border-line bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-moss-700">{item.patientName}</p>
          <h4 className="mt-1 text-lg font-bold text-ink">{item.title}</h4>
          <p className="mt-1 text-sm text-mute">{item.practitionerName}{item.profession ? ` · ${item.profession}` : ''}</p>
          {(item.council || item.registration) && <p className="mt-1 text-xs text-mute">{item.council ?? ''} {item.registration ?? ''}{item.region ? `/${item.region}` : ''}</p>}
          <div className="mt-4 rounded-xl bg-paper p-3 text-sm text-mute">
            <p><strong className="text-ink">Data/Hora:</strong> {new Date(item.occurredAt).toLocaleString('pt-BR')}</p>
            {item.organizationName && <p className="mt-1"><strong className="text-ink">Local:</strong> {item.organizationName}</p>}
            {item.notes && <p className="mt-1"><strong className="text-ink">Atendimento:</strong> {item.notes}</p>}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" disabled={busyId === item.id} onClick={() => void decide(item, 'confirm')} className="rounded-xl bg-pine-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Confirmar e incluir no prontuário</button>
            <button type="button" disabled={busyId === item.id} onClick={() => void decide(item, 'reject')} className="rounded-xl border border-line px-4 py-3 text-sm font-bold text-danger-600 disabled:opacity-50">Recusar registro</button>
          </div>
        </article>)}
      </div>}
    </section>

    {message && <p className="rounded-xl border border-line bg-card p-4 text-sm text-mute">{message}</p>}
  </div>;
}
