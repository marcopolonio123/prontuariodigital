import { useEffect, useMemo, useState } from 'react';
import {
  MyDoctorV1Api,
  defaultV1ApiUrl,
  type HealthEventV1,
  type LoginStartResponse,
  type MfaChannel,
  type PatientProfile,
  type V1User,
} from './lib/api-v1';

const EVENT_TYPES = [
  ['consultation', 'Consulta'], ['exam', 'Exame'], ['hospitalization', 'Internação'],
  ['procedure', 'Procedimento'], ['therapy', 'Terapia/Fisioterapia'], ['vaccine', 'Vacina'],
  ['prescription', 'Receita/Prescrição'], ['other', 'Outro'],
] as const;

const VITAL_TYPES = [
  ['blood_pressure', 'Pressão arterial', 'mmHg'], ['heart_rate', 'Frequência cardíaca', 'bpm'],
  ['spo2', 'Oxigenação (SpO₂)', '%'], ['temperature', 'Temperatura', '°C'], ['weight', 'Peso', 'kg'],
  ['glucose', 'Glicemia', 'mg/dL'], ['respiratory_rate', 'Frequência respiratória', 'irpm'],
] as const;

type AppView = 'record' | 'vitals' | 'profiles';
type AuthView = 'login' | 'register' | 'verify';
type VitalType = (typeof VITAL_TYPES)[number][0];

function Card({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl border border-line bg-card p-4 shadow-lift sm:p-5">{children}</section>;
}

function inputClass() {
  return 'w-full rounded-xl border border-line bg-white px-3 py-3 text-sm outline-none focus:border-moss-500';
}

function PasswordVisibilityIcon({ visible }: { visible: boolean }) {
  if (visible) return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true"><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 002.8 2.8" /><path d="M9.9 4.2A10.8 10.8 0 0112 4c5 0 9 5 9 8a10.3 10.3 0 01-2 3.6" /><path d="M6.6 6.6C4.4 8 3 10.1 3 12c0 3 4 8 9 8a9.7 9.7 0 004.2-.9" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
}

export default function V1PreviewApp() {
  const [apiUrl] = useState(defaultV1ApiUrl());
  const api = useMemo(() => new MyDoctorV1Api(apiUrl), [apiUrl]);
  const [token, setToken] = useState('');
  const [user, setUser] = useState<V1User | null>(null);
  const [authView, setAuthView] = useState<AuthView>('login');
  const [challenge, setChallenge] = useState<LoginStartResponse | null>(null);
  const [registerName, setRegisterName] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [channel, setChannel] = useState<MfaChannel>('email');
  const [code, setCode] = useState('');
  const [profiles, setProfiles] = useState<PatientProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<PatientProfile | null>(null);
  const [events, setEvents] = useState<HealthEventV1[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [view, setView] = useState<AppView>('record');

  const [newName, setNewName] = useState('');
  const [relationship, setRelationship] = useState<'child' | 'parent' | 'guardian' | 'dependent' | 'other'>('child');
  const [eventType, setEventType] = useState('consultation');
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [organizationName, setOrganizationName] = useState('');
  const [locationName, setLocationName] = useState('');
  const [practitionerName, setPractitionerName] = useState('');
  const [profession, setProfession] = useState('');
  const [council, setCouncil] = useState('');
  const [registration, setRegistration] = useState('');
  const [registrationRegion, setRegistrationRegion] = useState('');
  const [notes, setNotes] = useState('');

  const [vitalType, setVitalType] = useState<VitalType>('blood_pressure');
  const [vitalValue, setVitalValue] = useState('');
  const [vitalSecondaryValue, setVitalSecondaryValue] = useState('');
  const [vitalDate, setVitalDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [vitalSource, setVitalSource] = useState('manual');
  const [vitalDevice, setVitalDevice] = useState('');

  useEffect(() => { api.setToken(token); }, [api, token]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true); setMessage('');
    try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro inesperado.'); }
    finally { setBusy(false); }
  };

  const loadEvents = async (profile: PatientProfile, client = api) => {
    setEvents(await client.listHealthEvents(profile.id));
  };

  const loadProfiles = async (client = api) => {
    const items = await client.listProfiles();
    setProfiles(items);
    const selected = activeProfile ?? items[0] ?? null;
    setActiveProfile(selected);
    if (selected) await loadEvents(selected, client);
  };

  const createAccount = () => run(async () => {
    if (!registerName.trim()) throw new Error('Informe seu nome.');
    if (!email.trim()) throw new Error('Informe seu e-mail.');
    if (password.length < 8) throw new Error('A senha deve ter pelo menos 8 caracteres.');
    await api.register({ name: registerName.trim(), email: email.trim(), password, phone: registerPhone.trim() || undefined });
    setRegisterName(''); setRegisterPhone(''); setPassword(''); setShowPassword(false); setAuthView('login');
    setMessage('Cadastro concluído. Agora entre com seu e-mail e senha.');
  });

  const startLogin = () => run(async () => {
    if (!email.trim() || !password) throw new Error('Informe e-mail e senha.');
    const result = await api.startPasswordLogin({ email, password, channel });
    setChallenge(result); setAuthView('verify');
    if (result.developmentCode) setCode(result.developmentCode);
    setMessage(`Código enviado para ${result.destinationMasked}.`);
  });

  const verifyLogin = () => run(async () => {
    if (!challenge) return;
    const result = await api.verifyPasswordLogin({ challengeId: challenge.challengeId, code });
    setToken(result.token); setUser(result.user); api.setToken(result.token);
    await loadProfiles(api);
    setMessage('Acesso realizado com segurança.');
  });

  const logout = () => {
    api.setToken(''); setUser(null); setToken(''); setChallenge(null); setCode(''); setShowPassword(false);
    setProfiles([]); setActiveProfile(null); setEvents([]); setView('record'); setAuthView('login');
    setMessage('Você saiu com segurança.');
  };

  const chooseProfile = (profile: PatientProfile) => run(async () => { setActiveProfile(profile); await loadEvents(profile); });

  const createDependent = () => run(async () => {
    if (!newName.trim()) throw new Error('Informe o nome do dependente.');
    const created = await api.createDependentProfile({ name: newName.trim(), relationship });
    setNewName(''); await loadProfiles(api); setActiveProfile(created); setEvents([]);
    setMessage(`${created.name} criado sem necessidade de login próprio.`);
  });

  const createEvent = () => run(async () => {
    if (!activeProfile) throw new Error('Escolha um perfil.');
    if (!eventTitle.trim()) throw new Error('Informe a descrição do evento.');
    await api.createHealthEvent(activeProfile.id, {
      type: eventType, title: eventTitle.trim(), occurredAt: new Date(eventDate).toISOString(),
      organizationName: organizationName.trim() || undefined, locationName: locationName.trim() || undefined,
      practitionerName: practitionerName.trim() || undefined, profession: profession.trim() || undefined,
      council: council.trim() || undefined, registration: registration.trim() || undefined,
      registrationRegion: registrationRegion.trim() || undefined, payload: { notes: notes.trim() },
    });
    setEventTitle(''); setNotes(''); await loadEvents(activeProfile, api); setMessage('Evento incluído na linha do tempo.');
  });

  const selectedVital = VITAL_TYPES.find(([type]) => type === vitalType) ?? VITAL_TYPES[0];
  const vitalEvents = events.filter((event) => event.type === 'vital');
  const vitalPayload = (event: HealthEventV1) => event.payload as Record<string, unknown>;

  const createVital = () => run(async () => {
    if (!activeProfile) throw new Error('Escolha um perfil.');
    if (!vitalValue.trim()) throw new Error('Informe o valor da medição.');
    if (vitalType === 'blood_pressure' && !vitalSecondaryValue.trim()) throw new Error('Informe pressão sistólica e diastólica.');
    const label = selectedVital[1]; const unit = selectedVital[2];
    const displayValue = vitalType === 'blood_pressure' ? `${vitalValue}/${vitalSecondaryValue} ${unit}` : `${vitalValue} ${unit}`;
    await api.createHealthEvent(activeProfile.id, {
      type: 'vital', title: `${label}: ${displayValue}`, occurredAt: new Date(vitalDate).toISOString(),
      payload: { vitalType, label, value: vitalValue, secondaryValue: vitalType === 'blood_pressure' ? vitalSecondaryValue : null, unit, source: vitalSource, device: vitalDevice.trim() || null },
    });
    setVitalValue(''); setVitalSecondaryValue(''); setVitalDevice(''); setVitalDate(new Date().toISOString().slice(0, 16));
    await loadEvents(activeProfile, api); setMessage('Sinal vital salvo no prontuário.');
  });

  const passwordField = (autoComplete: 'current-password' | 'new-password') => <div className="relative mt-1">
    <input value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass()} pr-12`} type={showPassword ? 'text' : 'password'} autoComplete={autoComplete} />
    <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-mute hover:text-ink focus:outline-none" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
      <PasswordVisibilityIcon visible={showPassword} />
    </button>
  </div>;

  const authPanel = () => {
    if (authView === 'register') return <Card>
      <h2 className="font-display text-2xl font-bold text-ink">Criar sua conta</h2>
      <p className="mt-1 text-sm text-mute">Cadastre-se para criar seu prontuário pessoal.</p>
      <label className="mt-4 block text-xs font-bold text-mute">Nome completo</label><input value={registerName} onChange={(e) => setRegisterName(e.target.value)} className={`${inputClass()} mt-1`} autoComplete="name" />
      <label className="mt-3 block text-xs font-bold text-mute">E-mail</label><input value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass()} mt-1`} type="email" autoComplete="email" />
      <label className="mt-3 block text-xs font-bold text-mute">Celular (opcional)</label><input value={registerPhone} onChange={(e) => setRegisterPhone(e.target.value)} className={`${inputClass()} mt-1`} inputMode="tel" autoComplete="tel" />
      <label className="mt-3 block text-xs font-bold text-mute">Crie uma senha</label>{passwordField('new-password')}
      <button disabled={busy} onClick={() => void createAccount()} className="mt-5 w-full rounded-xl bg-pine-900 px-4 py-3 font-bold text-white disabled:opacity-50">Cadastrar</button>
      <p className="mt-5 text-center text-sm text-mute">Já tem cadastro? <button className="font-bold text-moss-700 underline" onClick={() => { setAuthView('login'); setShowPassword(false); setMessage(''); }}>Entrar</button></p>
    </Card>;

    if (authView === 'verify') return <Card>
      <button className="mb-4 text-sm font-bold text-moss-700" onClick={() => { setAuthView('login'); setChallenge(null); setCode(''); }}>← Voltar ao login</button>
      <h2 className="font-display text-2xl font-bold text-ink">Código de verificação</h2>
      <p className="mt-2 text-sm text-mute">Digite o código enviado para <strong>{challenge?.destinationMasked}</strong>.</p>
      <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className="mt-5 w-full rounded-xl border border-line bg-white px-3 py-3 text-center font-mono text-2xl tracking-[0.35em]" inputMode="numeric" autoComplete="one-time-code" />
      {challenge?.developmentCode && <p className="mt-2 text-xs text-mute">Ambiente de desenvolvimento: código preenchido automaticamente.</p>}
      <button disabled={busy || code.length !== 6} onClick={() => void verifyLogin()} className="mt-5 w-full rounded-xl bg-moss-700 px-4 py-3 font-bold text-white disabled:opacity-50">Validar e entrar</button>
    </Card>;

    return <Card>
      <h2 className="font-display text-2xl font-bold text-ink">Entrar no MyDoctor</h2>
      <p className="mt-1 text-sm text-mute">Acesse seu prontuário com seu e-mail e senha.</p>
      <label className="mt-5 block text-xs font-bold text-mute">E-mail</label><input value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass()} mt-1`} type="email" autoComplete="email" />
      <label className="mt-3 block text-xs font-bold text-mute">Senha</label>{passwordField('current-password')}
      <p className="mt-4 text-xs font-bold uppercase tracking-wide text-mute">Receber código de segurança por</p>
      <div className="mt-2 flex gap-4 text-sm"><label className="flex items-center gap-2"><input type="radio" checked={channel === 'email'} onChange={() => setChannel('email')} /> E-mail</label><label className="flex items-center gap-2"><input type="radio" checked={channel === 'sms'} onChange={() => setChannel('sms')} /> SMS</label></div>
      <button disabled={busy} onClick={() => void startLogin()} className="mt-5 w-full rounded-xl bg-pine-900 px-4 py-3 font-bold text-white disabled:opacity-50">Entrar</button>
      <p className="mt-5 text-center text-sm text-mute">Você não tem cadastro? <button className="font-bold text-moss-700 underline" onClick={() => { setAuthView('register'); setShowPassword(false); setMessage(''); }}>Clique aqui para se cadastrar</button></p>
    </Card>;
  };

  return <div className="min-h-screen bg-paper pb-24 md:p-8 md:pb-8"><div className="mx-auto max-w-6xl p-4 md:p-0">
    <header className="mb-5 flex items-start justify-between gap-3"><div><p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-moss-700">MyDoctor</p><h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Prontuário longitudinal</h1><p className="mt-1 text-sm text-mute">Seu histórico de saúde em um único lugar.</p></div>{user && <button onClick={logout} className="hidden rounded-xl border border-danger-200 bg-white px-4 py-2 text-sm font-bold text-danger-600 md:block">Sair</button>}</header>
    {message && <div className="mb-4 rounded-xl border border-moss-200 bg-moss-50 px-4 py-3 text-sm font-semibold text-moss-800">{message}</div>}

    {!user ? <div className="mx-auto max-w-md pt-4 sm:pt-10">{authPanel()}</div> : <>
      <div className="mb-5 hidden grid-cols-3 gap-2 md:grid"><button onClick={() => setView('record')} className={`rounded-xl px-4 py-3 text-sm font-bold ${view === 'record' ? 'bg-pine-900 text-white' : 'border border-line bg-white text-ink'}`}>Prontuário</button><button onClick={() => setView('vitals')} className={`rounded-xl px-4 py-3 text-sm font-bold ${view === 'vitals' ? 'bg-pine-900 text-white' : 'border border-line bg-white text-ink'}`}>Sinais vitais</button><button onClick={() => setView('profiles')} className={`rounded-xl px-4 py-3 text-sm font-bold ${view === 'profiles' ? 'bg-pine-900 text-white' : 'border border-line bg-white text-ink'}`}>Perfis</button></div>
      <div className="grid gap-5 xl:grid-cols-[300px_1fr]">
        <div className={`space-y-5 ${view === 'profiles' ? 'block' : 'hidden xl:block'}`}><Card><p className="text-xs font-bold uppercase tracking-wide text-mute">Conta</p><h2 className="mt-1 font-display text-xl font-bold text-ink">{user.name}</h2><p className="text-sm text-mute">{user.email}</p></Card><Card><h2 className="font-display text-lg font-bold text-ink">Escolher prontuário</h2><div className="mt-3 space-y-2">{profiles.map((profile) => <button key={profile.id} onClick={() => void chooseProfile(profile)} className={`w-full rounded-xl border p-3 text-left ${activeProfile?.id === profile.id ? 'border-moss-500 bg-moss-50' : 'border-line bg-white'}`}><strong className="block text-sm text-ink">{profile.name}</strong><span className="text-xs text-mute">{profile.relationship} · {profile.source === 'owned' ? 'sob sua gestão' : 'delegado'}</span></button>)}</div></Card><Card><h2 className="font-display text-lg font-bold text-ink">Cadastrar dependente</h2><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome completo" className={`${inputClass()} mt-3`} /><select value={relationship} onChange={(e) => setRelationship(e.target.value as typeof relationship)} className={`${inputClass()} mt-2`}><option value="child">Filho(a)</option><option value="parent">Pai/Mãe</option><option value="guardian">Pessoa sob tutela</option><option value="dependent">Dependente</option><option value="other">Outro</option></select><button disabled={busy} onClick={() => void createDependent()} className="mt-3 w-full rounded-xl border border-moss-500 px-3 py-3 text-sm font-bold text-moss-800">Adicionar perfil</button></Card></div>
        <div className={`space-y-5 ${view === 'profiles' ? 'hidden xl:block' : 'block'}`}>
          {view === 'vitals' ? <><Card><p className="text-xs font-bold uppercase tracking-wide text-moss-700">Sinais vitais</p><h2 className="mt-1 font-display text-2xl font-bold text-ink">{activeProfile?.name ?? 'Escolha um perfil'}</h2><p className="mt-1 text-sm text-mute">Registre medições manuais. Integrações HealthKit, Health Connect e dispositivos serão conectadas a esta mesma área.</p>{activeProfile && <div className="mt-5 grid gap-3 sm:grid-cols-2"><select value={vitalType} onChange={(e) => setVitalType(e.target.value as VitalType)} className={inputClass()}>{VITAL_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input type="datetime-local" value={vitalDate} onChange={(e) => setVitalDate(e.target.value)} className={inputClass()} /><input value={vitalValue} onChange={(e) => setVitalValue(e.target.value.replace(',', '.'))} inputMode="decimal" placeholder={vitalType === 'blood_pressure' ? 'Sistólica (ex.: 120)' : `Valor em ${selectedVital[2]}`} className={inputClass()} />{vitalType === 'blood_pressure' && <input value={vitalSecondaryValue} onChange={(e) => setVitalSecondaryValue(e.target.value.replace(',', '.'))} inputMode="decimal" placeholder="Diastólica (ex.: 80)" className={inputClass()} />}<select value={vitalSource} onChange={(e) => setVitalSource(e.target.value)} className={inputClass()}><option value="manual">Digitado manualmente</option><option value="healthkit">Apple Health / HealthKit</option><option value="health_connect">Android Health Connect</option><option value="bluetooth">Dispositivo Bluetooth</option><option value="institution">Instituição de saúde</option></select><input value={vitalDevice} onChange={(e) => setVitalDevice(e.target.value)} placeholder="Aparelho/dispositivo (opcional)" className={inputClass()} /><button disabled={busy} onClick={() => void createVital()} className="sm:col-span-2 rounded-xl bg-pine-900 px-4 py-3 font-bold text-white disabled:opacity-50">Salvar sinal vital</button></div>}</Card><Card><div className="flex items-center justify-between gap-3"><h2 className="font-display text-xl font-bold text-ink">Histórico de medições</h2>{activeProfile && <button disabled={busy} onClick={() => void loadEvents(activeProfile)} className="rounded-lg border border-line px-3 py-2 text-xs font-bold">Atualizar</button>}</div>{!activeProfile ? <p className="mt-3 text-sm text-mute">Escolha um perfil.</p> : vitalEvents.length === 0 ? <p className="mt-3 text-sm text-mute">Nenhum sinal vital registrado.</p> : <div className="mt-4 grid gap-3 sm:grid-cols-2">{vitalEvents.map((event) => { const payload = vitalPayload(event); return <article key={event.id} className="rounded-xl border border-line bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-moss-700">{String(payload.label ?? 'Sinal vital')}</p><h3 className="mt-1 text-xl font-bold text-ink">{String(payload.value ?? '')}{payload.secondaryValue ? `/${String(payload.secondaryValue)}` : ''} <span className="text-sm font-semibold text-mute">{String(payload.unit ?? '')}</span></h3><time className="mt-2 block text-xs text-mute">{new Date(event.occurredAt).toLocaleString('pt-BR')}</time></article>; })}</div>}</Card></> : <><Card><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-mute">Prontuário ativo</p><h2 className="font-display text-2xl font-bold text-ink">{activeProfile?.name ?? 'Escolha um perfil'}</h2></div>{activeProfile && <button disabled={busy} onClick={() => void loadEvents(activeProfile)} className="rounded-lg border border-line px-3 py-2 text-xs font-bold">Atualizar linha do tempo</button>}</div>{activeProfile && <div className="mt-5 grid gap-3 md:grid-cols-2"><select value={eventType} onChange={(e) => setEventType(e.target.value)} className={inputClass()}>{EVENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input type="datetime-local" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className={inputClass()} /><input value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} placeholder="Descrição do registro *" className={`${inputClass()} md:col-span-2`} /><input value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} placeholder="Hospital / clínica / consultório" className={inputClass()} /><input value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="Local / unidade" className={inputClass()} /><input value={practitionerName} onChange={(e) => setPractitionerName(e.target.value)} placeholder="Profissional de saúde" className={inputClass()} /><input value={profession} onChange={(e) => setProfession(e.target.value)} placeholder="Profissão / especialidade" className={inputClass()} /><input value={council} onChange={(e) => setCouncil(e.target.value)} placeholder="Conselho (CRM, CREFITO...)" className={inputClass()} /><div className="grid grid-cols-[1fr_84px] gap-2"><input value={registration} onChange={(e) => setRegistration(e.target.value)} placeholder="Registro" className={inputClass()} /><input value={registrationRegion} onChange={(e) => setRegistrationRegion(e.target.value)} placeholder="UF" className={inputClass()} /></div><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações clínicas" className={`${inputClass()} min-h-24 md:col-span-2`} /><button disabled={busy} onClick={() => void createEvent()} className="md:col-span-2 rounded-xl bg-pine-900 px-4 py-3 font-bold text-white disabled:opacity-50">Salvar no prontuário</button></div>}</Card><Card><h2 className="font-display text-xl font-bold text-ink">Linha do tempo</h2>{!activeProfile ? <p className="mt-3 text-sm text-mute">Escolha um perfil.</p> : events.length === 0 ? <p className="mt-3 text-sm text-mute">Nenhum evento clínico registrado.</p> : <ol className="mt-4 space-y-3">{events.map((event) => <li key={event.id} className="rounded-xl border border-line bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><span className="text-[10px] font-bold uppercase tracking-wider text-moss-700">{event.type === 'vital' ? 'Sinal vital' : event.type}</span><h3 className="font-display text-lg font-bold text-ink">{event.title}</h3></div><time className="font-mono text-xs text-mute">{new Date(event.occurredAt).toLocaleString('pt-BR')}</time></div><div className="mt-2 text-sm text-mute">{event.organizationNameSnapshot && <p><strong>Instituição:</strong> {event.organizationNameSnapshot}</p>}{event.locationNameSnapshot && <p><strong>Local:</strong> {event.locationNameSnapshot}</p>}{event.practitionerNameSnapshot && <p><strong>Profissional:</strong> {event.practitionerNameSnapshot} {event.professionSnapshot ? `· ${event.professionSnapshot}` : ''}</p>}{event.registrationSnapshot && <p><strong>Registro:</strong> {event.councilSnapshot ?? ''} {event.registrationSnapshot}{event.registrationRegionSnapshot ? `/${event.registrationRegionSnapshot}` : ''}</p>}{typeof event.payload?.notes === 'string' && event.payload.notes && <p className="mt-2 whitespace-pre-wrap text-ink">{event.payload.notes}</p>}</div></li>)}</ol>}</Card></>}
        </div>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t border-line bg-white/95 px-2 py-2 shadow-2xl backdrop-blur md:hidden"><button onClick={() => setView('record')} className={`rounded-xl px-2 py-2 text-xs font-bold ${view === 'record' ? 'bg-pine-900 text-white' : 'text-ink'}`}>Prontuário</button><button onClick={() => setView('vitals')} className={`rounded-xl px-2 py-2 text-xs font-bold ${view === 'vitals' ? 'bg-pine-900 text-white' : 'text-ink'}`}>Sinais vitais</button><button onClick={() => setView('profiles')} className={`rounded-xl px-2 py-2 text-xs font-bold ${view === 'profiles' ? 'bg-pine-900 text-white' : 'text-ink'}`}>Perfis</button><button onClick={logout} className="rounded-xl px-2 py-2 text-xs font-bold text-danger-600">Sair</button></nav>
    </>}
  </div></div>;
}
