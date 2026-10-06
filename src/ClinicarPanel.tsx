import { useEffect, useState } from 'react';
import type { MyDoctorV1Api, PatientLookupV1, ProfessionalAccessRequestV1, ProfessionalProfileV1 } from './lib/api-v1';

function statusCopy(status?: string) {
  switch (status) {
    case 'verified': return { title: 'Profissional verificado', detail: 'Seu perfil profissional está validado. Você pode solicitar acesso a prontuários de pacientes MyDoctor.' };
    case 'pending': return { title: 'Validação em andamento', detail: 'Seus dados profissionais foram enviados. Clinicar será liberado somente depois da validação.' };
    case 'rejected': return { title: 'Validação recusada', detail: 'Revise seus dados profissionais e envie novamente para análise.' };
    case 'suspended': return { title: 'Acesso profissional suspenso', detail: 'Clinicar está temporariamente indisponível para este perfil.' };
    default: return { title: 'Perfil profissional não validado', detail: 'Cadastre seus dados profissionais para iniciar o processo de validação.' };
  }
}

function requestStatus(status: string) {
  switch (status) {
    case 'approved': return 'Acesso autorizado';
    case 'rejected': return 'Solicitação recusada';
    case 'expired': return 'Solicitação expirada';
    case 'revoked': return 'Acesso revogado';
    default: return 'Aguardando autorização';
  }
}

export default function ClinicarPanel({ api, onOpenProfessional }: { api: MyDoctorV1Api; onOpenProfessional: () => void }) {
  const [profile, setProfile] = useState<ProfessionalProfileV1 | null>(null);
  const [requests, setRequests] = useState<ProfessionalAccessRequestV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [patientEmail, setPatientEmail] = useState('');
  const [patient, setPatient] = useState<PatientLookupV1 | null>(null);

  const load = async () => {
    setLoading(true);
    setMessage('');
    try {
      const result = await api.getProfessionalProfile();
      setProfile(result);
      if (result?.verificationStatus === 'verified' && result.active) {
        setRequests(await api.listProfessionalAccessRequests());
      } else {
        setRequests([]);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível consultar seu perfil profissional.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [api]);

  const findPatient = async () => {
    const email = patientEmail.trim().toLowerCase();
    if (!email) return setMessage('Informe o e-mail do paciente cadastrado no MyDoctor.');
    setBusy(true); setMessage(''); setPatient(null);
    try {
      const result = await api.lookupPatientByEmail(email);
      setPatient(result);
      if (!result) setMessage('Nenhum paciente MyDoctor encontrado com este e-mail. Confira o endereço com o paciente.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível localizar o paciente.');
    } finally { setBusy(false); }
  };

  const patientHasActiveAccess = Boolean(patient && requests.some(item => item.patientId === patient.patientId && item.status === 'approved' && !item.grantRevokedAt && (!item.grantValidUntil || new Date(item.grantValidUntil).getTime() > Date.now())));

  const requestAccess = async () => {
    if (!patient || patientHasActiveAccess) return;
    setBusy(true); setMessage('');
    try {
      const created = await api.requestPatientAccess(patient.patientId);
      setRequests((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setMessage(`Solicitação enviada para ${patient.name}. O acesso só será liberado após a autorização do paciente.`);
      setPatient(null); setPatientEmail('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível enviar a solicitação.');
    } finally { setBusy(false); }
  };

  if (loading) return <section className="rounded-2xl border border-line bg-card p-5 shadow-lift"><p className="text-sm text-mute">Verificando habilitação profissional...</p></section>;

  const verified = profile?.verificationStatus === 'verified' && profile.active;
  const status = statusCopy(profile?.verificationStatus);

  return <div className="space-y-5">
    <section className="rounded-2xl border border-line bg-card p-5 shadow-lift">
      <p className="text-xs font-bold uppercase tracking-wide text-moss-700">Solicitar acesso</p>
      <h2 className="mt-1 font-display text-2xl font-bold text-ink">Solicitar acesso ao prontuário de paciente</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-mute">O profissional usa a mesma conta pessoal. Para atender outro usuário, primeiro solicita acesso ao prontuário; o paciente precisa autorizar antes de qualquer consulta aos dados.</p>
    </section>

    <section className="rounded-2xl border border-line bg-card p-5 shadow-lift">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-wide text-mute">Habilitação</p><h3 className="mt-1 font-display text-xl font-bold text-ink">{status.title}</h3><p className="mt-1 max-w-2xl text-xs text-mute">{status.detail}</p>{profile && <p className="mt-2 text-sm text-ink"><strong>{profile.name}</strong>{profile.profession ? ` · ${profile.profession}` : ''}{profile.specialty ? ` · ${profile.specialty}` : ''}</p>}</div><span className={`rounded-full px-3 py-2 text-xs font-bold ${verified ? 'bg-moss-50 text-moss-800' : 'bg-paper text-mute'}`}>{verified ? 'Clinicar habilitado' : 'Clinicar bloqueado'}</span></div>
      {!verified ? <div className="mt-5 rounded-xl border border-line bg-white p-4"><p className="text-sm text-mute">Por segurança, nenhum prontuário de terceiro pode ser solicitado ou acessado enquanto o perfil profissional não estiver verificado.</p><button type="button" onClick={onOpenProfessional} className="mt-4 rounded-xl bg-pine-900 px-4 py-3 text-sm font-bold text-white">Abrir Perfil profissional</button></div> : <ol aria-label="Etapas para solicitar acesso" className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-3 text-xs text-mute"><li><strong className="text-ink">1. Solicitar acesso</strong> pelo e-mail do paciente</li><li><strong className="text-ink">2. Paciente autoriza</strong> o compartilhamento</li><li><strong className="text-ink">3. Realizar atendimento</strong> durante a autorização</li></ol>}
      {message && <p className="mt-4 rounded-xl border border-line bg-white p-3 text-sm text-mute">{message}</p>}
    </section>

    {verified && <section className="rounded-2xl border border-line bg-card p-5 shadow-lift">
      <p className="text-xs font-bold uppercase tracking-wide text-moss-700">Solicitar compartilhamento</p>
      <h3 className="mt-1 font-display text-xl font-bold text-ink">Localizar paciente MyDoctor</h3>
      <p className="mt-2 text-sm text-mute">Use somente o e-mail informado pelo próprio paciente. A busca não permite pesquisar por nome, evitando exposição da base de usuários.</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row"><input type="email" value={patientEmail} onChange={(e) => { setPatientEmail(e.target.value); setPatient(null); }} placeholder="email@paciente.com" className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-3 text-sm outline-none focus:border-moss-500" /><button type="button" disabled={busy} onClick={() => void findPatient()} className="rounded-xl bg-pine-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Consultando...' : 'Localizar paciente'}</button></div>
      {patient && <div className="mt-4 rounded-xl border border-moss-500 bg-moss-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-moss-700">Paciente localizado</p><h4 className="mt-1 font-bold text-ink">{patient.name}</h4><p className="mt-1 text-sm text-mute">{patientHasActiveAccess ? 'Você já possui autorização ativa. Use o prontuário autorizado abaixo.' : 'Nenhum dado clínico foi aberto. Envie a solicitação para o paciente decidir.'}</p><button type="button" disabled={busy || patientHasActiveAccess} onClick={() => void requestAccess()} className="mt-4 rounded-xl bg-pine-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Solicitar acesso ao prontuário</button></div>}
    </section>}

    {verified && <section className="rounded-2xl border border-line bg-card p-5 shadow-lift">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-mute">Solicitações</p><h3 className="mt-1 font-display text-xl font-bold text-ink">Meus pedidos de acesso</h3></div><button type="button" onClick={() => void load()} className="rounded-xl border border-moss-500 px-3 py-2 text-xs font-bold text-moss-800">Atualizar</button></div>
      {requests.length === 0 ? <p className="mt-4 text-sm text-mute">Nenhuma solicitação enviada.</p> : <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-white"><table className="w-full text-left text-sm"><caption className="sr-only">Pedidos de acesso ao prontuário</caption><thead className="bg-paper text-xs text-mute"><tr><th scope="col" className="px-3 py-2">Paciente</th><th scope="col" className="px-3 py-2">Enviado em</th><th scope="col" className="px-3 py-2">Validade do acesso</th><th scope="col" className="px-3 py-2">Situação</th></tr></thead><tbody>{requests.map(item=><tr key={item.id} className="border-t border-line"><td className="px-3 py-2 font-semibold text-ink">{item.patientName}</td><td className="whitespace-nowrap px-3 py-2 text-xs text-mute">{new Date(item.requestedAt).toLocaleString('pt-BR')}</td><td className="px-3 py-2 text-xs text-mute">{item.status==='approved'?(item.grantValidUntil?new Date(item.grantValidUntil).toLocaleString('pt-BR'):'Por tempo indeterminado'):'—'}</td><td className="px-3 py-2"><span className={`inline-block whitespace-nowrap rounded-full px-2 py-1 text-xs font-bold ${item.status==='approved'?'bg-moss-50 text-moss-800':'bg-paper text-mute'}`}>{requestStatus(item.status)}</span></td></tr>)}</tbody></table></div>}
    </section>}
  </div>;
}


