import { useEffect, useState } from 'react';
import {
  type MyDoctorV1Api,
  type ProfessionalProfileV1,
  type UpsertProfessionalProfileInput,
} from './lib/api-v1';

const COUNCILS: Array<[UpsertProfessionalProfileInput['council'], string]> = [
  ['CRM', 'CRM — Medicina'],
  ['CREFITO', 'CREFITO — Fisioterapia/Terapia Ocupacional'],
  ['CRN', 'CRN — Nutrição'],
  ['COREN', 'COREN — Enfermagem'],
  ['CRO', 'CRO — Odontologia'],
  ['OUTROS', 'Outro conselho profissional'],
];

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

function fieldClass() {
  return 'mt-1 block w-full min-w-0 max-w-full box-border rounded-xl border border-line bg-white px-3 py-3 text-sm outline-none focus:border-moss-500';
}

function statusLabel(status?: string) {
  switch (status) {
    case 'verified': return 'Profissional verificado';
    case 'pending': return 'Em validação';
    case 'rejected': return 'Validação recusada';
    case 'suspended': return 'Validação suspensa';
    default: return 'Ainda não validado';
  }
}

export default function ProfessionalProfilePanel({ api }: { api: MyDoctorV1Api }) {
  const [profile, setProfile] = useState<ProfessionalProfileV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [profession, setProfession] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [council, setCouncil] = useState<UpsertProfessionalProfileInput['council']>('CRM');
  const [registration, setRegistration] = useState('');
  const [region, setRegion] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const current = await api.getProfessionalProfile();
      setProfile(current);
      if (current) {
        setProfession(current.profession ?? '');
        setSpecialty(current.specialty ?? '');
        const first = current.registrations?.[0];
        if (first) {
          const normalized = COUNCILS.some(([value]) => value === first.council) ? first.council : 'OUTROS';
          setCouncil(normalized as UpsertProfessionalProfileInput['council']);
          setRegistration(first.registration ?? '');
          setRegion(first.region ?? '');
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível carregar o perfil profissional.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!profession.trim()) return setMessage('Informe sua profissão.');
    if (!registration.trim()) return setMessage('Informe o número do registro profissional.');
    if (council !== 'OUTROS' && !region) return setMessage('Informe a UF do registro profissional.');

    setSaving(true);
    setMessage('');
    try {
      const saved = await api.saveProfessionalProfile({
        profession: profession.trim(),
        specialty: specialty.trim() || undefined,
        council,
        registration: registration.trim(),
        region: region || undefined,
      });
      setProfile(saved);
      setMessage('Dados profissionais enviados para validação.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar o perfil profissional.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <section className="rounded-2xl border border-line bg-card p-5 shadow-lift"><p className="text-sm text-mute">Carregando perfil profissional...</p></section>;
  }

  return <div className="space-y-5">
    <section className="rounded-2xl border border-line bg-card p-5 shadow-lift">
      <p className="text-xs font-bold uppercase tracking-wide text-moss-700">Perfil profissional</p>
      <h2 className="mt-1 font-display text-2xl font-bold text-ink">Usar o MyDoctor como profissional de saúde</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-mute">Sua conta continua sendo a mesma conta de paciente. A função Clinicar só será liberada depois da confirmação da sua identidade e do registro no conselho profissional.</p>
      <div className="mt-4 rounded-xl border border-line bg-white p-4">
        <strong className="text-sm text-ink">Status: {statusLabel(profile?.verificationStatus)}</strong>
        {profile?.verificationStatus === 'verified' ? <p className="mt-1 text-sm text-moss-700">Seu acesso profissional está habilitado.</p> : <p className="mt-1 text-sm text-mute">Enquanto a validação estiver pendente, você continua usando normalmente seu prontuário pessoal, mas não pode acessar prontuários de terceiros como profissional.</p>}
      </div>
    </section>

    <section className="rounded-2xl border border-line bg-card p-5 shadow-lift">
      <h3 className="font-display text-xl font-bold text-ink">Dados para validação</h3>
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
        <label className="min-w-0 text-xs font-bold text-mute">Profissão
          <input value={profession} onChange={(e) => setProfession(e.target.value)} placeholder="Ex.: Médico, Fisioterapeuta, Nutricionista" className={fieldClass()} />
        </label>
        <label className="min-w-0 text-xs font-bold text-mute">Especialidade
          <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Ex.: Cardiologia" className={fieldClass()} />
        </label>
        <label className="min-w-0 text-xs font-bold text-mute">Conselho profissional
          <select value={council} onChange={(e) => setCouncil(e.target.value as UpsertProfessionalProfileInput['council'])} className={fieldClass()}>
            {COUNCILS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="min-w-0 text-xs font-bold text-mute">Número do registro
          <input value={registration} onChange={(e) => setRegistration(e.target.value)} className={fieldClass()} />
        </label>
        <label className="min-w-0 text-xs font-bold text-mute">UF do registro
          <select value={region} onChange={(e) => setRegion(e.target.value)} className={fieldClass()}>
            <option value="">Selecione</option>
            {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
          </select>
        </label>
        <div className="min-w-0 md:col-span-2">
          <p className="text-xs leading-5 text-mute">Na próxima etapa desta jornada serão adicionados os documentos de comprovação de identidade e do conselho profissional. O envio destes dados agora não equivale à aprovação automática.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <button type="button" disabled={saving} onClick={() => void save()} className="rounded-xl bg-pine-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Salvando...' : profile ? 'Atualizar dados profissionais' : 'Enviar para validação'}</button>
          {message && <span className="text-sm text-mute">{message}</span>}
        </div>
      </div>
    </section>
  </div>;
}
