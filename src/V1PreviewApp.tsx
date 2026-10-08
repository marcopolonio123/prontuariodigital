import InsurancePanel from './components/InsurancePanel';
import PractitionerLookup from './components/PractitionerLookup';
import PaginatedList from './components/PaginatedList';
import { useEffect, useMemo, useRef, useState } from 'react';
import RecordListFilters, { useRecordListFilters, SortColumn } from './components/RecordListFilters';
import DashboardNavigation from './components/DashboardNavigation';
import EncounterFields, { FollowUpFields, emptyFollowUp, localFollowUp, savedFollowUp } from './components/EncounterFields';
import AccountProfilePanel from './AccountProfilePanel';
import ProfilesPanel from './components/ProfilesPanel';
import MedicationAgenda from './components/MedicationAgenda';
import DictationTextarea from './components/DictationTextarea';
import {
  MyDoctorV1Api,
  defaultV1ApiUrl,
  readV1SessionToken,
  type HealthEventV1,
  type ConsultantUsageV1,
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

function recordedSpecialty(event: HealthEventV1): string {
  const specialty = event.payload?.specialty;
  if (typeof specialty === 'string' && specialty.trim()) return specialty.trim();
  // Atendimentos manuais antigos guardavam a especialidade neste snapshot.
  return (event.provenance?.source === 'mydoctor_professional' || event.payload?.confirmationRequired === true) ? '' : event.professionSnapshot?.trim() ?? '';
}

const VITAL_TYPES = [
  ['blood_pressure', 'Pressão arterial', 'mmHg'], ['heart_rate', 'Frequência cardíaca', 'bpm'],
  ['spo2', 'Oxigenação (SpO₂)', '%'], ['temperature', 'Temperatura', '°C'], ['weight', 'Peso', 'kg'],
  ['glucose', 'Glicemia', 'mg/dL'], ['respiratory_rate', 'Frequência respiratória', 'irpm'],
] as const;

const BRAZIL_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

type AppView = 'account' | 'welcome' | 'record' | 'vitals' | 'diary' | 'family-history' | 'medications' | 'profiles' | 'insurance' | 'consultant';
type AuthView = 'login' | 'register' | 'verify';
type VitalType = (typeof VITAL_TYPES)[number][0];



function Card({ children }: { children: React.ReactNode }) {
  return <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-card p-4 shadow-lift sm:p-5">{children}</section>;
}

function inputClass() {
  return 'block w-full min-w-0 max-w-full box-border rounded-xl border border-line bg-white px-3 py-3 text-sm outline-none focus:border-moss-500';
}

function PrimaryButton({ children, onClick, disabled = false }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="rounded-xl bg-pine-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{children}</button>;
}

function SecondaryButton({ children, onClick, disabled = false }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="rounded-xl border border-moss-500 px-4 py-3 text-sm font-bold text-moss-800 disabled:opacity-50">{children}</button>;
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

function localDateTimeInputValue(date = new Date()) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export default function V1PreviewApp({ canAdmin = false, onNavigate, recordRefresh = 0 }: { recordRefresh?: number; canAdmin?: boolean; onNavigate?: (view: 'professional-agenda' | 'identification-history' | 'utility' | 'app' | 'professional' | 'clinicar' | 'professional-locations' | 'professional-access' | 'access-requests' | 'consultation-confirmations' | 'administration') => void }) {
  const [matchedPlaces,setMatchedPlaces]=useState<{key:string;items:Array<{id:string;name:string;address:string}>}>({key:'',items:[]});
  const [apiUrl] = useState(defaultV1ApiUrl());
  const api = useMemo(() => new MyDoctorV1Api(apiUrl), [apiUrl]);
  const [token, setToken] = useState(readV1SessionToken);
  const [user, setUser] = useState<V1User | null>(null);
  const [authView, setAuthView] = useState<AuthView>('login');
  const [challenge, setChallenge] = useState<LoginStartResponse | null>(null);
  const [registerName, setRegisterName] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [passwordConfirmation,setPasswordConfirmation]=useState('');
  const [confirmingRegistration,setConfirmingRegistration]=useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [channel, setChannel] = useState<MfaChannel>('email');
  const [code, setCode] = useState('');
  const [profiles, setProfiles] = useState<PatientProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<PatientProfile | null>(null);
  const activeProfileIdRef = useRef<string | null>(null);
  activeProfileIdRef.current = activeProfile?.id ?? null;
  const [events, setEvents] = useState<HealthEventV1[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const navigationVersion=useRef(0);
  const [view, setView] = useState<AppView>('welcome');
  const [menuOpen, setMenuOpen] = useState(false);
  const [canClinicar, setCanClinicar] = useState(false);
  useEffect(() => {
    let current = true; setCanClinicar(false);
    if (token && user?.isHealthProfessional && (menuOpen || view === 'welcome')) api.getProfessionalProfile().then(profile => { if (current) setCanClinicar(Boolean(profile?.active && profile.verificationStatus === 'verified')); }).catch(() => {});
    return () => { current = false; };
  }, [api, token, user?.isHealthProfessional, menuOpen, view]);

  const [profileChosen,setProfileChosen]=useState(false);
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [showInactiveRecords, setShowInactiveRecords] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [showVitalForm, setShowVitalForm] = useState(false);
  const [showDiaryForm, setShowDiaryForm] = useState(false);
  const [diaryText, setDiaryText] = useState('');
  const [consultantQuestion, setConsultantQuestion] = useState('');
  const [consultantConsent, setConsultantConsent] = useState(false);
  const [consultantImages,setConsultantImages]=useState<Array<{name:string;data:string}>>([]);
  const [imageLoading,setImageLoading]=useState(false);
  const imageGeneration=useRef(0);
  const [consultantUsage, setConsultantUsage] = useState<ConsultantUsageV1 | null>(null);
  const [consultantUsageError, setConsultantUsageError] = useState('');
  const [consultantMessages, setConsultantMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  useEffect(() => { setConsultantQuestion(''); setConsultantMessages([]); setConsultantConsent(false);setConsultantImages([]);setImageLoading(false);imageGeneration.current++; }, [activeProfile?.id]);
  const [familyHistoryText, setFamilyHistoryText] = useState('');
  const [editingFamilyHistory, setEditingFamilyHistory] = useState(false);


  const [eventType, setEventType] = useState('consultation');
  const [followUp,setFollowUp]=useState(emptyFollowUp);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState(() => localDateTimeInputValue());
  const [organizationName, setOrganizationName] = useState('');
  const [homeVisit, setHomeVisit] = useState(false);
  const [onlineVisit, setOnlineVisit] = useState(false);
  const [practitionerName, setPractitionerName] = useState('');
  const [profession, setProfession] = useState('');
  const [council, setCouncil] = useState('CRM');
  const [registration, setRegistration] = useState('');
  const [registrationRegion, setRegistrationRegion] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [examsText, setExamsText] = useState('');
  const [prescriptions, setPrescriptions] = useState('');
  const [notes, setNotes] = useState('');
  const [reportFiles, setReportFiles] = useState<File[]>([]);
  const [prescriptionFiles, setPrescriptionFiles] = useState<File[]>([]);
  const [examFiles, setExamFiles] = useState<File[]>([]);
  const [savedDocuments, setSavedDocuments] = useState<Array<{ id: string; type: string; originalFilename: string; mimeType: string; sizeBytes: number; status: string }>>([]);

  const [vitalType, setVitalType] = useState<VitalType>('blood_pressure');
  const [vitalValue, setVitalValue] = useState('');
  const [vitalSecondaryValue, setVitalSecondaryValue] = useState('');
  const [vitalDate, setVitalDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [vitalSource, setVitalSource] = useState('manual');
  const [vitalDevice, setVitalDevice] = useState('');


  useEffect(() => { api.setToken(token); }, [api, token]);

  useEffect(() => {
    if (!token || view !== 'consultant') { setConsultantUsage(null); return; }
    let current = true;
    const refresh = () => api.getConsultantUsage().then(usage => {
      if (current) { setConsultantUsage(usage); setConsultantUsageError(''); }
    }).catch(() => {
      if (current) { setConsultantUsage(null); setConsultantUsageError('Não foi possível verificar a disponibilidade e o saldo do Consultor. Tente novamente mais tarde.'); }
    });
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30000);
    return () => { current = false; window.clearInterval(interval); };
  }, [api, token, view]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true); setMessage('');
    try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro inesperado.'); }
    finally { setBusy(false); }
  };

  const dataRequestRef = useRef(0);
  const profileRequestRef = useRef(0);
  const documentRequestRef = useRef(0);
  const loadEvents = async (profile: PatientProfile, client = api) => {
    const request = ++dataRequestRef.current;
    const session = readV1SessionToken();
    setEvents([]); setFamilyHistoryText(''); setEditingFamilyHistory(false);
    const items = await client.listHealthEvents(profile.id);
    if (request !== dataRequestRef.current || session !== readV1SessionToken() || activeProfileIdRef.current !== profile.id) return;
    const patientEvents = items.filter(item => item.patientId === profile.id);
    setEvents(patientEvents);
    setEditingFamilyHistory(false);
    setFamilyHistoryText(String(patientEvents.find((event) => event.type === 'family_history')?.payload?.text ?? ''));
  };
  const loadProfiles = async (client = api, preferredProfileId?: string | null) => {
    const request = ++profileRequestRef.current;
    const session = readV1SessionToken();
    const items = await client.listProfiles();
    if (request !== profileRequestRef.current || session !== readV1SessionToken()) return;
    setProfiles(items);
    const rememberedProfileId = preferredProfileId
      ?? activeProfile?.id
      ?? window.localStorage.getItem('mydoctor.v1.activeProfileId');
    const selected = (rememberedProfileId ? items.find((item) => item.id === rememberedProfileId) : null)
      ?? items.find((item) => item.relationship === 'self')
      ?? items[0]
      ?? null;
    ++dataRequestRef.current; setEvents([]); setFamilyHistoryText('');
    activeProfileIdRef.current = selected?.id ?? null;
    setActiveProfile(selected);
    if (selected) {
      window.localStorage.setItem('mydoctor.v1.activeProfileId', selected.id);
      await loadEvents(selected, client);
    }
  };

  useEffect(() => {
    const savedToken = readV1SessionToken();
    if (!savedToken) return;
    let current = true;
    const navigationAtStart=navigationVersion.current;
    api.setToken(savedToken);
    void api.getAccount().then(async account => {
      if (!current || readV1SessionToken() !== savedToken) return;
      setUser(account); setToken(savedToken);
      await loadProfiles(api);
      if (current && readV1SessionToken() === savedToken && navigationVersion.current===navigationAtStart && !account.completed) setView('account');
    }).catch(error => { if (current && readV1SessionToken() === savedToken) { api.setToken(''); setToken(''); setMessage(error instanceof Error ? error.message : 'Entre novamente.'); } });
    return () => { current = false; };
  }, [api]);

  useEffect(() => {
    if (!recordRefresh || !activeProfile || !readV1SessionToken()) return;
    void loadEvents(activeProfile, api).catch(error => setMessage(error instanceof Error ? error.message : 'Não foi possível atualizar o prontuário.'));
  }, [recordRefresh]);

  const createAccount = () => run(async () => {
    if (!registerName.trim()) throw new Error('Informe seu nome.');
    if (!email.trim()) throw new Error('Informe seu e-mail.');
    if (password.length < 8) throw new Error('A senha deve ter pelo menos 8 caracteres.');
    if(password!==passwordConfirmation)throw new Error('As senhas não coincidem. Repita a senha.');
    const result=await api.register({name:registerName.trim(),email:email.trim(),password,passwordConfirmation,phone:registerPhone.trim()||undefined});
    setPasswordConfirmation('');setShowPassword(false);setConfirmingRegistration(true);setChallenge(result);setCode(result.developmentCode??'');setAuthView('verify');
    setMessage(result.emailSent?'Confirme o e-mail para ativar seu cadastro.':'Sua conta foi criada, mas não conseguimos enviar o código. Solicite novo código após um minuto.');
  });

  const resendRegistration=()=>run(async()=>{
    if(!email.trim()||!password)throw new Error('Informe e-mail e senha do cadastro para solicitar a confirmação.');
    const result=await api.resendRegistration(email,password);setConfirmingRegistration(true);setChallenge(result);setCode(result.developmentCode??'');setAuthView('verify');setMessage(result.emailSent?'Novo código de confirmação enviado. Use somente o mais recente.':'Não foi possível enviar. Tente novamente em um minuto.');
  });
  const confirmEmail=()=>run(async()=>{if(!challenge)return;await api.confirmRegistration(challenge.challengeId,code);setAuthView('login');setConfirmingRegistration(false);setChallenge(null);setCode('');setPassword('');setPasswordConfirmation('');setMessage('E-mail confirmado. Agora entre com seu e-mail e senha.');});
  const startLogin = (resend = false) => run(async () => {
    if (!email.trim() || !password) throw new Error('Informe e-mail e senha.');
    const result = await api.startPasswordLogin({ email, password, channel });
    setConfirmingRegistration(false);setChallenge(result); setAuthView('verify');
    setCode(result.developmentCode ?? '');
    setMessage(`${resend ? 'Novo código' : 'Código'} enviado para ${result.destinationMasked}.${resend ? ' Use o código mais recente.' : ''}`);
  });

  const verifyLogin = () => run(async () => {
    if (!challenge) return;
    const result = await api.verifyPasswordLogin({ challengeId: challenge.challengeId, code });
    const navigationAtStart=++navigationVersion.current;
    setToken(result.token); setUser(result.user); api.setToken(result.token);
    await loadProfiles(api);
    if(readV1SessionToken()!==result.token)return;
    const account = await api.getAccount();
    if(readV1SessionToken()!==result.token)return;
    setUser(account);
    if(navigationVersion.current===navigationAtStart){setView(account.completed ? 'welcome' : 'account');setMessage('');}
  });

  const logout = () => {
    navigationVersion.current++;resetRecordForm();
    ++dataRequestRef.current; ++profileRequestRef.current; activeProfileIdRef.current = null;
    window.localStorage.removeItem('mydoctor.v1.activeProfileId');
    api.setToken(''); setUser(null); setToken(''); setChallenge(null); setCode(''); setShowPassword(false);
    setProfiles([]); setActiveProfile(null); setEvents([]); setFamilyHistoryText(''); setView('welcome'); setMenuOpen(false); setAuthView('login');
    setProfileChosen(false); setShowRecordForm(false); setShowVitalForm(false); 
    setMessage('Você saiu com segurança.');
  };

  const go = (next: AppView) => { navigationVersion.current++;if(next!=='record'){resetRecordForm();setShowRecordForm(false);}setView(next); setMenuOpen(false); setMessage(''); if (next === 'record' && activeProfile) void run(() => loadEvents(activeProfile, api)); };
  const chooseProfile = (profile: PatientProfile) => run(async () => {
    activeProfileIdRef.current = profile.id;
    setActiveProfile(profile);
    resetRecordForm(); setShowRecordForm(false); setSavedDocuments([]);
    window.localStorage.setItem('mydoctor.v1.activeProfileId', profile.id);
    await loadEvents(profile);
  });

  const createEvent = () => run(async () => {
    if (!activeProfile) throw new Error('Escolha um perfil.');
    if (!eventTitle.trim()) throw new Error('Informe o atendimento (descrição).');
    const input = {
      type: eventType, title: eventTitle.trim(), occurredAt: new Date(eventDate).toISOString(),
      organizationName: onlineVisit || homeVisit ? '' : organizationName.trim() || undefined,
      practitionerName: practitionerName.trim() || undefined, profession: profession.trim() || undefined,
      council: council.trim() || undefined, registration: registration.trim() || undefined,
      registrationRegion: registrationRegion.trim() || undefined,
      payload: { followUp:savedFollowUp(followUp),homeVisit, onlineVisit, specialty: profession.trim(), symptoms: symptoms.trim(), diagnosis: diagnosis.trim(), exams: examsText.trim(), prescriptions: prescriptions.trim(), notes: notes.trim() },
    };
    const saved = editingEventId
      ? await api.updateHealthEvent(activeProfile.id, editingEventId, input)
      : await api.createHealthEvent(activeProfile.id, input);

    if (reportFiles.length) await api.uploadHealthEventDocuments(activeProfile.id, saved.id, 'report', reportFiles);
    if (prescriptionFiles.length) await api.uploadHealthEventDocuments(activeProfile.id, saved.id, 'prescription', prescriptionFiles);
    if (examFiles.length) await api.uploadHealthEventDocuments(activeProfile.id, saved.id, 'exam', examFiles);
    if (activeProfileIdRef.current !== saved.patientId) return;
    setEvents((current) => [saved, ...current.filter((item) => item.id !== saved.id && item.patientId === saved.patientId)]);
    setReportFiles([]); setPrescriptionFiles([]); setExamFiles([]);
    setEventTitle(''); setSymptoms(''); setDiagnosis(''); setExamsText(''); setPrescriptions(''); setNotes(''); const wasEditing = Boolean(editingEventId);
    setEditingEventId(null);
    setShowRecordForm(false);
    setMessage(wasEditing ? 'Atendimento atualizado com histórico preservado.' : 'Atendimento salvo com sucesso.');
    if (wasEditing) window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  });

  const resetRecordForm = () => {
    ++documentRequestRef.current;
    setEditingEventId(null);setMatchedPlaces({key:'',items:[]});
    setFollowUp(emptyFollowUp());setEventType('consultation'); setEventTitle(''); setEventDate(localDateTimeInputValue());
    setOrganizationName(''); setHomeVisit(false); setOnlineVisit(false); setPractitionerName(''); setProfession(''); setCouncil('CRM'); setRegistration(''); setRegistrationRegion('');
    setSymptoms(''); setDiagnosis(''); setExamsText(''); setPrescriptions(''); setNotes('');
    setReportFiles([]); setPrescriptionFiles([]); setExamFiles([]); setSavedDocuments([]);
  };

  const startEditEvent = (event: HealthEventV1) => {
    if (!activeProfile || event.patientId !== activeProfile.id) return;
    const profileId = activeProfile.id, request = ++documentRequestRef.current, session = readV1SessionToken();
    setSavedDocuments([]);
    void run(async () => { const docs = await api.listHealthEventDocuments(profileId, event.id); if (request === documentRequestRef.current && profileId === activeProfileIdRef.current && session === readV1SessionToken()) setSavedDocuments(docs); });
    setEditingEventId(event.id);
    setEventType(event.type);
    setEventTitle(event.title);setFollowUp(localFollowUp(event.payload?.followUp));
    setEventDate(localDateTimeInputValue(new Date(event.occurredAt)));
    setOrganizationName(event.organizationNameSnapshot ?? '');
    setHomeVisit(event.payload?.homeVisit === true);
    setOnlineVisit(event.payload?.onlineVisit === true);
    setPractitionerName(event.practitionerNameSnapshot ?? '');
    setProfession(recordedSpecialty(event));
    setCouncil(event.councilSnapshot ?? 'CRM');
    setRegistration(event.registrationSnapshot ?? '');
    setRegistrationRegion(event.registrationRegionSnapshot ?? '');
    setSymptoms(typeof event.payload?.symptoms === 'string' ? event.payload.symptoms : '');
    setDiagnosis(typeof event.payload?.diagnosis === 'string' ? event.payload.diagnosis : '');
    setExamsText(typeof event.payload?.exams === 'string' ? event.payload.exams : '');
    setPrescriptions(typeof event.payload?.prescriptions === 'string' ? event.payload.prescriptions : '');
    setNotes(typeof event.payload?.notes === 'string' ? event.payload.notes : '');
    setReportFiles([]); setPrescriptionFiles([]); setExamFiles([]);
    setShowRecordForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const inactivateEvent = (event: HealthEventV1) => {
    const reason = window.prompt('Motivo da inativação (ex.: duplicidade ou lançamento incorreto):')?.trim();
    if (!reason || !activeProfile) return;
    void run(async () => {
      await api.inactivateHealthEvent(activeProfile.id, event.id, reason);
      await loadEvents(activeProfile, api);
      setMessage('Registro inativado. Ele permanece preservado no histórico.');
    });
  };

  const reactivateEvent = (event: HealthEventV1) => {
    if (!activeProfile) return;
    void run(async () => {
      await api.reactivateHealthEvent(activeProfile.id, event.id);
      await loadEvents(activeProfile, api);
      setMessage('Registro reativado.');
    });
  };

  useEffect(() => {
    resetRecordForm(); setShowRecordForm(false); setShowVitalForm(false);
    setDiaryText(''); setShowDiaryForm(false); 
     setMessage('');
  }, [activeProfile?.id]);

  const selectedVital = VITAL_TYPES.find(([type]) => type === vitalType) ?? VITAL_TYPES[0];
  const vitalEvents = events.filter((event) => event.type === 'vital');
  const insuranceEvents = events.filter((event) => event.type === 'insurance' && event.status !== 'cancelled');
  const allClinicalEvents = events.filter((event) => event.patientId === activeProfile?.id && EVENT_TYPES.some(([type]) => type === event.type) && ['final', 'amended', 'cancelled'].includes(event.status));
  const clinicalEvents = allClinicalEvents.filter((event) => showInactiveRecords ? event.status === 'cancelled' : event.status !== 'cancelled');
  const recordFilters = useRecordListFilters(clinicalEvents, activeProfile?.id, recordedSpecialty, EVENT_TYPES);
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
    setVitalValue(''); setVitalSecondaryValue(''); setVitalDevice(''); setVitalDate(localDateTimeInputValue()); setShowVitalForm(false);
    await loadEvents(activeProfile, api); setMessage('Sinal vital salvo no prontuário.');
  });

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
      <label htmlFor="register-password-confirmation" className="mt-3 block text-xs font-bold text-mute">Repita a senha</label><input id="register-password-confirmation" type={showPassword?'text':'password'} autoComplete="new-password" value={passwordConfirmation} onChange={e=>setPasswordConfirmation(e.target.value)} className={`${inputClass()} mt-1`}/>
      <p className="mt-3 text-xs text-mute">Enviaremos um código ao seu e-mail. Confirme-o antes de acessar o sistema.</p>
      <button disabled={busy} onClick={() => void createAccount()} className="mt-5 w-full rounded-xl bg-pine-900 px-4 py-3 font-bold text-white disabled:opacity-50">Cadastrar</button>
      <p className="mt-5 text-center text-sm text-mute">Já tem cadastro? <button className="font-bold text-moss-700 underline" onClick={() => { setAuthView('login'); setShowPassword(false); }}>Entrar</button></p>
    </Card>;
    if (authView === 'verify') return <Card>
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-moss-50 text-moss-800"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/><path d="M12 14v3"/></svg></div>
      <h2 className="mt-4 text-center font-display text-2xl font-bold text-ink">{confirmingRegistration?'Confirme seu e-mail':'Confirme seu acesso'}</h2>
      <p className="mt-2 text-center text-sm leading-6 text-mute">Enviamos um código de 6 números para<br/><strong className="break-words text-ink">{challenge?.destinationMasked}</strong>.</p>
      <form onSubmit={e=>{e.preventDefault();if(!busy&&code.length===6)void (confirmingRegistration?confirmEmail():verifyLogin())}} className="mt-5">
        <label htmlFor="login-verification-code" className="block text-center text-xs font-bold text-mute">Código de verificação</label>
        <input id="login-verification-code" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="000000" maxLength={6} autoFocus disabled={busy} className="mx-auto mt-2 block w-full min-w-0 rounded-xl border border-line bg-paper px-3 py-4 text-center font-mono text-3xl tracking-[0.3em] text-ink outline-none focus:border-moss-500 focus:ring-2 focus:ring-moss-100" inputMode="numeric" autoComplete="one-time-code"/>
        {challenge?.expiresAt&&<p className="mt-2 text-center text-xs text-mute">Válido até {new Date(challenge.expiresAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})} (seu horário local).</p>}
        <button type="submit" disabled={busy||code.length!==6} className="mt-4 min-h-11 w-full rounded-xl bg-moss-700 px-4 py-3 font-bold text-white disabled:opacity-50">{busy?'Aguarde...':confirmingRegistration?'Confirmar e-mail':'Validar e entrar'}</button>
      </form>
      <div className="mt-5 border-t border-line pt-4 text-center"><p className="text-xs text-mute">Não recebeu ou o código expirou?</p><button type="button" disabled={busy} onClick={()=>void (confirmingRegistration?resendRegistration():startLogin(true))} className="mt-2 min-h-11 w-full rounded-xl border border-moss-500 px-4 py-2 text-sm font-bold text-moss-800 disabled:opacity-50">Solicitar novo código</button><button type="button" disabled={busy} onClick={()=>{setAuthView('login');setConfirmingRegistration(false);setChallenge(null);setCode('');setPassword('');setShowPassword(false);setMessage('')}} className="mt-2 min-h-11 w-full rounded-xl px-4 py-2 text-sm font-semibold text-mute disabled:opacity-50">← Voltar ao login</button></div>
    </Card>;
    return <Card>
      <h2 className="font-display text-2xl font-bold text-ink">Entrar no MyDoctor</h2>
      <p className="mt-1 text-sm text-mute">Acesse seu prontuário com seu e-mail e senha.</p>
      <label className="mt-5 block text-xs font-bold text-mute">E-mail</label><input value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass()} mt-1`} type="email" autoComplete="email" />
      <label className="mt-3 block text-xs font-bold text-mute">Senha</label>{passwordField('current-password')}
      <p className="mt-4 text-xs font-bold uppercase tracking-wide text-mute">Receber código por</p>
      <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => setChannel('email')} className={`rounded-xl border px-3 py-3 text-sm font-bold ${channel === 'email' ? 'border-moss-700 bg-moss-50 text-moss-800' : 'border-line bg-white text-ink'}`}>✉️ E-mail</button><button type="button" onClick={() => setChannel('sms')} className={`rounded-xl border px-3 py-3 text-sm font-bold ${channel === 'sms' ? 'border-moss-700 bg-moss-50 text-moss-800' : 'border-line bg-white text-ink'}`}>💬 SMS</button></div>
      <button disabled={busy} onClick={() => void startLogin()} className="mt-5 w-full rounded-xl bg-pine-900 px-4 py-3 font-bold text-white disabled:opacity-50">Entrar</button>
      <button type="button" disabled={busy} onClick={()=>void resendRegistration()} className="mt-3 w-full text-sm font-semibold text-moss-700 underline">Confirmar e-mail / reenviar confirmação do cadastro</button>
      <p className="mt-5 text-center text-sm text-mute">Você não tem cadastro? <button className="font-bold text-moss-700 underline" onClick={() => { setAuthView('register'); setShowPassword(false); }}>Clique aqui para se cadastrar</button></p>
    </Card>;
  };

  const plannedReturns=events.filter(event=>event.patientId===activeProfile?.id&&!['draft','pending_patient_confirmation','rejected_by_patient','cancelled','inactive'].includes(event.status)&&(event.payload?.followUp as any)?.enabled).sort((a,b)=>Date.parse((a.payload.followUp as any).at)-Date.parse((b.payload.followUp as any).at));
  const returnAlerts=plannedReturns.filter(event=>(event.payload.followUp as any).alert!==false&&Date.parse((event.payload.followUp as any).at)<=Date.now());
  const returnsCard=plannedReturns.length>0&&<Card><h3 className="font-bold text-ink">Retornos programados</h3><div className="mt-3 space-y-2"><PaginatedList items={plannedReturns} label="Registros">{pageRows=>(<>{pageRows.map(event=><div key={event.id} className="rounded-lg border border-line p-3 text-sm"><strong>{event.title}</strong><p>{new Date((event.payload.followUp as any).at).toLocaleString('pt-BR')}</p>{returnAlerts.some(item=>item.id===event.id)&&<p className="font-semibold text-moss-800" role="status">Alerta: confira seu retorno previsto.</p>}</div>)}</>)}</PaginatedList></div></Card>;
  const navigation = (_includeHome = false) => <DashboardNavigation current={view} includeHome={false} isProfessional={Boolean(user?.isHealthProfessional)} canPractice={canClinicar} canAdmin={canAdmin} external={Boolean(onNavigate)} onLogout={logout} onSelect={destination=>{if(['professional-agenda','identification-history','utility','professional','clinicar','professional-access','professional-locations','access-requests','consultation-confirmations','administration'].includes(destination)){navigationVersion.current++;resetRecordForm();setShowRecordForm(false);setMenuOpen(false);if(view==='account')go('welcome');onNavigate?.(destination as Parameters<NonNullable<typeof onNavigate>>[0]);}else go(destination as AppView)}}/>;
  const menu = user && menuOpen ? <div className="mb-5 rounded-2xl border border-line bg-paper p-3 sm:p-5">{navigation(true)}</div> : null;
  const welcomeView = <div className="space-y-5"><div className="rounded-2xl border border-line bg-white px-5 py-5 sm:px-6"><p className="text-xs font-semibold text-moss-700">Bem-vindo ao MyDoctor</p><h1 className="mt-1 font-display text-2xl font-bold text-ink">Olá, {user?.name?.split(' ')[0]}.</h1><p className="mt-2 text-sm text-mute">Escolha o que você precisa cuidar hoje.</p>{activeProfile&&<p className="mt-3 inline-flex rounded-lg bg-moss-50 px-3 py-1.5 text-xs font-semibold text-moss-800">Perfil atual: {activeProfile.name}</p>}</div>{returnAlerts.length>0&&<Card><p role="status" className="font-bold text-moss-800">Você tem {returnAlerts.length} retorno(s) previsto(s). Consulte Retornos programados no Prontuário.</p></Card>}{!menuOpen&&navigation()}</div>;

  const profilesView=<ProfilesPanel api={api} profiles={profiles} activeId={activeProfile?.id} onChoose={async profile=>{setProfileChosen(true);await chooseProfile(profile);go('welcome')}} onChanged={id=>loadProfiles(api,id)} onOwnAccount={()=>go('account')}/>;

  const recordList = <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-mute">Prontuário ativo</p><h2 className="font-display text-2xl font-bold text-ink">{activeProfile?.name ?? 'Escolha um perfil'}</h2>{activeProfile&&<p className="mt-1 text-sm font-semibold text-mute">Prontuário: {activeProfile.record}</p>}</div>{activeProfile && <div className="flex flex-wrap gap-2"><SecondaryButton onClick={() => setShowInactiveRecords((v) => !v)}>{showInactiveRecords ? 'Ver ativos' : 'Ver atendimentos inativos'}</SecondaryButton><PrimaryButton onClick={() => { if (showRecordForm) { resetRecordForm(); setShowRecordForm(false); } else { resetRecordForm(); setShowRecordForm(true); } }}>{showRecordForm ? 'Cancelar' : '+ Adicionar Atendimento'}</PrimaryButton></div>}</div>{activeProfile && <RecordListFilters state={recordFilters} total={clinicalEvents.length}/>} {!activeProfile ? <p className="mt-4 text-sm text-mute">Escolha um perfil em Perfis e dependentes.</p> : recordFilters.rows.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-line bg-white p-5 text-sm text-mute">Nenhum atendimento encontrado. Revise os filtros ou adicione um atendimento.</div> : <div className="mt-5 overflow-hidden rounded-xl border border-line bg-white"><div className="hidden grid-cols-[180px_1fr_1.2fr_1.4fr_90px] gap-3 border-b border-line bg-paper px-4 py-3 text-xs font-bold uppercase tracking-wide text-mute md:grid"><SortColumn state={recordFilters} column="occurredAt" label="Data/Hora"/><SortColumn state={recordFilters} column="type" label="Tipo"/><SortColumn state={recordFilters} column="specialty" label="Especialidade"/><SortColumn state={recordFilters} column="practitioner" label="Médico/Atendente"/><span></span></div><div className="divide-y divide-line"><PaginatedList items={recordFilters.rows} label="Atendimentos" resetKey={JSON.stringify([activeProfile?.id,recordFilters.applied,recordFilters.sort])}>{pageRows=>(<>{pageRows.map((event) => <details key={event.id} data-record-id={event.id} className="group min-w-0"><summary className="cursor-pointer list-none px-4 py-4 hover:bg-paper"><div className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-3 md:grid-cols-[180px_1fr_1.2fr_1.4fr_90px] md:items-center"><div className="min-w-0"><span className="block text-[10px] font-bold uppercase text-mute md:hidden">Data/Hora</span><time className="break-words text-sm font-semibold text-ink">{new Date(event.occurredAt).toLocaleString('pt-BR')}</time></div><div className="min-w-0"><span className="block text-[10px] font-bold uppercase text-mute md:hidden">Tipo</span><span className="break-words text-sm text-ink">{EVENT_TYPES.find(([value]) => value === event.type)?.[1] ?? event.type}</span></div><div className="min-w-0"><span className="block text-[10px] font-bold uppercase text-mute md:hidden">Especialidade</span><span className="break-words text-sm text-ink">{recordedSpecialty(event) || '—'}</span></div><div className="min-w-0"><span className="block text-[10px] font-bold uppercase text-mute md:hidden">Médico/Atendente</span><span className="break-words text-sm text-ink">{event.practitionerNameSnapshot || '—'}</span></div><span className="col-span-2 text-xs font-bold text-moss-700 group-open:hidden md:col-span-1 md:text-right">Ver detalhes</span><span className="col-span-2 hidden text-xs font-bold text-moss-700 group-open:block md:col-span-1 md:text-right">Fechar</span></div></summary><div className="border-t border-line bg-moss-50/40 px-4 py-4"><div className="grid min-w-0 gap-3 text-sm sm:grid-cols-2"><div><strong className="block text-xs uppercase text-mute">Atendimento(descrição)</strong><p className="mt-1 break-words text-ink">{event.title}</p></div>{event.payload.onlineVisit === true && <div><strong className="block text-xs uppercase text-mute">Local do atendimento</strong><p className="mt-1 text-ink">Atendimento on-line</p></div>}{event.payload.homeVisit === true && <div><strong className="block text-xs uppercase text-mute">Local do atendimento</strong><p className="mt-1 text-ink">Atendimento domiciliar</p></div>}{event.organizationNameSnapshot && <div><strong className="block text-xs uppercase text-mute">Hospital/Clínica/Consultório</strong><p className="mt-1 break-words text-ink">{event.organizationNameSnapshot}</p></div>}<div><strong className="block text-xs uppercase text-mute">Tipo</strong><p className="mt-1 text-ink">{EVENT_TYPES.find(([value]) => value === event.type)?.[1] ?? event.type}</p></div>{event.practitionerNameSnapshot && <div><strong className="block text-xs uppercase text-mute">Médico/Fisioterapeuta/Atendente</strong><p className="mt-1 break-words text-ink">{event.practitionerNameSnapshot}</p></div>}{recordedSpecialty(event) && <div><strong className="block text-xs uppercase text-mute">Especialidade</strong><p className="mt-1 break-words text-ink">{recordedSpecialty(event)}</p></div>}{event.registrationSnapshot && <div><strong className="block text-xs uppercase text-mute">Registro profissional</strong><p className="mt-1 text-ink">{event.councilSnapshot ?? ''} {event.registrationSnapshot}{event.registrationRegionSnapshot ? `/${event.registrationRegionSnapshot}` : ''}</p></div>}{typeof event.payload?.symptoms === 'string' && event.payload.symptoms && <div className="sm:col-span-2"><strong className="block text-xs uppercase text-mute">Sintomas / Queixa principal</strong><p className="mt-1 whitespace-pre-wrap break-words text-ink">{event.payload.symptoms}</p></div>}{typeof event.payload?.diagnosis === 'string' && event.payload.diagnosis && <div className="sm:col-span-2"><strong className="block text-xs uppercase text-mute">Diagnóstico / Causa / Hipótese</strong><p className="mt-1 whitespace-pre-wrap break-words text-ink">{event.payload.diagnosis}</p></div>}{typeof event.payload?.exams === 'string' && event.payload.exams && <div className="sm:col-span-2"><strong className="block text-xs uppercase text-mute">Exames</strong><p className="mt-1 whitespace-pre-wrap break-words text-ink">{event.payload.exams}</p></div>}{typeof event.payload?.prescriptions === 'string' && event.payload.prescriptions && <div className="sm:col-span-2"><strong className="block text-xs uppercase text-mute">Receitas / Prescrições</strong><p className="mt-1 whitespace-pre-wrap break-words text-ink">{event.payload.prescriptions}</p></div>}{typeof event.payload?.notes === 'string' && event.payload.notes && <div className="sm:col-span-2"><strong className="block text-xs uppercase text-mute">Observações</strong><p className="mt-1 whitespace-pre-wrap break-words text-ink">{event.payload.notes}</p></div>}<div className="sm:col-span-2 flex flex-wrap gap-2 border-t border-line pt-3">{event.status !== 'cancelled' ? <><SecondaryButton onClick={() => startEditEvent(event)}>Editar</SecondaryButton><button type="button" onClick={() => inactivateEvent(event)} className="rounded-xl border border-danger-500 px-4 py-3 text-sm font-bold text-danger-600">Inativar</button></> : <PrimaryButton onClick={() => reactivateEvent(event)}>Reativar</PrimaryButton>}</div></div></div></details>)}</>)}</PaginatedList></div></div>}</Card>;

  const recordView = <div className="space-y-5">{returnsCard}{showRecordForm && activeProfile && <Card><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-display text-xl font-bold text-ink">{editingEventId ? 'Editar Atendimento' : 'Novo Atendimento'}</h3><SecondaryButton onClick={()=>{resetRecordForm();setShowRecordForm(false);setMessage('')}}>Cancelar sem salvar</SecondaryButton></div><div className="mt-4 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2"><EncounterFields locations={matchedPlaces.key===`${activeProfile.id}|${council}|${registration}|${registrationRegion}|${practitionerName}`?matchedPlaces.items:[]} value={{followUp,type:eventType,occurredAt:eventDate,organizationName,homeVisit,onlineVisit,title:eventTitle,symptoms,diagnosis,exams:examsText,prescriptions,notes}} onChange={value=>{setFollowUp(value.followUp??emptyFollowUp());setEventType(value.type);setEventDate(value.occurredAt);setOrganizationName(value.organizationName);setHomeVisit(value.homeVisit);setOnlineVisit(value.onlineVisit);setEventTitle(value.title);setSymptoms(value.symptoms);setDiagnosis(value.diagnosis);setExamsText(value.exams);setPrescriptions(value.prescriptions);setNotes(value.notes);}}><label className="min-w-0 text-xs font-bold text-mute">CRM/CREFITO<div className="mt-1 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_110px]"><select value={council} onChange={(e) => setCouncil(e.target.value)} className={inputClass()}><option value="CRM">CRM</option><option value="CREFITO">Crefito</option><option value="Outros">Outros</option></select><input value={registration} onChange={(e) => setRegistration(e.target.value)} placeholder="Número" className={inputClass()} /><select value={registrationRegion} onChange={(e) => setRegistrationRegion(e.target.value)} className={inputClass()}><option value="">UF</option>{BRAZIL_UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}</select></div></label><PractitionerLookup key={`${activeProfile.id}-${editingEventId}`} api={api} council={council} registration={registration} region={registrationRegion} automatic={!editingEventId} onReset={()=>setMatchedPlaces({key:'',items:[]})} onLocations={items=>setMatchedPlaces({key:`${activeProfile.id}|${council}|${registration}|${registrationRegion}|${practitionerName}`,items})} onMatch={(name,specialty,items)=>{setPractitionerName(name);setProfession(specialty);setMatchedPlaces({key:`${activeProfile.id}|${council}|${registration}|${registrationRegion}|${name}`,items})}}/><label className="min-w-0 text-xs font-bold text-mute">Nome do Médico/Fisioterapeuta/Atendente<input value={practitionerName} onChange={(e) => setPractitionerName(e.target.value)} className={`${inputClass()} mt-1`} /></label><label className="min-w-0 text-xs font-bold text-mute">Especialidade<input value={profession} onChange={(e) => setProfession(e.target.value)} className={`${inputClass()} mt-1`} /></label></EncounterFields><div className="md:col-span-2 rounded-xl border border-line bg-paper p-4"><p className="text-xs font-bold uppercase tracking-wide text-mute">Anexos do Atendimento</p><p className="mt-1 text-xs text-mute">Você pode anexar vários PDFs ou imagens em cada categoria. Arquivos já salvos permanecem vinculados ao Atendimento.</p><div className="mt-3 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-line bg-white p-4 shadow-sm"><p className="text-sm font-bold text-ink">📄 Laudo / Relatório</p><label className="mt-2 inline-flex cursor-pointer rounded-lg border border-moss-500 px-3 py-2 text-xs font-bold text-moss-800">+ Selecionar arquivos<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => setReportFiles((current) => [...current, ...Array.from(e.target.files ?? [])])} /></label>{reportFiles.length > 0 && <div className="mt-2 space-y-1">{reportFiles.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 text-xs"><span className="truncate">{file.name}</span><button type="button" title="Remover arquivo selecionado" aria-label="Remover arquivo selecionado" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-danger-600" onClick={() => setReportFiles((current) => current.filter((_, i) => i !== index))}><span aria-hidden="true">🗑️</span></button></div>)}</div>}{savedDocuments.filter((doc) => doc.type === 'report').map((doc) => <div key={doc.id} className="mt-2 rounded-lg bg-paper px-2 py-2 text-xs"><div className="flex min-w-0 items-center justify-between gap-2"><span className="min-w-0 flex-1 truncate font-semibold text-ink" title={doc.originalFilename}>{doc.originalFilename}</span><span className="shrink-0 text-moss-700">Salvo</span></div><div className="mt-2 flex items-center justify-between gap-2"><button type="button" className="text-xs font-bold text-moss-800 underline" onClick={() => activeProfile && editingEventId && void api.openHealthEventDocument(activeProfile.id, editingEventId, doc.id, doc.originalFilename)}>Visualizar</button><button type="button" title="Remover anexo" aria-label="Remover anexo" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-danger-200 text-danger-600 hover:bg-danger-50" onClick={() => activeProfile && editingEventId && void run(async () => { if (!window.confirm('Remover este anexo do Atendimento?')) return; await api.inactivateHealthEventDocument(activeProfile.id, editingEventId, doc.id); setSavedDocuments((items) => items.filter((item) => item.id !== doc.id)); })}><span aria-hidden="true">🗑️</span></button></div></div>)}</div><div className="rounded-2xl border border-line bg-white p-4 shadow-sm"><p className="text-sm font-bold text-ink">💊 Receita / Prescrição</p><label className="mt-2 inline-flex cursor-pointer rounded-lg border border-moss-500 px-3 py-2 text-xs font-bold text-moss-800">+ Selecionar arquivos<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => setPrescriptionFiles((current) => [...current, ...Array.from(e.target.files ?? [])])} /></label>{prescriptionFiles.length > 0 && <div className="mt-2 space-y-1">{prescriptionFiles.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 text-xs"><span className="truncate">{file.name}</span><button type="button" title="Remover arquivo selecionado" aria-label="Remover arquivo selecionado" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-danger-600" onClick={() => setPrescriptionFiles((current) => current.filter((_, i) => i !== index))}><span aria-hidden="true">🗑️</span></button></div>)}</div>}{savedDocuments.filter((doc) => doc.type === 'prescription').map((doc) => <div key={doc.id} className="mt-2 rounded-lg bg-paper px-2 py-2 text-xs"><div className="flex min-w-0 items-center justify-between gap-2"><span className="min-w-0 flex-1 truncate font-semibold text-ink" title={doc.originalFilename}>{doc.originalFilename}</span><span className="shrink-0 text-moss-700">Salvo</span></div><div className="mt-2 flex items-center justify-between gap-2"><button type="button" className="text-xs font-bold text-moss-800 underline" onClick={() => activeProfile && editingEventId && void api.openHealthEventDocument(activeProfile.id, editingEventId, doc.id, doc.originalFilename)}>Visualizar</button><button type="button" title="Remover anexo" aria-label="Remover anexo" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-danger-200 text-danger-600 hover:bg-danger-50" onClick={() => activeProfile && editingEventId && void run(async () => { if (!window.confirm('Remover este anexo do Atendimento?')) return; await api.inactivateHealthEventDocument(activeProfile.id, editingEventId, doc.id); setSavedDocuments((items) => items.filter((item) => item.id !== doc.id)); })}><span aria-hidden="true">🗑️</span></button></div></div>)}</div><div className="rounded-2xl border border-line bg-white p-4 shadow-sm"><p className="text-sm font-bold text-ink">🧪 Exames</p><label className="mt-2 inline-flex cursor-pointer rounded-lg border border-moss-500 px-3 py-2 text-xs font-bold text-moss-800">+ Selecionar arquivos<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => setExamFiles((current) => [...current, ...Array.from(e.target.files ?? [])])} /></label>{examFiles.length > 0 && <div className="mt-2 space-y-1">{examFiles.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 text-xs"><span className="truncate">{file.name}</span><button type="button" title="Remover arquivo selecionado" aria-label="Remover arquivo selecionado" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-danger-600" onClick={() => setExamFiles((current) => current.filter((_, i) => i !== index))}><span aria-hidden="true">🗑️</span></button></div>)}</div>}{savedDocuments.filter((doc) => doc.type === 'exam').map((doc) => <div key={doc.id} className="mt-2 rounded-lg bg-paper px-2 py-2 text-xs"><div className="flex min-w-0 items-center justify-between gap-2"><span className="min-w-0 flex-1 truncate font-semibold text-ink" title={doc.originalFilename}>{doc.originalFilename}</span><span className="shrink-0 text-moss-700">Salvo</span></div><div className="mt-2 flex items-center justify-between gap-2"><button type="button" className="text-xs font-bold text-moss-800 underline" onClick={() => activeProfile && editingEventId && void api.openHealthEventDocument(activeProfile.id, editingEventId, doc.id, doc.originalFilename)}>Visualizar</button><button type="button" title="Remover anexo" aria-label="Remover anexo" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-danger-200 text-danger-600 hover:bg-danger-50" onClick={() => activeProfile && editingEventId && void run(async () => { if (!window.confirm('Remover este anexo do Atendimento?')) return; await api.inactivateHealthEventDocument(activeProfile.id, editingEventId, doc.id); setSavedDocuments((items) => items.filter((item) => item.id !== doc.id)); })}><span aria-hidden="true">🗑️</span></button></div></div>)}</div></div></div><div className="md:col-span-2"><FollowUpFields value={followUp} occurredAt={eventDate} onChange={setFollowUp} disabled={busy}/></div><div className="md:col-span-2 flex flex-wrap gap-2"><PrimaryButton disabled={busy} onClick={() => void createEvent()}>{busy ? 'Salvando...' : editingEventId ? 'Salvar alterações' : 'Salvar Atendimento'}</PrimaryButton>{editingEventId && <SecondaryButton onClick={() => { resetRecordForm(); setShowRecordForm(false); }}>Cancelar</SecondaryButton>}</div></div></Card>}{!editingEventId && recordList}</div>;

  const familyHistoryEvent = events.find((event) => event.type === 'family_history');
  const saveFamilyHistory = () => run(async () => {
    if (!activeProfile) throw new Error('Escolha um perfil.');
    const text = familyHistoryText.trim();
    if (!text) throw new Error('Informe o histórico familiar.');
    const input = { type: 'family_history', title: 'Histórico familiar', occurredAt: familyHistoryEvent?.occurredAt ?? new Date().toISOString(), payload: { text } };
    if (familyHistoryEvent) await api.updateHealthEvent(activeProfile.id, familyHistoryEvent.id, input);
    else await api.createHealthEvent(activeProfile.id, input);
    await loadEvents(activeProfile, api);
    setMessage('Histórico familiar salvo.');
  });
  const familyHistoryView = <div className="space-y-5"><Card><p className="text-xs font-bold uppercase tracking-wide text-moss-700">Histórico familiar</p><h2 className="mt-1 font-display text-2xl font-bold text-ink">{activeProfile?.name ?? 'Escolha um perfil'}</h2>{activeProfile&&<p className="mt-1 text-sm font-semibold text-mute">Prontuário: {activeProfile.record}</p>}<p className="mt-2 text-sm text-mute">Registre informações relevantes sobre a saúde da família. Você pode digitar ou ditar o texto e editar o histórico sempre que precisar.</p>{activeProfile && (familyHistoryEvent && !editingFamilyHistory ? <><p className="mt-4 whitespace-pre-wrap rounded-xl border border-line bg-paper p-4 text-sm text-ink">{String(familyHistoryEvent.payload?.text ?? '')}</p><div className="mt-3"><SecondaryButton disabled={busy} onClick={() => { setFamilyHistoryText(String(familyHistoryEvent.payload?.text ?? '')); setEditingFamilyHistory(true); }}>Editar histórico familiar</SecondaryButton></div></> : <><div className="mt-4"><p className="mb-1 text-xs font-bold text-mute">Histórico familiar</p><DictationTextarea key={activeProfile.id} value={familyHistoryText} onChange={setFamilyHistoryText} className={`${inputClass()} min-h-52`} placeholder="Conte os antecedentes importantes da sua família..." /></div><div className="mt-3 flex flex-wrap gap-2"><PrimaryButton disabled={busy} onClick={() => void saveFamilyHistory()}>{busy ? 'Salvando...' : familyHistoryEvent ? 'Salvar alterações' : 'Salvar histórico familiar'}</PrimaryButton>{familyHistoryEvent && <SecondaryButton disabled={busy} onClick={() => { setFamilyHistoryText(String(familyHistoryEvent.payload?.text ?? '')); setEditingFamilyHistory(false); }}>Cancelar</SecondaryButton>}</div></>)}</Card></div>;

  const diaryEvents = events.filter((event) => event.type === 'wellbeing_diary' && event.status !== 'cancelled');
  const todayKey = localDateTimeInputValue().slice(0, 10);
  const todayDiary = diaryEvents.find((event) => String(event.payload?.diaryDate ?? event.occurredAt.slice(0, 10)) === todayKey);
  const diaryEntries = (event: HealthEventV1) => Array.isArray(event.payload?.entries) ? event.payload.entries as Array<{ at: string; text: string }> : [];

  const deleteDiaryEntry = (day: HealthEventV1, index: number) => run(async () => {
    if (!activeProfile) return;
    if (!window.confirm('Apagar este relato definitivamente? Esta ação não pode ser desfeita.')) return;
    const entry = diaryEntries(day)[index];
    await api.deleteDiaryEntry(activeProfile.id, day.id, index, entry.at, entry.text);
    await loadEvents(activeProfile, api);
    setMessage('Relato apagado.');
  });

  const addDiaryEntry = () => run(async () => {
    if (!activeProfile) throw new Error('Escolha um perfil.');
    const text = diaryText.trim();
    if (!text) throw new Error('Escreva ou dite seu relato.');
    const now = new Date();
    const entry = { at: now.toISOString(), text };
    if (todayDiary) {
      const entries = [...diaryEntries(todayDiary), entry];
      await api.updateHealthEvent(activeProfile.id, todayDiary.id, {
        type: 'wellbeing_diary', title: `Diário de Saúde e Bem-Estar — ${todayKey}`, occurredAt: todayDiary.occurredAt,
        payload: { ...todayDiary.payload, diaryDate: todayKey, entries },
      });
    } else {
      await api.createHealthEvent(activeProfile.id, {
        type: 'wellbeing_diary', title: `Diário de Saúde e Bem-Estar — ${todayKey}`, occurredAt: now.toISOString(),
        payload: { diaryDate: todayKey, entries: [entry] },
      });
    }
    setDiaryText(''); setShowDiaryForm(false); await loadEvents(activeProfile, api);
    setMessage('Relato incluído no Diário de hoje.');
  });

  const diaryView = <div className="space-y-5"><Card><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-moss-700">Meu Diário de Saúde e Bem-Estar</p><h2 className="font-display text-2xl font-bold text-ink">{activeProfile?.name ?? 'Escolha um perfil'}</h2>{activeProfile&&<p className="mt-1 text-sm font-semibold text-mute">Prontuário: {activeProfile.record}</p>}<p className="mt-1 text-sm text-mute">Registre como você está se sentindo. Os relatos ficam guardados por 60 dias e depois são apagados automaticamente. Você também pode apagar cada relato antes desse prazo.</p></div>{activeProfile && <PrimaryButton onClick={() => { setDiaryText(''); setShowDiaryForm(true); }}>+ Incluir relato</PrimaryButton>}</div></Card>{showDiaryForm && activeProfile && <Card><div className="flex items-center justify-between gap-3"><div><h3 className="font-display text-xl font-bold text-ink">Novo relato</h3><p className="text-sm text-mute">{new Date().toLocaleString('pt-BR')}</p></div><SecondaryButton onClick={() => { setDiaryText(''); setShowDiaryForm(false); }}>Cancelar</SecondaryButton></div><label className="mt-4 block text-xs font-bold text-mute">O que está acontecendo?<textarea value={diaryText} onChange={(e) => setDiaryText(e.target.value)} className={`${inputClass()} mt-1 min-h-40`} placeholder="Conte livremente como você está se sentindo, o que comeu, medicamentos, exercícios, reações, melhora ou piora..." /></label><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="rounded-xl border border-danger-200 px-4 py-3 text-sm font-bold text-danger-600" onClick={() => { if (!diaryText || window.confirm('Apagar todo o texto deste relato e começar novamente?')) setDiaryText(''); }}>🗑️ Limpar texto</button><PrimaryButton disabled={busy} onClick={() => void addDiaryEntry()}>{busy ? 'Salvando...' : 'Salvar relato'}</PrimaryButton></div></Card>}<div className="space-y-3"><PaginatedList items={diaryEvents} label="Registros">{pageRows=>(<>{diaryEvents.length === 0 ? <Card><p className="text-sm text-mute">Nenhum relato no Diário ainda.</p></Card> : pageRows.map((day) => <Card key={day.id}><h3 className="font-display text-xl font-bold text-ink">{new Date(day.occurredAt).toLocaleDateString('pt-BR')}</h3><div className="mt-3 space-y-3">{diaryEntries(day).map((entry, index) => <div key={`${entry.at}-${index}`} className="rounded-xl border border-line bg-white p-3"><time className="text-xs font-bold text-moss-700">{new Date(entry.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time><p className="mt-1 whitespace-pre-wrap text-sm text-ink">{entry.text}</p><button type="button" disabled={busy} className="mt-2 rounded-lg border border-danger-200 px-3 py-2 text-xs font-bold text-danger-600 disabled:opacity-50" onClick={() => void deleteDiaryEntry(day, index)}>Apagar relato</button></div>)}</div></Card>)}</>)}</PaginatedList></div></div>;

  const vitalsView = <div className="space-y-5"><Card><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-moss-700">Sinais vitais</p><h2 className="font-display text-2xl font-bold text-ink">{activeProfile?.name ?? 'Escolha um perfil'}</h2>{activeProfile&&<p className="mt-1 text-sm font-semibold text-mute">Prontuário: {activeProfile.record}</p>}</div>{activeProfile && <PrimaryButton onClick={() => setShowVitalForm((v) => !v)}>{showVitalForm ? 'Cancelar' : '+ Incluir medição'}</PrimaryButton>}</div>{!activeProfile ? <p className="mt-4 text-sm text-mute">Escolha um perfil.</p> : vitalEvents.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-line bg-white p-5 text-sm text-mute">Nenhuma medição registrada. Use “+ Incluir medição” para cadastrar.</div> : <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2"><PaginatedList items={vitalEvents} label="Registros">{pageRows=>(<>{pageRows.map((event) => { const payload = vitalPayload(event); return <article key={event.id} className="min-w-0 rounded-xl border border-line bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-moss-700">{String(payload.label ?? 'Sinal vital')}</p><h3 className="mt-1 break-words text-xl font-bold text-ink">{String(payload.value ?? '')}{payload.secondaryValue ? `/${String(payload.secondaryValue)}` : ''} <span className="text-sm font-semibold text-mute">{String(payload.unit ?? '')}</span></h3><p className="mt-1 text-xs text-mute">Origem: {String(payload.source ?? 'manual')}</p><time className="mt-2 block text-xs text-mute">{new Date(event.occurredAt).toLocaleString('pt-BR')}</time></article>; })}</>)}</PaginatedList></div>}</Card>{showVitalForm && activeProfile && <Card><h3 className="font-display text-xl font-bold text-ink">Nova medição</h3><p className="mt-1 text-sm text-mute">A captura automática por Apple Health/Health Connect será habilitada no aplicativo nativo. Aqui o registro é manual.</p><div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2"><select value={vitalType} onChange={(e) => setVitalType(e.target.value as VitalType)} className={inputClass()}>{VITAL_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input type="datetime-local" value={vitalDate} onChange={(e) => setVitalDate(e.target.value)} className={inputClass()} /><input value={vitalValue} onChange={(e) => setVitalValue(e.target.value.replace(',', '.'))} inputMode="decimal" placeholder={vitalType === 'blood_pressure' ? 'Sistólica' : `Valor em ${selectedVital[2]}`} className={inputClass()} />{vitalType === 'blood_pressure' && <input value={vitalSecondaryValue} onChange={(e) => setVitalSecondaryValue(e.target.value.replace(',', '.'))} inputMode="decimal" placeholder="Diastólica" className={inputClass()} />}<select value={vitalSource} onChange={(e) => setVitalSource(e.target.value)} className={inputClass()}><option value="manual">Digitado manualmente</option><option value="healthkit">Apple Health / HealthKit</option><option value="health_connect">Android Health Connect</option><option value="bluetooth">Dispositivo Bluetooth</option><option value="institution">Instituição de saúde</option></select><input value={vitalDevice} onChange={(e) => setVitalDevice(e.target.value)} placeholder="Aparelho/dispositivo (opcional)" className={inputClass()} /><div className="sm:col-span-2"><PrimaryButton disabled={busy} onClick={() => void createVital()}>Salvar sinal vital</PrimaryButton></div></div></Card>}</div>;

  const insuranceView = activeProfile ? <InsurancePanel key={activeProfile.id} api={api} profile={activeProfile} events={events} prepareImage={compressImage} onRefresh={()=>loadEvents(activeProfile,api)}/> : <Card>Escolha um perfil.</Card>;

  const attachConsultantImages = async (files:File[]) => {
    const generation=++imageGeneration.current;
    if(!files.length)return;
    if(consultantImages.length+files.length>3){setMessage('Anexe até 3 imagens por pergunta.');return}
    setImageLoading(true);setMessage('');
    try{
      const prepared:Array<{name:string;data:string}>=[];
      for(const file of files){
        if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error('Use JPEG, PNG ou WebP de até 10 MB.');
        const url=URL.createObjectURL(file);
        try{
          const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Não foi possível abrir esta imagem.'));img.src=url});
          if(image.naturalWidth*image.naturalHeight>24000000)throw new Error('Use uma imagem de até 24 megapixels.');
          const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
          const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
          const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Não foi possível preparar a imagem.');
          ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
          const data=canvas.toDataURL('image/jpeg',0.85);if(data.length>2800000)throw new Error('A imagem ficou muito grande. Escolha outra foto.');
          prepared.push({name:file.name,data});
        }finally{URL.revokeObjectURL(url)}
      }
      if(generation===imageGeneration.current){setConsultantImages(current=>[...current,...prepared]);setConsultantConsent(false)}
    }catch(error){if(generation===imageGeneration.current)setMessage(error instanceof Error?error.message:'Falha ao preparar imagem.')}finally{if(generation===imageGeneration.current)setImageLoading(false)}
  };
  const askConsultant = () => run(async () => {
    if (busy || imageLoading) return;
    if (!activeProfile) throw new Error('Escolha um perfil.');
    const question = consultantQuestion.trim();
    if (!question) throw new Error('Digite ou dite sua pergunta.');
    if (!consultantConsent) throw new Error('Autorize o envio do contexto à IA para continuar.');
    const profileId = activeProfile.id;
    try {
      const result = await api.askConsultant(profileId, question, consultantMessages, consultantConsent, consultantImages.map(image=>image.data));
      setConsultantUsage(result.usage);
      if (activeProfileIdRef.current !== profileId) return;
      setConsultantMessages(current => [...current, { role: 'user', content: question+(consultantImages.length?`\n[${consultantImages.length} imagem(ns) enviada(s) nesta pergunta]`:'') }, { role: 'assistant', content: result.answer }]);
      setConsultantQuestion('');setConsultantImages([]);
    } finally {
      await api.getConsultantUsage().then(setConsultantUsage).catch(() => undefined);
    }
  });
  const consultantChat = <Card>
    <h3 className="font-display text-xl font-bold text-ink">Converse com o Consultor MyDoctor</h3>
    <p className="mt-2 text-sm text-mute">Dúvidas exclusivamente sobre saúde e bem-estar: doenças, dores, sintomas, medicamentos, exercícios e alimentação. A IA considera os registros disponíveis do prontuário, agenda de medicamentos, diário e histórico familiar. Pode cometer erros, não faz pesquisa na web e não substitui atendimento médico.</p>
    <div className="mt-3 rounded-xl border border-line bg-paper p-3 text-sm" aria-live="polite">
      {consultantUsage ? <>
        <p className="font-bold text-ink">{consultantUsage.remaining} de {consultantUsage.limit} perguntas disponíveis</p>
        <p className="mt-1 text-mute">Limite por conta: {consultantUsage.limit} perguntas respondidas nas últimas {consultantUsage.windowHours} horas, compartilhado entre o site e o aplicativo. Cada mensagem sua que recebe uma resposta conta um uso, inclusive respostas às perguntas do consultor. Falhas e perguntas recusadas por estarem fora de saúde e bem-estar não descontam o saldo.</p>
        {consultantUsage.nextAvailableAt && <p className="mt-1 text-mute">Próxima liberação: {new Date(consultantUsage.nextAvailableAt).toLocaleString('pt-BR')}. Cada uso é liberado {consultantUsage.windowHours} horas após a resposta; não depende da meia-noite.</p>}
        {consultantUsage.pending > 0 && <p className="mt-1 text-mute">{consultantUsage.pending} resposta(s) em processamento, com saldo reservado temporariamente.</p>}
        {!consultantUsage.configured && <p className="mt-2 font-semibold text-danger-600">O consultor ainda não foi ativado pelo administrador. Nenhum uso será descontado.</p>}
        {consultantUsage.configured && consultantUsage.remaining === 0 && <p className="mt-2 font-semibold text-mute">Seu limite foi atingido. Aguarde a próxima liberação para enviar outra pergunta.</p>}
      </> : <p className="text-mute">{consultantUsageError || 'Verificando disponibilidade e saldo...'}</p>}
    </div>
    {activeProfile && <>
      <div className="mt-4 space-y-3">{consultantMessages.map((item, index) => <div key={index} className="rounded-xl border border-line bg-paper p-3"><p className="text-xs font-bold text-moss-700">{item.role === 'user' ? 'Sua pergunta' : 'Consultor MyDoctor'}</p><p className="mt-1 whitespace-pre-wrap text-sm text-ink">{item.content}</p></div>)}</div>
      <div className="mt-4"><DictationTextarea key={activeProfile.id} value={consultantQuestion} onChange={setConsultantQuestion} placeholder="Digite ou dite sua pergunta..." className={`${inputClass()} min-h-24`} /></div>
      <div className="mt-3 rounded-xl border border-line p-3"><label className="block text-sm font-bold text-ink">Anexar imagens<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy||imageLoading||consultantImages.length>=3} onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value='';void attachConsultantImages(files)}} className="mt-2 block w-full min-w-0 max-w-full text-xs" /></label><p className="mt-2 text-xs text-mute">Até 3 imagens por pergunta. Escolha uma foto nítida e explique sua dúvida abaixo. As imagens são enviadas ao provedor de IA com sua autorização e não são salvas automaticamente no prontuário. Para revê-las em outra pergunta, anexe novamente.</p>{imageLoading&&<p role="status" className="mt-2 text-xs">Preparando imagens...</p>}<div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{consultantImages.map((image,index)=><figure key={index} className="min-w-0 rounded-lg border border-line p-2"><img src={image.data} alt={`Imagem anexada ${index+1}`} className="h-28 w-full object-contain"/><figcaption className="truncate text-xs">{image.name}</figcaption><button type="button" disabled={busy||imageLoading} onClick={()=>setConsultantImages(current=>current.filter((_,i)=>i!==index))} className="mt-1 text-xs font-bold text-danger-600" aria-label={`Remover imagem ${index+1}`}>Remover</button></figure>)}</div></div>
      <label className="mt-3 flex gap-2 text-xs text-mute"><input type="checkbox" checked={consultantConsent} onChange={e => setConsultantConsent(e.target.checked)} />Autorizo enviar minha pergunta, as imagens anexadas e os registros clínicos disponíveis ao provedor de IA usado pelo MyDoctor para esta conversa.</label>
      <div className="mt-3"><PrimaryButton disabled={busy || imageLoading || !consultantConsent || !consultantQuestion.trim() || !consultantUsage?.configured || consultantUsage.remaining === 0} onClick={() => void askConsultant()}>{busy ? 'Consultando...' : 'Enviar pergunta'}</PrimaryButton></div>
    </>}
  </Card>;

  const consultantSummary = (() => { const latest = new Map<string, HealthEventV1>(); vitalEvents.forEach((event) => { const type = String(event.payload?.vitalType ?? 'vital'); if (!latest.has(type)) latest.set(type, event); }); return { latestVitals: [...latest.values()], recentClinical: clinicalEvents.slice(0, 5), insurance: insuranceEvents[0] }; })();
  const consultantView = <div className="space-y-5">{consultantChat}<Card><p className="text-xs font-bold uppercase tracking-wide text-moss-700">Consultor MyDoctor</p><h2 className="mt-1 font-display text-2xl font-bold text-ink">Prepare sua próxima consulta</h2><p className="mt-2 text-sm leading-6 text-mute">Organiza o que já existe no prontuário para facilitar a conversa com o profissional de saúde. Não faz diagnóstico.</p></Card><Card><h3 className="font-display text-xl font-bold text-ink">Resumo de {activeProfile?.name ?? 'perfil'}</h3>{!activeProfile ? <p className="mt-3 text-sm text-mute">Escolha um perfil.</p> : <div className="mt-4 space-y-4"><div><p className="text-xs font-bold uppercase text-mute">Últimos sinais vitais</p>{consultantSummary.latestVitals.length === 0 ? <p className="text-sm text-mute">Nenhum sinal vital registrado.</p> : consultantSummary.latestVitals.map((event) => <p key={event.id} className="text-sm text-ink">• {event.title}</p>)}</div><div><p className="text-xs font-bold uppercase text-mute">Convênio</p><p className="text-sm text-ink">{consultantSummary.insurance?.title ?? 'Nenhum convênio cadastrado.'}</p></div><div><p className="text-xs font-bold uppercase text-mute">Histórico familiar</p><p className="whitespace-pre-wrap text-sm text-ink">{familyHistoryEvent?.payload?.text ? 'Histórico familiar disponível para consulta pelo consultor.' : 'Nenhum histórico familiar registrado.'}</p></div><div><p className="text-xs font-bold uppercase text-mute">Eventos recentes</p>{consultantSummary.recentClinical.length === 0 ? <p className="text-sm text-mute">Nenhum evento clínico registrado.</p> : consultantSummary.recentClinical.map((event) => <p key={event.id} className="text-sm text-ink">• {event.title}</p>)}</div></div>}</Card></div>;

  const activeView = profiles.length>1&&!profileChosen&&view!=='account'?profilesView:view === 'account' ? <AccountProfilePanel api={api} onProfessional={() => {go('welcome');onNavigate?.('professional')}} onSaved={async account => { setUser(account); await loadProfiles(api); }} onContinue={() => go('welcome')} /> : view === 'medications' ? (activeProfile ? <MedicationAgenda key={activeProfile.id} api={api} profile={activeProfile} /> : <Card>Escolha um perfil.</Card>) : view === 'welcome' ? welcomeView : view === 'profiles' ? profilesView : view === 'vitals' ? vitalsView : view === 'diary' ? diaryView : view === 'family-history' ? familyHistoryView : view === 'insurance' ? insuranceView : view === 'consultant' ? consultantView : recordView;

  return <div className="min-h-screen bg-paper"><div className="mx-auto max-w-6xl p-4 pb-[calc(2rem+env(safe-area-inset-bottom))] md:p-8"><header className="mb-4 flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-moss-700">MyDoctor</p><p className="mt-1 text-sm text-mute">Sua saúde e seus cuidados em um só lugar.</p></div>{user && <button type="button" onClick={() => setMenuOpen((value) => !value)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-ink shadow-sm" aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}><MenuIcon open={menuOpen} /></button>}</header>{user&&activeProfile&&<div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-moss-200 bg-moss-50 px-4 py-3"><span className="min-w-0 break-words text-sm font-semibold text-moss-800"><span>Perfil em uso: {activeProfile.name}</span><span className="block text-xs">Prontuário: {activeProfile.record}</span></span><button type="button" className="min-h-11 rounded-lg border border-line bg-white px-3 py-2 text-xs font-bold text-moss-800" onClick={()=>go('profiles')}>Trocar perfil</button></div>}{menu}{message && <div className="mb-4 break-words rounded-xl border border-moss-200 bg-moss-50 px-4 py-3 text-sm font-semibold text-moss-800">{message}</div>}{!user ? <div className="mx-auto max-w-md pt-4 sm:pt-10">{authPanel()}</div> : activeView}</div></div>;
}




