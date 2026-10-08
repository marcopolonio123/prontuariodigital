import TutorRequestsPanel from './components/TutorRequestsPanel';
import PaginatedList from './components/PaginatedList';
import { useEffect, useRef, useState } from 'react';
import type { AdminProfessionalV1, MyDoctorV1Api } from './lib/api-v1';

const statusText: Record<string, string> = { pending: 'Pendente', unverified: 'Não verificado', verified: 'Aprovado', rejected: 'Recusado', suspended: 'Suspenso' };
const field = 'mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm';
export default function ProfessionalAdminPanel({ api }: { api: MyDoctorV1Api }) {
  const feedback = useRef<HTMLParagraphElement>(null);
  const [rows, setRows] = useState<AdminProfessionalV1[]>([]);
  const [selected, setSelected] = useState<AdminProfessionalV1 | null>(null);
  const [filter, setFilter] = useState('pending');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { if (message) feedback.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, [message]);
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState('');
  const [registrationId, setRegistrationId] = useState('');
  const [checked, setChecked] = useState(false);
  async function load() {
    setBusy(true);
    try { setRows(await api.listAdminProfessionals()); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, [api]);
  async function decide(decision: string) {
    if (!selected || busy) return;
    if (note.trim().length < 5) return setMessage('Registre o motivo da decisão.');
    if (decision === 'approve' && (!checked || evidence.trim().length < 5 || !registrationId)) return setMessage('Selecione o registro, confira identidade e conselho e informe a fonte da conferência.');
    setBusy(true); setMessage('');
    try {
      await api.decideProfessional(selected.id, { decision, note, evidence, registrationId, checkedIdentityAndCouncil: checked, expectedUpdatedAt: selected.updatedAt });
      setSelected(null); setNote(''); setEvidence(''); setChecked(false);
      setMessage(decision === 'approve' ? 'Profissional aprovado. O paciente ainda precisa autorizar o acesso ao prontuário.' : decision === 'reject' ? 'Profissional recusado. Decisão registrada.' : 'Acesso profissional suspenso. Decisão registrada.');
      try { setRows(await api.listAdminProfessionals()); } catch { setMessage('Decisão registrada, mas a lista não pôde ser atualizada. Clique em Atualizar para conferir o status.'); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível registrar a decisão.'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3"><TutorRequestsPanel api={api} admin/>
    <section className="rounded-xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Validação de profissionais</h2><p className="mt-1 text-xs text-mute">Confira a identidade e o registro no conselho antes de aprovar. As conferências são manuais.</p></div><button disabled={busy} onClick={() => void load()} className="rounded-lg border border-line px-3 py-2 text-sm">Atualizar</button></div>
      <label className="mt-3 block text-xs font-bold">Filtrar por status<select value={filter} onChange={e => setFilter(e.target.value)} className={field}><option value="all">Todos</option>{Object.entries(statusText).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
      {message && <p ref={!selected ? feedback : undefined} role="status" className="mt-3 rounded-lg bg-paper p-3 text-sm">{message}</p>}
    </section>
    <section className="overflow-x-auto rounded-xl border border-line bg-card">
      <PaginatedList items={rows.filter(row => filter === 'all' || row.verificationStatus === filter)} label="Registros">{pageRows=>(<table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-paper text-xs text-mute"><tr>{['Profissional', 'Registro', 'Status', 'Ação'].map(text => <th className="px-3 py-2" key={text} scope="col">{text}</th>)}</tr></thead><tbody className="divide-y divide-line">{pageRows.map(row => <tr key={row.id}><th scope="row" className="px-3 py-2 font-normal"><strong>{row.name}</strong><p className="text-xs text-mute">{row.profession}{row.specialty ? ' · ' + row.specialty : ''}</p><p className="text-xs text-mute">{row.email}</p></th><td className="px-3 py-2">{row.registrations.map(reg => <p key={reg.id}>{reg.council} {reg.registration}/{reg.region || '—'}</p>)}</td><td className="px-3 py-2">{statusText[row.verificationStatus] || row.verificationStatus}</td><td className="px-3 py-2"><button disabled={busy} className="rounded-lg border border-line px-3 py-2 text-xs font-bold" onClick={() => { setSelected(row); setNote(''); setEvidence(''); setChecked(false); setMessage(''); setRegistrationId(row.registrations[0]?.id || ''); }}>Analisar</button></td></tr>)}</tbody></table>)}</PaginatedList>
      {!busy && !rows.some(row => filter === 'all' || row.verificationStatus === filter) && <p className="p-4 text-sm text-mute">Nenhum profissional neste status.</p>}
    </section>
    {selected && <section className="rounded-xl border border-line bg-card p-4">
      <h3 className="font-bold">Analisar: {selected.name}</h3>
      <p className="mt-1 text-xs text-mute">Analise os documentos enviados e confira o registro na fonte oficial do conselho. Você não pode aprovar seu próprio perfil.</p>
      <div className="mt-3 rounded-lg border border-line p-3"><h4 className="text-sm font-bold">Documentos enviados</h4>{selected.documents.length ? selected.documents.map(doc => <div key={doc.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs"><span>{doc.kind === 'identity' ? 'Identidade' : 'Conselho'} · {doc.filename} · {new Date(doc.createdAt).toLocaleDateString('pt-BR')}</span><button type="button" className="font-bold text-moss-700 underline" onClick={() => void api.openVerificationDocument(doc.id, true).catch(error => setMessage(error.message))}>Abrir documento</button></div>) : <p className="mt-2 text-xs text-mute">Nenhum documento enviado.</p>}</div>
      <label className="mt-3 block text-xs font-bold">Registro conferido<select value={registrationId} onChange={e => setRegistrationId(e.target.value)} className={field}>{selected.registrations.map(reg => <option key={reg.id} value={reg.id}>{reg.council} {reg.registration}/{reg.region || '—'}</option>)}</select></label>
      <label className="mt-3 block text-xs font-bold">Fonte da conferência (obrigatória para aprovação)<textarea value={evidence} maxLength={2000} onChange={e => setEvidence(e.target.value)} className={field} placeholder="Fonte oficial do conselho, data da consulta e como a identidade foi conferida" /></label>
      <label className="mt-2 flex items-center gap-2 text-sm"><input style={{ width: 16, height: 16, flex: '0 0 16px', maxWidth: 16 }} type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />Conferi a identidade e a situação do registro no conselho.</label>
      <label className="mt-3 block text-xs font-bold">Motivo da decisão<textarea value={note} maxLength={2000} onChange={e => setNote(e.target.value)} className={field} /></label>
      {message && <p ref={feedback} role="alert" className="mt-3 rounded-lg bg-paper p-3 text-sm">{message}</p>}
      {busy && <p role="status" className="mt-3 text-sm">Registrando decisão, aguarde...</p>}
      <div className="mt-3 flex flex-wrap gap-2"><button disabled={busy} onClick={() => void decide('approve')} className="rounded-lg bg-pine-900 px-3 py-2 text-sm font-bold text-white">{busy ? 'Processando...' : 'Aprovar'}</button><button disabled={busy} onClick={() => void decide('reject')} className="rounded-lg border border-line px-3 py-2 text-sm">Recusar</button><button disabled={busy} onClick={() => void decide('suspend')} className="rounded-lg border border-line px-3 py-2 text-sm">Suspender acesso</button><button disabled={busy} onClick={() => setSelected(null)} className="px-3 py-2 text-sm">Cancelar</button></div>
      <details className="mt-4 border-t border-line pt-3"><summary className="cursor-pointer text-sm font-bold">Histórico de decisões</summary><PaginatedList items={selected.history} label="Registros">{pageRows=>(<>{selected.history.length ? pageRows.map(item => <article key={item.id} className="mt-2 rounded-lg bg-paper p-3 text-xs"><strong>{statusText[item.status]} · {item.actorName} · {new Date(item.createdAt).toLocaleString('pt-BR')}</strong><p className="mt-1">{item.note}</p>{item.evidence && <p className="mt-1">Conferência: {item.evidence}</p>}</article>) : <p className="mt-2 text-xs text-mute">Nenhuma decisão registrada.</p>}</>)}</PaginatedList></details>
    </section>}
  </div>;
}


