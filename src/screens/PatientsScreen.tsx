import { useEffect, useMemo, useState } from 'react';
import type { BloodType, Fingerprint, Patient } from '../lib/types';
import { BLOOD_TYPES } from '../lib/types';
import { ageFromBirth, maskCPF, timeAgo } from '../lib/biometrics';
import { nextRecordNumber, uid } from '../lib/store';
import {
  Avatar,
  BloodBadge,
  Btn,
  ConfirmDialog,
  Drawer,
  EmptyState,
  Field,
  inputCls,
  Tag,
  useToast,
} from '../components/ui';
import { CameraCapture } from '../components/CameraCapture';
import { FingerprintPad } from '../components/FingerprintPad';
import {
  IconCamera,
  IconChart,
  IconChevronRight,
  IconDatabase,
  IconFace,
  IconFingerprint,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUpload,
  IconUsers,
  IconX,
} from '../components/icons';
import { fileToDataURL } from '../lib/biometrics';

/* ------------------------- formulário do paciente ------------------------ */

function PatientForm({
  open,
  initial,
  defaultPhoto,
  patients,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: Patient | null;
  defaultPhoto: string | null;
  patients: Patient[];
  onClose: () => void;
  onSave: (p: Patient) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [sex, setSex] = useState<'F' | 'M' | 'O'>('F');
  const [cpf, setCpf] = useState('');
  const [bloodType, setBloodType] = useState<BloodType | ''>('');
  const [allergies, setAllergies] = useState('');
  const [conditions, setConditions] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState<Fingerprint | null>(null);
  const [showPad, setShowPad] = useState(false);
  const [camOpen, setCamOpen] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; birthDate?: string }>({});

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setBirthDate(initial?.birthDate ?? '');
    setSex(initial?.sex ?? 'F');
    setCpf(initial?.cpf ?? '');
    setBloodType(initial?.bloodType ?? '');
    setAllergies(initial?.allergies.join(', ') ?? '');
    setConditions(initial?.conditions.join(', ') ?? '');
    setPhoto(initial?.photo ?? defaultPhoto);
    setFingerprint(initial?.fingerprint ?? null);
    setShowPad(false);
    setCamOpen(false);
    setErrors({});
  }, [open, initial, defaultPhoto]);

  const save = () => {
    const errs: typeof errors = {};
    if (!name.trim()) errs.name = 'Informe o nome completo.';
    if (!birthDate) errs.birthDate = 'Informe a data de nascimento.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    const split = (s: string) =>
      s.split(',').map((t) => t.trim()).filter(Boolean);
    const photoChanged = photo !== (initial?.photo ?? null);
    onSave({
      id: initial?.id ?? uid(),
      record: initial?.record ?? nextRecordNumber(patients),
      name: name.trim(),
      birthDate,
      sex,
      cpf,
      bloodType,
      allergies: split(allergies),
      conditions: split(conditions),
      photo,
      photoHash: photoChanged ? null : (initial?.photoHash ?? null),
      fingerprint,
      entries: initial?.entries ?? [],
      createdAt: initial?.createdAt ?? Date.now(),
    });
    onClose();
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPhoto(await fileToDataURL(file, 560, 0.85));
      toast('success', 'Retrato carregado.');
    } catch {
      toast('error', 'Não foi possível ler este arquivo.');
    }
  };

  if (!open) return null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={initial ? 'Editar paciente' : 'Novo paciente'}
      subtitle={
        initial
          ? `Ficha ${initial.record} — alterações ficam neste dispositivo.`
          : `Ficha nº ${nextRecordNumber(patients)} será atribuída automaticamente.`
      }
    >
      <div className="space-y-5">
        {/* retrato */}
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-ink">Retrato para identificação</p>
          <div className="flex items-center gap-4">
            {photo ? (
              <img src={photo} alt="Retrato do paciente" className="h-24 w-24 rounded-xl object-cover ring-2 ring-line" />
            ) : (
              <span className="flex h-24 w-24 items-center justify-center rounded-xl border-2 border-dashed border-line bg-paper text-mute">
                <IconFace size={28} />
              </span>
            )}
            <div className="flex flex-wrap gap-2">
              <Btn variant="outline" size="sm" onClick={() => setCamOpen(true)}>
                <IconCamera size={14} /> Capturar
              </Btn>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs font-semibold text-ink transition-all hover:border-moss-300 hover:bg-moss-50 active:scale-[0.97]">
                <IconUpload size={14} /> Enviar arquivo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    void onUpload(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
              {photo && (
                <Btn variant="ghost" size="sm" onClick={() => setPhoto(null)}>
                  <IconX size={14} /> Remover
                </Btn>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-mute">
            Com retrato, o paciente pode ser identificado pela Central de identificação.
          </p>
        </div>

        <Field label="Nome completo" required>
          <input
            className={`${inputCls} ${errors.name ? 'border-danger-500' : ''}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex.: Maria Clara dos Santos"
          />
          {errors.name && <p className="mt-1 text-xs font-medium text-danger-600">{errors.name}</p>}
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Nascimento" required>
            <input
              type="date"
              className={`${inputCls} ${errors.birthDate ? 'border-danger-500' : ''}`}
              value={birthDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setBirthDate(e.target.value)}
            />
            {errors.birthDate && <p className="mt-1 text-xs font-medium text-danger-600">{errors.birthDate}</p>}
          </Field>
          <Field label="Sexo">
            <select className={inputCls} value={sex} onChange={(e) => setSex(e.target.value as 'F' | 'M' | 'O')}>
              <option value="F">Feminino</option>
              <option value="M">Masculino</option>
              <option value="O">Outro</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="CPF" hint="opcional">
            <input
              className={`${inputCls} font-mono`}
              value={cpf}
              onChange={(e) => setCpf(maskCPF(e.target.value))}
              placeholder="000.000.000-00"
              inputMode="numeric"
            />
          </Field>
          <Field label="Tipo sanguíneo" hint="opcional">
            <select className={inputCls} value={bloodType} onChange={(e) => setBloodType(e.target.value as BloodType | '')}>
              <option value="">Não informado</option>
              {BLOOD_TYPES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Alergias" hint="separe por vírgula">
          <input
            className={inputCls}
            value={allergies}
            onChange={(e) => setAllergies(e.target.value)}
            placeholder="ex.: Dipirona, Penicilina"
          />
        </Field>

        <Field label="Condições existentes" hint="separe por vírgula">
          <input
            className={inputCls}
            value={conditions}
            onChange={(e) => setConditions(e.target.value)}
            placeholder="ex.: Hipertensão, Diabetes tipo 2"
          />
        </Field>

        {/* digital */}
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-ink">Digital para identificação</p>
          {fingerprint ? (
            <div className="flex items-center gap-3 rounded-lg border border-moss-500/25 bg-moss-50 px-3.5 py-3">
              <span className="rounded-lg bg-moss-100 p-2 text-moss-600">
                <IconFingerprint size={18} />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-moss-800">Template cadastrado</p>
                <p className="font-mono text-[11px] text-mute">
                  qualidade {fingerprint.quality}% · {timeAgo(fingerprint.enrolledAt)}
                </p>
              </div>
              <Btn variant="ghost" size="sm" onClick={() => setFingerprint(null)}>
                <IconX size={14} /> Remover
              </Btn>
            </div>
          ) : (
            <div>
              {!showPad ? (
                <Btn variant="outline" onClick={() => setShowPad(true)}>
                  <IconFingerprint size={16} /> Cadastrar digital
                </Btn>
              ) : (
                <div className="rounded-xl border border-line bg-paper/60 p-3">
                  <FingerprintPad
                    size="sm"
                    autoReset={false}
                    hint="Segure o sensor para gerar o template local"
                    onComplete={(template, quality) => {
                      setFingerprint({ template, enrolledAt: Date.now(), quality });
                      setShowPad(false);
                      toast('success', `Digital cadastrada com qualidade ${quality}%.`);
                    }}
                  />
                </div>
              )}
              <p className="mt-2 text-xs text-mute">
                Simulação local — o template é um código aleatório vinculado à leitura, nunca a imagem do dedo.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-7 flex justify-end gap-2 border-t border-line pt-4">
        <Btn variant="outline" onClick={onClose}>
          Cancelar
        </Btn>
        <Btn onClick={save}>
          <IconPlus size={15} /> {initial ? 'Salvar alterações' : 'Cadastrar paciente'}
        </Btn>
      </div>

      <CameraCapture
        open={camOpen}
        onClose={() => setCamOpen(false)}
        onCapture={(url) => {
          setPhoto(url);
          toast('success', 'Retrato capturado.');
        }}
        title="Capturar retrato do paciente"
      />
    </Drawer>
  );
}

/* ------------------------------ tela principal --------------------------- */

export function PatientsScreen({
  patients,
  onAdd,
  onUpdate,
  onDelete,
  onOpenRecord,
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
  onDelete: (id: string) => void;
  onOpenRecord: (id: string) => void;
  onLoadDemo: () => void;
  seeded: boolean;
  pendingPhoto: string | null;
  consumePendingPhoto: () => void;
  pendingEditId: string | null;
  consumePendingEdit: () => void;
}) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [bloodFilter, setBloodFilter] = useState<string>('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [defaultPhoto, setDefaultPhoto] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Patient | null>(null);

  useEffect(() => {
    if (pendingPhoto) {
      setEditing(null);
      setDefaultPhoto(pendingPhoto);
      setDrawerOpen(true);
      consumePendingPhoto();
    }
  }, [pendingPhoto, consumePendingPhoto]);

  useEffect(() => {
    if (pendingEditId) {
      const p = patients.find((x) => x.id === pendingEditId) ?? null;
      setEditing(p);
      setDefaultPhoto(null);
      setDrawerOpen(true);
      consumePendingEdit();
    }
  }, [pendingEditId, patients, consumePendingEdit]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return patients
      .filter((p) => (bloodFilter === 'all' ? true : p.bloodType === bloodFilter))
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.record.toLowerCase().includes(q) ||
          p.cpf.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§'),
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [patients, query, bloodFilter]);

  const openNew = () => {
    setEditing(null);
    setDefaultPhoto(null);
    setDrawerOpen(true);
  };

  return (
    <div>
      <header className="rise mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-moss-600">
            Cadastro · base local
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">Pacientes</h1>
          <p className="mt-2 text-sm text-mute">
            {patients.length} pessoa{patients.length === 1 ? '' : 's'} ·{' '}
            {patients.filter((p) => p.photo).length} com retrato ·{' '}
            {patients.filter((p) => p.fingerprint).length} com digital
          </p>
        </div>
        <Btn size="lg" onClick={openNew}>
          <IconPlus size={17} /> Novo paciente
        </Btn>
      </header>

      {patients.length === 0 ? (
        <div className="rise" style={{ animationDelay: '80ms' }}>
          <EmptyState
            icon={<IconUsers size={24} />}
            title="Nenhum paciente cadastrado"
            desc="Cada paciente recebe uma ficha com número de prontuário, retrato opcional para identificação por imagem e digital simulada."
          >
            <Btn onClick={openNew}>
              <IconPlus size={16} /> Cadastrar primeiro paciente
            </Btn>
            {!seeded && (
              <Btn variant="outline" onClick={onLoadDemo}>
                <IconDatabase size={16} /> Carregar dados de exemplo
              </Btn>
            )}
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="rise mb-4 flex flex-wrap items-center gap-2" style={{ animationDelay: '60ms' }}>
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
              <input
                className={`${inputCls} pl-9`}
                placeholder="Buscar por nome, ficha ou CPF…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select
              className={`${inputCls} w-auto`}
              value={bloodFilter}
              onChange={(e) => setBloodFilter(e.target.value)}
              aria-label="Filtrar por tipo sanguíneo"
            >
              <option value="all">Todos os tipos</option>
              {BLOOD_TYPES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <span className="ml-auto font-mono text-xs text-mute">
              {filtered.length}/{patients.length}
            </span>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<IconSearch size={22} />}
              title="Nada encontrado"
              desc="Nenhum paciente corresponde à busca ou ao filtro atual."
            >
              <Btn
                variant="outline"
                onClick={() => {
                  setQuery('');
                  setBloodFilter('all');
                }}
              >
                Limpar filtros
              </Btn>
            </EmptyState>
          ) : (
            <ul className="space-y-2.5">
              {filtered.map((p, i) => {
                const age = ageFromBirth(p.birthDate);
                return (
                  <li
                    key={p.id}
                    className="rise group flex items-center gap-3.5 rounded-xl border border-line bg-card p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-moss-300/70 hover:shadow-lift"
                    style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                  >
                    <Avatar patient={p} size={50} />
                    <button onClick={() => onOpenRecord(p.id)} className="min-w-0 flex-1 text-left">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="truncate font-display text-[17px] font-bold text-ink transition-colors group-hover:text-moss-700">
                          {p.name}
                        </span>
                        {p.bloodType && <BloodBadge type={p.bloodType} size="sm" />}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-mute">
                        <span className="font-mono">{p.record}</span>
                        {age !== null && (
                          <span>
                            {age} ano{age === 1 ? '' : 's'}
                          </span>
                        )}
                        {p.photo && <Tag tone="moss">retrato</Tag>}
                        {p.fingerprint && <Tag tone="info">digital {p.fingerprint.quality}%</Tag>}
                        {p.allergies.length > 0 && <Tag tone="warn">{p.allergies.length} alergia{p.allergies.length === 1 ? '' : 's'}</Tag>}
                      </div>
                    </button>
                    <span className="hidden items-center gap-1.5 font-mono text-xs text-mute sm:flex" title="Registros no prontuário">
                      <IconChart size={14} />
                      {p.entries.length}
                    </span>
                    <div className="flex items-center gap-1 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                      <button
                        onClick={() => {
                          setEditing(p);
                          setDefaultPhoto(null);
                          setDrawerOpen(true);
                        }}
                        className="rounded-lg p-2 text-mute transition-colors hover:bg-moss-50 hover:text-moss-700"
                        aria-label={`Editar ${p.name}`}
                      >
                        <IconPencil size={17} />
                      </button>
                      <button
                        onClick={() => setToDelete(p)}
                        className="rounded-lg p-2 text-mute transition-colors hover:bg-danger-100 hover:text-danger-600"
                        aria-label={`Excluir ${p.name}`}
                      >
                        <IconTrash size={17} />
                      </button>
                      <button
                        onClick={() => onOpenRecord(p.id)}
                        className="rounded-lg p-2 text-mute transition-colors hover:bg-pine-900/6 hover:text-ink"
                        aria-label={`Abrir prontuário de ${p.name}`}
                      >
                        <IconChevronRight size={18} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <PatientForm
        open={drawerOpen}
        initial={editing}
        defaultPhoto={defaultPhoto}
        patients={patients}
        onClose={() => setDrawerOpen(false)}
        onSave={(p) => {
          if (editing) {
            onUpdate(p);
            toast('success', `Ficha de ${p.name} atualizada.`);
          } else {
            onAdd(p);
            toast('success', `${p.name} cadastrado — ficha ${p.record}.`);
          }
        }}
      />

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) {
            onDelete(toDelete.id);
            toast('info', `Paciente ${toDelete.name} removido da base local.`);
          }
        }}
        title="Excluir paciente"
        confirmLabel="Excluir definitivamente"
        message={
          <p>
            A ficha <strong className="text-ink">{toDelete?.record}</strong> de{' '}
            <strong className="text-ink">{toDelete?.name}</strong> será removida junto com{' '}
            {toDelete?.entries.length} registro{toDelete?.entries.length === 1 ? '' : 's'} clínicos. Essa ação não
            pode ser desfeita.
          </p>
        }
      />

    </div>
  );
}
