import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AccessGrant, Account, AppState, ClinicalEntry, IdEvent, Patient, Route } from './lib/types';
import { accessiblePatients, emptyState, loadState, saveState, seedDemoState, uid } from './lib/store';
import { avatarTone, initials } from './lib/biometrics';
import { Avatar, Btn, Ecg, Modal, Tag, ToastProvider, useToast } from './components/ui';
import {
  IconBrain,
  IconChevronDown,
  IconFace,
  IconFileText,
  IconGear,
  IconLogOut,
  IconMapPin,
  IconSearch,
  IconShare,
  IconUsers,
  LogoMark,
} from './components/icons';
import { LoginScreen } from './screens/LoginScreen';
import { IdentifyScreen } from './screens/IdentifyScreen';
import { ConsultantScreen } from './screens/ConsultantScreen';
import { PatientsScreen } from './screens/PatientsScreen';
import { RecordScreen } from './screens/RecordScreen';
import { MissingScreen } from './screens/MissingScreen';
import { SettingsScreen } from './screens/SettingsScreen';

const NAV: Array<{ key: 'identify' | 'consultor' | 'patients' | 'missing' | 'settings'; label: string; icon: ReactNode }> = [
  { key: 'identify', label: 'Identificação', icon: <IconFace size={18} /> },
  { key: 'consultor', label: 'Consultor IA', icon: <IconBrain size={18} /> },
  { key: 'patients', label: 'Pessoas & prontuários', icon: <IconUsers size={18} /> },
  { key: 'missing', label: 'Desaparecidos', icon: <IconSearch size={18} /> },
  { key: 'settings', label: 'Dados & privacidade', icon: <IconGear size={18} /> },
];

const DEMO_SCENARIOS = [
  {
    title: 'Pessoa desaparecida localizada',
    badge: 'fluxo completo',
    steps: [
      'Na aba Identificação, clique em “Testar com exemplo”.',
      'Ana é reconhecida: o cartão de emergência abre e o alerta vermelho indica que ela está desaparecida.',
      'Na rede de avisos, toque no WhatsApp da Marina (1º contato) e depois em “Registrar avisos na auditoria”.',
      'Clique em “Marcar como localizada”, descreva como foi e confirme. O contador vermelho da sidebar zera.',
    ],
    expect: 'Alerta ativo → avisos rastreados → caso encerrado com histórico.',
  },
  {
    title: 'Pessoa fora da base',
    badge: 'cadastro biométrico',
    steps: [
      'Clique em “Enviar imagem” e envie uma foto que não está cadastrada (pode ser a sua).',
      'O resultado é “sem correspondência”. Clique em “Cadastrar como nova pessoa”.',
      'Complete nome e nascimento, salve. A assinatura visual da foto já foi gerada.',
      'Envie a mesma foto de novo: agora a identidade é confirmada e o cartão de emergência abre.',
    ],
    expect: 'Ciclo completo: desconhecida → cadastrada → reconhecida.',
  },
  {
    title: 'Acesso delegado (login)',
    badge: 'contas & PIN',
    steps: [
      'Saia da conta (ícone no rodapé da sidebar) e entre como Marina Sampaio Reis — PIN 1234.',
      'Ela vê o prontuário da mãe Ana como “delegado por Ana Beatriz” e pode abri-lo normalmente.',
      'Entre como Ana Beatriz e use “Delegar acesso” para conceder/revogar acessos a outras contas.',
    ],
    expect: 'Responsáveis cuidam do prontuário de quem não opera o app, com rastreio de quem consulta.',
  },
  {
    title: 'Consultor IA + digital',
    badge: 'apoio informativo',
    steps: [
      'Com o prontuário da Ana aberto, vá em Consultor IA e pergunte: “Estou com febre e dor no corpo”.',
      'A dipirona aparece como EVITAR (alergia registrada) e o paracetamol como compatível — sempre com o aviso médico.',
      'Na aba Identificação → Impressão digital, segure o sensor: a qualidade sobe se o dedo ficar imóvel.',
    ],
    expect: 'Sugestões cruzadas com o prontuário e leitura de digital simulada com qualidade.',
  },
];

function DemoGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Roteiro de demonstração"
      subtitle="Quatro cenários para testar o Vitalis de ponta a ponta, em ordem."
      width="max-w-2xl"
    >
      <ol className="space-y-4">
        {DEMO_SCENARIOS.map((s, i) => (
          <li key={s.title} className="rounded-xl border border-line bg-paper/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-pine-900 font-mono text-xs font-bold text-white">
                {i + 1}
              </span>
              <h3 className="font-display text-[15px] font-bold text-ink">{s.title}</h3>
              <span className="ml-auto rounded-full bg-moss-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-moss-700">
                {s.badge}
              </span>
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
        Tudo fica salvo apenas neste navegador (localStorage). Use Dados &amp; privacidade para exportar um backup
        JSON a qualquer momento — os dados nunca são excluídos, apenas arquivados.
      </p>
    </Modal>
  );
}

function AccountBadge({ name, size = 36 }: { name: string; size?: number }) {
  const tone = avatarTone(name);
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-display font-bold"
      style={{ width: size, height: size, background: tone.fg, color: tone.bg, fontSize: size * 0.34 }}
    >
      {initials(name)}
    </span>
  );
}

function Shell() {
  const toast = useToast();
  const [state, setState] = useState<AppState>(() => loadState());
  const [route, setRoute] = useState<Route>({ name: 'identify' });
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [pendingEditId, setPendingEditId] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [grantAcc, setGrantAcc] = useState('');
  const [grantLevel, setGrantLevel] = useState<'completo' | 'leitura'>('completo');

  useEffect(() => {
    if (!saveState(state)) {
      toast('error', 'Não foi possível salvar no navegador — armazenamento cheio.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const session = state.session;
  const account = useMemo(
    () => (session ? state.accounts.find((a) => a.id === session.accountId) ?? null : null),
    [state.accounts, session],
  );
  const accessible = useMemo(
    () => (account ? accessiblePatients(state, account.id) : []),
    [state, account],
  );
  const activePatient = useMemo(
    () => (session?.patientId ? accessible.find((p) => p.id === session.patientId) ?? null : null),
    [accessible, session],
  );

  /* ------------------------------ ações ------------------------------ */
  const addPatient = (p: Patient) => setState((s) => ({ ...s, patients: [...s.patients, p] }));
  const updatePatient = (p: Patient) =>
    setState((s) => ({ ...s, patients: s.patients.map((x) => (x.id === p.id ? p : x)) }));
  const archivePatient = (id: string) =>
    setState((s) => ({
      ...s,
      patients: s.patients.map((x) => (x.id === id ? { ...x, archived: true } : x)),
      session:
        s.session && s.session.patientId === id ? { ...s.session, patientId: null } : s.session,
    }));
  const restorePatient = (id: string) =>
    setState((s) => ({
      ...s,
      patients: s.patients.map((x) => (x.id === id ? { ...x, archived: false } : x)),
    }));
  const replacePatients = (patients: Patient[]) => setState((s) => ({ ...s, patients }));
  const addEntry = (pid: string, e: ClinicalEntry) =>
    setState((s) => ({
      ...s,
      patients: s.patients.map((p) => (p.id === pid ? { ...p, entries: [...p.entries, e] } : p)),
    }));
  const setEntryArchived = (pid: string, eid: string, archived: boolean) =>
    setState((s) => ({
      ...s,
      patients: s.patients.map((p) =>
        p.id === pid
          ? { ...p, entries: p.entries.map((e) => (e.id === eid ? { ...e, archived } : e)) }
          : p,
      ),
    }));
  const logEvent = (evt: IdEvent) => setState((s) => ({ ...s, log: [evt, ...s.log].slice(0, 60) }));
  const loadDemo = () => {
    setState((s) => seedDemoState(s));
    toast('success', 'Dados de exemplo carregados: contas, delegações, prontuários e histórico.');
  };
  const importState = (s: AppState) => {
    setState(s);
    toast('success', `Backup importado: ${s.patients.length} paciente(s) restaurado(s).`);
  };
  const addGrant = (g: AccessGrant) => setState((s) => ({ ...s, grants: [...s.grants, g] }));
  const revokeGrant = (id: string) =>
    setState((s) => ({ ...s, grants: s.grants.filter((g) => g.id !== id) }));
  const logout = () => {
    setState((s) => ({ ...s, session: null }));
    setRoute({ name: 'identify' });
    toast('info', 'Sessão encerrada neste dispositivo.');
  };

  /* --------------------------- portal de acesso --------------------------- */
  if (!session || !account) {
    return (
      <LoginScreen
        accounts={state.accounts}
        grants={state.grants}
        patients={state.patients}
        seeded={state.seeded}
        onLoadDemo={loadDemo}
        onCreate={(a: Account) => setState((s) => ({ ...s, accounts: [...s.accounts, a] }))}
        onGrant={addGrant}
        onRevoke={revokeGrant}
        onEnter={(accountId, patientId) => {
          setState((s) => ({ ...s, session: { accountId, patientId } }));
          setRoute({ name: 'identify' });
        }}
      />
    );
  }

  const activeKey = route.name === 'record' ? 'patients' : route.name;
  const currentPatient =
    route.name === 'record' ? state.patients.find((p) => p.id === route.id) : undefined;
  const missingCount = state.patients.filter((p) => p.missing.active && !p.archived).length;
  const owned = accessible.filter((p) => p.ownerAccountId === account.id);

  const navButton = (item: (typeof NAV)[number], mobile: boolean) => {
    const active = activeKey === item.key;
    const badge =
      item.key === 'missing' && missingCount > 0 ? (
        <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger-500 px-1.5 font-mono text-[11px] font-bold text-white">
          {missingCount}
        </span>
      ) : null;
    if (mobile) {
      return (
        <button
          key={item.key}
          onClick={() => setRoute({ name: item.key } as Route)}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-all ${
            active ? 'bg-moss-600 text-white' : 'text-pine-200 hover:bg-pine-800 hover:text-white'
          }`}
        >
          {item.icon}
          {item.label}
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
        <span
          className={`absolute left-0 h-6 w-1 rounded-r-full bg-moss-400 transition-all duration-200 ${
            active ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'
          }`}
        />
        <span className={active ? 'text-moss-300' : 'text-pine-200/80 group-hover:text-moss-300'}>{item.icon}</span>
        {item.label}
        {badge}
      </button>
    );
  };

  return (
    <div className="flex min-h-screen">
      {/* sidebar desktop */}
      <aside className="scanlines sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-pine-800 bg-pine-900 lg:flex">
        <div className="flex items-center gap-3 px-5 pb-6 pt-7">
          <span className="text-moss-300">
            <LogoMark size={34} />
          </span>
          <div>
            <p className="font-display text-[22px] font-bold leading-none tracking-tight text-white">Vitalis</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-pine-200/70">
              prontuário vitalício
            </p>
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
            <span className="ml-auto font-mono text-[10px] uppercase tracking-widest opacity-70">4 casos</span>
          </button>
        </div>

        <div className="border-t border-pine-800 px-4 pb-4 pt-4">
          <Ecg className="h-9 w-full text-moss-400" />
          <div className="mt-3 flex items-center gap-2.5">
            <AccountBadge name={account.name} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-white">{account.name}</p>
              <p className="truncate font-mono text-[10px] text-pine-200/60">
                {account.role === 'responsavel' ? 'responsável' : 'titular'} · {accessible.length} acesso(s)
              </p>
            </div>
            <button
              onClick={logout}
              className="rounded-md p-1.5 text-pine-200/70 transition-all hover:bg-pine-800 hover:text-white"
              aria-label="Sair da conta"
              title="Sair"
            >
              <IconLogOut size={16} />
            </button>
          </div>
          <p className="mt-2.5 font-mono text-[10px] text-pine-200/40">100% local · v0.2.0</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* topo mobile */}
        <header className="sticky top-0 z-40 border-b border-pine-800 bg-pine-900 lg:hidden">
          <div className="flex items-center gap-2.5 px-4 pt-3">
            <span className="text-moss-300">
              <LogoMark size={26} />
            </span>
            <p className="font-display text-lg font-bold leading-none text-white">Vitalis</p>
            <button
              onClick={() => setGuideOpen(true)}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-moss-500/35 bg-moss-500/10 px-2.5 py-1.5 text-[11px] font-bold text-moss-300 transition-all hover:bg-moss-500/20 active:scale-95"
            >
              <IconFileText size={13} />
              Testar
            </button>
            <button onClick={logout} className="rounded-md p-1.5 text-pine-200/70 hover:text-white" aria-label="Sair">
              <IconLogOut size={16} />
            </button>
          </div>
          <nav className="flex gap-1.5 overflow-x-auto px-3 py-2.5">{NAV.map((n) => navButton(n, true))}</nav>
        </header>

        <main className="dotted-ground">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
            {/* seletor de prontuário ativo */}
            <div className="rise mb-6 flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => setSwitcherOpen(true)}
                className="inline-flex max-w-full items-center gap-2.5 rounded-xl border border-line bg-card py-1.5 pl-1.5 pr-3 shadow-lift transition-all hover:border-moss-300 hover:shadow-float active:scale-[0.98]"
              >
                {activePatient ? (
                  <>
                    <Avatar patient={activePatient} size={30} />
                    <span className="truncate text-sm font-bold text-ink">{activePatient.name}</span>
                    <span className="hidden font-mono text-[11px] text-mute sm:inline">{activePatient.record}</span>
                    {activePatient.ownerAccountId !== account.id && (
                      <Tag tone="info">
                        <IconShare size={11} className="mr-1" /> delegado
                      </Tag>
                    )}
                  </>
                ) : (
                  <>
                    <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-pine-900/8 text-mute">
                      <IconUsers size={15} />
                    </span>
                    <span className="text-sm font-bold text-mute">Nenhum prontuário aberto</span>
                  </>
                )}
                <IconChevronDown size={15} className="shrink-0 text-mute" />
              </button>
              <span className="hidden text-xs text-mute sm:inline">
                {activePatient ? 'prontuário ativo para consultas e registro' : 'escolha um prontuário para o Consultor IA'}
              </span>
              <span className="ml-auto hidden font-mono text-[11px] text-mute md:inline">
                sessões de busca são registradas em nome de {account.name.split(' ')[0]}
              </span>
            </div>

            {route.name === 'identify' && (
              <IdentifyScreen
                patients={state.patients.filter((p) => !p.archived)}
                log={state.log}
                accountName={account.name}
                onPatientsUpdated={replacePatients}
                onLogEvent={logEvent}
                onOpenRecord={(id) => setRoute({ name: 'record', id })}
                onNewPatientWithPhoto={(photo) => {
                  setPendingPhoto(photo);
                  setRoute({ name: 'patients' });
                }}
                onGoPatients={() => setRoute({ name: 'patients' })}
              />
            )}
            {route.name === 'consultor' && (
              <ConsultantScreen patient={activePatient} onPickRecord={() => setSwitcherOpen(true)} />
            )}
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
                onBack={() => setRoute({ name: 'patients' })}
                onEditPatient={(id) => {
                  setPendingEditId(id);
                  setRoute({ name: 'patients' });
                }}
                onAddEntry={addEntry}
                onArchiveEntry={(pid, eid) => setEntryArchived(pid, eid, true)}
                onRestoreEntry={(pid, eid) => setEntryArchived(pid, eid, false)}
              />
            )}
            {route.name === 'missing' && (
              <MissingScreen
                patients={state.patients}
                log={state.log}
                onUpdate={updatePatient}
                onOpenRecord={(id) => setRoute({ name: 'record', id })}
                onGoPatients={() => setRoute({ name: 'patients' })}
              />
            )}
            {route.name === 'settings' && (
              <SettingsScreen state={state} onImport={importState} onLoadDemo={loadDemo} />
            )}
          </div>
        </main>
      </div>

      {/* seletor de prontuário + delegação */}
      <Modal
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        title="Prontuários acessíveis"
        subtitle={`Sessão de ${account.name} — escolha qual prontuário abrir ou gerencie acessos delegados.`}
        width="max-w-2xl"
      >
        {accessible.length === 0 ? (
          <p className="rounded-lg bg-paper px-4 py-6 text-center text-sm text-mute">
            Nenhum prontuário acessível com esta conta. Cadastre pessoas na aba Pacientes.
          </p>
        ) : (
          <ul className="space-y-2">
            {accessible.map((p) => {
              const isOwner = p.ownerAccountId === account.id;
              const grant = state.grants.find((g) => g.accountId === account.id && g.patientId === p.id);
              return (
                <li key={p.id}>
                  <button
                    onClick={() => {
                      setState((s) => ({ ...s, session: s.session ? { ...s.session, patientId: p.id } : s.session }));
                      setSwitcherOpen(false);
                      toast('success', `Prontuário de ${p.name} aberto.`);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.99] ${
                      activePatient?.id === p.id ? 'border-moss-500 bg-moss-50' : 'border-line bg-card hover:border-moss-300'
                    }`}
                  >
                    <Avatar patient={p} size={42} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink">{p.name}</span>
                      <span className="block font-mono text-[11px] text-mute">{p.record}</span>
                    </span>
                    {isOwner ? (
                      <Tag tone="moss">Titular</Tag>
                    ) : (
                      <Tag tone="info">
                        <IconShare size={11} className="mr-1" />
                        delegado{grant ? ` por ${grant.grantedByName.split(' ')[0]}` : ''}
                      </Tag>
                    )}
                    {p.missing.active && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-danger-100 px-1.5 py-0.5 text-[10px] font-bold text-danger-600">
                        <span className="blink-dot h-1 w-1 rounded-full bg-danger-500" />
                        desaparecida
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {owned.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="flex items-center gap-2 font-display text-sm font-bold text-ink">
              <IconShare size={15} className="text-moss-600" /> Delegar acesso (área do titular)
            </h3>
            <p className="mt-1 text-xs text-mute">
              Conceda acesso a parentes e curadores de quem não opera o app. Todo acesso fica registrado e pode ser revogado.
            </p>
            <div className="mt-3 space-y-3">
              {owned.map((p) => {
                const pg = state.grants.filter((g) => g.patientId === p.id);
                return (
                  <div key={p.id} className="rounded-lg border border-line bg-paper/60 p-3">
                    <p className="text-sm font-bold text-ink">
                      {p.name} <span className="ml-1 font-mono text-[11px] font-normal text-mute">{p.record}</span>
                    </p>
                    {pg.length > 0 && (
                      <ul className="mt-2 space-y-1.5">
                        {pg.map((g) => {
                          const acc = state.accounts.find((a) => a.id === g.accountId);
                          return (
                            <li key={g.id} className="flex flex-wrap items-center gap-2 rounded-md bg-white/80 px-2.5 py-1.5 text-[13px]">
                              <span className="font-semibold text-ink">{acc?.name ?? 'conta removida'}</span>
                              <Tag tone={g.level === 'completo' ? 'moss' : 'info'}>{g.level === 'completo' ? 'completo' : 'leitura'}</Tag>
                              <button
                                onClick={() => {
                                  revokeGrant(g.id);
                                  toast('info', `Acesso de ${acc?.name ?? 'conta'} revogado.`);
                                }}
                                className="ml-auto rounded px-2 py-0.5 text-xs font-bold text-danger-600 transition-colors hover:bg-danger-100"
                              >
                                Revogar
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <select
                        className="w-auto min-w-40 rounded-lg border border-line bg-white/80 px-2.5 py-1.5 text-xs font-semibold"
                        value={grantAcc}
                        onChange={(e) => setGrantAcc(e.target.value)}
                      >
                        <option value="">Escolher conta…</option>
                        {state.accounts.filter((a) => a.id !== account.id).map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                      <select
                        className="w-auto rounded-lg border border-line bg-white/80 px-2.5 py-1.5 text-xs font-semibold"
                        value={grantLevel}
                        onChange={(e) => setGrantLevel(e.target.value as 'completo' | 'leitura')}
                      >
                        <option value="completo">Completo</option>
                        <option value="leitura">Leitura</option>
                      </select>
                      <Btn
                        size="sm"
                        disabled={!grantAcc}
                        onClick={() => {
                          addGrant({
                            id: uid(),
                            accountId: grantAcc,
                            patientId: p.id,
                            grantedByName: account.name,
                            level: grantLevel,
                            createdAt: Date.now(),
                          });
                          setGrantAcc('');
                          toast('success', 'Acesso delegado com sucesso.');
                        }}
                      >
                        <IconShare size={13} /> Delegar
                      </Btn>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Modal>

      <DemoGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}
