import { useEffect, useState } from 'react';
import type { MyDoctorV1Api, ProfessionalProfileV1 } from './lib/api-v1';

function statusCopy(status?: string) {
  switch (status) {
    case 'verified': return { title: 'Profissional verificado', detail: 'Seu perfil profissional está validado. Você poderá iniciar solicitações de acesso a prontuários de pacientes.' };
    case 'pending': return { title: 'Validação em andamento', detail: 'Seus dados profissionais foram enviados. Clinicar será liberado somente depois da validação.' };
    case 'rejected': return { title: 'Validação recusada', detail: 'Revise seus dados profissionais e envie novamente para análise.' };
    case 'suspended': return { title: 'Acesso profissional suspenso', detail: 'Clinicar está temporariamente indisponível para este perfil.' };
    default: return { title: 'Perfil profissional não validado', detail: 'Cadastre seus dados profissionais para iniciar o processo de validação.' };
  }
}

export default function ClinicarPanel({ api, onOpenProfessional }: { api: MyDoctorV1Api; onOpenProfessional: () => void }) {
  const [profile, setProfile] = useState<ProfessionalProfileV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    void api.getProfessionalProfile()
      .then((result) => { if (active) setProfile(result); })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : 'Não foi possível consultar seu perfil profissional.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api]);

  if (loading) {
    return <section className="rounded-2xl border border-line bg-card p-5 shadow-lift"><p className="text-sm text-mute">Verificando habilitação profissional...</p></section>;
  }

  const verified = profile?.verificationStatus === 'verified' && profile.active;
  const status = statusCopy(profile?.verificationStatus);

  return <div className="space-y-5">
    <section className="rounded-2xl border border-line bg-card p-5 shadow-lift">
      <p className="text-xs font-bold uppercase tracking-wide text-moss-700">Clinicar</p>
      <h2 className="mt-1 font-display text-2xl font-bold text-ink">Atendimento profissional pelo MyDoctor</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-mute">O profissional usa a mesma conta pessoal. Para atender outro usuário, primeiro solicita acesso ao prontuário; o paciente precisa autorizar antes de qualquer consulta aos dados.</p>
    </section>

    <section className="rounded-2xl border border-line bg-card p-5 shadow-lift">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-mute">Habilitação</p>
          <h3 className="mt-1 font-display text-xl font-bold text-ink">{status.title}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-mute">{status.detail}</p>
          {profile && <p className="mt-3 text-sm text-ink"><strong>{profile.name}</strong>{profile.profession ? ` · ${profile.profession}` : ''}{profile.specialty ? ` · ${profile.specialty}` : ''}</p>}
        </div>
        <span className={`rounded-full px-3 py-2 text-xs font-bold ${verified ? 'bg-moss-50 text-moss-800' : 'bg-paper text-mute'}`}>{verified ? 'Clinicar habilitado' : 'Clinicar bloqueado'}</span>
      </div>

      {!verified ? <div className="mt-5 rounded-xl border border-line bg-white p-4">
        <p className="text-sm text-mute">Por segurança, nenhum prontuário de terceiro pode ser solicitado ou acessado enquanto o perfil profissional não estiver verificado.</p>
        <button type="button" onClick={onOpenProfessional} className="mt-4 rounded-xl bg-pine-900 px-4 py-3 text-sm font-bold text-white">Abrir Perfil profissional</button>
      </div> : <div className="mt-5 grid gap-3 md:grid-cols-3">
        <article className="rounded-xl border border-line bg-white p-4"><span className="text-xs font-bold text-moss-700">1</span><h4 className="mt-1 font-bold text-ink">Solicitar acesso</h4><p className="mt-1 text-sm text-mute">Localizar o paciente MyDoctor e enviar uma solicitação de compartilhamento.</p></article>
        <article className="rounded-xl border border-line bg-white p-4"><span className="text-xs font-bold text-moss-700">2</span><h4 className="mt-1 font-bold text-ink">Paciente autoriza</h4><p className="mt-1 text-sm text-mute">O paciente confirma o profissional, o escopo e o período de acesso.</p></article>
        <article className="rounded-xl border border-line bg-white p-4"><span className="text-xs font-bold text-moss-700">3</span><h4 className="mt-1 font-bold text-ink">Realizar atendimento</h4><p className="mt-1 text-sm text-mute">Após autorização, o atendimento poderá ser registrado e enviado para confirmação do paciente.</p></article>
      </div>}

      {verified && <button type="button" disabled className="mt-5 rounded-xl bg-pine-900 px-4 py-3 text-sm font-bold text-white opacity-50">Solicitar acesso ao paciente — próxima etapa</button>}
      {message && <p className="mt-4 text-sm text-danger-600">{message}</p>}
    </section>
  </div>;
}
