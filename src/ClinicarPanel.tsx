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

  const requestAccess = async () => {
    if (!patient) return;
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
      <p className="text-xs font-bold uppercase tracking-wide text-moss-700">Clinicar</p>
      <h2 className="mt-1 font-display text-2xl font-bold text-ink">Atendimento profissional pelo MyDoctor</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-mute">O profissional usa a mesma conta pessoal. Para atender outro usuário, primeiro solicita acesso ao prontuário; o paciente precisa autorizar antes de qualquer consulta aos dados.</p>
    </section>

    <section className="rounded-2xl border border-line bg-card p-5 shadow-lift">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-mute">Habilitação</p><h3 className="mt-1 font-display text-xl font-bold text-ink">{status.title}</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-mute">{status.detail}</p>{profile && <p className="mt-3 text-sm text-ink"><strong>{profile.name}</strong>{profile.profession ? ` · ${profile.profession}` : ''}{profile.specialty ? ` · ${profile.specialty}` : ''}</p>}</div><span className={`rounded-full px-3 py-2 text-xs font-bold ${verified ? 'bg-moss-50 text-moss-800' : 'bg-paper text-mute'}`}>{verified ? 'Clinicar habilitado' : 'Clinicar bloqueado'}</span></div>
      {!verified ? <div className="mt-5 rounded-xl border border-line bg-white p-4"><p className="text-sm text-mute">Por segurança, nenhum prontuário de terceiro pode ser solicitado ou acessado enquanto o perfil profissional não estiver verificado.</p><button type="button" onClick={onOpenProfessional} className="mt-4 rounded-xl bg-pine-900 px-4 py-3 text-sm font-bold text-white">Abrir Perfil profissional</button></div> : <div className="mt-5 grid gap-3 md:grid-cols-3"><article className="rounded-xl border border-line bg-white p-4"><span className="text-xs font-bold text-moss-700">1</span><h4 className="mt-1 font-bold text-ink">Solicitar acesso</h4><p className="mt-1 text-sm text-mute">Localizar o paciente pelo e-mail exato cadastrado no MyDoctor.</p></article><article className="rounded-xl border border-line bg-white p-4"><span className="text-xs font-bold text-moss-700">2</span><h4 className="mt-1 font-bold text-ink">Paciente autoriza</h4><p className="mt-1 text-sm text-mute">O paciente confirma o profissional antes de liberar qualquer dado.</p></article><article className="rounded-xl border border-line bg-white p-4"><span className="text-xs font-bold text-moss-700">3</span><h4 className="mt-1 font-bold text-ink">Realizar atendimento</h4><p className="mt-1 text-sm text-mute">Após autorização, o prontuário fica disponível por período controlado.</p></article></div>}
      {message && <p className="mt-4 rounded-xl border border-line bg-white p-3 text-sm text-mute">{message}</p>}
    </section>

    {verified && <section className="rounded-2xl border border-line bg-card p-5 shadow-lift">
      <p className="text-xs font-bold uppercase tracking-wide text-moss-700">Solicitar compartilhamento</p>
      <h3 className="mt-1 font-display text-xl font-bold text-ink">Localizar paciente MyDoctor</h3>
      <p className="mt-2 text-sm text-mute">Use somente o e-mail informado pelo próprio paciente. A busca não permite pesquisar por nome, evitando exposição da base de usuários.</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row"><input type="email" value={patientEmail} onChange={(e) => { setPatientEmail(e.target.value); setPatient(null); }} placeholder="email@paciente.com" className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-3 text-sm outline-none focus:border-moss-500" /><button type="button" disabled={busy} onClick={() => void findPatient()} className="rounded-xl bg-pine-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Consultando...' : 'Localizar paciente'}</button></div>
      {patient && <div className="mt-4 rounded-xl border border-moss-500 bg-moss-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-moss-700">Paciente localizado</p><h4 className="mt-1 font-bold text-ink">{patient.name}</h4><p className="mt-1 text-sm text-mute">Nenhum dado clínico foi aberto. Envie a solicitação para o paciente decidir.</p><button type="button" disabled={busy} onClick={() => void requestAccess()} className="mt-4 rounded-xl bg-pine-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Solicitar acesso ao prontuário</button></div>}
    </section>}

    {verified && <section className="rounded-2xl border border-line bg-card p-5 shadow-lift">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-mute">Solicitações</p><h3 className="mt-1 font-display text-xl font-bold text-ink">Meus pedidos de acesso</h3></div><button type="button" onClick={() => void load()} className="rounded-xl border border-moss-500 px-3 py-2 text-xs font-bold text-moss-800">Atualizar</button></div>
      {requests.length === 0 ? <p className="mt-4 text-sm text-mute">Nenhuma solicitação enviada.</p> : <div className="mt-4 space-y-3">{requests.map((item) => <article key={item.id} className="rounded-xl border border-line bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-bold text-ink">{item.patientName}</h4><p className="mt-1 text-xs text-mute">Enviado em {new Date(item.requestedAt).toLocaleString('pt-BR')}</p>{item.status === 'approved' && item.grantValidUntil && <p className="mt-1 text-xs text-moss-700">Acesso válido até {new Date(item.grantValidUntil).toLocaleString('pt-BR')}</p>}</div><span className={`rounded-full px-3 py-2 text-xs font-bold ${item.status === 'approved' ? 'bg-moss-50 text-moss-800' : 'bg-paper text-mute'}`}>{requestStatus(item.status)}</span></div></article>)}</div>}
    </section>}
  </div>;
}
