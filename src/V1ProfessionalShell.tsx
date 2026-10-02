import { useEffect, useMemo, useState } from 'react';
import IdentificationHistoryPanel from './IdentificationHistoryPanel';
import PublicUtilityPanel from './PublicUtilityPanel';
import { NavigationIcon } from './components/DashboardNavigation';
import { ProfessionalLocationsPage } from './components/ProfessionalLocations';
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

type ShellView = 'identification-history' | 'utility' | 'administration' | 'app' | 'professional' | 'clinicar' | 'professional-locations' | 'professional-access' | 'access-requests' | 'consultation-confirmations';

export default function V1ProfessionalShell() {
  const [view, setView] = useState<ShellView>('app');
  const [recordRefresh, setRecordRefresh] = useState(0);
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
    if (token && ['clinicar','professional-locations','professional-access'].includes(view)) Promise.all([api.getAccount(), api.getProfessionalProfile()]).then(([account, profile]) => { if (current) setCanClinicar(Boolean(account.isHealthProfessional && profile?.active && profile.verificationStatus === 'verified')); }).catch(() => {}).finally(() => { if (current) setCheckingClinicar(false); });
    else setCheckingClinicar(false);
    return () => { current = false; };
  }, [api, token, view]);

  const title = view === 'identification-history' ? 'Acessos à minha digital' : view === 'utility' ? 'Identificar Pessoa' : view === 'administration' ? 'Administração' : view === 'professional' ? 'Validação de cadastro profissional' : view === 'clinicar' ? 'Atendimento' : view === 'professional-locations' ? 'Locais que atendo' : view === 'professional-access' ? 'Solicitar acesso ao prontuário do paciente' : view === 'access-requests' ? 'Solicitações de acesso' : 'Atendimentos para confirmar';

  return <>
    <RecordDictationEnhancer />
    <div className={view === 'app' ? '' : 'hidden'}><V1PreviewApp recordRefresh={recordRefresh} canAdmin={canAdmin} onNavigate={setView} /></div>
    {view !== 'app' && <main className="min-h-screen bg-paper px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-wide text-moss-700">MyDoctor</p><h1 className="font-display text-2xl font-bold text-ink">{title}</h1></div>
          <button type="button" onClick={() => setView('app')} className="rounded-xl border border-moss-500 px-4 py-3 text-sm font-bold text-moss-800">← Voltar ao MyDoctor</button>
        </div>
        {token && ['professional','clinicar','professional-locations','professional-access'].includes(view) && <nav aria-label="Navegação profissional" className="mb-5 flex flex-wrap gap-2">{([['clinicar','Atendimento'],['professional-access','Solicitar acesso ao prontuário do paciente'],['professional-locations','Locais que atendo'],['professional','Validação de cadastro profissional']] as const).map(([key,label])=><button type="button" key={key} aria-current={view===key?'page':undefined} onClick={()=>setView(key)} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${view===key?'border-moss-500 bg-moss-50 text-moss-800':'border-line text-ink'}`}><NavigationIcon destination={key} className="h-5 w-5 shrink-0"/>{label}</button>)}</nav>}
        {!token ? <section className="rounded-2xl border border-line bg-card p-5 shadow-lift"><h2 className="font-display text-xl font-bold text-ink">Faça login para continuar</h2><p className="mt-2 text-sm text-mute">Perfil profissional, Clinicar e compartilhamento usam o mesmo login do seu prontuário pessoal.</p><button type="button" onClick={() => setView('app')} className="mt-4 rounded-xl bg-pine-900 px-4 py-3 text-sm font-bold text-white">Voltar ao login</button></section>
          : view === 'identification-history' ? <IdentificationHistoryPanel key={token} api={api} canAdmin={canAdmin}/>
          : view === 'utility' ? <PublicUtilityPanel key={token} api={api}/>
          : view === 'administration' ? <ProfessionalAdminPanel api={api} />
          : view === 'professional' ? <ProfessionalProfilePanel api={api} />
          : view === 'professional-access' ? (checkingClinicar ? <p role="status">Verificando habilitação profissional...</p> : canClinicar ? <ClinicarPanel api={api} onOpenProfessional={()=>setView('professional')}/> : <section className="rounded-xl border border-line bg-card p-5">Solicitar acesso exige perfil profissional aprovado.</section>)
          : view === 'professional-locations' ? (checkingClinicar ? <p role="status">Verificando habilitação profissional...</p> : canClinicar ? <ProfessionalLocationsPage api={api}/> : <section className="rounded-xl border border-line bg-card p-5">Locais de atendimento serão liberados após a aprovação do seu perfil profissional.</section>)
          : view === 'clinicar' ? (checkingClinicar ? <p role="status">Verificando habilitação profissional...</p> : !canClinicar ? <section className="rounded-xl border border-line bg-card p-5">Clinicar será liberado após a aprovação do seu perfil profissional.</section> : <ProfessionalConsultationWorkspace api={api} />)
          : view === 'access-requests' ? <AccessRequestsPanel api={api} />
          : <ConsultationConfirmationsPanel api={api} onDecision={() => setRecordRefresh(value => value + 1)} />}
      </div>
    </main>}
  </>;
}
