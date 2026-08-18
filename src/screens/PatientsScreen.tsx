import { useEffect, useMemo, useRef, useState } from 'react';
import type { BloodType, Contact, Patient, Relationship, SpecialCare } from '../lib/types';
import { BLOOD_TYPES, RELATIONSHIPS, RELATIONSHIP_META, SPECIAL_CARES, SPECIAL_CARE_META, SPECIALTIES } from '../lib/types';
import { newRecordNumber, uid } from '../lib/store';
import {
  ageFromBirth,
  daysSince,
  dHash,
  fileToDataURL,
  makeThumb,
  maskCPF,
  timeAgo,
} from '../lib/biometrics';
import {
  Avatar,
  BloodBadge,
  Btn,
  ConfirmDialog,
  EmptyState,
  Field,
  inputCls,
  Tag,
  useToast,
} from '../components/ui';
import { CameraCapture } from '../components/CameraCapture';
import { FingerprintPad } from '../components/FingerprintPad';
import {
  IconAlert,
  IconArchive,
  IconCamera,
  IconChart,
  IconFace,
  IconFingerprint,
  IconPencil,
  IconPhone,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconUpload,
  IconUsers,
  IconX,
} from '../components/icons';

/* ------------------------------- TagInput ------------------------------ */

function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const t = draft.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft('');
  };
  return (
    <div className={inputCls}>
      <div className="flex flex-wrap items-center gap-1.5 py-0.5">
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-md bg-pine-900/8 px-2 py-0.5 text-xs font-semibold text-ink">
            {v}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== v))}
              className="text-mute transition-colors hover:text-danger-600"
              aria-label={`Remover ${v}`}
            >
              <IconX size={11} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={commit}
          placeholder={value.length ? '' : placeholder}
          className="min-w-28 flex-1 border-none bg-transparent text-sm outline-none placeholder:text-mute/60"
        />
      </div>
    </div>
  );
}

/* --------------------------- formulário completo ------------------------ */

const emptyForm = (record: string) => ({
  name: '',
  birthDate: '',
  sex: 'O' as Patient['sex'],
  cpf: '',
  bloodType: '' as BloodType | '',
  allergies: [] as string[],
  intolerances: [] as string[],
  conditions: [] as string[],
  medications: [] as string[],
  specialCare: [] as SpecialCare[],
  emergencyNotes: '',
  contacts: [] as Contact[],
  primarySpecialty: '',
});

type FormState = ReturnType<typeof emptyForm> & {
  photo: string | null;
  photoHash: string | null;
  fingerprint: Patient['fingerprint'];
  missing: Patient['missing'];
};

function PatientForm({
  initial,
  patients,
  onSave,
  onCancel,
  initialPhoto,
  defaultOwnerId,
}: {
  initial: Patient | null;
  patients: Patient[];
  onSave: (p: Patient) => void;
  onCancel: () => void;
  initialPhoto?: string | null;
  defaultOwnerId: string | null;
}) {
  const toast = useToast();
  const [f, setF] = useState<FormState>(() =>
    initial
      ? {
          name: initial.name,
          birthDate: initial.birthDate,
          sex: initial.sex,
          cpf: initial.cpf,
          bloodType: initial.bloodType,
          allergies: [...initial.allergies],
          intolerances: [...initial.intolerances],
          conditions: [...initial.conditions],
          medications: [...initial.medications],
          specialCare: [...initial.specialCare],
          emergencyNotes: initial.emergencyNotes,
          contacts: [...initial.contacts],
          primarySpecialty: initial.primarySpecialty,
          photo: initial.photo,
          photoHash: initial.photoHash,
          fingerprint: initial.fingerprint,
          missing: initial.missing,
        }
      : { ...emptyForm(newRecordNumber(patients)), photo: null, photoHash: null, fingerprint: null, missing: { active: false, since: '', lastPlace: '', notes: '', history: [] } },
  );
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [camOpen, setCamOpen] = useState(false);
  const [fingerOpen, setFingerOpen] = useState(false);
  const [rehashing, setRehashing] = useState(false);
  const [showFinger, setShowFinger] = useState(false);

  // contato em edição
  const [cName, setCName] = useState('');
  const [cRel, setCRel] = useState<Relationship>('mae');
  const [cPhone, setCPhone] = useState('');
  const [cPrio, setCPrio] = useState<1 | 2 | 3>(2);
  const [cNote, setCNote] = useState('');
  const [cErr, setCErr] = useState('');

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  const applyPhoto = async (url: string) => {
    // definida antes do efeito abaixo
    setRehashing(true);
    try {
      const [hash, thumb] = await Promise.all([dHash(url), makeThumb(url)]);
      setF((s) => ({ ...s, photo: thumb, photoHash: hash }));
      toast('success', 'Retrato capturado e assinatura visual gerada.');
    } catch {
      toast('error', 'Não foi possível processar a imagem.');
    } finally {
      setRehashing(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      await applyPhoto(await fileToDataURL(file, 640, 0.85));
    } catch {
      toast('error', 'Arquivo de imagem inválido.');
    }
  };

  // foto vinda da tela de identificação ("cadastrar como nova pessoa")
  useEffect(() => {
    if (initialPhoto) void applyPhoto(initialPhoto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addContact = () => {
    if (!cName.trim() || cPhone.replace(/\D/g, '').length < 10) {
      setCErr('Informe nome e um telefone válido (com DDD).');
      return;
    }
    setCErr('');
    const contact: Contact = {
      id: uid(),
      name: cName.trim(),
      relationship: cRel,
      phone: cPhone.replace(/\D/g, ''),
      priority: cPrio,
      note: cNote.trim() || undefined,
    };
    set('contacts', [...f.contacts, contact].sort((a, b) => a.priority - b.priority));
    setCName('');
    setCPhone('');
    setCNote('');
    setCPrio(2);
    toast('success', `${contact.name} adicionado(a) à rede de avisos.`);
  };

  const submit = () => {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = 'O nome completo é obrigatório.';
    if (!f.birthDate) e.birthDate = 'Informe a data de nascimento.';
    setErrs(e);
    if (Object.keys(e).length > 0) return;
    const base: Patient = initial ?? {
      id: uid(),
      record: f.name ? '' : '',
      name: '',
      birthDate: '',
      sex: 'O',
      cpf: '',
      bloodType: '',
      allergies: [],
      intolerances: [],
      conditions: [],
      medications: [],
      specialCare: [],
      emergencyNotes: '',
      contacts: [],
      missing: { active: false, since: '', lastPlace: '', notes: '', history: [] },
      photo: null,
      photoHash: null,
      fingerprint: null,
      entries: [],
      createdAt: Date.now(),
      primarySpecialty: '',
      archived: false,
      ownerAccountId: null,
    };
    onSave({
      ...base,
      record: base.record || newRecordNumber(patients),
      name: f.name.trim(),
      birthDate: f.birthDate,
      sex: f.sex,
      cpf: f.cpf.trim(),
      bloodType: f.bloodType,
      primarySpecialty: f.primarySpecialty,
      ownerAccountId: initial ? initial.ownerAccountId : defaultOwnerId,
      allergies: f.allergies,
      intolerances: f.intolerances,
      conditions: f.conditions,
      medications: f.medications,
      specialCare: f.specialCare,
      emergencyNotes: f.emergencyNotes.trim(),
      contacts: f.contacts,
      missing: f.missing,
      photo: f.photo,
      photoHash: f.photoHash,
      fingerprint: f.fingerprint,
    });
  };

  const toggleCare = (c: SpecialCare) =>
    set('specialCare', f.specialCare.includes(c) ? f.specialCare.filter((x) => x !== c) : [...f.specialCare, c]);

  return (
    <div className="px-5 pb-5">
      <p className="mb-4 font-mono text-xs text-mute">
        {initial ? `editando ficha ${initial.record}` : 'nova ficha — número gerado automaticamente'}
      </p>

      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        {/* coluna biométrica */}
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-[13px] font-semibold text-ink">Retrato</p>
            <div className="relative">
              {f.photo ? (
                <img src={f.photo} alt="Retrato" className="aspect-[4/5] w-full rounded-xl border border-line object-cover" />
              ) : (
                <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-paper text-mute">
                  <IconFace size={26} />
                  <span className="text-xs">sem retrato</span>
                </div>
              )}
              {rehashing && (
                <div className="overlay-in absolute inset-0 flex items-center justify-center rounded-xl bg-pine-950/50 text-pine-100">
                  <span className="text-xs font-semibold">gerando assinatura…</span>
                </div>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Btn variant="outline" size="sm" onClick={() => setCamOpen(true)}>
                <IconCamera size={14} /> Câmera
              </Btn>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs font-semibold text-ink transition-all hover:border-moss-300 hover:bg-moss-50 active:scale-[0.97]">
                <IconUpload size={14} /> Arquivo
                <input type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
              </label>
              {f.photo && (
                <Btn variant="ghost" size="sm" onClick={() => setF((s) => ({ ...s, photo: null, photoHash: null }))}>
                  <IconTrash size={13} />
                </Btn>
              )}
            </div>
            {f.photoHash && <p className="mt-1.5 font-mono text-[10px] text-moss-700">assinatura: {f.photoHash}</p>}
          </div>

          <div>
            <p className="mb-1.5 text-[13px] font-semibold text-ink">Digital</p>
            {f.fingerprint ? (
              <div className="rounded-xl border border-moss-500/30 bg-moss-50 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-moss-700">
                  <IconFingerprint size={17} /> Cadastrada · qualidade {f.fingerprint.quality}%
                </p>
                <p className="mt-1 font-mono text-[10px] break-all text-mute">
                  {showFinger ? f.fingerprint.template : '•'.repeat(24)}
                </p>
                <div className="mt-2 flex gap-1.5">
                  <Btn variant="ghost" size="sm" onClick={() => setShowFinger((v) => !v)}>
                    {showFinger ? 'Ocultar' : 'Ver template'}
                  </Btn>
                  <Btn variant="ghost" size="sm" onClick={() => set('fingerprint', null)}>
                    <IconTrash size={13} /> Remover
                  </Btn>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border-2 border-dashed border-line bg-paper p-3 text-center">
                <p className="mb-2 text-xs text-mute">Sem digital cadastrada</p>
                <Btn variant="dark" size="sm" onClick={() => setFingerOpen(true)}>
                  <IconFingerprint size={14} /> Cadastrar digital
                </Btn>
              </div>
            )}
          </div>

          {initial?.missing.active && (
            <div className="rounded-xl border border-danger-500/40 bg-danger-100/60 p-3 text-[13px] text-danger-600">
              <p className="flex items-center gap-1.5 font-bold">
                <IconAlert size={14} /> Desaparecida há {daysSince(initial.missing.since)} dia(s)
              </p>
              <p className="mt-1 text-xs">Gerencie o status na tela Desaparecidos.</p>
            </div>
          )}
        </div>

        {/* coluna de dados */}
        <div className="space-y-5">
          <section>
            <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-[0.14em] text-mute">Dados básicos</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome completo" required>
                <input className={`${inputCls} ${errs.name ? 'border-danger-500' : ''}`} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Nome civil completo" />
                {errs.name && <p className="mt-1 text-xs font-medium text-danger-600">{errs.name}</p>}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nascimento" required>
                  <input type="date" className={`${inputCls} ${errs.birthDate ? 'border-danger-500' : ''}`} value={f.birthDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set('birthDate', e.target.value)} />
                  {errs.birthDate && <p className="mt-1 text-xs font-medium text-danger-600">{errs.birthDate}</p>}
                </Field>
                <Field label="Sexo">
                  <select className={inputCls} value={f.sex} onChange={(e) => set('sex', e.target.value as Patient['sex'])}>
                    <option value="F">Feminino</option>
                    <option value="M">Masculino</option>
                    <option value="O">Outro</option>
                  </select>
                </Field>
              </div>
              <Field label="CPF">
                <input className={inputCls} value={f.cpf} onChange={(e) => set('cpf', maskCPF(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" />
              </Field>
              <Field label="Tipo sanguíneo">
                <select className={inputCls} value={f.bloodType} onChange={(e) => set('bloodType', e.target.value as BloodType | '')}>
                  <option value="">Desconhecido</option>
                  {BLOOD_TYPES.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </Field>
              <Field label="Especialidade principal">
                <select className={inputCls} value={f.primarySpecialty} onChange={(e) => set('primarySpecialty', e.target.value)}>
                  <option value="">Sem preferência definida</option>
                  {SPECIALTIES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          <section className="border-t border-line pt-5">
            <h3 className="mb-1 font-display text-sm font-bold uppercase tracking-[0.14em] text-mute">Saúde & emergência</h3>
            <p className="mb-3 text-xs text-mute">Exibido no cartão de emergência quando a pessoa for identificada.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Alergias">
                <TagInput value={f.allergies} onChange={(v) => set('allergies', v)} placeholder="Enter para adicionar" />
              </Field>
              <Field label="Intolerâncias alimentares">
                <TagInput value={f.intolerances} onChange={(v) => set('intolerances', v)} placeholder="ex.: lactose, glúten" />
              </Field>
              <Field label="Condições crônicas">
                <TagInput value={f.conditions} onChange={(v) => set('conditions', v)} placeholder="ex.: hipertensão" />
              </Field>
              <Field label="Medicações em uso">
                <TagInput value={f.medications} onChange={(v) => set('medications', v)} placeholder="ex.: Losartana 50 mg 1x/dia" />
              </Field>
            </div>
            <div className="mt-4">
              <p className="mb-1.5 text-[13px] font-semibold text-ink">Cuidados especiais</p>
              <div className="flex flex-wrap gap-1.5">
                {SPECIAL_CARES.map((c) => {
                  const on = f.specialCare.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      title={SPECIAL_CARE_META[c].detail}
                      onClick={() => toggleCare(c)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 ${
                        on
                          ? 'border-pine-900 bg-pine-900 text-white shadow-sm'
                          : 'border-line bg-card text-mute hover:border-pine-200 hover:text-ink'
                      }`}
                    >
                      {SPECIAL_CARE_META[c].label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-4">
              <Field label="Instruções para quem encontrar" hint="como abordar, o que evitar, quem chamar">
                <textarea className={`${inputCls} min-h-20 resize-y`} value={f.emergencyNotes} onChange={(e) => set('emergencyNotes', e.target.value)} placeholder="ex.: pode estar confusa — fale com calma e não a deixe sozinha…" />
              </Field>
            </div>
          </section>

          <section className="border-t border-line pt-5">
            <h3 className="mb-1 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.14em] text-mute">
              <IconUsers size={15} /> Rede de avisos
            </h3>
            <p className="mb-3 text-xs text-mute">Quem deve ser avisado se esta pessoa for localizada — pais, filhos, curadores…</p>

            {f.contacts.length > 0 && (
              <ul className="mb-3 space-y-1.5">
                {[...f.contacts].sort((a, b) => a.priority - b.priority).map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white/70 px-3 py-2 text-sm">
                    <span className="font-bold text-ink">{c.name}</span>
                    <Tag tone={c.priority === 1 ? 'danger' : 'mute'}>{['1º', '2º', '3º'][c.priority - 1]} contato</Tag>
                    <span className="text-xs text-mute">
                      {RELATIONSHIP_META[c.relationship]}
                      {c.note ? ` · ${c.note}` : ''}
                    </span>
                    <span className="ml-auto flex items-center gap-2 font-mono text-xs text-mute">
                      <IconPhone size={13} /> {c.phone}
                      <button
                        type="button"
                        onClick={() => set('contacts', f.contacts.filter((x) => x.id !== c.id))}
                        className="rounded p-1 text-mute transition-colors hover:bg-danger-100 hover:text-danger-600"
                        aria-label={`Remover ${c.name}`}
                      >
                        <IconX size={14} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="rounded-xl border border-line bg-paper/70 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <input className={inputCls} value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Nome do contato" />
                <div className="grid grid-cols-2 gap-2">
                  <select className={inputCls} value={cRel} onChange={(e) => setCRel(e.target.value as Relationship)}>
                    {RELATIONSHIPS.map((r) => (
                      <option key={r} value={r}>{RELATIONSHIP_META[r]}</option>
                    ))}
                  </select>
                  <select className={inputCls} value={cPrio} onChange={(e) => setCPrio(Number(e.target.value) as 1 | 2 | 3)}>
                    <option value={1}>1º contato</option>
                    <option value={2}>2º contato</option>
                    <option value={3}>3º contato</option>
                  </select>
                </div>
                <input className={inputCls} value={cPhone} onChange={(e) => setCPhone(e.target.value.replace(/[^\d+() -]/g, ''))} placeholder="Telefone c/ DDD (ex.: 11 98888-0000)" inputMode="tel" />
                <input className={inputCls} value={cNote} onChange={(e) => setCNote(e.target.value)} placeholder="Observação (opcional)" />
              </div>
              {cErr && <p className="mt-2 text-xs font-medium text-danger-600">{cErr}</p>}
              <Btn variant="dark" size="sm" className="mt-3" onClick={addContact}>
                <IconPlus size={14} /> Adicionar contato
              </Btn>
            </div>
          </section>
        </div>
      </div>

      <div className="sticky bottom-0 mt-6 flex justify-end gap-2 border-t border-line bg-card/95 px-1 pt-3.5 backdrop-blur">
        <Btn variant="ghost" onClick={onCancel}>Cancelar</Btn>
        <Btn onClick={submit}>
          {initial ? 'Salvar alterações' : 'Cadastrar pessoa'}
        </Btn>
      </div>

      <CameraCapture open={camOpen} onClose={() => setCamOpen(false)} onCapture={(url) => void applyPhoto(url)} title="Retrato para identificação" />

      {fingerOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="overlay-in absolute inset-0 bg-pine-950/70" onClick={() => setFingerOpen(false)} />
          <div className="modal-in relative w-full max-w-sm rounded-xl border border-pine-700 bg-pine-900 p-5 text-pine-100 shadow-float">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="font-display text-lg font-bold text-white">Cadastro de digital</h3>
                <p className="text-xs text-pine-200/80">Sensor local — pressione e segure até completar.</p>
              </div>
              <button onClick={() => setFingerOpen(false)} className="rounded p-1 text-pine-200 hover:text-white" aria-label="Fechar">
                <IconX size={18} />
              </button>
            </div>
            <FingerprintPad
              onComplete={(template, quality) => {
                set('fingerprint', { template, quality, enrolledAt: Date.now() });
                window.setTimeout(() => {
                  setFingerOpen(false);
                  toast('success', 'Digital cadastrada na ficha.');
                }, 900);
              }}
              size="sm"
              autoReset={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- tela --------------------------------- */

export function PatientsScreen({
  patients,
  onAdd,
  onUpdate,
  onArchive,
  onRestore,
  onOpenRecord,
  ownerAccountId,
  onLoadDemo,
  seeded,
  pendingPhoto,
  consumePendingPhoto,
  pendingEditId,
  consumePendingEdit,
}: {
  patients: Patient[];
  onAdd: (p: Patient) => void;
  onUpdate: (p: Patient) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onOpenRecord: (id: string) => void;
  onLoadDemo: () => void;
  seeded: boolean;
  pendingPhoto: string | null;
  consumePendingPhoto: () => void;
  pendingEditId: string | null;
  consumePendingEdit: () => void;
  ownerAccountId?: string | null;
}) {
  const toast = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [toArchive, setToArchive] = useState<Patient | null>(null);
  const [formPhoto, setFormPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (pendingPhoto) {
      setFormPhoto(pendingPhoto);
      consumePendingPhoto();
      setEditing(null);
      setDrawerOpen(true);
    }
  }, [pendingPhoto, consumePendingPhoto]);

  useEffect(() => {
    if (pendingEditId) {
      consumePendingEdit();
      const p = patients.find((x) => x.id === pendingEditId);
      if (p) {
        setEditing(p);
        setDrawerOpen(true);
      }
    }
  }, [pendingEditId, consumePendingEdit, patients]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...patients]
      .filter((p) => showArchived || !p.archived)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    if (!q) return list;
    return list.filter((p) =>
      [p.name, p.cpf, p.record].join(' ').toLowerCase().includes(q),
    );
  }, [patients, query, showArchived]);

  const missingCount = patients.filter((p) => p.missing.active).length;

  return (
    <div>
      <header className="rise mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-moss-700">cadastro</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink">Pessoas & prontuários</h1>
          <p className="mt-1.5 max-w-xl text-sm text-mute">
            {patients.length} pessoa{patients.length === 1 ? '' : 's'} cadastrada{patients.length === 1 ? '' : 's'}
            {missingCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-danger-100 px-2 py-0.5 text-xs font-bold text-danger-600">
                <span className="blink-dot h-1.5 w-1.5 rounded-full bg-danger-500" />
                {missingCount} desaparecida{missingCount === 1 ? '' : 's'}
              </span>
            )}
          </p>
        </div>
        <Btn onClick={() => { setEditing(null); setDrawerOpen(true); }}>
          <IconPlus size={16} /> Nova pessoa
        </Btn>
      </header>

      {patients.length === 0 ? (
        <EmptyState
          icon={<IconUsers size={24} />}
          title="Nenhuma pessoa cadastrada"
          desc="Cadastre os dados básicos, retrato e digital de quem você quer proteger — incluindo a rede de contatos para avisos."
        >
          <div className="flex flex-wrap justify-center gap-2">
            <Btn onClick={() => setDrawerOpen(true)}>
              <IconPlus size={15} /> Cadastrar primeira pessoa
            </Btn>
            {!seeded && (
              <Btn variant="outline" onClick={onLoadDemo}>Carregar dados de exemplo</Btn>
            )}
          </div>
        </EmptyState>
      ) : (
        <>
          <div className="rise mb-4 flex flex-wrap items-center gap-2.5" style={{ animationDelay: '60ms' }}>
            <div className="relative max-w-sm flex-1">
              <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
              <input
                className={`${inputCls} pl-9`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nome, CPF ou ficha…"
              />
            </div>
            {patients.some((p) => p.archived) && (
              <button
                onClick={() => setShowArchived((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-all ${
                  showArchived
                    ? 'border-warn-500/50 bg-warn-100 text-warn-600'
                    : 'border-line bg-card text-mute hover:border-pine-200 hover:text-ink'
                }`}
              >
                <IconArchive size={14} />
                {showArchived ? 'Ocultar arquivados' : `Mostrar arquivados (${patients.filter((p) => p.archived).length})`}
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={<IconSearch size={22} />} title="Nada encontrado" desc={`Nenhum resultado para “${query}”.`}>
              <Btn variant="outline" onClick={() => setQuery('')}>Limpar busca</Btn>
            </EmptyState>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((p, i) => {
                const age = ageFromBirth(p.birthDate);
                return (
                  <li key={p.id} className="rise group relative" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
                    <div className={`flex h-full flex-col rounded-xl border bg-card p-4 shadow-lift transition-all duration-200 hover:-translate-y-1 hover:shadow-float ${p.missing.active ? 'border-danger-500/50' : 'border-line'}`}>
                      <div className="flex items-start gap-3.5">
                        <Avatar patient={p} size={56} />
                        <div className="min-w-0 flex-1">
                          <h2 className="truncate font-display text-[15px] font-bold text-ink">{p.name}</h2>
                          <p className="mt-0.5 text-xs text-mute">
                            {age !== null ? `${age} anos` : 'idade n/d'} · ficha <span className="font-mono">{p.record}</span>
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            <BloodBadge type={p.bloodType} size="sm" />
                            {p.missing.active && (
                              <span className="inline-flex items-center gap-1 rounded-md border border-danger-500/30 bg-danger-100 px-1.5 py-0.5 text-[10px] font-bold text-danger-600">
                                <span className="blink-dot h-1 w-1 rounded-full bg-danger-500" />
                                DESAPARECIDA · {daysSince(p.missing.since)}d
                              </span>
                            )}
                            {p.specialCare.includes('alzheimer') && <Tag tone="info">Alzheimer</Tag>}
                            {p.allergies.length > 0 && <Tag tone="danger">{p.allergies.length} alergia{p.allergies.length === 1 ? '' : 's'}</Tag>}
                            {p.primarySpecialty && <Tag tone="mute">{p.primarySpecialty}</Tag>}
                            {p.archived && <Tag tone="warn">arquivada</Tag>}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-[11px] text-mute">
                        <span className="inline-flex items-center gap-1">
                          <IconFace size={13} className={p.photo ? 'text-moss-600' : 'text-line'} />
                          retrato
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <IconFingerprint size={13} className={p.fingerprint ? 'text-moss-600' : 'text-line'} />
                          digital
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <IconUsers size={13} className={p.contacts.length > 0 ? 'text-moss-600' : 'text-line'} />
                          {p.contacts.length} contato{p.contacts.length === 1 ? '' : 's'}
                        </span>
                        <span className="ml-auto font-mono">{timeAgo(p.createdAt)}</span>
                      </div>

                      <div className="mt-3 flex gap-1.5">
                        <Btn variant="dark" size="sm" className="flex-1" onClick={() => onOpenRecord(p.id)}>
                          <IconChart size={14} /> Prontuário
                        </Btn>
                        <Btn variant="outline" size="sm" onClick={() => { setEditing(p); setDrawerOpen(true); }} aria-label={`Editar ${p.name}`}>
                          <IconPencil size={14} />
                        </Btn>
                        {p.archived ? (
                          <Btn
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              onRestore(p.id);
                              toast('success', `${p.name} restaurada — a ficha voltou a ficar acessível.`);
                            }}
                          >
                            <IconRefresh size={14} /> Restaurar
                          </Btn>
                        ) : (
                          <Btn variant="ghost" size="sm" onClick={() => setToArchive(p)} aria-label={`Arquivar ${p.name}`}>
                            <IconArchive size={14} />
                          </Btn>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {/* drawer de cadastro/edição */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[60]">
          <div className="overlay-in absolute inset-0 bg-pine-950/55 backdrop-blur-[2px]" onClick={() => setDrawerOpen(false)} />
          <div className="drawer-in absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col overflow-auto border-l border-line bg-card shadow-float">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-card/95 px-5 py-4 backdrop-blur">
              <h2 className="font-display text-lg font-bold text-ink">
                {editing ? `Editar — ${editing.name}` : 'Nova pessoa'}
              </h2>
              <button onClick={() => setDrawerOpen(false)} className="rounded-md p-1.5 text-mute transition-colors hover:bg-pine-900/6 hover:text-ink" aria-label="Fechar">
                <IconX size={18} />
              </button>
            </div>
            <PatientForm
              initial={editing}
              patients={patients}
              initialPhoto={formPhoto}
              defaultOwnerId={ownerAccountId ?? null}
              onCancel={() => {
                setDrawerOpen(false);
                setFormPhoto(null);
              }}
              onSave={(p) => {
                if (editing) {
                  onUpdate(p);
                  toast('success', `Ficha de ${p.name} atualizada.`);
                } else {
                  onAdd(p);
                  toast('success', `${p.name} cadastrada — ficha ${p.record}.`);
                }
                setDrawerOpen(false);
              }}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={toArchive !== null}
        onClose={() => setToArchive(null)}
        onConfirm={() => {
          if (toArchive) {
            onArchive(toArchive.id);
            toast('info', `${toArchive.name} arquivada. Os dados foram preservados — nada é excluído.`);
          }
        }}
        title="Arquivar prontuário"
        tone="default"
        confirmLabel="Arquivar"
        message={
          <p>
            O prontuário de <strong className="text-ink">{toArchive?.name}</strong> sairá das listas e da
            identificação, mas <strong className="text-ink">nenhum dado será excluído</strong>. Você poderá
            restaurá-lo quando quiser em “Mostrar arquivados”.
          </p>
        }
      />
    </div>
  );
}
