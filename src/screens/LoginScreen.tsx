import { useMemo, useState, useEffect } from 'react';
import type { Account, AppState, Patient } from '../lib/types';
import { accessiblePatients, grantFor, hashPin, newRecordNumber, uid } from '../lib/store';
import { ageFromBirth } from '../lib/biometrics';
import { Btn, Ecg, Field, inputCls, Tag, useToast } from '../components/ui';
import {
  IconChevronLeft,
  IconFingerprint,
  IconLock,
  IconPlus,
  IconShield,
  IconSparkles,
  IconUsers,
  LogoMark,
} from '../components/icons';
import { BiometricService } from '../services/BiometricService';

type Step = 'account' | 'pin' | 'record' | 'biometric';

export function LoginScreen({
  state,
  onSeed,
  onCreateAccount,
  onLogin,
}: {
  state: AppState;
  onSeed: () => void;
  onCreateAccount: (acc: Account) => void;
  onLogin: (accountId: string, patientId: string | null) => void;
}) {
  const toast = useToast();
  const [step, setStep] = useState<Step>('account');
  const [selected, setSelected] = useState<Account | null>(null);
  const [pin, setPin] = useState('');
  const [pinErr, setPinErr] = useState(false);

  const [nName, setNName] = useState('');
  const [nEmail, setNEmail] = useState('');
  const [nRole, setNRole] = useState<'titular' | 'responsavel'>('titular');
  const [creating, setCreating] = useState(false);
  
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    // Verifica disponibilidade da biometria ao montar o componente
    BiometricService.isAvailable().then(setBiometricAvailable);
  }, []);

  const handleBiometricLogin = async () => {
    if (!selected) return;
    
    try {
      const success = await BiometricService.authenticate({
        reason: `Autentique-se para entrar como ${selected.name}`,
        fallbackTitle: 'Usar PIN',
        cancelTitle: 'Cancelar',
      });
      
      if (success) {
        // Autenticação biométrica bem-sucedida
        const accessible = accessiblePatients(state, selected.id);
        if (accessible.length === 0) {
          onLogin(selected.id, null);
        } else {
          setStep('record');
        }
      } else {
        // Falha na biometria, volta para PIN
        setStep('pin');
        toast('error', 'Autenticação biométrica falhou. Use seu PIN.');
      }
    } catch (error) {
      console.error('Erro na biometria:', error);
      setStep('pin');
      toast('error', 'Biometria não disponível. Use seu PIN.');
    }
  };

  const hasAccounts = state.accounts.length > 0;

  const accessible = useMemo(
    () => (selected ? accessiblePatients(state, selected.id) : []),
    [state, selected],
  );

  const chooseAccount = (acc: Account) => {
    setSelected(acc);
    setPin('');
    setPinErr(false);
    setStep('pin');
  };

  const pressDigit = (d: string) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setPinErr(false);
    if (next.length === 4 && selected) {
      if (selected.pinHash === null || selected.pinHash === hashPin(next)) {
        window.setTimeout(() => {
          if (accessible.length === 0) {
            onLogin(selected.id, null);
          } else {
            setStep('record');
          }
        }, 250);
      } else {
        window.setTimeout(() => {
          setPin('');
          setPinErr(true);
        }, 200);
      }
    }
  };

  const createAccount = () => {
    if (!nName.trim()) {
      toast('error', 'Informe o nome de quem vai usar esta conta.');
      return;
    }
    const acc: Account = {
      id: uid(),
      name: nName.trim(),
      email: nEmail.trim(),
      role: nRole,
      pinHash: hashPin('0000'),
      createdAt: Date.now(),
    };
    onCreateAccount(acc);
    toast('success', `Conta de ${acc.name} criada. PIN inicial: 0000.`);
    setCreating(false);
    setNName('');
    setNEmail('');
  };

  const enterApp = (patientId: string | null) => {
    if (selected) onLogin(selected.id, patientId);
  };

  return (
    <div className="dotted-ground flex min-h-screen">
      {/* painel lateral */}
      <aside className="scanlines relative hidden w-[400px] shrink-0 flex-col justify-between overflow-hidden bg-pine-900 p-8 lg:flex">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-moss-300"><LogoMark size={34} /></span>
            <div>
              <p className="font-display text-2xl font-bold leading-none text-white">My Doctor</p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-pine-200/70">prontuário vitalício</p>
            </div>
          </div>
          <h1 className="mt-10 font-display text-4xl font-bold leading-tight tracking-tight text-white">
            Quem cuida de alguém começa pela <span className="text-moss-300">identificação</span>.
          </h1>
          <ul className="mt-8 space-y-3">
            {[
              'Reconhecimento facial e digital 100% no dispositivo',
              'Localização de desaparecidos com rede de avisos',
              'Cartão de emergência no momento da identificação',
              'Acesso delegado: cuide do prontuário de quem não opera o app',
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-sm leading-relaxed text-pine-200">
                <IconShield size={16} className="mt-0.5 shrink-0 text-moss-400" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <Ecg className="h-10 w-full text-moss-400" />
          <p className="mt-2 font-mono text-[11px] text-pine-200/60">dados guardados apenas neste navegador</p>
        </div>
      </aside>

      {/* área de acesso */}
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <span className="text-moss-600"><LogoMark size={30} /></span>
            <div>
              <p className="font-display text-xl font-bold leading-none text-ink">My Doctor</p>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.22em] text-mute">prontuário vitalício</p>
            </div>
          </div>

          {!hasAccounts ? (
            <div className="rise rounded-xl border border-line bg-card p-6 shadow-lift">
              <h2 className="font-display text-2xl font-bold text-ink">Bem-vinda(o) ao My Doctor</h2>
              <p className="mt-2 text-sm leading-relaxed text-mute">
                Para começar, carregue os dados de demonstração (3 pessoas, contas e uma rede de avisos) ou crie a sua
                primeira conta.
              </p>
              <div className="mt-5 space-y-3">
                <Btn size="lg" onClick={() => { onSeed(); toast('success', 'Dados de exemplo carregados. Entre com qualquer conta (PIN 1234).'); }} className="w-full">
                  <IconSparkles size={17} /> Carregar dados de exemplo
                </Btn>
                <Btn variant="outline" className="w-full" onClick={() => setCreating(true)}>
                  <IconPlus size={16} /> Criar minha primeira conta
                </Btn>
              </div>
              <p className="mt-5 flex items-start gap-2 text-[12px] leading-relaxed text-mute">
                <IconLock size={14} className="mt-0.5 shrink-0 text-moss-600" />
                Tudo roda localmente: nenhum dado de saúde sai deste dispositivo.
              </p>
            </div>
          ) : step === 'account' ? (
            <div className="rise rounded-xl border border-line bg-card p-6 shadow-lift">
              <h2 className="font-display text-2xl font-bold text-ink">Quem está acessando?</h2>
              <p className="mt-1.5 text-sm text-mute">Escolha a sua conta para entrar.</p>
              <ul className="mt-4 space-y-2">
                {state.accounts.map((acc) => (
                  <li key={acc.id}>
                    <button
                      onClick={() => chooseAccount(acc)}
                      className="flex w-full items-center gap-3 rounded-xl border border-line bg-white/70 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-moss-300 hover:shadow-lift active:scale-[0.99]"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pine-900 font-display font-bold text-moss-300">
                        {acc.name.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-ink">{acc.name}</span>
                        <span className="block truncate text-xs text-mute">{acc.email || 'sem e-mail'}</span>
                      </span>
                      <Tag tone={acc.role === 'responsavel' ? 'info' : 'moss'}>
                        {acc.role === 'responsavel' ? 'responsável' : 'titular'}
                      </Tag>
                    </button>
                  </li>
                ))}
              </ul>
              <button onClick={() => setCreating(true)} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-moss-700 transition-colors hover:text-moss-800">
                <IconPlus size={15} /> Criar outra conta
              </button>
            </div>
          ) : step === 'pin' && selected ? (
            <div className="rise rounded-xl border border-line bg-card p-6 text-center shadow-lift">
              <button onClick={() => setStep('account')} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-mute hover:text-ink">
                <IconChevronLeft size={14} /> trocar conta
              </button>
              <p className="text-sm text-mute">Olá,</p>
              <h2 className="font-display text-xl font-bold text-ink">{selected.name}</h2>
              
              {/* Botão de biometria se disponível */}
              {biometricAvailable && (
                <div className="mt-4">
                  <Btn variant="outline" onClick={handleBiometricLogin} className="w-full flex items-center justify-center gap-2 border-moss-300 bg-moss-50 text-moss-700 hover:bg-moss-100">
                    <IconFingerprint size={20} />
                    <span>Entrar com Biometria (Face/Digital)</span>
                  </Btn>
                  <p className="mt-2 text-xs text-mute">ou use seu PIN abaixo</p>
                </div>
              )}
              <p className="mt-3 text-sm text-mute">Digite seu PIN de 4 dígitos</p>
              <div className={`mt-3 flex justify-center gap-2.5 ${pinErr ? 'animate-pulse' : ''}`}>
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={`h-4 w-4 rounded-full border-2 transition-all ${
                      pinErr ? 'border-danger-500 bg-danger-100' : i < pin.length ? 'border-moss-600 bg-moss-600' : 'border-line bg-white'
                    }`}
                  />
                ))}
              </div>
              {pinErr && <p className="mt-2 text-xs font-semibold text-danger-600">PIN incorreto. Tente novamente.</p>}
              <div className="mx-auto mt-5 grid w-52 grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                  <button key={d} onClick={() => pressDigit(d)} className="rounded-xl border border-line bg-white/80 py-3 font-mono text-lg font-bold text-ink transition-all hover:border-moss-300 hover:bg-moss-50 active:scale-95">
                    {d}
                  </button>
                ))}
                <span />
                <button onClick={() => pressDigit('0')} className="rounded-xl border border-line bg-white/80 py-3 font-mono text-lg font-bold text-ink transition-all hover:border-moss-300 hover:bg-moss-50 active:scale-95">
                  0
                </button>
                <button onClick={() => setPin((p) => p.slice(0, -1))} className="rounded-xl border border-line py-3 text-xs font-bold text-mute transition-all hover:bg-pine-900/5 active:scale-95">
                  apagar
                </button>
              </div>
              <p className="mt-4 text-[11px] text-mute">Contas de exemplo usam o PIN <strong className="font-mono">1234</strong>.</p>
            </div>
          ) : step === 'record' && selected ? (
            <div className="rise rounded-xl border border-line bg-card p-6 shadow-lift">
              <button onClick={() => setStep('account')} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-mute hover:text-ink">
                <IconChevronLeft size={14} /> trocar conta
              </button>
              <h2 className="font-display text-2xl font-bold text-ink">Qual prontuário abrir?</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-mute">
                Você pode acessar os seus próprios prontuários e os que foram <strong className="text-ink">delegados</strong> a você.
              </p>
              <ul className="mt-4 space-y-2">
                {accessible.map((p) => {
                  const grant = grantFor(state, selected.id, p.id);
                  const isOwn = p.ownerAccountId === selected.id;
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => enterApp(p.id)}
                        className="flex w-full items-center gap-3 rounded-xl border border-line bg-white/70 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-moss-300 hover:shadow-lift active:scale-[0.99]"
                      >
                        {p.photo ? (
                          <img src={p.photo} alt={p.name} className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-card" />
                        ) : (
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-pine-900 text-moss-300">
                            <IconUsers size={20} />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-ink">{p.name}</span>
                          <span className="block text-xs text-mute">
                            {ageFromBirth(p.birthDate) !== null ? `${ageFromBirth(p.birthDate)} anos · ` : ''}
                            ficha <span className="font-mono">{p.record}</span>
                          </span>
                        </span>
                        {isOwn ? (
                          <Tag tone="moss">seu prontuário</Tag>
                        ) : (
                          <Tag tone="info">delegado por {grant?.grantedByName ?? '—'}</Tag>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <Btn variant="dark" className="mt-4 w-full" onClick={() => enterApp(null)}>
                <IconFingerprint size={16} /> Entrar sem abrir prontuário (usar identificação)
              </Btn>
            </div>
          ) : null}

          {creating && (
            <div className="overlay-in fixed inset-0 z-[80] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-pine-950/60 backdrop-blur-[2px]" onClick={() => setCreating(false)} />
              <div className="modal-in relative w-full max-w-sm rounded-xl border border-line bg-card p-5 shadow-float">
                <h3 className="font-display text-lg font-bold text-ink">Nova conta</h3>
                <div className="mt-4 space-y-3">
                  <Field label="Nome completo" required>
                    <input className={inputCls} value={nName} onChange={(e) => setNName(e.target.value)} placeholder="Quem vai usar esta conta" />
                  </Field>
                  <Field label="E-mail" hint="opcional">
                    <input className={inputCls} value={nEmail} onChange={(e) => setNEmail(e.target.value)} placeholder="voce@exemplo.com" />
                  </Field>
                  <Field label="Tipo de conta">
                    <select className={inputCls} value={nRole} onChange={(e) => setNRole(e.target.value as 'titular' | 'responsavel')}>
                      <option value="titular">Titular (cuida do próprio prontuário)</option>
                      <option value="responsavel">Responsável (cuida de outra pessoa)</option>
                    </select>
                  </Field>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  <Btn variant="outline" onClick={() => setCreating(false)}>Cancelar</Btn>
                  <Btn onClick={createAccount}>Criar conta</Btn>
                </div>
                <p className="mt-3 text-[11px] text-mute">PIN inicial: 0000. Você poderá alterá-lo nas configurações.</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
