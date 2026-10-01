import { useEffect, useMemo, useState } from 'react';
import ProfessionalAdminPanel from './ProfessionalAdminPanel';
import AccessRequestsPanel from './AccessRequestsPanel';
import ClinicarPanel from './ClinicarPanel';
import ConsultationConfirmationsPanel from './ConsultationConfirmationsPanel';
import ProfessionalConsultationWorkspace from './ProfessionalConsultationWorkspace';
import ProfessionalProfilePanel from './ProfessionalProfilePanel';
import V1PreviewApp from './V1PreviewApp';
import RecordDictationEnhancer from './components/RecordDictationEnhancer';
import {
  MyDoctorV1Api,
  defaultV1ApiUrl,
  readV1SessionToken,
  subscribeV1SessionToken,
} from './lib/api-v1';

type ShellView = 'administration' | 'app' | 'professional' | 'clinicar' | 'access-requests' | 'consultation-confirmations';

export default function V1ProfessionalShell() {
  const [view, setView] = useState<ShellView>('app');
  const [token, setToken] = useState(readV1SessionToken());
  const [canClinicar, setCanClinicar] = useState(false);
  const [checkingClinicar, setCheckingClinicar] = useState(true);
  const [canAdmin, setCanAdmin] = useState(false);
  const api = useMemo(() => new MyDoctorV1Api(defaultV1ApiUrl(), token), [token]);

  useEffect(() => subscribeV1SessionToken(setToken), []);
  useEffect(() => {
    let current = true; setCanAdmin(false);
    if (token) api.getAdminSession().then(result => { if (current) setCanAdmin(result.authorized); }).catch(() => { if (current) setCanAdmin(false); });
    return () => { current = false; };
  }, [api, token]);
  useEffect(() => { if (!token) setView('app'); }, [token]);
  useEffect(() => {
    let current = true; setCanClinicar(false); setCheckingClinicar(true);
    if (token && view === 'clinicar') Promise.all([api.getAccount(), api.getProfessionalProfile()]).then(([account, profile]) => { if (current) setCanClinicar(Boolean(account.isHealthProfessional && profile?.active && profile.verificationStatus === 'verified')); }).catch(() => {}).finally(() => { if (current) setCheckingClinicar(false); });
    else setCheckingClinicar(false);
    return () => { current = false; };
  }, [api, token, view]);

  const title = view === 'administration' ? 'Administração' : view === 'professional' ? 'Perfil profissional' : view === 'clinicar' ? 'Clinicar' : view === 'access-requests' ? 'Solicitações de acesso' : 'Atendimentos para confirmar';

  return <>
    <RecordDictationEnhancer />
    <div className={view === 'app' ? '' : 'hidden'}><V1PreviewApp canAdmin={canAdmin} onNavigate={setView} /></div>
    {view !== 'app' && <main className="min-h-screen bg-paper px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-wide text-moss-700">MyDoctor</p><h1 className="font-display text-2xl font-bold text-ink">{title}</h1></div>
          <button type="button" onClick={() => setView('app')} className="rounded-xl border border-moss-500 px-4 py-3 text-sm font-bold text-moss-800">← Voltar ao MyDoctor</button>
        </div>
        {!token ? <section className="rounded-2xl border border-line bg-card p-5 shadow-lift"><h2 className="font-display text-xl font-bold text-ink">Faça login para continuar</h2><p className="mt-2 text-sm text-mute">Perfil profissional, Clinicar e compartilhamento usam o mesmo login do seu prontuário pessoal.</p><button type="button" onClick={() => setView('app')} className="mt-4 rounded-xl bg-pine-900 px-4 py-3 text-sm font-bold text-white">Voltar ao login</button></section>
          : view === 'administration' ? <ProfessionalAdminPanel api={api} />
          : view === 'professional' ? <ProfessionalProfilePanel api={api} />
          : view === 'clinicar' ? (checkingClinicar ? <p role="status">Verificando habilitação profissional...</p> : !canClinicar ? <section className="rounded-xl border border-line bg-card p-5">Clinicar será liberado após a aprovação do seu perfil profissional.</section> : <div className="space-y-5"><ClinicarPanel api={api} onOpenProfessional={() => setView('professional')} /><ProfessionalConsultationWorkspace api={api} /></div>)
          : view === 'access-requests' ? <AccessRequestsPanel api={api} />
          : <ConsultationConfirmationsPanel api={api} />}
      </div>
    </main>}
  </>;
}

