import { useMemo, useState } from 'react';
import type { AccessGrant, Account, Patient } from '../lib/types';
import { hashPin, uid } from '../lib/store';
import { ageFromBirth, avatarTone, initials } from '../lib/biometrics';
import { Btn, Ecg, EmptyState, Field, inputCls, Tag, useToast } from '../components/ui';
import {
  IconBrain,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconFace,
  IconLock,
  IconShare,
  IconUserPlus,
  IconUsers,
  LogoMark,
} from '../components/icons';

type View = 'accounts' | 'pin' | 'records';

function AccountBadge({ name, size = 40 }: { name: string; size?: number }) {
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

export function LoginScreen({
  accounts,
  grants,
  patients,
  onEnter,
  onCreate,
  onGrant,
  onRevoke,
  onLoadDemo,
  seeded,
}: {
  accounts: Account[];
  grants: AccessGrant[];
  patients: Patient[];
  onEnter: (accountId: string, patientId: string | null) => void;
  onCreate: (a: Account) => void;
  onGrant: (g: AccessGrant) => void;
  onRevoke: (grantId: string) => void;
  onLoadDemo: () => void;
  seeded: boolean;
}) {
  const toast = useToast();
  const [view, setView] = useState<View>('accounts');
  const [pending, setPending] = useState<Account | null>(null);
  const [pin, setPin] = useState('');
  const [pinErr, setPinErr] = useState('');

  const [showCreate, setShowCreate] = useState(accounts.length === 0);
  const [cfName, setCfName] = useState('');
  const [cfEmail, setCfEmail] = useState('');
  const [cfRole, setCfRole] = useState<Account['role']>('titular');
  const [cfPin, setCfPin] = useState('');
  const [cfPin2, setCfPin2] = useState('');
  const [cfErrs, setCfErrs] = useState<Record<string, string>>({});

  const [grantAcc, setGrantAcc] = useState('');
  const [grantLevel, setGrantLevel] = useState<'completo' | 'leitura'>('completo');

  const pickAccount = (a: Account) => {
    setPending(a);
    setPin('');
    setPinErr('');
    if (a.pinHash) setView('pin');
    else setView('records');
  };

  const submitPin = () => {
    if (!pending) return;
    if (hashPin(pin) === pending.pinHash) {
      setView('records');
    } else {
      setPinErr('PIN incorreto. Tente novamente.');
      setPin('');
    }
  };

  const submitCreate = () => {
    const e: Record<string, string> = {};
    if (!cfName.trim()) e.name = 'Informe o nome.';
    if (!/^\S+@\S+\.\S+$/.test(cfEmail.trim())) e.email = 'E-mail inválido.';
    if (cfPin && cfPin.length !== 4) e.pin = 'O PIN deve ter 4 dígitos.';
    if (cfPin !== cfPin2) e.pin2 = 'Os PINs não conferem.';
    if (accounts.some((a) => a.email.toLowerCase() === cfEmail.trim().toLowerCase())) e.email = 'Já existe conta com este e-mail.';
    setCfErrs(e);
    if (Object.keys(e).length > 0) return;
    const acc: Account = {
      id: uid(),
      name: cfName.trim(),
      email: cfEmail.trim(),
      role: cfRole,
      pinHash: cfPin ? hashPin(cfPin) : null,
      createdAt: Date.now(),
    };
    onCreate(acc);
    setPending(acc);
    setShowCreate(false);
    setView('records');
    toast('success', `Conta de ${acc.name} criada. Delegue acessos abaixo, se necessário.`);
  };

  const owned = useMemo(
    () => (pending ? patients.filter((p) => p.ownerAccountId === pending.id && !p.archived) : []),
    [patients, pending],
  );
  const delegated = useMemo(() => {
    if (!pending) return [];
    return grants
      .filter((g) => g.accountId === pending.id)
      .map((g) => ({ grant: g, patient: patients.find((p) => p.id === g.patientId) }))
      .filter((x): x is { grant: AccessGrant; patient: Patient } => Boolean(x.patient && !x.patient.archived));
  }, [grants, patients, pending]);

  const doGrant = (patientId: string) => {
    if (!pending || !grantAcc) return;
    onGrant({
      id: uid(),
      accountId: grantAcc,
      patientId,
      grantedByName: pending.name,
      level: grantLevel,
      createdAt: Date.now(),
    });
    setGrantAcc('');
    toast('success', 'Acesso delegado com sucesso.');
  };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[440px_1fr]">
      {/* painel institucional */}
      <aside className="scanlines relative hidden flex-col justify-between overflow-hidden border-r border-pine-800 bg-pine-900 p-9 lg:flex">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-moss-300">
              <LogoMark size={40} />
            </span>
            <div>
              <p className="font-display text-3xl font-bold tracking-tight text-white">Vitalis</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-pine-200/70">
                prontuário para a vida toda
              </p>
            </div>
          </div>
          <ul className="mt-12 space-y-7">
            <li className="flex gap-4">
              <span className="mt-0.5 text-moss-300"><IconFace size={22} /></span>
              <div>
                <p className="font-display text-lg font-bold text-white">Encontre quem se perdeu</p>
                <p className="mt-1 text-sm leading-relaxed text-pine-200/80">
                  Identificação por retrato ou digital, com alerta imediato para a rede de avisos quando a pessoa está desaparecida.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="mt-0.5 text-moss-300"><IconShare size={22} /></span>
              <div>
                <p className="font-display text-lg font-bold text-white">Acesso delegado</p>
                <p className="mt-1 text-sm leading-relaxed text-pine-200/80">
                  Pais, filhos e curadores cuidam do prontuário de bebês, idosos ou pessoas com deficiência — com rastreio de quem consulta.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="mt-0.5 text-moss-300"><IconBrain size={22} /></span>
              <div>
                <p className="font-display text-lg font-bold text-white">Consultor IA</p>
                <p className="mt-1 text-sm leading-relaxed text-pine-200/80">
                  Dúvidas de sintomas cruzadas com o prontuário: alergias e interações checadas antes de qualquer sugestão.
                </p>
              </div>
            </li>
          </ul>
        </div>
        <div>
          <Ecg className="h-10 w-full text-moss-400" />
          <p className="mt-2 font-mono text-[11px] text-pine-200/60">
            100% local · nenhum dado sai do dispositivo · v0.2.0
          </p>
        </div>
      </aside>

      {/* fluxo de acesso */}
      <main className="dotted-ground flex min-h-screen items-center justify-center px-4 py-10">
        <div className="rise w-full max-w-2xl">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <span className="text-moss-600"><LogoMark size={30} /></span>
            <p className="font-display text-2xl font-bold text-ink">Vitalis</p>
          </div>

          {/* passo: contas */}
          {view === 'accounts' && (
            <section>
              <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Quem está acessando?</h1>
              <p className="mt-1.5 text-sm text-mute">
                Entre com sua conta para abrir os prontuários que você cuida — próprios ou delegados.
              </p>

              {accounts.length === 0 && !showCreate ? (
                <EmptyState
                  icon={<IconUsers size={22} />}
                  title="Nenhuma conta neste dispositivo"
                  desc="Crie a primeira conta para começar. Todo dado fica somente aqui."
                >
                  <Btn onClick={() => setShowCreate(true)}>
                    <IconUserPlus size={15} /> Criar conta
                  </Btn>
                </EmptyState>
              ) : (
                <>
                  <ul className="mt-6 space-y-2">
                    {accounts.map((a) => (
                      <li key={a.id}>
                        <button
                          onClick={() => pickAccount(a)}
                          className="group flex w-full items-center gap-3.5 rounded-xl border border-line bg-card p-3.5 text-left shadow-lift transition-all hover:-translate-y-0.5 hover:border-moss-300 hover:shadow-float active:scale-[0.99]"
                        >
                          <AccountBadge name={a.name} size={46} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-display text-[15px] font-bold text-ink">{a.name}</span>
                            <span className="block truncate text-xs text-mute">{a.email}</span>
                          </span>
                          <Tag tone={a.role === 'responsavel' ? 'info' : 'moss'}>
                            {a.role === 'responsavel' ? 'responsável' : 'titular'}
                          </Tag>
                          {a.pinHash ? (
                            <span className="text-mute"><IconLock size={16} /></span>
                          ) : (
                            <span className="text-mute transition-transform group-hover:translate-x-0.5"><IconChevronRight size={17} /></span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Btn variant="outline" onClick={() => setShowCreate((v) => !v)}>
                      <IconUserPlus size={15} /> Nova conta
                    </Btn>
                    {!seeded && (
                      <Btn variant="ghost" onClick={onLoadDemo}>Carregar dados de exemplo</Btn>
                    )}
                    <p className="ml-auto text-xs text-mute">
                      {seeded ? 'PIN das contas de demonstração: 1234' : 'Dados salvos apenas neste dispositivo'}
                    </p>
                  </div>
                </>
              )}

              {showCreate && (
                <div className="mt-6 rounded-xl border border-moss-500/30 bg-card p-5 shadow-lift">
                  <h2 className="font-display text-lg font-bold text-ink">Criar conta local</h2>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field label="Nome completo" required>
                      <input className={`${inputCls} ${cfErrs.name ? 'border-danger-500' : ''}`} value={cfName} onChange={(e) => setCfName(e.target.value)} placeholder="Seu nome" />
                      {cfErrs.name && <p className="mt-1 text-xs font-medium text-danger-600">{cfErrs.name}</p>}
                    </Field>
                    <Field label="E-mail" required>
                      <input className={`${inputCls} ${cfErrs.email ? 'border-danger-500' : ''}`} value={cfEmail} onChange={(e) => setCfEmail(e.target.value)} placeholder="voce@exemplo.com" />
                      {cfErrs.email && <p className="mt-1 text-xs font-medium text-danger-600">{cfErrs.email}</p>}
                    </Field>
                    <Field label="Perfil">
                      <select className={inputCls} value={cfRole} onChange={(e) => setCfRole(e.target.value as Account['role'])}>
                        <option value="titular">Titular (cuida do próprio prontuário)</option>
                        <option value="responsavel">Responsável (cuida de outra pessoa)</option>
                      </select>
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="PIN (4 dígitos)" hint="opcional">
                        <input className={`${inputCls} ${cfErrs.pin ? 'border-danger-500' : ''}`} value={cfPin} onChange={(e) => setCfPin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="••••" />
                        {cfErrs.pin && <p className="mt-1 text-xs font-medium text-danger-600">{cfErrs.pin}</p>}
                      </Field>
                      <Field label="Confirmar">
                        <input className={`${inputCls} ${cfErrs.pin2 ? 'border-danger-500' : ''}`} value={cfPin2} onChange={(e) => setCfPin2(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="••••" />
                        {cfErrs.pin2 && <p className="mt-1 text-xs font-medium text-danger-600">{cfErrs.pin2}</p>}
                      </Field>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    {accounts.length > 0 && (
                      <Btn variant="ghost" onClick={() => setShowCreate(false)}>Cancelar</Btn>
                    )}
                    <Btn onClick={submitCreate}>
                      <IconCheck size={15} /> Criar e entrar
                    </Btn>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* passo: PIN */}
          {view === 'pin' && pending && (
            <section className="mx-auto max-w-sm">
              <button
                onClick={() => setView('accounts')}
                className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-mute transition-colors hover:text-ink"
              >
                <IconChevronLeft size={16} /> Outras contas
              </button>
              <div className="rounded-xl border border-line bg-card p-6 text-center shadow-lift">
                <AccountBadge name={pending.name} size={64} />
                <h1 className="mt-3 font-display text-xl font-bold text-ink">{pending.name}</h1>
                <p className="mt-0.5 text-sm text-mute">Digite o PIN de 4 dígitos para entrar.</p>
                <div className="mt-5 flex justify-center gap-3">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={`flex h-12 w-12 items-center justify-center rounded-xl border-2 text-xl font-bold transition-all ${
                        pin.length > i ? 'border-moss-500 bg-moss-50 text-moss-700' : 'border-line bg-white/70 text-mute/40'
                      }`}
                    >
                      {pin.length > i ? '•' : ''}
                    </span>
                  ))}
                </div>
                <input
                  autoFocus
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                    setPinErr('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && pin.length === 4 && submitPin()}
                  className="mx-auto mt-4 block w-40 rounded-lg border border-line bg-white/80 px-3 py-2 text-center font-mono text-lg tracking-[0.5em] focus:border-moss-400"
                  aria-label="PIN"
                />
                {pinErr && <p className="mt-2 text-xs font-bold text-danger-600">{pinErr}</p>}
                <Btn className="mt-4 w-full" disabled={pin.length !== 4} onClick={submitPin}>
                  <IconLock size={15} /> Entrar
                </Btn>
                <p className="mt-3 text-[11px] text-mute">Contas de demonstração usam PIN 1234.</p>
              </div>
            </section>
          )}

          {/* passo: escolha do prontuário */}
          {view === 'records' && pending && (
            <section>
              <button
                onClick={() => setView('accounts')}
                className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-mute transition-colors hover:text-ink"
              >
                <IconChevronLeft size={16} /> Trocar de conta
              </button>
              <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
                Olá, {pending.name.split(' ')[0]} — qual prontuário abrir?
              </h1>
              <p className="mt-1.5 text-sm text-mute">
                Você pode abrir o seu próprio prontuário ou os que recebeu acesso delegado.
              </p>

              {owned.length === 0 && delegated.length === 0 ? (
                <EmptyState
                  icon={<IconUsers size={22} />}
                  title="Nenhum prontuário acessível ainda"
                  desc="Cadastre pessoas para criar prontuários — ou entre sem prontuário para começar pela aba Pacientes."
                >
                  <Btn onClick={() => onEnter(pending.id, null)}>Entrar sem prontuário</Btn>
                </EmptyState>
              ) : (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {[...owned.map((p) => ({ p, grant: null as AccessGrant | null })), ...delegated.map((d) => ({ p: d.patient, grant: d.grant }))].map(
                    ({ p, grant }) => {
                      const age = ageFromBirth(p.birthDate);
                      return (
                        <div key={p.id} className="group relative">
                          <button
                            onClick={() => onEnter(pending.id, p.id)}
                            className="flex h-full w-full flex-col rounded-xl border border-line bg-card p-4 text-left shadow-lift transition-all hover:-translate-y-1 hover:border-moss-300 hover:shadow-float active:scale-[0.99]"
                          >
                            <span className="flex items-center gap-3">
                              {p.photo ? (
                                <img src={p.photo} alt="" className="h-12 w-12 rounded-full object-cover ring-2 ring-moss-100" />
                              ) : (
                                <AccountBadge name={p.name} size={48} />
                              )}
                              <span className="min-w-0">
                                <span className="block truncate font-display text-[15px] font-bold text-ink">{p.name}</span>
                                <span className="block text-xs text-mute">
                                  {age !== null ? `${age} anos` : 'idade n/d'} · {p.record}
                                </span>
                              </span>
                            </span>
                            <span className="mt-3 flex flex-wrap items-center gap-1.5">
                              {grant ? (
                                <Tag tone="info">
                                  <IconShare size={11} className="mr-1" />
                                  delegado por {grant.grantedByName.split(' ')[0]} · {grant.level === 'completo' ? 'acesso completo' : 'somente leitura'}
                                </Tag>
                              ) : (
                                <Tag tone="moss">Titular</Tag>
                              )}
                              {p.primarySpecialty && <Tag tone="mute">{p.primarySpecialty}</Tag>}
                              {p.missing.active && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-danger-100 px-1.5 py-0.5 text-[10px] font-bold text-danger-600">
                                  <span className="blink-dot h-1 w-1 rounded-full bg-danger-500" />
                                  desaparecida
                                </span>
                              )}
                            </span>
                            <span className="mt-3 border-t border-line pt-2.5 text-xs font-semibold text-moss-700 opacity-0 transition-opacity group-hover:opacity-100">
                              Abrir prontuário →
                            </span>
                          </button>
                        </div>
                      );
                    },
                  )}
                </div>
              )}

              {/* delegação de acesso */}
              {owned.length > 0 && (
                <div className="mt-8 rounded-xl border border-line bg-card p-5 shadow-lift">
                  <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
                    <IconShare size={18} className="text-moss-600" /> Delegar acesso aos meus prontuários
                  </h2>
                  <p className="mt-1 text-[13px] text-mute">
                    Ideal para quem não consegue operar o app: bebês, idosos ou pessoas com deficiência. O acesso fica registrado e pode ser revogado.
                  </p>
                  <div className="mt-4 space-y-4">
                    {owned.map((p) => {
                      const pg = grants.filter((g) => g.patientId === p.id);
                      return (
                        <div key={p.id} className="rounded-lg border border-line bg-paper/60 p-3.5">
                          <p className="text-sm font-bold text-ink">
                            {p.name} <span className="ml-1 font-mono text-[11px] font-normal text-mute">{p.record}</span>
                          </p>
                          {pg.length > 0 ? (
                            <ul className="mt-2 space-y-1.5">
                              {pg.map((g) => {
                                const acc = accounts.find((a) => a.id === g.accountId);
                                return (
                                  <li key={g.id} className="flex flex-wrap items-center gap-2 rounded-md bg-white/80 px-2.5 py-1.5 text-[13px]">
                                    <span className="font-semibold text-ink">{acc?.name ?? 'conta removida'}</span>
                                    <Tag tone={g.level === 'completo' ? 'moss' : 'info'}>{g.level === 'completo' ? 'completo' : 'leitura'}</Tag>
                                    <button
                                      onClick={() => {
                                        onRevoke(g.id);
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
                          ) : (
                            <p className="mt-2 text-xs text-mute">Nenhum acesso delegado até agora.</p>
                          )}
                          <div className="mt-2.5 flex flex-wrap gap-2">
                            <select className={`${inputCls} w-auto min-w-44`} value={grantAcc} onChange={(e) => setGrantAcc(e.target.value)}>
                              <option value="">Escolher conta…</option>
                              {accounts.filter((a) => a.id !== pending.id).map((a) => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                              ))}
                            </select>
                            <select className={`${inputCls} w-auto`} value={grantLevel} onChange={(e) => setGrantLevel(e.target.value as 'completo' | 'leitura')}>
                              <option value="completo">Acesso completo</option>
                              <option value="leitura">Somente leitura</option>
                            </select>
                            <Btn size="sm" disabled={!grantAcc} onClick={() => doGrant(p.id)}>
                              <IconShare size={14} /> Delegar
                            </Btn>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-6 text-center">
                <button
                  onClick={() => onEnter(pending.id, null)}
                  className="text-sm font-semibold text-mute underline-offset-4 transition-colors hover:text-ink hover:underline"
                >
                  Entrar sem abrir um prontuário agora
                </button>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
