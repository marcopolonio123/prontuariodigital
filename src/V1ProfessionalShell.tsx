import { useEffect, useMemo, useState } from 'react';
import ProfessionalProfilePanel from './ProfessionalProfilePanel';
import V1PreviewApp from './V1PreviewApp';
import {
  MyDoctorV1Api,
  defaultV1ApiUrl,
  readV1SessionToken,
  subscribeV1SessionToken,
} from './lib/api-v1';

const PROFESSIONAL_EVENT = 'mydoctor:open-professional-profile';

function addProfessionalMenuEntry() {
  const buttons = Array.from(document.querySelectorAll('button'));
  const logoutButton = buttons.find((button) => button.textContent?.trim() === 'Sair');
  if (!logoutButton?.parentElement) return;

  const menuGrid = logoutButton.parentElement;
  if (menuGrid.querySelector('[data-mydoctor-professional-entry="true"]')) return;

  const professionalButton = document.createElement('button');
  professionalButton.type = 'button';
  professionalButton.dataset.mydoctorProfessionalEntry = 'true';
  professionalButton.className = 'rounded-xl px-4 py-3 text-left text-sm font-bold text-ink hover:bg-paper';
  professionalButton.textContent = 'Perfil profissional';
  professionalButton.addEventListener('click', () => {
    window.dispatchEvent(new Event(PROFESSIONAL_EVENT));
  });
  menuGrid.insertBefore(professionalButton, logoutButton);
}

export default function V1ProfessionalShell() {
  const [showProfessional, setShowProfessional] = useState(false);
  const [token, setToken] = useState(readV1SessionToken());
  const api = useMemo(() => new MyDoctorV1Api(defaultV1ApiUrl(), token), [token]);

  useEffect(() => subscribeV1SessionToken(setToken), []);

  useEffect(() => {
    const observer = new MutationObserver(() => addProfessionalMenuEntry());
    observer.observe(document.body, { childList: true, subtree: true });
    addProfessionalMenuEntry();

    const openProfessional = () => setShowProfessional(true);
    window.addEventListener(PROFESSIONAL_EVENT, openProfessional);
    return () => {
      observer.disconnect();
      window.removeEventListener(PROFESSIONAL_EVENT, openProfessional);
    };
  }, []);

  return <>
    <div className={showProfessional ? 'hidden' : ''}>
      <V1PreviewApp />
    </div>

    {showProfessional && <main className="min-h-screen bg-paper px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-moss-700">MyDoctor</p>
            <h1 className="font-display text-2xl font-bold text-ink">Perfil profissional</h1>
          </div>
          <button type="button" onClick={() => setShowProfessional(false)} className="rounded-xl border border-moss-500 px-4 py-3 text-sm font-bold text-moss-800">← Voltar ao MyDoctor</button>
        </div>

        {!token ? <section className="rounded-2xl border border-line bg-card p-5 shadow-lift">
          <h2 className="font-display text-xl font-bold text-ink">Faça login para continuar</h2>
          <p className="mt-2 text-sm text-mute">O perfil profissional usa o mesmo login do seu prontuário pessoal.</p>
          <button type="button" onClick={() => setShowProfessional(false)} className="mt-4 rounded-xl bg-pine-900 px-4 py-3 text-sm font-bold text-white">Voltar ao login</button>
        </section> : <ProfessionalProfilePanel api={api} />}
      </div>
    </main>}
  </>;
}
