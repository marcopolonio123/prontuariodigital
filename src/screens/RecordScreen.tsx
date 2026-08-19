import { useMemo, useState, type ReactNode } from 'react';
import type { Attachment, ClinicalEntry, ClinicalSection, EntryType, Patient } from '../lib/types';
import { ENTRY_META, ENTRY_TYPES, SPECIAL_CARE_META, SPECIALTIES } from '../lib/types';
import { ageFromBirth, formatDateBR, formatDateTime } from '../lib/biometrics';
import { uid } from '../lib/store';
import { downloadAttachment, fileToAttachment, formatSizeKb } from '../lib/attachments';
import { Avatar, BloodBadge, Btn, ConfirmDialog, EmptyState, Field, inputCls, MicButton, Modal, Tag, useToast } from '../components/ui';
import {
  IconActivity, IconAlert, IconArchive, IconCalendar, IconChart, IconChevronDown, IconChevronLeft,
  IconDownload, IconEye, IconFace, IconFileText, IconFingerprint, IconFlask, IconInfo, IconPaperclip,
  IconPencil, IconPill, IconPlus, IconPrescription, IconRefresh, IconShare, IconSpinner, IconStetho,
  IconSyringe, IconTrash, IconX,
} from '../components/icons';

const ENTRY_VISUAL: Record<EntryType, { icon: ReactNode; chip: string; node: string }> = {
  consulta: { icon: <IconStetho size={15} />, chip: 'bg-moss-100 text-moss-700', node: 'bg-moss-500' },
  exame: { icon: <IconFlask size={15} />, chip: 'bg-info-100 text-info-600', node: 'bg-info-500' },
  medicacao: { icon: <IconPill size={15} />, chip: 'bg-pine-100 text-pine-700', node: 'bg-pine-600' },
  vacina: { icon: <IconSyringe size={15} />, chip: 'bg-warn-100 text-warn-600', node: 'bg-warn-500' },
  procedimento: { icon: <IconActivity size={15} />, chip: 'bg-danger-100 text-danger-600', node: 'bg-danger-500' },
  observacao: { icon: <IconFileText size={15} />, chip: 'bg-pine-900/6 text-mute', node: 'bg-mute' },
};

/* ------------------------- anexos: lista & lightbox ---------------------- */

function AttachmentStrip({
  items,
  onView,
  onRemove,
}: {
  items: Attachment[];
  onView: (a: Attachment) => void;
  onRemove?: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((a) =>
        a.kind === 'image' ? (
          <li key={a.id} className="group relative">
            <button
              onClick={() => onView(a)}
              className="block h-16 w-16 overflow-hidden rounded-lg border border-line transition-all hover:-translate-y-0.5 hover:border-moss-400 hover:shadow-lift active:scale-95"
              aria-label={`Ver anexo ${a.name}`}
            >
              <img src={a.dataUrl} alt={a.name} className="h-full w-full object-cover" />
            </button>
            <span className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-lg bg-pine-950/70 px-1 py-0.5 text-center font-mono text-[9px] text-pine-100 opacity-0 transition-opacity group-hover:opacity-100">
              {formatSizeKb(a.sizeKb)}
            </span>
            {onRemove && (
              <button
                onClick={() => onRemove(a.id)}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-danger-500 p-0.5 text-white shadow-sm transition-transform hover:scale-110"
                aria-label={`Remover ${a.name}`}
              >
                <IconX size={11} />
              </button>
            )}
          </li>
        ) : (
          <li key={a.id}>
            <button
              onClick={() => onView(a)}
              className="flex h-16 items-center gap-2 rounded-lg border border-line bg-white/70 px-3 transition-all hover:-translate-y-0.5 hover:border-moss-400 hover:shadow-lift active:scale-95"
            >
              <span className="rounded-md bg-danger-100 p-1.5 text-danger-600">
                <IconFileText size={15} />
              </span>
              <span className="max-w-32 text-left">
                <span className="block truncate text-xs font-bold text-ink">{a.name}</span>
                <span className="block font-mono text-[10px] text-mute">PDF · {formatSizeKb(a.sizeKb)}</span>
              </span>
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

function AttachmentModal({ att, onClose }: { att: Attachment | null; onClose: () => void }) {
  if (!att) return null;
  return (
    <Modal open onClose={onClose} title={att.name} subtitle={`${att.kind === 'image' ? 'Imagem' : 'PDF'} · ${formatSizeKb(att.sizeKb)} · anexado por ${att.addedBy || 'conta local'} em ${formatDateTime(att.addedAt)}`} width="max-w-2xl">
      {att.kind === 'image' ? (
        <img src={att.dataUrl} alt={att.name} className="max-h-[62vh] w-full rounded-lg border border-line object-contain bg-pine-950/90" />
      ) : (
        <iframe title={att.name} src={att.dataUrl} className="h-[62vh] w-full rounded-lg border border-line bg-white" />
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Btn variant="outline" onClick={onClose}>Fechar</Btn>
        <Btn onClick={() => downloadAttachment(att)}>
          <IconDownload size={15} /> Baixar arquivo
        </Btn>
      </div>
    </Modal>
  );
}

/* --------------------- seção prescritiva do formulário ------------------- */

function SectionEditor({
  icon,
  label,
  hint,
  placeholder,
  section,
  open,
  onToggle,
  onChange,
  onView,
  byName,
  accent,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  placeholder: string;
  section: ClinicalSection;
  open: boolean;
  onToggle: () => void;
  onChange: (s: ClinicalSection) => void;
  onView: (a: Attachment) => void;
  byName: string;
  accent: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const hasContent = section.text.trim().length > 0 || section.attachments.length > 0;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const a = await fileToAttachment(file, byName);
      onChange({ ...section, attachments: [...section.attachments, a] });
      toast('success', `Anexo "${a.name}" adicionado.`);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Não foi possível anexar o arquivo.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center gap-2.5 rounded-lg border-2 border-dashed border-line bg-card px-3.5 py-2.5 text-left text-sm font-semibold transition-all hover:border-moss-300 hover:bg-moss-50 ${hasContent ? 'border-moss-400/60' : ''}`}
      >
        <span className={`rounded-md p-1.5 ${accent}`}>{icon}</span>
        {label}
        <span className="text-xs font-normal text-mute">— {hint}</span>
        {hasContent && <Tag tone="moss">preenchida</Tag>}
        <IconPlus size={15} className="ml-auto shrink-0 text-moss-600" />
      </button>
    );
  }

  return (
    <div className={`rounded-lg border bg-card p-3.5 ${hasContent ? 'border-moss-500/40' : 'border-line'}`}>
      <div className="flex items-center gap-2">
        <span className={`rounded-md p-1.5 ${accent}`}>{icon}</span>
        <p className="text-sm font-bold text-ink">{label}</p>
        <button type="button" onClick={onToggle} className="ml-auto rounded p-1 text-mute transition-colors hover:text-ink" aria-label="Recolher seção">
          <IconChevronDown size={15} />
        </button>
      </div>
      <textarea
        className={`${inputCls} mt-2.5 min-h-20 resize-y`}
        value={section.text}
        onChange={(e) => onChange({ ...section, text: e.target.value })}
        placeholder={placeholder}
      />
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-paper px-3 py-1.5 text-xs font-bold text-ink transition-all hover:border-moss-300 hover:bg-moss-50 active:scale-95">
          {busy ? <IconSpinner size={13} /> : <IconPaperclip size={13} />}
          {busy ? 'Processando…' : 'Anexar receita/exame (foto ou PDF)'}
          <input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        <MicButton onAppend={(t) => onChange({ ...section, text: (section.text ? section.text + ' ' : '') + t })} />
        <span className="text-[11px] text-mute">digite, dite por voz ou anexe · máx. 1,5 MB por arquivo</span>
        {hasContent && (
          <button
            type="button"
            onClick={() => onChange({ text: '', attachments: [] })}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-mute transition-colors hover:bg-danger-100 hover:text-danger-600"
          >
            <IconTrash size={12} /> Limpar seção
          </button>
        )}
      </div>
      {section.attachments.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <AttachmentStrip
            items={section.attachments}
            onView={onView}
            onRemove={(id) => onChange({ ...section, attachments: section.attachments.filter((x) => x.id !== id) })}
          />
        </div>
      )}
    </div>
  );
}

/* -------------------------------- formulário ----------------------------- */

const emptySection = (): ClinicalSection => ({ text: '', attachments: [] });

function NewEntryForm({
  defaultSpecialty,
  byName,
  onAdd,
  onCancel,
}: {
  defaultSpecialty: string;
  byName: string;
  onAdd: (e: ClinicalEntry) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<EntryType>('consulta');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [specialty, setSpecialty] = useState(defaultSpecialty);
  const [notes, setNotes] = useState('');
  const [rx, setRx] = useState<ClinicalSection>(emptySection());
  const [rxOpen, setRxOpen] = useState(false);
  const [ex, setEx] = useState<ClinicalSection>(emptySection());
  const [exOpen, setExOpen] = useState(false);
  const [viewAtt, setViewAtt] = useState<Attachment | null>(null);
  const [errs, setErrs] = useState<{ title?: string; date?: string }>({});

  const submit = () => {
    const e: typeof errs = {};
    if (!title.trim()) e.title = 'Dê um título ao registro.';
    if (!date) e.date = 'Informe a data.';
    setErrs(e);
    if (Object.keys(e).length > 0) return;
    const rxHas = rx.text.trim() || rx.attachments.length > 0;
    const exHas = ex.text.trim() || ex.attachments.length > 0;
    onAdd({
      id: uid(), type, title: title.trim(), notes: notes.trim(), date, createdAt: Date.now(),
      specialty, archived: false,
      prescription: rxHas ? { text: rx.text.trim(), attachments: rx.attachments } : null,
      exams: exHas ? { text: ex.text.trim(), attachments: ex.attachments } : null,
    });
  };

  return (
    <div className="rise rounded-xl border border-moss-500/30 bg-moss-50/50 p-4">
      <p className="mb-3 flex items-center gap-2 font-display text-sm font-bold text-ink">
        <IconPlus size={15} className="text-moss-600" /> Novo registro clínico
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[150px_1fr_150px_170px] lg:gap-4">
        <Field label="Tipo">
          <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as EntryType)}>
            {ENTRY_TYPES.map((t) => (
              <option key={t} value={t}>{ENTRY_META[t].label}</option>
            ))}
          </select>
        </Field>
        <Field label="Título" required>
          <input className={`${inputCls} ${errs.title ? 'border-danger-500' : ''}`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex.: Consulta de retorno — cardiologia" />
          {errs.title && <p className="mt-1 text-xs font-medium text-danger-600">{errs.title}</p>}
        </Field>
        <Field label="Data" required>
          <input type="date" className={`${inputCls} ${errs.date ? 'border-danger-500' : ''}`} value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
          {errs.date && <p className="mt-1 text-xs font-medium text-danger-600">{errs.date}</p>}
        </Field>
        <Field label="Especialidade">
          <select className={inputCls} value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
            <option value="">Geral</option>
            {SPECIALTIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-4">
        <Field label="Anotações clínicas" hint="digite ou dite por voz">
          <div className="relative">
            <textarea className={`${inputCls} min-h-20 resize-y`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Evolução, conduta, observações do atendimento…" />
            <MicButton className="absolute bottom-2 right-2" onAppend={(t) => setNotes((n) => (n ? n + ' ' : '') + t)} />
          </div>
        </Field>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <SectionEditor
          icon={<IconPrescription size={15} />}
          label="Prescrição médica"
          hint="descreva e/ou anexe a receita"
          placeholder={'Medicamento — dose — frequência\nex.: Losartana 50 mg — 1x/dia pela manhã'}
          section={rx}
          open={rxOpen}
          onToggle={() => setRxOpen((v) => !v)}
          onChange={setRx}
          onView={setViewAtt}
          byName={byName}
          accent="bg-moss-100 text-moss-700"
        />
        <SectionEditor
          icon={<IconFlask size={15} />}
          label="Exames solicitados"
          hint="descreva e/ou anexe os pedidos"
          placeholder={'Exames pedidos e orientações\nex.: Hemograma + HbA1c — jejum 8h'}
          section={ex}
          open={exOpen}
          onToggle={() => setExOpen((v) => !v)}
          onChange={setEx}
          onView={setViewAtt}
          byName={byName}
          accent="bg-info-100 text-info-600"
        />
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Btn variant="ghost" onClick={onCancel}>
          <IconX size={15} /> Descartar
        </Btn>
        <Btn onClick={submit}>Salvar registro</Btn>
      </div>

      <AttachmentModal att={viewAtt} onClose={() => setViewAtt(null)} />
    </div>
  );
}

/* --------------------------------- bloco da seção ------------------------ */

function SectionBlock({
  title,
  icon,
  section,
  onView,
  tone,
}: {
  title: string;
  icon: ReactNode;
  section: ClinicalSection;
  onView: (a: Attachment) => void;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-paper/60 p-3">
      <p className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] ${tone}`}>
        {icon} {title}
      </p>
      {section.text && <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-ink">{section.text}</p>}
      {section.attachments.length > 0 && (
        <div className="mt-2.5">
          <AttachmentStrip items={section.attachments} onView={onView} />
        </div>
      )}
      {!section.text && section.attachments.length === 0 && (
        <p className="mt-1 text-xs text-mute">Nada registrado nesta seção.</p>
      )}
    </div>
  );
}

/* ---------------------------------- tela --------------------------------- */

export function RecordScreen({
  patient,
  byName,
  onBack,
  onEditPatient,
  onAddEntry,
  onArchiveEntry,
  onRestoreEntry,
}: {
  patient: Patient | undefined;
  byName: string;
  onBack: () => void;
  onEditPatient: (id: string) => void;
  onAddEntry: (pid: string, e: ClinicalEntry) => void;
  onArchiveEntry: (pid: string, eid: string) => void;
  onRestoreEntry: (pid: string, eid: string) => void;
}) {
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | EntryType>('all');
  const [specFilter, setSpecFilter] = useState<string>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [toArchive, setToArchive] = useState<ClinicalEntry | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewAtt, setViewAtt] = useState<Attachment | null>(null);

  const sorted = useMemo(() => {
    if (!patient) return [];
    return [...patient.entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }, [patient]);

  const visible = useMemo(
    () =>
      sorted.filter(
        (e) =>
          (showArchived || !e.archived) &&
          (typeFilter === 'all' || e.type === typeFilter) &&
          (specFilter === 'all' || e.specialty === specFilter),
      ),
    [sorted, typeFilter, specFilter, showArchived],
  );

  const typeCounts = useMemo(() => {
    const m = new Map<EntryType, number>();
    for (const e of sorted) if (!e.archived) m.set(e.type, (m.get(e.type) ?? 0) + 1);
    return m;
  }, [sorted]);

  const specialties = useMemo(() => {
    const s = new Set<string>();
    for (const e of sorted) if (e.specialty && !e.archived) s.add(e.specialty);
    return Array.from(s).sort();
  }, [sorted]);

  const archivedCount = sorted.filter((e) => e.archived).length;

  const exportBySpecialty = () => {
    if (!patient) return;
    const list = sorted.filter((e) => !e.archived && (specFilter === 'all' || e.specialty === specFilter));
    const atts = list.reduce((s, e) => s + (e.prescription?.attachments.length ?? 0) + (e.exams?.attachments.length ?? 0), 0);
    const payload = {
      app: 'vitalis',
      patient: { record: patient.record, name: patient.name, primarySpecialty: patient.primarySpecialty },
      specialtyFilter: specFilter === 'all' ? 'todas' : specFilter,
      exportedAt: new Date().toISOString(),
      entries: list,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vitalis-${patient.record}-${specFilter === 'all' ? 'completo' : specFilter.toLowerCase().replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('success', `${list.length} registro(s) exportado(s)${atts > 0 ? `, com ${atts} anexo(s)` : ''}.`);
  };

  const shareBySpecialty = async () => {
    if (!patient) return;
    const list = sorted.filter((e) => !e.archived && (specFilter === 'all' || e.specialty === specFilter));
    const lines = [
      `Resumo do prontuário de ${patient.name} (${patient.record})`,
      specFilter !== 'all' ? `Especialidade: ${specFilter}` : 'Todas as especialidades',
      '---',
      ...list.slice(0, 8).flatMap((e) => {
        const parts = [`${formatDateBR(e.date)} · ${ENTRY_META[e.type].label}: ${e.title}`];
        if (e.prescription?.text) parts.push(`  Prescrição: ${e.prescription.text.replace(/\n+/g, ' | ')}`);
        if (e.exams?.text) parts.push(`  Exames solicitados: ${e.exams.text.replace(/\n+/g, ' | ')}`);
        const atts = (e.prescription?.attachments.length ?? 0) + (e.exams?.attachments.length ?? 0);
        if (atts > 0) parts.push(`  ${atts} anexo(s) digitalizado(s) no app`);
        return parts;
      }),
      list.length > 8 ? `… e mais ${list.length - 8} registro(s)` : '',
    ].filter(Boolean);
    const text = lines.join('\n');
    if (navigator.share) {
      try {
        await navigator.share({ title: `Prontuário — ${patient.name}`, text });
      } catch {
        /* usuário cancelou */
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        toast('success', 'Resumo copiado para a área de transferência.');
      } catch {
        toast('error', 'Não foi possível copiar o resumo.');
      }
    }
  };

  if (!patient) {
    return (
      <EmptyState icon={<IconChart size={24} />} title="Prontuário não encontrado" desc="Este paciente pode ter sido removido ou arquivado.">
        <Btn variant="outline" onClick={onBack}>
          <IconChevronLeft size={16} /> Voltar para pacientes
        </Btn>
      </EmptyState>
    );
  }

  const age = ageFromBirth(patient.birthDate);
  const lastEntry = sorted.find((e) => !e.archived);

  return (
    <div>
      <button onClick={onBack} className="rise mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-mute transition-colors hover:text-ink">
        <IconChevronLeft size={16} /> Pacientes
      </button>

      <header className="rise relative overflow-hidden rounded-xl border border-line bg-card shadow-lift" style={{ animationDelay: '40ms' }}>
        <div className="scanlines pointer-events-none absolute inset-0 opacity-[0.35]" />
        <div className="relative flex flex-wrap items-start gap-5 p-5 sm:p-6">
          <Avatar patient={patient} size={84} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">{patient.name}</h1>
              {patient.bloodType && <BloodBadge type={patient.bloodType} />}
            </div>
            <p className="mt-1 font-mono text-xs text-mute">
              ficha {patient.record} · aberta em {formatDateBR(new Date(patient.createdAt).toISOString().slice(0, 10))}
              {patient.primarySpecialty && <span className="ml-2 text-moss-700">· {patient.primarySpecialty}</span>}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-mute">
              <span className="inline-flex items-center gap-1.5">
                <IconCalendar size={15} className="text-moss-600" />
                {formatDateBR(patient.birthDate)}
                {age !== null && (
                  <strong className="text-ink">· {age} ano{age === 1 ? '' : 's'}</strong>
                )}
              </span>
              {patient.cpf && <span className="font-mono text-xs">{patient.cpf}</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {patient.allergies.map((a) => (
                <Tag key={a} tone="danger">
                  <IconAlert size={11} className="mr-1" /> alergia: {a}
                </Tag>
              ))}
              {patient.intolerances.map((i) => (
                <Tag key={`int-${i}`} tone="warn">intolerância: {i}</Tag>
              ))}
              {patient.conditions.map((c) => (
                <Tag key={c} tone="info">{c}</Tag>
              ))}
              {patient.specialCare.length > 0 && (
                <Tag tone="info">
                  <IconAlert size={11} className="mr-1" />
                  {SPECIAL_CARE_META[patient.specialCare[0]].label}
                  {patient.specialCare.length > 1 ? ` +${patient.specialCare.length - 1}` : ''}
                </Tag>
              )}
              {patient.medications.length > 0 && <Tag tone="mute">{patient.medications.length} medicação(ões) em uso</Tag>}
              {patient.photo && (
                <Tag tone="moss"><IconFace size={11} className="mr-1" /> retrato</Tag>
              )}
              {patient.fingerprint && (
                <Tag tone="moss"><IconFingerprint size={11} className="mr-1" /> digital {patient.fingerprint.quality}%</Tag>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Btn variant="outline" size="sm" onClick={() => onEditPatient(patient.id)}>
              <IconPencil size={14} /> Editar cadastro
            </Btn>
            <div className="rounded-lg border border-line bg-paper/70 px-3 py-2 text-right">
              <p className="font-mono text-xl font-semibold leading-none text-ink">{sorted.filter((e) => !e.archived).length}</p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-mute">registros</p>
            </div>
          </div>
        </div>
        {patient.missing.active && (
          <div className="relative flex items-center gap-2 border-t border-danger-500/30 bg-danger-100/70 px-5 py-2 sm:px-6">
            <span className="blink-dot h-2 w-2 rounded-full bg-danger-500" />
            <p className="text-xs font-bold text-danger-600">
              DESAPARECIDA desde {formatDateBR(patient.missing.since)} — gerencie o alerta em Utilidade pública.
            </p>
          </div>
        )}
        {patient.emergency.active && (
          <div className="relative flex items-center gap-2 border-t border-warn-500/30 bg-warn-100/70 px-5 py-2 sm:px-6">
            <span className="blink-dot h-2 w-2 rounded-full bg-warn-500" />
            <p className="text-xs font-bold text-warn-600">
              EMERGÊNCIA ATIVA desde {formatDateBR(patient.emergency.since)}
              {patient.emergency.location ? ` — ${patient.emergency.location}` : ''} · gerencie em Utilidade pública.
            </p>
          </div>
        )}
        <div className="relative border-t border-line bg-paper/50 px-5 py-2.5 sm:px-6">
          <p className="text-xs text-mute">
            Último registro:{' '}
            {lastEntry ? (
              <>
                <strong className="text-ink">{lastEntry.title}</strong> · {formatDateBR(lastEntry.date)}
              </>
            ) : (
              'nenhum ainda'
            )}
          </p>
        </div>
      </header>

      <section className="mt-6">
        <div className="rise mb-3 flex flex-wrap items-center gap-2" style={{ animationDelay: '100ms' }}>
          <h2 className="mr-2 font-display text-lg font-bold text-ink">Linha do tempo clínica</h2>
          <button
            onClick={() => setTypeFilter('all')}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
              typeFilter === 'all' ? 'border-pine-900 bg-pine-900 text-white' : 'border-line bg-card text-mute hover:border-pine-200 hover:text-ink'
            }`}
          >
            Todos · {sorted.filter((e) => !e.archived).length}
          </button>
          {ENTRY_TYPES.filter((t) => typeCounts.has(t)).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                typeFilter === t ? 'border-pine-900 bg-pine-900 text-white' : 'border-line bg-card text-mute hover:border-pine-200 hover:text-ink'
              }`}
            >
              {ENTRY_META[t].plural} · {typeCounts.get(t)}
            </button>
          ))}
          <Btn size="sm" className="ml-auto" onClick={() => setFormOpen((v) => !v)}>
            {formOpen ? (<><IconX size={14} /> Fechar</>) : (<><IconPlus size={14} /> Novo registro</>)}
          </Btn>
        </div>

        {specialties.length > 0 && (
          <div className="rise mb-3 flex flex-wrap items-center gap-2" style={{ animationDelay: '130ms' }}>
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-mute">Especialidade:</span>
            <button
              onClick={() => setSpecFilter('all')}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-all ${
                specFilter === 'all' ? 'border-moss-600 bg-moss-600 text-white' : 'border-line bg-card text-mute hover:border-moss-300 hover:text-ink'
              }`}
            >
              todas
            </button>
            {specialties.map((s) => (
              <button
                key={s}
                onClick={() => setSpecFilter(specFilter === s ? 'all' : s)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-all ${
                  specFilter === s ? 'border-moss-600 bg-moss-600 text-white' : 'border-line bg-card text-mute hover:border-moss-300 hover:text-ink'
                }`}
              >
                {s}
              </button>
            ))}
            <div className="ml-auto flex gap-1.5">
              <Btn variant="outline" size="sm" onClick={() => void shareBySpecialty()}>
                <IconShare size={13} /> Compartilhar
              </Btn>
              <Btn variant="outline" size="sm" onClick={exportBySpecialty}>
                <IconDownload size={13} /> Exportar
              </Btn>
            </div>
          </div>
        )}

        {archivedCount > 0 && (
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="rise mb-3 inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-bold text-mute transition-all hover:border-pine-200 hover:text-ink"
            style={{ animationDelay: '150ms' }}
          >
            <IconArchive size={13} />
            {showArchived ? 'Ocultar arquivados' : `Mostrar ${archivedCount} arquivado(s)`}
          </button>
        )}

        {formOpen && (
          <div className="mb-5">
            <NewEntryForm
              defaultSpecialty={patient.primarySpecialty}
              byName={byName}
              onCancel={() => setFormOpen(false)}
              onAdd={(e) => {
                onAddEntry(patient.id, e);
                setFormOpen(false);
                toast('success', `${ENTRY_META[e.type].label} registrada no prontuário.`);
              }}
            />
          </div>
        )}

        {visible.length === 0 ? (
          <EmptyState
            icon={<IconChart size={22} />}
            title="Nenhum registro aqui"
            desc="Ajuste os filtros ou adicione um novo registro — com prescrição, exames e anexos — para continuar o histórico vitalício."
          >
            <Btn onClick={() => setFormOpen(true)}>
              <IconPlus size={15} /> Adicionar registro
            </Btn>
          </EmptyState>
        ) : (
          <ol className="relative ml-3 space-y-3 border-l-2 border-line pl-6">
            {visible.map((e, i) => {
              const v = ENTRY_VISUAL[e.type];
              const hasSections = Boolean(e.prescription || e.exams);
              const attCount = (e.prescription?.attachments.length ?? 0) + (e.exams?.attachments.length ?? 0);
              const expanded = expandedId === e.id;
              return (
                <li key={e.id} className={`rise relative ${e.archived ? 'opacity-60' : ''}`} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                  <span className={`absolute -left-[31px] top-4 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-paper ${v.node}`} />
                  <div className="group rounded-xl border border-line bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${v.chip}`}>
                        <span className="inline-flex items-center gap-1.5">
                          {v.icon}
                          {ENTRY_META[e.type].label}
                        </span>
                      </span>
                      {e.specialty && <Tag tone="mute">{e.specialty}</Tag>}
                      {e.archived && <Tag tone="warn">arquivado</Tag>}
                      {e.prescription && (
                        <Tag tone="moss">
                          <IconPrescription size={11} className="mr-1" /> prescrição
                          {e.prescription.attachments.length > 0 && ` · ${e.prescription.attachments.length} anexo`}
                        </Tag>
                      )}
                      {e.exams && (
                        <Tag tone="info">
                          <IconFlask size={11} className="mr-1" /> exames
                          {e.exams.attachments.length > 0 && ` · ${e.exams.attachments.length} anexo`}
                        </Tag>
                      )}
                      <h3 className="font-display text-[15px] font-bold text-ink">{e.title}</h3>
                      <span className="ml-auto font-mono text-xs text-mute">{formatDateBR(e.date)}</span>
                      {hasSections && (
                        <button
                          onClick={() => setExpandedId(expanded ? null : e.id)}
                          className={`rounded-md p-1.5 transition-all hover:bg-moss-50 hover:text-moss-700 ${expanded ? 'rotate-180 text-moss-700' : 'text-mute'}`}
                          aria-label={expanded ? 'Recolher detalhes' : 'Ver prescrição e exames'}
                          title="Prescrição & exames"
                        >
                          <IconChevronDown size={16} />
                        </button>
                      )}
                      {e.archived ? (
                        <button onClick={() => { onRestoreEntry(patient.id, e.id); toast('success', 'Registro restaurado.'); }} className="rounded-md p-1.5 text-mute transition-all hover:bg-moss-50 hover:text-moss-700" aria-label="Restaurar registro">
                          <IconRefresh size={15} />
                        </button>
                      ) : (
                        <button onClick={() => setToArchive(e)} className="rounded-md p-1.5 text-mute opacity-0 transition-all hover:bg-warn-100 hover:text-warn-600 group-hover:opacity-100" aria-label={`Arquivar registro ${e.title}`}>
                          <IconArchive size={15} />
                        </button>
                      )}
                    </div>
                    {e.notes && <p className="mt-2 text-sm leading-relaxed text-mute">{e.notes}</p>}

                    {hasSections && (
                      <div
                        className={`grid transition-all duration-300 ease-out ${expanded ? 'mt-3 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                      >
                        <div className="overflow-hidden">
                          <div className="grid gap-3 md:grid-cols-2">
                            {e.prescription && (
                              <SectionBlock
                                title={`Prescrição médica${e.prescription.attachments.length ? ` · ${e.prescription.attachments.length} anexo(s)` : ''}`}
                                icon={<IconPrescription size={13} />}
                                section={e.prescription}
                                onView={setViewAtt}
                                tone="text-moss-700"
                              />
                            )}
                            {e.exams && (
                              <SectionBlock
                                title={`Exames solicitados${e.exams.attachments.length ? ` · ${e.exams.attachments.length} anexo(s)` : ''}`}
                                icon={<IconFlask size={13} />}
                                section={e.exams}
                                onView={setViewAtt}
                                tone="text-info-600"
                              />
                            )}
                          </div>
                          {attCount === 0 && (
                            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-mute">
                              <IconPaperclip size={12} /> Sem anexos digitalizados — apenas descritivo.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <aside className="rise mt-8 flex items-start gap-3 rounded-xl border border-info-500/25 bg-info-100/50 px-4 py-3.5 text-[13px] leading-relaxed text-info-600" style={{ animationDelay: '160ms' }}>
        <IconInfo size={17} className="mt-0.5 shrink-0" />
        <p>
          Esta linha do tempo é o <strong>embrião do prontuário vitalício</strong> — o objetivo principal do Vitalis.
          Cada registro pode levar <strong>prescrição médica</strong> (descritiva ou receita anexada) e{' '}
          <strong>exames solicitados</strong> (descritivo ou pedidos anexados). Arquivar nunca apaga dados; use
          Compartilhar/Exportar para levar o histórico a um médico, filtrando por especialidade.
        </p>
      </aside>

      <AttachmentModal att={viewAtt} onClose={() => setViewAtt(null)} />

      <ConfirmDialog
        open={toArchive !== null}
        onClose={() => setToArchive(null)}
        onConfirm={() => {
          if (toArchive) {
            onArchiveEntry(patient.id, toArchive.id);
            toast('info', 'Registro arquivado — continua preservado no prontuário.');
          }
        }}
        title="Arquivar registro"
        confirmLabel="Arquivar"
        message={
          <p>
            <strong className="text-ink">{toArchive?.title}</strong> será arquivado da linha do tempo, mas{' '}
            <strong className="text-ink">permanece preservado</strong> (incluindo prescrições e anexos) e pode ser
            restaurado quando quiser.
          </p>
        }
      />
    </div>
  );
}
