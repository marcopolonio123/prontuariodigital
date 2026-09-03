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

type AppView = 'welcome' | 'record' | 'vitals' | 'profiles' | 'insurance' | 'consultant';
type AuthView = 'login' | 'register' | 'verify';
type VitalType = (typeof VITAL_TYPES)[number][0];

type InsurancePayload = {
  provider?: string;
  planName?: string;
  memberNumber?: string;
  holderName?: string;
  validity?: string;
  notes?: string;
  status?: string;
  cardFront?: string | null;
  cardBack?: string | null;
};

function Card({ children }: { children: React.ReactNode }) {
  return <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-card p-4 shadow-lift sm:p-5">{children}</section>;
}

function inputClass() {
  return 'block w-full min-w-0 max-w-full box-border rounded-xl border border-line bg-white px-3 py-3 text-sm outline-none focus:border-moss-500';
}

function PrimaryButton({ children, onClick, disabled = false }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="rounded-xl bg-pine-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{children}</button>;
}

function SecondaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-xl border border-moss-500 px-4 py-3 text-sm font-bold text-moss-800">{children}</button>;
}

function PasswordVisibilityIcon({ visible }: { visible: boolean }) {
  if (!visible) return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true"><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 002.8 2.8" /><path d="M9.9 4.2A10.8 10.8 0 0112 4c5 0 9 5 9 8a10.3 10.3 0 01-2 3.6" /><path d="M6.6 6.6C4.4 8 3 10.1 3 12c0 3 4 8 9 8a9.7 9.7 0 004.2-.9" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
}

function MenuIcon({ open }: { open: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-6 w-6" aria-hidden="true">{open ? <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></> : <><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></>}</svg>;
}

async function compressImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Selecione uma imagem válida.');
  if (file.size > 12 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 12 MB.');
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível processar a imagem.'));
    img.src = source;
  });
  const limit = 1280;
  const scale = Math.min(1, limit / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível preparar a imagem.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.72);
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
  const [view, setView] = useState<AppView>('welcome');
  const [menuOpen, setMenuOpen] = useState(false);

  const [showProfileForm, setShowProfileForm] = useState(false);
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [showVitalForm, setShowVitalForm] = useState(false);
  const [showInsuranceForm, setShowInsuranceForm] = useState(false);

  const [newName, setNewName] = useState('');
  const [newBirthDate, setNewBirthDate] = useState('');
  const [newSex, setNewSex] = useState('');
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

  const [insuranceProvider, setInsuranceProvider] = useState('');
  const [insurancePlan, setInsurancePlan] = useState('');
  const [insuranceNumber, setInsuranceNumber] = useState('');
  const [insuranceHolder, setInsuranceHolder] = useState('');
  const [insuranceValidity, setInsuranceValidity] = useState('');
  const [insuranceNotes, setInsuranceNotes] = useState('');
  const [insuranceFront, setInsuranceFront] = useState<string | null>(null);
  const [insuranceBack, setInsuranceBack] = useState<string | null>(null);

  useEffect(() => { api.setToken(token); }, [api, token]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true); setMessage('');
    try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro inesperado.'); }
    finally { setBusy(false); }
  };

  const loadEvents = async (profile: PatientProfile, client = api) => setEvents(await client.listHealthEvents(profile.id));
  const loadProfiles = async (client = api) => {
    const items = await client.listProfiles();
    setProfiles(items);
    const selected = activeProfile && items.some((item) => item.id === activeProfile.id) ? activeProfile : items[0] ?? null;
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
    await loadProfiles(api); setView('welcome'); setMessage('Acesso realizado com segurança.');
  });

  const logout = () => {
    api.setToken(''); setUser(null); setToken(''); setChallenge(null); setCode(''); setShowPassword(false);
    setProfiles([]); setActiveProfile(null); setEvents([]); setView('welcome'); setMenuOpen(false); setAuthView('login');
    setShowProfileForm(false); setShowRecordForm(false); setShowVitalForm(false); setShowInsuranceForm(false);
    setMessage('Você saiu com segurança.');
  };

  const go = (next: AppView) => { setView(next); setMenuOpen(false); setMessage(''); };
  const chooseProfile = (profile: PatientProfile) => run(async () => { setActiveProfile(profile); await loadEvents(profile); });

  const createDependent = () => run(async () => {
    if (!newName.trim()) throw new Error('Informe o nome da pessoa.');
    const created = await api.createDependentProfile({
      name: newName.trim(), relationship, birthDate: newBirthDate || undefined, sex: newSex || undefined,
    });
    setNewName(''); setNewBirthDate(''); setNewSex(''); setShowProfileForm(false);
    await loadProfiles(api); setActiveProfile(created); setEvents([]); setMessage(`${created.name} incluído com sucesso.`);
  });

  const createEvent = () => run(async () => {
    if (!activeProfile) throw new Error('Escolha um perfil.');
    if (!eventTitle.trim()) throw new Error('Informe a descrição do registro.');
    await api.createHealthEvent(activeProfile.id, {
      type: eventType, title: eventTitle.trim(), occurredAt: new Date(eventDate).toISOString(),
      organizationName: organizationName.trim() || undefined, locationName: locationName.trim() || undefined,
      practitionerName: practitionerName.trim() || undefined, profession: profession.trim() || undefined,
      council: council.trim() || undefined, registration: registration.trim() || undefined,
      registrationRegion: registrationRegion.trim() || undefined, payload: { notes: notes.trim() },
    });
    setEventTitle(''); setNotes(''); setShowRecordForm(false); await loadEvents(activeProfile, api); setMessage('Registro incluído no prontuário.');
  });

  const selectedVital = VITAL_TYPES.find(([type]) => type === vitalType) ?? VITAL_TYPES[0];
  const vitalEvents = events.filter((event) => event.type === 'vital');
  const insuranceEvents = events.filter((event) => event.type === 'insurance');
  const clinicalEvents = events.filter((event) => event.type !== 'vital' && event.type !== 'insurance');
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
    setVitalValue(''); setVitalSecondaryValue(''); setVitalDevice(''); setVitalDate(new Date().toISOString().slice(0, 16)); setShowVitalForm(false);
    await loadEvents(activeProfile, api); setMessage('Sinal vital salvo no prontuário.');
  });

  const createInsurance = () => run(async () => {
    if (!activeProfile) throw new Error('Escolha um perfil.');
    if (!insuranceProvider.trim()) throw new Error('Informe o convênio/operadora.');
    await api.createHealthEvent(activeProfile.id, {
      type: 'insurance',
      title: `Convênio: ${insuranceProvider.trim()}${insurancePlan.trim() ? ` · ${insurancePlan.trim()}` : ''}`,
      occurredAt: new Date().toISOString(),
      payload: {
        provider: insuranceProvider.trim(), planName: insurancePlan.trim(), memberNumber: insuranceNumber.trim(),
        holderName: insuranceHolder.trim(), validity: insuranceValidity || null, notes: insuranceNotes.trim(), status: 'active',
        cardFront: insuranceFront, cardBack: insuranceBack,
      },
    });
    setInsuranceProvider(''); setInsurancePlan(''); setInsuranceNumber(''); setInsuranceHolder(''); setInsuranceValidity(''); setInsuranceNotes('');
    setInsuranceFront(null); setInsuranceBack(null); setShowInsuranceForm(false);
    await loadEvents(activeProfile, api); setMessage('Convênio e imagens da carteirinha salvos.');
  });

  const handleCardPhoto = (side: 'front' | 'back', file?: File) => {
    if (!file) return;
    void run(async () => {
      const image = await compressImage(file);
      if (side === 'front') setInsuranceFront(image); else setInsuranceBack(image);
      setMessage(`Foto do ${side === 'front' ? 'anverso' : 'verso'} pronta para salvar.`);
    });
  };

  const passwordField = (autoComplete: 'current-password' | 'new-password') => <div className="relative mt-1 min-w-0">
    <input value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass()} pr-12`} type={showPassword ? 'text' : 'password'} autoComplete={autoComplete} />
    <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-mute hover:text-ink" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}><PasswordVisibilityIcon visible={showPassword} /></button>
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
      <p className="mt-5 text-center text-sm text-mute">Já tem cadastro? <button className="font-bold text-moss-700 underline" onClick={() => { setAuthView('login'); setShowPassword(false); }}>Entrar</button></p>
    </Card>;
    if (authView === 'verify') return <Card>
      <button className="mb-4 text-sm font-bold text-moss-700" onClick={() => { setAuthView('login'); setChallenge(null); setCode(''); }}>← Voltar ao login</button>
      <h2 className="font-display text-2xl font-bold text-ink">Código de verificação</h2>
      <p className="mt-2 text-sm text-mute">Digite o código enviado para <strong>{challenge?.destinationMasked}</strong>.</p>
      <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className="mt-5 block w-full min-w-0 box-border rounded-xl border border-line bg-white px-3 py-3 text-center font-mono text-2xl tracking-[0.25em]" inputMode="numeric" autoComplete="one-time-code" />
      <button disabled={busy || code.length !== 6} onClick={() => void verifyLogin()} className="mt-5 w-full rounded-xl bg-moss-700 px-4 py-3 font-bold text-white disabled:opacity-50">Validar e entrar</button>
    </Card>;
    return <Card>
      <h2 className="font-display text-2xl font-bold text-ink">Entrar no MyDoctor</h2>
      <p className="mt-1 text-sm text-mute">Acesse seu prontuário com seu e-mail e senha.</p>
      <label className="mt-5 block text-xs font-bold text-mute">E-mail</label><input value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass()} mt-1`} type="email" autoComplete="email" />
      <label className="mt-3 block text-xs font-bold text-mute">Senha</label>{passwordField('current-password')}
      <p className="mt-4 text-xs font-bold uppercase tracking-wide text-mute">Receber código por</p>
      <div className="mt-2 flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="radio" checked={channel === 'email'} onChange={() => setChannel('email')} /> E-mail</label><label className="flex items-center gap-2"><input type="radio" checked={channel === 'sms'} onChange={() => setChannel('sms')} /> SMS</label></div>
      <button disabled={busy} onClick={() => void startLogin()} className="mt-5 w-full rounded-xl bg-pine-900 px-4 py-3 font-bold text-white disabled:opacity-50">Entrar</button>
      <p className="mt-5 text-center text-sm text-mute">Você não tem cadastro? <button className="font-bold text-moss-700 underline" onClick={() => { setAuthView('register'); setShowPassword(false); }}>Clique aqui para se cadastrar</button></p>
    </Card>;
  };

  const menu = user && menuOpen ? <div className="mb-5 rounded-2xl border border-line bg-white p-2 shadow-lift"><div className="grid min-w-0 gap-1 sm:grid-cols-2 lg:grid-cols-3">
    {([['welcome', 'Início'], ['record', 'Prontuário'], ['vitals', 'Sinais vitais'], ['insurance', 'Convênios'], ['consultant', 'Consultor'], ['profiles', 'Perfis e dependentes']] as [AppView, string][]).map(([key, label]) => <button key={key} onClick={() => go(key)} className={`rounded-xl px-4 py-3 text-left text-sm font-bold ${view === key ? 'bg-moss-50 text-moss-800' : 'text-ink hover:bg-paper'}`}>{label}</button>)}
    <button onClick={logout} className="rounded-xl px-4 py-3 text-left text-sm font-bold text-danger-600 hover:bg-paper">Sair</button>
  </div></div> : null;

  const welcomeView = <div className="space-y-5"><Card><p className="text-xs font-bold uppercase tracking-wide text-moss-700">Bem-vindo ao MyDoctor</p><h2 className="mt-2 font-display text-3xl font-bold text-ink">Olá, {user?.name?.split(' ')[0]}.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-mute">O MyDoctor organiza seu histórico de saúde em um único lugar. Consulte primeiro o que já está registrado e inclua novas informações apenas quando precisar.</p><div className="mt-5 flex flex-wrap gap-2"><PrimaryButton onClick={() => go('record')}>Abrir prontuário</PrimaryButton><SecondaryButton onClick={() => go('vitals')}>Ver sinais vitais</SecondaryButton></div></Card></div>;

  const profilesView = <div className="space-y-5"><Card><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-mute">Perfis e dependentes</p><h2 className="mt-1 font-display text-2xl font-bold text-ink">Pessoas cadastradas</h2></div><PrimaryButton onClick={() => setShowProfileForm((v) => !v)}>{showProfileForm ? 'Cancelar' : '+ Incluir pessoa'}</PrimaryButton></div><div className="mt-4 space-y-2">{profiles.length === 0 ? <p className="text-sm text-mute">Nenhuma pessoa cadastrada.</p> : profiles.map((profile) => <button key={profile.id} onClick={() => void chooseProfile(profile)} className={`w-full min-w-0 rounded-xl border p-3 text-left ${activeProfile?.id === profile.id ? 'border-moss-500 bg-moss-50' : 'border-line bg-white'}`}><strong className="block truncate text-sm text-ink">{profile.name}</strong><span className="text-xs text-mute">{profile.relationship} · {profile.source === 'owned' ? 'sob sua gestão' : 'delegado'}</span></button>)}</div></Card>{showProfileForm && <Card><h3 className="font-display text-xl font-bold text-ink">Nova pessoa</h3><div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2"><label className="min-w-0 text-xs font-bold text-mute sm:col-span-2">Nome completo<input value={newName} onChange={(e) => setNewName(e.target.value)} className={`${inputClass()} mt-1`} /></label><label className="min-w-0 text-xs font-bold text-mute">Dt. de Nascimento<input type="date" value={newBirthDate} onChange={(e) => setNewBirthDate(e.target.value)} className={`${inputClass()} mt-1`} /></label><label className="min-w-0 text-xs font-bold text-mute">Sexo<select value={newSex} onChange={(e) => setNewSex(e.target.value)} className={`${inputClass()} mt-1`}><option value="">Não informado</option><option value="female">Feminino</option><option value="male">Masculino</option><option value="other">Outro</option><option value="unknown">Prefiro não informar</option></select></label><label className="min-w-0 text-xs font-bold text-mute sm:col-span-2">Relação com o titular<select value={relationship} onChange={(e) => setRelationship(e.target.value as typeof relationship)} className={`${inputClass()} mt-1`}><option value="child">Filho(a)</option><option value="parent">Pai/Mãe</option><option value="guardian">Pessoa sob tutela</option><option value="dependent">Dependente</option><option value="other">Outro</option></select></label><div className="sm:col-span-2"><PrimaryButton disabled={busy} onClick={() => void createDependent()}>Salvar pessoa</PrimaryButton></div></div></Card>}</div>;

  const recordList = <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-mute">Prontuário ativo</p><h2 className="font-display text-2xl font-bold text-ink">{activeProfile?.name ?? 'Escolha um perfil'}</h2></div>{activeProfile && <PrimaryButton onClick={() => setShowRecordForm((v) => !v)}>{showRecordForm ? 'Cancelar' : '+ Adicionar registro'}</PrimaryButton>}</div>{!activeProfile ? <p className="mt-4 text-sm text-mute">Escolha um perfil em Perfis e dependentes.</p> : clinicalEvents.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-line bg-white p-5 text-sm text-mute">Nenhum registro clínico ainda. Use “+ Adicionar registro” quando quiser incluir o primeiro.</div> : <ol className="mt-4 space-y-3">{clinicalEvents.map((event) => <li key={event.id} className="rounded-xl border border-line bg-white p-4"><time className="block text-xs font-semibold text-mute">{new Date(event.occurredAt).toLocaleString('pt-BR')}</time><h3 className="mt-1 font-display text-lg font-bold text-ink">{event.title}</h3><div className="mt-2 space-y-1 text-sm text-mute">{(event.locationNameSnapshot || event.organizationNameSnapshot) && <p><strong>Local/Instituição:</strong> {[event.locationNameSnapshot, event.organizationNameSnapshot].filter(Boolean).join(' · ')}</p>}<p><strong>Tipo:</strong> {EVENT_TYPES.find(([value]) => value === event.type)?.[1] ?? event.type}</p>{event.registrationSnapshot && <p><strong>CRM/CREFITO:</strong> {event.councilSnapshot ?? ''} {event.registrationSnapshot}{event.registrationRegionSnapshot ? `/${event.registrationRegionSnapshot}` : ''}</p>}{event.practitionerNameSnapshot && <p><strong>Profissional:</strong> {event.practitionerNameSnapshot}</p>}{event.professionSnapshot && <p><strong>Especialidade:</strong> {event.professionSnapshot}</p>}{typeof event.payload?.notes === 'string' && event.payload.notes && <p><strong>Observações:</strong> {event.payload.notes}</p>}</div></li>)}</ol>}</Card>;

  const recordView = <div className="space-y-5">{recordList}{showRecordForm && activeProfile && <Card><h3 className="font-display text-xl font-bold text-ink">Novo registro</h3><div className="mt-4 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2"><label className="min-w-0 text-xs font-bold text-mute">Data/Hora<input type="datetime-local" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className={`${inputClass()} mt-1`} /></label><label className="min-w-0 text-xs font-bold text-mute">Local/Instituição<div className="mt-1 grid min-w-0 grid-cols-1 gap-2"><input value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="Local / unidade" className={inputClass()} /><input value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} placeholder="Hospital / clínica / consultório" className={inputClass()} /></div></label><label className="min-w-0 text-xs font-bold text-mute">Tipo<select value={eventType} onChange={(e) => setEventType(e.target.value)} className={`${inputClass()} mt-1`}>{EVENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="min-w-0 text-xs font-bold text-mute">CRM/CREFITO<div className="mt-1 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_72px]"><input value={council} onChange={(e) => setCouncil(e.target.value)} placeholder="Conselho" className={inputClass()} /><input value={registration} onChange={(e) => setRegistration(e.target.value)} placeholder="Número" className={inputClass()} /><input value={registrationRegion} onChange={(e) => setRegistrationRegion(e.target.value)} placeholder="UF" className={inputClass()} /></div></label><label className="min-w-0 text-xs font-bold text-mute">Nome do Médico/Fisioterapeuta/Atendente<input value={practitionerName} onChange={(e) => setPractitionerName(e.target.value)} className={`${inputClass()} mt-1`} /></label><label className="min-w-0 text-xs font-bold text-mute">Especialidade<input value={profession} onChange={(e) => setProfession(e.target.value)} className={`${inputClass()} mt-1`} /></label><label className="min-w-0 text-xs font-bold text-mute md:col-span-2">Descrição do registro<input value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} className={`${inputClass()} mt-1`} /></label><label className="min-w-0 text-xs font-bold text-mute md:col-span-2">Observações<textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass()} mt-1 min-h-24`} /></label><div className="md:col-span-2"><PrimaryButton disabled={busy} onClick={() => void createEvent()}>Salvar no prontuário</PrimaryButton></div></div></Card>}</div>;

  const vitalsView = <div className="space-y-5"><Card><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-moss-700">Sinais vitais</p><h2 className="font-display text-2xl font-bold text-ink">{activeProfile?.name ?? 'Escolha um perfil'}</h2></div>{activeProfile && <PrimaryButton onClick={() => setShowVitalForm((v) => !v)}>{showVitalForm ? 'Cancelar' : '+ Incluir medição'}</PrimaryButton>}</div>{!activeProfile ? <p className="mt-4 text-sm text-mute">Escolha um perfil.</p> : vitalEvents.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-line bg-white p-5 text-sm text-mute">Nenhuma medição registrada. Use “+ Incluir medição” para cadastrar.</div> : <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">{vitalEvents.map((event) => { const payload = vitalPayload(event); return <article key={event.id} className="min-w-0 rounded-xl border border-line bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-moss-700">{String(payload.label ?? 'Sinal vital')}</p><h3 className="mt-1 break-words text-xl font-bold text-ink">{String(payload.value ?? '')}{payload.secondaryValue ? `/${String(payload.secondaryValue)}` : ''} <span className="text-sm font-semibold text-mute">{String(payload.unit ?? '')}</span></h3><p className="mt-1 text-xs text-mute">Origem: {String(payload.source ?? 'manual')}</p><time className="mt-2 block text-xs text-mute">{new Date(event.occurredAt).toLocaleString('pt-BR')}</time></article>; })}</div>}</Card>{showVitalForm && activeProfile && <Card><h3 className="font-display text-xl font-bold text-ink">Nova medição</h3><p className="mt-1 text-sm text-mute">A captura automática por Apple Health/Health Connect será habilitada no aplicativo nativo. Aqui o registro é manual.</p><div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2"><select value={vitalType} onChange={(e) => setVitalType(e.target.value as VitalType)} className={inputClass()}>{VITAL_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input type="datetime-local" value={vitalDate} onChange={(e) => setVitalDate(e.target.value)} className={inputClass()} /><input value={vitalValue} onChange={(e) => setVitalValue(e.target.value.replace(',', '.'))} inputMode="decimal" placeholder={vitalType === 'blood_pressure' ? 'Sistólica' : `Valor em ${selectedVital[2]}`} className={inputClass()} />{vitalType === 'blood_pressure' && <input value={vitalSecondaryValue} onChange={(e) => setVitalSecondaryValue(e.target.value.replace(',', '.'))} inputMode="decimal" placeholder="Diastólica" className={inputClass()} />}<select value={vitalSource} onChange={(e) => setVitalSource(e.target.value)} className={inputClass()}><option value="manual">Digitado manualmente</option><option value="healthkit">Apple Health / HealthKit</option><option value="health_connect">Android Health Connect</option><option value="bluetooth">Dispositivo Bluetooth</option><option value="institution">Instituição de saúde</option></select><input value={vitalDevice} onChange={(e) => setVitalDevice(e.target.value)} placeholder="Aparelho/dispositivo (opcional)" className={inputClass()} /><div className="sm:col-span-2"><PrimaryButton disabled={busy} onClick={() => void createVital()}>Salvar sinal vital</PrimaryButton></div></div></Card>}</div>;

  const insuranceView = <div className="space-y-5"><Card><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-moss-700">Convênios</p><h2 className="font-display text-2xl font-bold text-ink">{activeProfile?.name ?? 'Escolha um perfil'}</h2></div>{activeProfile && <PrimaryButton onClick={() => setShowInsuranceForm((v) => !v)}>{showInsuranceForm ? 'Cancelar' : '+ Incluir convênio'}</PrimaryButton>}</div>{!activeProfile ? <p className="mt-4 text-sm text-mute">Escolha um perfil.</p> : insuranceEvents.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-line bg-white p-5 text-sm text-mute">Nenhum convênio cadastrado. Use “+ Incluir convênio” para adicionar.</div> : <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">{insuranceEvents.map((event) => { const payload = event.payload as InsurancePayload; return <article key={event.id} className="min-w-0 overflow-hidden rounded-xl border border-line bg-white p-4"><h3 className="break-words font-display text-lg font-bold text-ink">{payload.provider || event.title}</h3>{payload.planName && <p className="break-words text-sm text-mute">{payload.planName}</p>}<div className="mt-3 space-y-1 break-words text-sm text-ink">{payload.memberNumber && <p><strong>Carteirinha:</strong> {payload.memberNumber}</p>}{payload.holderName && <p><strong>Titular:</strong> {payload.holderName}</p>}{payload.validity && <p><strong>Validade:</strong> {new Date(`${payload.validity}T12:00:00`).toLocaleDateString('pt-BR')}</p>}</div>{(payload.cardFront || payload.cardBack) && <div className="mt-4 grid min-w-0 grid-cols-2 gap-2">{payload.cardFront && <figure className="min-w-0"><img src={payload.cardFront} alt="Frente da carteirinha" className="h-28 w-full rounded-lg border border-line object-cover" /><figcaption className="mt-1 text-center text-[10px] text-mute">Frente</figcaption></figure>}{payload.cardBack && <figure className="min-w-0"><img src={payload.cardBack} alt="Verso da carteirinha" className="h-28 w-full rounded-lg border border-line object-cover" /><figcaption className="mt-1 text-center text-[10px] text-mute">Verso</figcaption></figure>}</div>}</article>; })}</div>}</Card>{showInsuranceForm && activeProfile && <Card><h3 className="font-display text-xl font-bold text-ink">Novo convênio</h3><div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2"><label className="min-w-0 text-xs font-bold text-mute">Convênio / operadora<input value={insuranceProvider} onChange={(e) => setInsuranceProvider(e.target.value)} className={`${inputClass()} mt-1`} /></label><label className="min-w-0 text-xs font-bold text-mute">Plano / categoria<input value={insurancePlan} onChange={(e) => setInsurancePlan(e.target.value)} className={`${inputClass()} mt-1`} /></label><label className="min-w-0 text-xs font-bold text-mute">Número da carteirinha<input value={insuranceNumber} onChange={(e) => setInsuranceNumber(e.target.value)} className={`${inputClass()} mt-1`} /></label><label className="min-w-0 text-xs font-bold text-mute">Nome do titular<input value={insuranceHolder} onChange={(e) => setInsuranceHolder(e.target.value)} className={`${inputClass()} mt-1`} /></label><label className="min-w-0 overflow-hidden text-xs font-bold text-mute sm:col-span-2">Validade da carteirinha<input type="date" value={insuranceValidity} onChange={(e) => setInsuranceValidity(e.target.value)} className={`${inputClass()} mt-1`} /></label><div className="grid min-w-0 gap-3 sm:col-span-2 sm:grid-cols-2"><label className="min-w-0 rounded-xl border border-line bg-white p-3 text-xs font-bold text-mute">Foto da carteirinha — frente<input type="file" accept="image/*" capture="environment" onChange={(e) => handleCardPhoto('front', e.target.files?.[0])} className="mt-2 block w-full min-w-0 max-w-full text-xs" />{insuranceFront && <img src={insuranceFront} alt="Prévia da frente" className="mt-3 h-32 w-full rounded-lg object-cover" />}</label><label className="min-w-0 rounded-xl border border-line bg-white p-3 text-xs font-bold text-mute">Foto da carteirinha — verso<input type="file" accept="image/*" capture="environment" onChange={(e) => handleCardPhoto('back', e.target.files?.[0])} className="mt-2 block w-full min-w-0 max-w-full text-xs" />{insuranceBack && <img src={insuranceBack} alt="Prévia do verso" className="mt-3 h-32 w-full rounded-lg object-cover" />}</label></div><label className="min-w-0 text-xs font-bold text-mute sm:col-span-2">Observações<textarea value={insuranceNotes} onChange={(e) => setInsuranceNotes(e.target.value)} className={`${inputClass()} mt-1 min-h-20`} /></label><div className="sm:col-span-2"><PrimaryButton disabled={busy} onClick={() => void createInsurance()}>Salvar convênio</PrimaryButton></div></div></Card>}</div>;

  const consultantSummary = (() => { const latest = new Map<string, HealthEventV1>(); vitalEvents.forEach((event) => { const type = String(event.payload?.vitalType ?? 'vital'); if (!latest.has(type)) latest.set(type, event); }); return { latestVitals: [...latest.values()], recentClinical: clinicalEvents.slice(0, 5), insurance: insuranceEvents[0] }; })();
  const consultantView = <div className="space-y-5"><Card><p className="text-xs font-bold uppercase tracking-wide text-moss-700">Consultor MyDoctor</p><h2 className="mt-1 font-display text-2xl font-bold text-ink">Prepare sua próxima consulta</h2><p className="mt-2 text-sm leading-6 text-mute">Organiza o que já existe no prontuário para facilitar a conversa com o profissional de saúde. Não faz diagnóstico.</p></Card><Card><h3 className="font-display text-xl font-bold text-ink">Resumo de {activeProfile?.name ?? 'perfil'}</h3>{!activeProfile ? <p className="mt-3 text-sm text-mute">Escolha um perfil.</p> : <div className="mt-4 space-y-4"><div><p className="text-xs font-bold uppercase text-mute">Últimos sinais vitais</p>{consultantSummary.latestVitals.length === 0 ? <p className="text-sm text-mute">Nenhum sinal vital registrado.</p> : consultantSummary.latestVitals.map((event) => <p key={event.id} className="text-sm text-ink">• {event.title}</p>)}</div><div><p className="text-xs font-bold uppercase text-mute">Convênio</p><p className="text-sm text-ink">{consultantSummary.insurance?.title ?? 'Nenhum convênio cadastrado.'}</p></div><div><p className="text-xs font-bold uppercase text-mute">Eventos recentes</p>{consultantSummary.recentClinical.length === 0 ? <p className="text-sm text-mute">Nenhum evento clínico registrado.</p> : consultantSummary.recentClinical.map((event) => <p key={event.id} className="text-sm text-ink">• {event.title}</p>)}</div></div>}</Card></div>;

  const activeView = view === 'welcome' ? welcomeView : view === 'profiles' ? profilesView : view === 'vitals' ? vitalsView : view === 'insurance' ? insuranceView : view === 'consultant' ? consultantView : recordView;

  return <div className="min-h-screen bg-paper"><div className="mx-auto max-w-6xl p-4 pb-[calc(2rem+env(safe-area-inset-bottom))] md:p-8"><header className="mb-4 flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-moss-700">MyDoctor</p><h1 className="break-words font-display text-2xl font-bold text-ink sm:text-3xl">Prontuário longitudinal</h1><p className="mt-1 text-sm text-mute">Seu histórico de saúde em um único lugar.</p></div>{user && <button type="button" onClick={() => setMenuOpen((value) => !value)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-ink shadow-sm" aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}><MenuIcon open={menuOpen} /></button>}</header>{menu}{message && <div className="mb-4 break-words rounded-xl border border-moss-200 bg-moss-50 px-4 py-3 text-sm font-semibold text-moss-800">{message}</div>}{!user ? <div className="mx-auto max-w-md pt-4 sm:pt-10">{authPanel()}</div> : activeView}</div></div>;
}
