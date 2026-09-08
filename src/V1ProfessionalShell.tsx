import { useEffect, useMemo, useState } from 'react';
import AccessRequestsPanel from './AccessRequestsPanel';
import ClinicarPanel from './ClinicarPanel';
import ConsultationConfirmationsPanel from './ConsultationConfirmationsPanel';
import ProfessionalConsultationWorkspace from './ProfessionalConsultationWorkspace';
import ProfessionalProfilePanel from './ProfessionalProfilePanel';
import V1PreviewApp from './V1PreviewApp';
import {
  MyDoctorV1Api,
  defaultV1ApiUrl,
  readV1SessionToken,
  subscribeV1SessionToken,
} from './lib/api-v1';

const PROFESSIONAL_EVENT = 'mydoctor:open-professional-profile';
const CLINICAR_EVENT = 'mydoctor:open-clinicar';
const ACCESS_REQUESTS_EVENT = 'mydoctor:open-access-requests';
const CONSULTATION_CONFIRMATIONS_EVENT = 'mydoctor:open-consultation-confirmations';

type ShellView = 'app' | 'professional' | 'clinicar' | 'access-requests' | 'consultation-confirmations';

function addProfessionalMenuEntries() {
  const buttons = Array.from(document.querySelectorAll('button'));
  const logoutButton = buttons.find((button) => button.textContent?.trim() === 'Sair');
  if (!logoutButton?.parentElement) return;
  const menuGrid = logoutButton.parentElement;

  if (!menuGrid.querySelector('[data-mydoctor-consultation-confirmations-entry="true"]')) {
    const confirmationButton = document.createElement('button');
    confirmationButton.type = 'button';
    confirmationButton.dataset.mydoctorConsultationConfirmationsEntry = 'true';
    confirmationButton.className = 'rounded-xl px-4 py-3 text-left text-sm font-bold text-ink hover:bg-paper';
    confirmationButton.textContent = 'Atendimentos para confirmar';
    confirmationButton.addEventListener('click', () => window.dispatchEvent(new Event(CONSULTATION_CONFIRMATIONS_EVENT)));
    menuGrid.insertBefore(confirmationButton, logoutButton);
  }
  if (!menuGrid.querySelector('[data-mydoctor-access-requests-entry="true"]')) {
    const accessButton = document.createElement('button');
    accessButton.type = 'button';
    accessButton.dataset.mydoctorAccessRequestsEntry = 'true';
    accessButton.className = 'rounded-xl px-4 py-3 text-left text-sm font-bold text-ink hover:bg-paper';
    accessButton.textContent = 'Solicitações de acesso';
    accessButton.addEventListener('click', () => window.dispatchEvent(new Event(ACCESS_REQUESTS_EVENT)));
    menuGrid.insertBefore(accessButton, logoutButton);
  }
  if (!menuGrid.querySelector('[data-mydoctor-professional-entry="true"]')) {
    const professionalButton = document.createElement('button');
    professionalButton.type = 'button';
    professionalButton.dataset.mydoctorProfessionalEntry = 'true';
    professionalButton.className = 'rounded-xl px-4 py-3 text-left text-sm font-bold text-ink hover:bg-paper';
    professionalButton.textContent = 'Perfil profissional';
    professionalButton.addEventListener('click', () => window.dispatchEvent(new Event(PROFESSIONAL_EVENT)));
    menuGrid.insertBefore(professionalButton, logoutButton);
  }
  if (!menuGrid.querySelector('[data-mydoctor-clinicar-entry="true"]')) {
    const clinicarButton = document.createElement('button');
    clinicarButton.type = 'button';
    clinicarButton.dataset.mydoctorClinicarEntry = 'true';
    clinicarButton.className = 'rounded-xl px-4 py-3 text-left text-sm font-bold text-ink hover:bg-paper';
    clinicarButton.textContent = 'Clinicar';
    clinicarButton.addEventListener('click', () => window.dispatchEvent(new Event(CLINICAR_EVENT)));
    menuGrid.insertBefore(clinicarButton, logoutButton);
  }
}

export default function V1ProfessionalShell() {
  const [view, setView] = useState<ShellView>('app');
  const [token, setToken] = useState(readV1SessionToken());
  const api = useMemo(() => new MyDoctorV1Api(defaultV1ApiUrl(), token), [token]);

  useEffect(() => subscribeV1SessionToken(setToken), []);
  useEffect(() => {
    const observer = new MutationObserver(() => addProfessionalMenuEntries());
    observer.observe(document.body, { childList: true, subtree: true });
    addProfessionalMenuEntries();
    const openProfessional = () => setView('professional');
    const openClinicar = () => setView('clinicar');
    const openAccessRequests = () => setView('access-requests');
    const openConsultationConfirmations = () => setView('consultation-confirmations');
    window.addEventListener(PROFESSIONAL_EVENT, openProfessional);
    window.addEventListener(CLINICAR_EVENT, openClinicar);
    window.addEventListener(ACCESS_REQUESTS_EVENT, openAccessRequests);
    window.addEventListener(CONSULTATION_CONFIRMATIONS_EVENT, openConsultationConfirmations);
    return () => {
      observer.disconnect();
      window.removeEventListener(PROFESSIONAL_EVENT, openProfessional);
      window.removeEventListener(CLINICAR_EVENT, openClinicar);
      window.removeEventListener(ACCESS_REQUESTS_EVENT, openAccessRequests);
      window.removeEventListener(CONSULTATION_CONFIRMATIONS_EVENT, openConsultationConfirmations);
    };
  }, []);

  const title = view === 'professional' ? 'Perfil profissional' : view === 'clinicar' ? 'Clinicar' : view === 'access-requests' ? 'Solicitações de acesso' : 'Atendimentos para confirmar';

  return <>
    <div className={view === 'app' ? '' : 'hidden'}><V1PreviewApp /></div>
    {view !== 'app' && <main className="min-h-screen bg-paper px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-wide text-moss-700">MyDoctor</p><h1 className="font-display text-2xl font-bold text-ink">{title}</h1></div>
          <button type="button" onClick={() => setView('app')} className="rounded-xl border border-moss-500 px-4 py-3 text-sm font-bold text-moss-800">← Voltar ao MyDoctor</button>
        </div>
        {!token ? <section className="rounded-2xl border border-line bg-card p-5 shadow-lift"><h2 className="font-display text-xl font-bold text-ink">Faça login para continuar</h2><p className="mt-2 text-sm text-mute">Perfil profissional, Clinicar e compartilhamento usam o mesmo login do seu prontuário pessoal.</p><button type="button" onClick={() => setView('app')} className="mt-4 rounded-xl bg-pine-900 px-4 py-3 text-sm font-bold text-white">Voltar ao login</button></section>
          : view === 'professional' ? <ProfessionalProfilePanel api={api} />
          : view === 'clinicar' ? <div className="space-y-5"><ClinicarPanel api={api} onOpenProfessional={() => setView('professional')} /><ProfessionalConsultationWorkspace api={api} /></div>
          : view === 'access-requests' ? <AccessRequestsPanel api={api} />
          : <ConsultationConfirmationsPanel api={api} />}
      </div>
    </main>}
  </>;
}
