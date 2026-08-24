import { Component, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from 'react';
import type { Account, AppState, ClinicalEntry, IdEvent, Patient, Route } from './lib/types';
import { accessiblePatients, emptyState, loadState, saveState, seedDemoState } from './lib/store';
import { ageFromBirth } from './lib/biometrics';
import { Avatar, Btn, Ecg, Modal, ToastProvider, useToast } from './components/ui';
import {
  IconBrain, IconChart, IconCheck, IconChevronRight, IconCreditCard, IconDownload, IconFace, IconFileText,
  IconCloud, IconGear, IconHeartPulse, IconLogout, IconMapPin, IconMegaphone, IconUsers, LogoMark,
} from './components/icons';
import { LoginScreen } from './screens/LoginScreen';
import { LgpdConsent } from './components/LgpdConsent';
import { PatientsScreen } from './screens/PatientsScreen';
import { RecordScreen } from './screens/RecordScreen';
import { PublicUtilityScreen } from './screens/PublicUtilityScreen';
import { CloudScreen } from './screens/CloudScreen';
import { ConsultantScreen } from './screens/ConsultantScreen';
import { VitalsScreen } from './screens/VitalsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { InsuranceScreen } from './screens/InsuranceScreen';

const DEMO_SCENARIOS = [
  {
    title: 'Entrar com acesso delegado',
    badge: 'login + delegação',
    steps: [
      'Na tela de acesso, escolha a conta “Marina Sampaio Reis” e digite o PIN 1234.',
      'No passo “qual prontuário abrir”, escolha Ana Beatriz — aparece o selo “delegado por Ana”.',
      'Marina é filha e responsável: cuida do prontuário da mãe, que já não opera o app sozinha.',
    ],
    expect: 'Você entra direto no contexto da Ana, com o seletor de prontuário no topo.',
  },
  {
    title: 'Medicamentos contínuos & convênios',
    badge: 'cadastro',
    steps: [
      'Em Pessoas & prontuários, edite a Ana: a seção “Medicamentos de uso contínuo” tem nome, dose, frequência e motivo.',
      'Logo abaixo, em “Convênios & seguro saúde”, adicione um plano com nº da carteirinha, validade e a foto da carteirinha (câmera ou arquivo).',
      'Na Utilidade pública → aba Identificação, “Testar com exemplo” — o Cartão de Emergência exibe os medicamentos e o convênio com validade.',
    ],
    expect: 'Cartão de emergência completo para hospitais: o que toma, alergias e o plano de saúde com a carteirinha.',
  },
  {
    title: 'Desaparecida + alerta na identificação',
    badge: 'caso principal',
    steps: [
      'Na Utilidade pública → aba Identificação, clique em “Testar com exemplo”.',
      'Ana é confirmada, o Cartão de Emergência abre e o alerta vermelho de desaparecida dispara.',
      'Na Rede de avisos, abra o WhatsApp da Marina (1º contato) e registre os avisos na auditoria.',
      'Clique em “Marcar como localizada” para encerrar o caso.',
    ],
    expect: 'Fluxo completo: identificar → alertar → avisar → localizar, tudo auditado com o seu nome.',
  },
  {
    title: 'Utilidade pública — emergência/vulnerabilidade',
    badge: 'utilidade pública',
    steps: [
      'Na Utilidade pública, a aba “Emergência/Vulnerabilidade” mostra o Carlos internado sem contato com a família.',
      'Na aba Identificação, envie a foto do Carlos (ou teste com o retrato dele): o alerta âmbar dispara junto do cartão médico.',
      'Avise a rede de contatos pelo WhatsApp e marque a situação como resolvida.',
      'Na aba “Desaparecidos”, reporte um desaparecimento e registre avistamentos na linha do tempo do caso.',
    ],
    expect: 'Dois serviços públicos no mesmo hub: desaparecidos (vermelho) e emergências (âmbar), ambos com rede de avisos e trilha de auditoria.',
  },
  {
    title: 'Identificar alguém em campo',
    badge: 'utilidade pública',
    steps: [
      'Na Utilidade pública, clique em “Identificar alguém agora” (canto superior direito).',
      'Fotografe a pessoa, envie uma imagem ou use “simular com exemplo”. O app cruza o retrato com a base em segundos.',
      'Ao confirmar a identidade, você pode avisar a rede de contatos na hora ou registrar um desaparecimento/emergência já com a foto capturada anexada ao caso.',
      'Se a pessoa não estiver na base, o app oferece cadastrá-la como nova pessoa com o retrato capturado.',
    ],
    expect: 'Fluxo de resgate: encontrar → identificar → avisar parentes/amigos → registrar o caso com evidências (fotos/arquivos).',
  },
  {
    title: 'Consultor IA (qualquer pessoa com acesso)',
    badge: 'prontuário + sintomas',
    steps: [
      'Abra o Consultor e escolha um prontuário — o seu ou um delegado (ex.: Marina escolhendo o da mãe, Ana).',
      'Pergunte “Estou com febre e dor no corpo”.',
      'Para a Ana (alergia a dipirona), a dipirona sai como EVITAR e o paracetamol como compatível.',
      'Use o seletor no topo para trocar de prontuário — cada conversa analisa a pessoa escolhida.',
    ],
    expect: 'Resposta cruzada com o prontuário da pessoa logada/identificada + sinais de emergência + aviso médico.',
  },
  {
    title: 'Prescrição, exames, anexos e voz',
    badge: 'prontuário',
    steps: [
      'No prontuário da Ana, clique na seta do registro “Avaliação geriátrica” — abre a prescrição e os exames solicitados.',
      'Crie um novo registro: nos campos de prescrição/exames/anotações, use o botão “ditar” para escrever pela voz (Chrome/Edge) ou anexe foto/PDF da receita.',
      'Filtre por especialidade (ex.: Neurologia) e use Compartilhar/Exportar — o texto sai no resumo e os anexos no JSON.',
      'Passe o mouse sobre um registro e clique no ícone de arquivo — é arquivado, nunca excluído (anexos preservados).',
    ],
    expect: 'Registros com receita/exames descritivos ou digitalizados, visualização, download e exportação por especialidade.',
  },
  {
    title: 'Câmera ao vivo',
    badge: 'permissão necessária',
    steps: [
      'Na aba Identificação (Utilidade pública), clique em “Usar câmera” e permita o acesso (exige HTTPS ou localhost).',
      'Enquadre o rosto e capture. Se for bloqueada, use o fallback “Enviar imagem”.',
    ],
    expect: 'Captura espelhada com varredura e análise imediata.',
  },
  {
    title: 'Impressão digital',
    badge: 'sensor simulado',
    steps: [
      'Troque para “Impressão digital” e pressione & segure o sensor.',
      'Fique imóvel para qualidade alta; mover o dedo reduz a qualidade.',
    ],
    expect: 'Leitura com qualidade calculada pela imobilidade do dedo.',
  },
  {
    title: 'Sinais vitais (monitorar, gráficos & relação)',
    badge: 'novo',
    steps: [
      'Abra “Sinais vitais” — o prontuário ativo é o da pessoa logada ou delegada (ex.: Marina monitorando a mãe).',
      'Clique em “Iniciar” para uma sessão ao vivo (FC, pressão, SpO₂, temperatura) e deixe “gravar no histórico” ativo; pare quando quiser.',
      'Em “Variações por sinal”, clique num sinal (ou na aba dele) e veja o gráfico com faixa de normalidade, estatísticas e filtro 24h/7d/30d/tudo.',
      'Em “Relação entre sinais”, compare dois sinais medidos na mesma captura (ex.: FC × Pressão) e veja o coeficiente de correlação.',
      'O histórico abaixo mostra só o sinal escolhido — as últimas medições de todos os sinais continuam nos cartões ao lado.',
    ],
    expect: 'Monitoramento com data/hora, gráficos de variação por sinal, relação entre sinais e histórico otimizado — tudo no prontuário autorizado.',
  },
  {
    title: 'Nuvem & servidor (multiusuário)',
    badge: 'novo',
    steps: [
      'Abra “Nuvem & servidor” na barra lateral e conecte ao servidor de demonstração (crie uma conta).',
      'Clique em “Sincronizar agora” — as fichas sobem e o servidor vira a fonte da verdade.',
      'Desconecte, crie uma segunda conta e sincronize: cada usuário vê só as próprias fichas e as delegadas.',
      'Para o servidor definitivo, suba a pasta server/ (Node + PostgreSQL) — passo a passo em server/README.md.',
    ],
    expect: 'App conectado a um servidor com banco de dados, contas individuais e sincronização real.',
  },
];

function DemoGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Roteiro de demonstração" subtitle={`${DEMO_SCENARIOS.length} cenários para testar o My Doctor de ponta a ponta.`} width="max-w-2xl">
      <ol className="space-y-4">
        {DEMO_SCENARIOS.map((s, i) => (
          <li key={s.title} className="rounded-xl border border-line bg-paper/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-pine-900 font-mono text-xs font-bold text-white">{i + 1}</span>
              <h3 className="font-display text-[15px] font-bold text-ink">{s.title}</h3>
              <span className="ml-auto rounded-full bg-moss-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-moss-700">{s.badge}</span>
            </div>
            <ul className="mt-2.5 space-y-1.5">
              {s.steps.map((st) => (
                <li key={st} className="flex gap-2 text-[13px] leading-relaxed text-mute">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-moss-500" />
                  {st}
                </li>
              ))}
            </ul>
            <p className="mt-2.5 rounded-lg bg-moss-50 px-3 py-1.5 text-xs font-semibold text-moss-700">
              Resultado esperado: {s.expect}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-4 flex items-start gap-2 text-[12px] leading-relaxed text-mute">
        <IconMapPin size={14} className="mt-0.5 shrink-0 text-moss-600" />
        Tudo fica salvo apenas neste navegador (localStorage). Contas de exemplo usam o PIN 1234. Use Dados &amp;
        privacidade para exportar um backup JSON a qualquer momento.
      </p>
    </Modal>
  );
}

const NAV: Array<{ key: 'patients' | 'insurance' | 'consultor' | 'vitals' | 'missing' | 'settings'; label: string; short: string; icon: ReactNode }> = [
  { key: 'patients', label: 'Pessoas & prontuários', short: 'Pacientes', icon: <IconUsers size={18} /> },
  { key: 'insurance', label: 'Convênios & planos', short: 'Convênios', icon: <IconCreditCard size={18} /> },
  { key: 'consultor', label: 'Consultor IA', short: 'Consultor', icon: <IconBrain size={18} /> },
  { key: 'vitals', label: 'Sinais vitais', short: 'Sinais vitais', icon: <IconHeartPulse size={18} /> },
  { key: 'missing', label: 'Utilidade pública', short: 'Utilidade pública', icon: <IconMegaphone size={18} /> },
  { key: 'settings', label: 'Dados & privacidade', short: 'Dados', icon: <IconGear size={18} /> },
];

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function Shell() {
  const toast = useToast();
  const [state, setState] = useState<AppState>(() => loadState());
  const [route, setRoute] = useState<Route>({ name: 'patients' });
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [pendingEditId, setPendingEditId] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [recordMenuOpen, setRecordMenuOpen] = useState(false);

  /* ------------------------- PWA: instalar & offline ------------------------ */
  const [online, setOnline] = useState(() => navigator.onLine);
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [appInstalled, setAppInstalled] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches,
  );
  const [installHelp, setInstallHelp] = useState(false);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setAppInstalled(true);
      setInstallEvt(null);
      toast('success', 'My Doctor instalado! Agora ele abre como app, pelo ícone na tela inicial.');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [toast]);

  const doInstall = async () => {
    if (installEvt) {
      await installEvt.prompt();
      const choice = await installEvt.userChoice;
      if (choice.outcome === 'accepted') setInstallEvt(null);
    } else {
      setInstallHelp(true);
    }
  };

  const installButton = (compact: boolean) => {
    if (appInstalled) {
      return compact ? null : (
        <p className="flex items-center gap-2 rounded-lg border border-pine-700 bg-pine-850 px-3.5 py-2.5 text-xs font-semibold text-pine-200">
          <IconCheck size={14} className="text-moss-300" /> App instalado neste dispositivo
        </p>
      );
    }
    return (
      <button
        onClick={() => void doInstall()}
        className={`flex items-center justify-center gap-2 rounded-lg border border-moss-500/35 bg-moss-500/10 font-semibold text-moss-300 transition-all hover:border-moss-400 hover:bg-moss-500/20 hover:text-moss-200 active:scale-[0.98] ${
          compact ? 'px-2.5 py-1.5 text-[11px]' : 'w-full px-3.5 py-2.5 text-sm'
        }`}
      >
        <IconDownload size={compact ? 13 : 16} />
        {compact ? 'Instalar' : 'Instalar app'}
        {!compact && (
          <span className="ml-auto font-mono text-[10px] uppercase tracking-widest opacity-70">PWA</span>
        )}
      </button>
    );
  };

  useEffect(() => {
    if (!saveState(state)) {
      toast('error', 'Não foi possível salvar no navegador — armazenamento cheio.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const account = useMemo(
    () => (state.session ? state.accounts.find((a) => a.id === state.session!.accountId) ?? null : null),
    [state.session, state.accounts],
  );
  const accessible = useMemo(
    () => (account ? accessiblePatients(state, account.id) : []),
    [state, account],
  );
  const activePatient = useMemo(
    () =>
      state.session?.patientId
        ? state.patients.find((p) => p.id === state.session!.patientId && !p.archived) ?? null
        : null,
    [state.session, state.patients],
  );

  const setSession = (session: AppState['session']) => setState((s) => ({ ...s, session }));

  /* ------------------------------ ações ------------------------------ */
  const addPatient = (p: Patient) => setState((s) => ({ ...s, patients: [...s.patients, p] }));
  const updatePatient = (p: Patient) =>
    setState((s) => ({ ...s, patients: s.patients.map((x) => (x.id === p.id ? p : x)) }));
  const archivePatient = (id: string) =>
    setState((s) => ({ ...s, patients: s.patients.map((x) => (x.id === id ? { ...x, archived: true } : x)) }));
  const restorePatient = (id: string) =>
    setState((s) => ({ ...s, patients: s.patients.map((x) => (x.id === id ? { ...x, archived: false } : x)) }));
  const replacePatients = (patients: Patient[]) => setState((s) => ({ ...s, patients }));
  const addEntry = (pid: string, e: ClinicalEntry) =>
    setState((s) => ({ ...s, patients: s.patients.map((p) => (p.id === pid ? { ...p, entries: [...p.entries, e] } : p)) }));
  const setEntryArchived = (pid: string, eid: string, archived: boolean) =>
    setState((s) => ({
      ...s,
      patients: s.patients.map((p) =>
        p.id === pid ? { ...p, entries: p.entries.map((e) => (e.id === eid ? { ...e, archived } : e)) } : p,
      ),
    }));
  const logEvent = (evt: IdEvent) => setState((s) => ({ ...s, log: [evt, ...s.log].slice(0, 60) }));
  const loadDemo = () => {
    setState((s) => seedDemoState(s));
    toast('success', 'Dados de exemplo carregados: 3 pessoas, 4 contas e uma rede de avisos.');
  };
  const importState = (s: AppState) => {
    setState(s);
    toast('success', `Backup importado: ${s.patients.length} pessoa(s) restaurada(s).`);
  };
  const addAccount = (acc: Account) => setState((s) => ({ ...s, accounts: [...s.accounts, acc] }));
  const login = (accountId: string, patientId: string | null) => setSession({ accountId, patientId });
  const logout = () => {
    setSession(null);
    setRoute({ name: 'patients' });
    toast('info', 'Sessão encerrada. Até logo!');
  };

  /* --------------------------- LGPD (consentimento) --------------------------- */
  const acceptConsent = () => {
    setState((s) => ({ ...s, lgpdConsentedAt: Date.now() }));
    toast('success', 'Consentimento de privacidade registrado. Bem-vindo(a) ao My Doctor!');
  };
  const revokeConsent = () => {
    setState((s) => ({ ...s, lgpdConsentedAt: null }));
    toast('info', 'Consentimento revogado — o aviso de privacidade voltará a ser exibido.');
  };
  const wipeAll = () => {
    setState(emptyState());
    toast('info', 'Base local eliminada deste navegador (direito LGPD).');
  };

  const consentBanner = state.lgpdConsentedAt === null ? <LgpdConsent onAccept={acceptConsent} /> : null;

  if (!state.session || !account) {
    return (
      <>
        <LoginScreen state={state} onSeed={loadDemo} onCreateAccount={addAccount} onLogin={login} />
        {consentBanner}
      </>
    );
  }

  const activeKey = route.name === 'record' ? 'patients' : route.name;
  const currentPatient = route.name === 'record' ? state.patients.find((p) => p.id === route.id) : undefined;
  const alertCount = state.patients.filter((p) => !p.archived && (p.missing.active || p.emergency.active)).length;

  const navButton = (item: (typeof NAV)[number], mobile: boolean) => {
    const active = activeKey === item.key;
    const badge =
      item.key === 'missing' && alertCount > 0 ? (
        <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger-500 px-1.5 font-mono text-[11px] font-bold text-white">
          {alertCount}
        </span>
      ) : null;
    if (mobile) {
      return (
        <button
          key={item.key}
          onClick={() => setRoute({ name: item.key } as Route)}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
            active ? 'bg-moss-600 text-white' : 'text-pine-200 hover:bg-pine-800 hover:text-white'
          }`}
        >
          {item.icon}
          {item.short}
          {badge}
        </button>
      );
    }
    return (
      <button
        key={item.key}
        onClick={() => setRoute({ name: item.key } as Route)}
        className={`group relative flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-left text-sm font-semibold transition-all duration-150 ${
          active ? 'bg-pine-800 text-white' : 'text-pine-200 hover:bg-pine-850 hover:text-white'
        }`}
      >
        <span className={`absolute left-0 h-6 w-1 rounded-r-full bg-moss-400 transition-all duration-200 ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`} />
        <span className={active ? 'text-moss-300' : 'text-pine-200/80 group-hover:text-moss-300'}>{item.icon}</span>
        {item.label}
        {badge}
      </button>
    );
  };

  const recordSwitcher = (mobile: boolean) => (
    <div className={`relative ${mobile ? '' : 'ml-auto'}`}>
      <button
        onClick={() => setRecordMenuOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all ${
          recordMenuOpen ? 'border-moss-400 bg-moss-50' : 'border-line bg-card hover:border-moss-300'
        } ${mobile ? 'text-ink' : 'text-ink'}`}
      >
        {activePatient ? (
          <>
            <Avatar patient={activePatient} size={22} />
            <span className="max-w-[130px] truncate">{activePatient.name}</span>
          </>
        ) : (
          <span className="text-mute">sem prontuário ativo</span>
        )}
        <IconChevronRight size={13} className={`text-mute transition-transform ${recordMenuOpen ? 'rotate-90' : ''}`} />
      </button>
      {recordMenuOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setRecordMenuOpen(false)} />
          <div className="rise absolute right-0 top-full z-40 mt-1.5 w-64 rounded-xl border border-line bg-card p-1.5 shadow-float">
            <p className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-mute">Trocar prontuário ativo</p>
            {accessible.length === 0 ? (
              <p className="px-2.5 pb-2 text-xs text-mute">Nenhum prontuário acessível.</p>
            ) : (
              accessible.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSession({ accountId: account.id, patientId: p.id });
                    setRecordMenuOpen(false);
                    toast('info', `Prontuário ativo: ${p.name}.`);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                    activePatient?.id === p.id ? 'bg-moss-50 font-bold text-moss-800' : 'text-ink hover:bg-pine-900/5'
                  }`}
                >
                  <Avatar patient={p} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{p.name}</span>
                    <span className="block text-[10px] text-mute">{ageFromBirth(p.birthDate) !== null ? `${ageFromBirth(p.birthDate)} anos` : ''}</span>
                  </span>
                  {activePatient?.id === p.id && <span className="h-1.5 w-1.5 rounded-full bg-moss-500" />}
                </button>
              ))
            )}
            <button
              onClick={() => {
                setSession({ accountId: account.id, patientId: null });
                setRecordMenuOpen(false);
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-line px-2.5 py-2 text-left text-xs font-semibold text-mute transition-colors hover:bg-pine-900/5 hover:text-ink"
            >
              <IconFace size={14} /> Usar só a identificação (sem prontuário)
            </button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="scanlines sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-pine-800 bg-pine-900 lg:flex">
        <div className="flex items-center gap-3 px-5 pb-6 pt-7">
          <span className="text-moss-300"><LogoMark size={34} /></span>
          <div>
            <p className="font-display text-[22px] font-bold leading-none tracking-tight text-white">My Doctor</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-pine-200/70">prontuário vitalício</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3">{NAV.map((n) => navButton(n, false))}</nav>

        <div className="px-3 pb-4">
          <button
            onClick={() => setGuideOpen(true)}
            className="flex w-full items-center gap-2.5 rounded-lg border border-moss-500/35 bg-moss-500/10 px-3.5 py-2.5 text-sm font-semibold text-moss-300 transition-all hover:border-moss-400 hover:bg-moss-500/20 hover:text-moss-200 active:scale-[0.98]"
          >
            <IconFileText size={17} />
            Roteiro de demonstração
            <span className="ml-auto font-mono text-[10px] uppercase tracking-widest opacity-70">11 casos</span>
          </button>
        </div>

        <div className="px-3 pb-4">
          {installButton(false)}
          <button
            onClick={() => setRoute({ name: 'cloud' } as Route)}
            className={`mt-2 flex w-full items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-all active:scale-[0.98] ${
              state.cloud.mode !== 'off'
                ? 'border-moss-500/35 bg-moss-500/10 text-moss-300 hover:bg-moss-500/20'
                : 'border-pine-700 bg-pine-850 text-pine-200 hover:border-pine-600 hover:text-white'
            }`}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${state.cloud.mode !== 'off' ? 'blink-dot bg-moss-400' : 'bg-pine-600'}`} />
            {state.cloud.mode === 'off'
              ? 'Modo local'
              : state.cloud.mode === 'demo'
                ? 'Nuvem: demonstração'
                : `Nuvem: ${state.cloud.baseUrl.replace(/^https?:\/\//, '').slice(0, 20)}`}
          </button>
        </div>

        <div className="border-t border-pine-800 px-4 pb-4 pt-4">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pine-800 font-display text-sm font-bold text-moss-300">
              {account.name.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-white">{account.name}</p>
              <p className="text-[10px] uppercase tracking-wider text-pine-200/60">{account.role}</p>
            </div>
            <button onClick={logout} className="rounded-md p-1.5 text-pine-200 transition-colors hover:bg-pine-800 hover:text-white" aria-label="Sair">
              <IconLogout size={16} />
            </button>
          </div>
          <Ecg className="h-8 w-full text-moss-400" />
          <p className="mt-2 font-mono text-[11px] text-pine-200/70">
            {state.patients.filter((p) => !p.archived).length} pessoa(s) · 100% local
          </p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {!online && (
          <div className="flex items-center gap-2.5 border-b border-warn-500/40 bg-warn-500 px-4 py-2 text-[13px] font-semibold text-white">
            <span className="blink-dot h-2 w-2 rounded-full bg-white" />
            Sem conexão — o My Doctor continua funcionando offline com os dados deste dispositivo.
          </div>
        )}
        <header className="sticky top-0 z-40 border-b border-pine-800 bg-pine-900 lg:hidden">
          <div className="flex items-center gap-2.5 px-4 pt-3">
            <span className="text-moss-300"><LogoMark size={26} /></span>
            <p className="font-display text-lg font-bold leading-none text-white">My Doctor</p>
            <button
              onClick={() => setGuideOpen(true)}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-moss-500/35 bg-moss-500/10 px-2.5 py-1.5 text-[11px] font-bold text-moss-300 transition-all hover:bg-moss-500/20 active:scale-95"
            >
              <IconFileText size={13} /> Testar
            </button>
            {!appInstalled && (
              <button
                onClick={() => void doInstall()}
                className="flex items-center gap-1.5 rounded-lg border border-moss-500/35 bg-moss-500/10 px-2.5 py-1.5 text-[11px] font-bold text-moss-300 transition-all hover:bg-moss-500/20 active:scale-95"
              >
                <IconDownload size={13} />
                Instalar
              </button>
            )}
            <button onClick={logout} className="rounded-md p-1.5 text-pine-200 hover:text-white" aria-label="Sair">
              <IconLogout size={16} />
            </button>
          </div>
          <nav className="no-scrollbar flex gap-1 overflow-x-auto px-2.5 py-2">{NAV.map((n) => navButton(n, true))}</nav>
        </header>

        <div className="dotted-ground">
          <div className="border-b border-line bg-card/70 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 sm:px-6 lg:px-8">
              <span className="hidden text-[11px] font-bold uppercase tracking-[0.14em] text-mute sm:inline">
                Prontuário ativo:
              </span>
              {recordSwitcher(false)}
              <span className="ml-2 hidden items-center gap-1.5 text-[11px] text-mute md:flex">
                consultando como <strong className="text-ink">{account.name}</strong>
              </span>
            </div>
          </div>

          <main>
            <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
              {route.name === 'patients' && (
                <PatientsScreen
                  patients={state.patients}
                  onAdd={addPatient}
                  onUpdate={updatePatient}
                  onArchive={archivePatient}
                  onRestore={restorePatient}
                  onOpenRecord={(id) => setRoute({ name: 'record', id })}
                  onLoadDemo={loadDemo}
                  seeded={state.seeded}
                  pendingPhoto={pendingPhoto}
                  consumePendingPhoto={() => setPendingPhoto(null)}
                  pendingEditId={pendingEditId}
                  consumePendingEdit={() => setPendingEditId(null)}
                  ownerAccountId={account.id}
                />
              )}
              {route.name === 'record' && (
                <RecordScreen
                  patient={currentPatient}
                  patients={state.patients}
                  byName={account?.name ?? 'conta local'}
                  onBack={() => setRoute({ name: 'patients' })}
                  onUpdate={updatePatient}
                  onAddEntry={addEntry}
                  onArchiveEntry={(pid, eid) => setEntryArchived(pid, eid, true)}
                  onRestoreEntry={(pid, eid) => setEntryArchived(pid, eid, false)}
                />
              )}
              {route.name === 'missing' && (
                <PublicUtilityScreen
                  patients={state.patients}
                  log={state.log}
                  accountName={account?.name ?? 'conta local'}
                  onUpdate={updatePatient}
                  onOpenRecord={(id) => setRoute({ name: 'record', id })}
                  onGoPatients={() => setRoute({ name: 'patients' })}
                  onLogEvent={logEvent}
                  onNewPatientWithPhoto={(photo) => {
                    setPendingPhoto(photo);
                    setRoute({ name: 'patients' });
                  }}
                  onPatientsUpdated={replacePatients}
                />
              )}
              {route.name === 'consultor' && (
                <ConsultantScreen
                  patients={accessible}
                  patient={activePatient}
                  account={account}
                  grants={state.grants}
                  onSelect={(id) => setSession({ accountId: account.id, patientId: id })}
                />
              )}
              {route.name === 'vitals' && (
                <VitalsScreen
                  patients={accessible}
                  patient={activePatient}
                  account={account}
                  grants={state.grants}
                  onUpdate={updatePatient}
                  onSelect={(id) => setSession({ accountId: account.id, patientId: id })}
                />
              )}
              {route.name === 'insurance' && (
                <InsuranceScreen
                  insurances={activePatient?.insurances ?? []}
                  onChange={(insurances) => {
                    if (!activePatient) return;
                    updatePatient({ ...activePatient, insurances });
                  }}
                />
              )}
              {route.name === 'cloud' && (
                <CloudScreen
                  patients={state.patients.filter((p) => !p.archived)}
                  log={state.log}
                  cloud={state.cloud}
                  onCloud={(c) => setState((s) => ({ ...s, cloud: c }))}
                  onPatientsUpdated={replacePatients}
                />
              )}
              {route.name === 'settings' && (
                <SettingsScreen
                  state={state}
                  onImport={importState}
                  onLoadDemo={loadDemo}
                  onWipe={wipeAll}
                  onRevokeConsent={revokeConsent}
                  onOpenCloud={() => setRoute({ name: 'cloud' })}
                />
              )}
            </div>
          </main>
        </div>
      </div>

      <DemoGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
      {consentBanner}

      <Modal
        open={installHelp}
        onClose={() => setInstallHelp(false)}
        title="Instalar o My Doctor"
        subtitle="O app abre em tela cheia, com ícone próprio e funciona offline."
      >
        <ul className="space-y-3 text-sm leading-relaxed text-mute">
          <li className="flex gap-2.5">
            <span className="mt-0.5 shrink-0 rounded-md bg-moss-100 p-1.5 font-mono text-xs font-bold text-moss-700">Android</span>
            <span>
              No <strong className="text-ink">Chrome</strong>: menu <strong className="text-ink">⋮</strong> →
              “Instalar app” (ou “Adicionar à tela inicial”).
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="mt-0.5 shrink-0 rounded-md bg-moss-100 p-1.5 font-mono text-xs font-bold text-moss-700">iPhone</span>
            <span>
              No <strong className="text-ink">Safari</strong>: botão <strong className="text-ink">Compartilhar</strong> →
              “Adicionar à Tela de Início”.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="mt-0.5 shrink-0 rounded-md bg-moss-100 p-1.5 font-mono text-xs font-bold text-moss-700">Desktop</span>
            <span>
              No <strong className="text-ink">Chrome/Edge</strong>: ícone de instalação na barra de endereço
              (lado direito) ou menu → “Instalar My Doctor”.
            </span>
          </li>
        </ul>
        <p className="mt-4 rounded-lg bg-paper px-3 py-2.5 text-xs leading-relaxed text-mute">
          A instalação exige <strong className="text-ink">HTTPS</strong> — já garantido pelo SSL da Hostinger.
          Depois de instalado, o My Doctor abre sem a barra do navegador e continua funcionando sem internet.
        </p>
      </Modal>
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[MyDoctor] erro de runtime:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-paper p-6">
          <div className="w-full max-w-lg rounded-xl border border-danger-500/40 bg-card p-6 shadow-float">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-danger-600">my doctor · falha na interface</p>
            <h1 className="mt-2 font-display text-2xl font-bold text-ink">Algo impediu a execução</h1>
            <p className="mt-2 text-sm leading-relaxed text-mute">
              O app encontrou um erro ao iniciar. O detalhe técnico abaixo ajuda no diagnóstico — seus dados locais
              não foram afetados.
            </p>
            <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-pine-950 p-3 font-mono text-xs leading-relaxed text-danger-100">
              {String(this.state.error?.message ?? this.state.error)}
            </pre>
            <button
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-moss-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-moss-700 active:scale-[0.97]"
            >
              Recarregar o My Doctor
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </ErrorBoundary>
  );
}
