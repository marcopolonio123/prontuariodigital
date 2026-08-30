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
  ['consultation', 'Consulta'],
  ['exam', 'Exame'],
  ['hospitalization', 'Internação'],
  ['procedure', 'Procedimento'],
  ['therapy', 'Terapia/Fisioterapia'],
  ['vaccine', 'Vacina'],
  ['prescription', 'Receita/Prescrição'],
  ['vital', 'Sinal vital'],
  ['other', 'Outro'],
] as const;

function Card({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl border border-line bg-card p-5 shadow-lift">{children}</section>;
}

export default function V1PreviewApp() {
  const [apiUrl, setApiUrl] = useState(defaultV1ApiUrl());
  const api = useMemo(() => new MyDoctorV1Api(apiUrl), [apiUrl]);
  const [token, setToken] = useState('');
  const [user, setUser] = useState<V1User | null>(null);
  const [challenge, setChallenge] = useState<LoginStartResponse | null>(null);
  const [registerName, setRegisterName] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [channel, setChannel] = useState<MfaChannel>('email');
  const [code, setCode] = useState('');
  const [profiles, setProfiles] = useState<PatientProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<PatientProfile | null>(null);
  const [events, setEvents] = useState<HealthEventV1[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

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

  useEffect(() => {
    if (token) api.setToken(token);
  }, [api, token]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try {
      await work();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro inesperado.');
    } finally {
      setBusy(false);
    }
  };

  const loadProfiles = async (client = api) => {
    const items = await client.listProfiles();
    setProfiles(items);
    if (!activeProfile && items.length > 0) setActiveProfile(items[0]);
  };

  const loadEvents = async (profile: PatientProfile, client = api) => {
    const items = await client.listHealthEvents(profile.id);
    setEvents(items);
  };

  const createAccount = () => run(async () => {
    if (!registerName.trim()) throw new Error('Informe seu nome.');
    if (!email.trim()) throw new Error('Informe seu e-mail.');
    if (password.length < 8) throw new Error('A senha deve ter pelo menos 8 caracteres.');
    await api.register({
      name: registerName.trim(),
      email: email.trim(),
      password,
      phone: registerPhone.trim() || undefined,
    });
    setMessage('Conta criada. Agora clique em “Enviar código” para entrar com MFA.');
  });

  const startLogin = () => run(async () => {
    const result = await api.startPasswordLogin({ email, password, channel });
    setChallenge(result);
    if (result.developmentCode) setCode(result.developmentCode);
    setMessage(`Código enviado para ${result.destinationMasked}.`);
  });

  const verifyLogin = () => run(async () => {
    if (!challenge) return;
    const result = await api.verifyPasswordLogin({ challengeId: challenge.challengeId, code });
    setToken(result.token);
    setUser(result.user);
    api.setToken(result.token);
    await loadProfiles(api);
    setMessage('Autenticação concluída com segundo fator.');
  });

  const chooseProfile = (profile: PatientProfile) => run(async () => {
    setActiveProfile(profile);
    await loadEvents(profile);
  });

  const createDependent = () => run(async () => {
    if (!newName.trim()) throw new Error('Informe o nome do dependente.');
    api.setToken(token);
    const created = await api.createDependentProfile({ name: newName.trim(), relationship });
    setNewName('');
    await loadProfiles(api);
    setActiveProfile(created);
    setEvents([]);
    setMessage(`${created.name} criado sem necessidade de login próprio.`);
  });

  const createEvent = () => run(async () => {
    if (!activeProfile) throw new Error('Escolha um perfil.');
    if (!eventTitle.trim()) throw new Error('Informe a descrição do evento.');
    api.setToken(token);
    await api.createHealthEvent(activeProfile.id, {
      type: eventType,
      title: eventTitle.trim(),
      occurredAt: new Date(eventDate).toISOString(),
      organizationName: organizationName.trim() || undefined,
      locationName: locationName.trim() || undefined,
      practitionerName: practitionerName.trim() || undefined,
      profession: profession.trim() || undefined,
      council: council.trim() || undefined,
      registration: registration.trim() || undefined,
      registrationRegion: registrationRegion.trim() || undefined,
      payload: { notes: notes.trim() },
    });
    setEventTitle('');
    setNotes('');
    await loadEvents(activeProfile, api);
    setMessage('Evento incluído na linha do tempo.');
  });

  return (
    <div className="min-h-screen bg-paper p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-moss-700">MyDoctor V1 · ambiente de teste</p>
            <h1 className="font-display text-3xl font-bold text-ink">Prontuário longitudinal</h1>
            <p className="mt-1 text-sm text-mute">Criar conta → MFA → escolher perfil → linha do tempo → evento clínico.</p>
          </div>
          <a href="/" className="text-sm font-semibold text-moss-700 hover:underline">Voltar para versão atual</a>
        </header>

        {message && <div className="mb-4 rounded-xl border border-moss-200 bg-moss-50 px-4 py-3 text-sm font-semibold text-moss-800">{message}</div>}

        {!user ? (
          <div className="grid gap-5 xl:grid-cols-3">
            <Card>
              <h2 className="font-display text-xl font-bold text-ink">1. Criar conta</h2>
              <p className="mt-1 text-sm text-mute">No primeiro acesso, crie sua conta e seu prontuário pessoal.</p>
              <label className="mt-4 block text-xs font-bold text-mute">URL da API</label>
              <input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm" />
              <label className="mt-3 block text-xs font-bold text-mute">Nome completo</label>
              <input value={registerName} onChange={(e) => setRegisterName(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2" />
              <label className="mt-3 block text-xs font-bold text-mute">E-mail</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2" type="email" />
              <label className="mt-3 block text-xs font-bold text-mute">Celular (opcional)</label>
              <input value={registerPhone} onChange={(e) => setRegisterPhone(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2" inputMode="tel" />
              <label className="mt-3 block text-xs font-bold text-mute">Senha</label>
              <input value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2" type="password" />
              <button disabled={busy} onClick={() => void createAccount()} className="mt-5 w-full rounded-xl bg-pine-900 px-4 py-3 font-bold text-white disabled:opacity-50">Criar minha conta</button>
            </Card>

            <Card>
              <h2 className="font-display text-xl font-bold text-ink">2. Login e senha</h2>
              <p className="mt-1 text-sm text-mute">Depois do cadastro, confirme o acesso com segundo fator.</p>
              <label className="mt-4 block text-xs font-bold text-mute">E-mail</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2" type="email" />
              <label className="mt-3 block text-xs font-bold text-mute">Senha</label>
              <input value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2" type="password" />
              <div className="mt-3 flex gap-3 text-sm">
                <label className="flex items-center gap-2"><input type="radio" checked={channel === 'email'} onChange={() => setChannel('email')} /> E-mail</label>
                <label className="flex items-center gap-2"><input type="radio" checked={channel === 'sms'} onChange={() => setChannel('sms')} /> Celular/SMS</label>
              </div>
              <button disabled={busy} onClick={() => void startLogin()} className="mt-5 w-full rounded-xl bg-pine-900 px-4 py-3 font-bold text-white disabled:opacity-50">Enviar código</button>
            </Card>

            <Card>
              <h2 className="font-display text-xl font-bold text-ink">3. Código de verificação</h2>
              {!challenge ? (
                <p className="mt-3 text-sm text-mute">Primeiro valide login e senha.</p>
              ) : (
                <>
                  <p className="mt-2 text-sm text-mute">Destino: <strong>{challenge.destinationMasked}</strong></p>
                  <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className="mt-4 w-full rounded-lg border border-line bg-white px-3 py-3 text-center font-mono text-2xl tracking-[0.35em]" inputMode="numeric" />
                  {challenge.developmentCode && <p className="mt-2 text-xs text-mute">Ambiente de desenvolvimento: código preenchido automaticamente.</p>}
                  <button disabled={busy || code.length !== 6} onClick={() => void verifyLogin()} className="mt-4 w-full rounded-xl bg-moss-700 px-4 py-3 font-bold text-white disabled:opacity-50">Validar e entrar</button>
                </>
              )}
            </Card>
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
            <div className="space-y-5">
              <Card>
                <p className="text-xs font-bold uppercase tracking-wide text-mute">Usuário autenticado</p>
                <h2 className="mt-1 font-display text-xl font-bold text-ink">{user.name}</h2>
                <p className="text-sm text-mute">{user.email}</p>
                <button onClick={() => { setUser(null); setToken(''); setChallenge(null); setProfiles([]); setActiveProfile(null); setEvents([]); }} className="mt-3 text-xs font-bold text-danger-600">Sair</button>
              </Card>

              <Card>
                <h2 className="font-display text-lg font-bold text-ink">Escolher prontuário</h2>
                <p className="mt-1 text-xs text-mute">O login é do adulto; o prontuário pode ser dele ou de alguém sob sua responsabilidade.</p>
                <div className="mt-3 space-y-2">
                  {profiles.map((p) => (
                    <button key={p.id} onClick={() => void chooseProfile(p)} className={`w-full rounded-xl border p-3 text-left ${activeProfile?.id === p.id ? 'border-moss-500 bg-moss-50' : 'border-line bg-white'}`}>
                      <strong className="block text-sm text-ink">{p.name}</strong>
                      <span className="text-xs text-mute">{p.relationship} · {p.source === 'owned' ? 'sob sua gestão' : 'delegado'}</span>
                    </button>
                  ))}
                  {profiles.length === 0 && <p className="text-sm text-mute">Nenhum perfil cadastrado ainda.</p>}
                </div>
              </Card>

              <Card>
                <h2 className="font-display text-lg font-bold text-ink">Cadastrar dependente</h2>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome completo" className="mt-3 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm" />
                <select value={relationship} onChange={(e) => setRelationship(e.target.value as typeof relationship)} className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm">
                  <option value="child">Filho(a)</option>
                  <option value="parent">Pai/Mãe</option>
                  <option value="guardian">Pessoa sob tutela</option>
                  <option value="dependent">Dependente</option>
                  <option value="other">Outro</option>
                </select>
                <button disabled={busy} onClick={() => void createDependent()} className="mt-3 w-full rounded-lg border border-moss-500 px-3 py-2 text-sm font-bold text-moss-800">Adicionar perfil</button>
              </Card>
            </div>

            <div className="space-y-5">
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-mute">Prontuário ativo</p>
                    <h2 className="font-display text-2xl font-bold text-ink">{activeProfile?.name ?? 'Escolha um perfil'}</h2>
                  </div>
                  {activeProfile && <button disabled={busy} onClick={() => void loadEvents(activeProfile)} className="rounded-lg border border-line px-3 py-2 text-xs font-bold">Atualizar linha do tempo</button>}
                </div>

                {activeProfile && (
                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    <select value={eventType} onChange={(e) => setEventType(e.target.value)} className="rounded-lg border border-line bg-white px-3 py-2 text-sm">
                      {EVENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <input type="datetime-local" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="rounded-lg border border-line bg-white px-3 py-2 text-sm" />
                    <input value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} placeholder="Descrição do registro *" className="md:col-span-2 rounded-lg border border-line bg-white px-3 py-2 text-sm" />
                    <input value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} placeholder="Hospital / clínica / consultório" className="rounded-lg border border-line bg-white px-3 py-2 text-sm" />
                    <input value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="Local / unidade" className="rounded-lg border border-line bg-white px-3 py-2 text-sm" />
                    <input value={practitionerName} onChange={(e) => setPractitionerName(e.target.value)} placeholder="Profissional de saúde" className="rounded-lg border border-line bg-white px-3 py-2 text-sm" />
                    <input value={profession} onChange={(e) => setProfession(e.target.value)} placeholder="Profissão / especialidade" className="rounded-lg border border-line bg-white px-3 py-2 text-sm" />
                    <input value={council} onChange={(e) => setCouncil(e.target.value)} placeholder="Conselho (CRM, CREFITO...)" className="rounded-lg border border-line bg-white px-3 py-2 text-sm" />
                    <div className="grid grid-cols-[1fr_90px] gap-2">
                      <input value={registration} onChange={(e) => setRegistration(e.target.value)} placeholder="Registro" className="rounded-lg border border-line bg-white px-3 py-2 text-sm" />
                      <input value={registrationRegion} onChange={(e) => setRegistrationRegion(e.target.value)} placeholder="UF" className="rounded-lg border border-line bg-white px-3 py-2 text-sm" />
                    </div>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações clínicas" className="md:col-span-2 min-h-24 rounded-lg border border-line bg-white px-3 py-2 text-sm" />
                    <button disabled={busy} onClick={() => void createEvent()} className="md:col-span-2 rounded-xl bg-pine-900 px-4 py-3 font-bold text-white disabled:opacity-50">Salvar no prontuário</button>
                  </div>
                )}
              </Card>

              <Card>
                <h2 className="font-display text-xl font-bold text-ink">Linha do tempo</h2>
                {!activeProfile ? <p className="mt-3 text-sm text-mute">Escolha um perfil.</p> : events.length === 0 ? <p className="mt-3 text-sm text-mute">Nenhum evento clínico registrado.</p> : (
                  <ol className="mt-4 space-y-3">
                    {events.map((event) => (
                      <li key={event.id} className="rounded-xl border border-line bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-moss-700">{event.type}</span>
                            <h3 className="font-display text-lg font-bold text-ink">{event.title}</h3>
                          </div>
                          <time className="font-mono text-xs text-mute">{new Date(event.occurredAt).toLocaleString('pt-BR')}</time>
                        </div>
                        <div className="mt-2 text-sm text-mute">
                          {event.organizationNameSnapshot && <p><strong>Instituição:</strong> {event.organizationNameSnapshot}</p>}
                          {event.locationNameSnapshot && <p><strong>Local:</strong> {event.locationNameSnapshot}</p>}
                          {event.practitionerNameSnapshot && <p><strong>Profissional:</strong> {event.practitionerNameSnapshot} {event.professionSnapshot ? `· ${event.professionSnapshot}` : ''}</p>}
                          {event.registrationSnapshot && <p><strong>Registro:</strong> {event.councilSnapshot ?? ''} {event.registrationSnapshot}{event.registrationRegionSnapshot ? `/${event.registrationRegionSnapshot}` : ''}</p>}
                          {typeof event.payload?.notes === 'string' && event.payload.notes && <p className="mt-2 whitespace-pre-wrap text-ink">{event.payload.notes}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
