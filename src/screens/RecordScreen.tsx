import { useMemo, useState, type ReactNode } from 'react';
import type { ClinicalEntry, EntryType, Patient } from '../lib/types';
import { ENTRY_META, ENTRY_TYPES, SPECIAL_CARE_META, SPECIALTIES } from '../lib/types';
import { ageFromBirth, formatDateBR } from '../lib/biometrics';
import { uid } from '../lib/store';
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
import {
  IconActivity,
  IconAlert,
  IconArchive,
  IconCalendar,
  IconChart,
  IconChevronLeft,
  IconDownload,
  IconFace,
  IconFileText,
  IconFingerprint,
  IconFlask,
  IconInfo,
  IconPencil,
  IconPill,
  IconPlus,
  IconRefresh,
  IconShare,
  IconStetho,
  IconSyringe,
  IconX,
} from '../components/icons';

const ENTRY_VISUAL: Record<EntryType, { icon: ReactNode; chip: string; node: string }> = {
  consulta: { icon: <IconStetho size={15} />, chip: 'bg-moss-100 text-moss-700', node: 'bg-moss-500' },
  exame: { icon: <IconFlask size={15} />, chip: 'bg-info-100 text-info-600', node: 'bg-info-500' },
  medicacao: { icon: <IconPill size={15} />, chip: 'bg-pine-100 text-pine-700', node: 'bg-pine-600' },
  vacina: { icon: <IconSyringe size={15} />, chip: 'bg-warn-100 text-warn-600', node: 'bg-warn-500' },
  procedimento: { icon: <IconActivity size={15} />, chip: 'bg-danger-100 text-danger-600', node: 'bg-danger-500' },
  observacao: { icon: <IconFileText size={15} />, chip: 'bg-pine-900/6 text-mute', node: 'bg-mute' },
};

function NewEntryForm({
  defaultSpecialty,
  onAdd,
  onCancel,
}: {
  defaultSpecialty: string;
  onAdd: (e: ClinicalEntry) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<EntryType>('consulta');
  const [title, setTitle] = useState('');
  const [specialty, setSpecialty] = useState(defaultSpecialty);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [errs, setErrs] = useState<{ title?: string; date?: string }>({});

  const submit = () => {
    const e: typeof errs = {};
    if (!title.trim()) e.title = 'Dê um título ao registro.';
    if (!date) e.date = 'Informe a data.';
    setErrs(e);
    if (Object.keys(e).length > 0) return;
    onAdd({
      id: uid(),
      type,
      title: title.trim(),
      notes: notes.trim(),
      date,
      createdAt: Date.now(),
      specialty,
      archived: false,
    });
  };

  return (
    <div className="rise rounded-xl border border-moss-500/30 bg-moss-50/50 p-4">
      <p className="mb-3 flex items-center gap-2 font-display text-sm font-bold text-ink">
        <IconPlus size={15} className="text-moss-600" /> Novo registro clínico
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[150px_1fr_190px_150px]">
        <Field label="Tipo">
          <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as EntryType)}>
            {ENTRY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ENTRY_META[t].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Título" required>
          <input
            className={`${inputCls} ${errs.title ? 'border-danger-500' : ''}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ex.: Consulta de retorno — cardiologia"
          />
          {errs.title && <p className="mt-1 text-xs font-medium text-danger-600">{errs.title}</p>}
        </Field>
        <Field label="Especialidade">
          <select className={inputCls} value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
            <option value="">Geral</option>
            {SPECIALTIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Data" required>
          <input
            type="date"
            className={`${inputCls} ${errs.date ? 'border-danger-500' : ''}`}
            value={date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)}
          />
          {errs.date && <p className="mt-1 text-xs font-medium text-danger-600">{errs.date}</p>}
        </Field>
      </div>
      <div className="mt-4">
        <Field label="Anotações clínicas" hint="opcional">
          <textarea
            className={`${inputCls} min-h-20 resize-y`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Conduta, prescrições, resultados, observações…"
          />
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Btn variant="ghost" onClick={onCancel}>
          <IconX size={15} /> Descartar
        </Btn>
        <Btn onClick={submit}>Salvar registro</Btn>
      </div>
    </div>
  );
}

function buildSummary(p: Patient, spec: string): string {
  const age = ageFromBirth(p.birthDate);
  const entries = p.entries.filter((e) => !e.archived && (!spec || e.specialty === spec));
  const lines = [
    `RESUMO DO PRONTUÁRIO — Vitalis${spec ? ` (${spec})` : ''}`,
    `${p.name}${age !== null ? `, ${age} anos` : ''} · ficha ${p.record}`,
    p.bloodType ? `Tipo sanguíneo: ${p.bloodType}` : '',
    p.allergies.length ? `ALERGIAS: ${p.allergies.join(', ')}` : '',
    p.intolerances.length ? `Intolerâncias: ${p.intolerances.join(', ')}` : '',
    p.conditions.length ? `Condições: ${p.conditions.join(', ')}` : '',
    p.medications.length ? `Medicações em uso: ${p.medications.join('; ')}` : '',
    p.specialCare.length
      ? `Cuidados especiais: ${p.specialCare.map((c) => SPECIAL_CARE_META[c].label).join(', ')}`
      : '',
    p.emergencyNotes ? `Instruções: ${p.emergencyNotes}` : '',
    entries.length
      ? `\nRegistros${spec ? ` de ${spec}` : ''} (${entries.length}):`
      : '',
    ...entries.slice(0, 12).map((e) => `• [${formatDateBR(e.date)}] ${ENTRY_META[e.type].label}: ${e.title}`),
    `\nGerado em ${new Date().toLocaleString('pt-BR')} · app Vitalis (dados locais)`,
  ];
  return lines.filter(Boolean).join('\n');
}

function downloadJSON(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function RecordScreen({
  patient,
  onBack,
  onEditPatient,
  onAddEntry,
  onArchiveEntry,
  onRestoreEntry,
}: {
  patient: Patient | undefined;
  onBack: () => void;
  onEditPatient: (id: string) => void;
  onAddEntry: (pid: string, e: ClinicalEntry) => void;
  onArchiveEntry: (pid: string, eid: string) => void;
  onRestoreEntry: (pid: string, eid: string) => void;
}) {
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | EntryType>('all');
  const [spec, setSpec] = useState('');
  const [toArchive, setToArchive] = useState<ClinicalEntry | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const active = useMemo(() => {
    if (!patient) return [];
    return patient.entries
      .filter((e) => !e.archived)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }, [patient]);

  const archived = useMemo(
    () => (patient ? patient.entries.filter((e) => e.archived) : []),
    [patient],
  );

  const visible = useMemo(
    () =>
      active.filter(
        (e) =>
          (filter === 'all' || e.type === filter) && (!spec || e.specialty === spec),
      ),
    [active, filter, spec],
  );

  const typeCounts = useMemo(() => {
    const m = new Map<EntryType, number>();
    for (const e of active) m.set(e.type, (m.get(e.type) ?? 0) + 1);
    return m;
  }, [active]);

  const specialtiesPresent = useMemo(() => {
    const s = new Set(active.map((e) => e.specialty).filter(Boolean));
    if (patient?.primarySpecialty) s.add(patient.primarySpecialty);
    return [...s].sort();
  }, [active, patient]);

  if (!patient) {
    return (
      <EmptyState
        icon={<IconChart size={24} />}
        title="Prontuário não encontrado"
        desc="Este paciente pode ter sido removido da base local."
      >
        <Btn variant="outline" onClick={onBack}>
          <IconChevronLeft size={16} /> Voltar para pacientes
        </Btn>
      </EmptyState>
    );
  }

  const age = ageFromBirth(patient.birthDate);
  const lastEntry = active[0];

  const share = async (mode: 'copy' | 'whatsapp') => {
    const text = buildSummary(patient, spec);
    if (mode === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      toast('info', 'Compartilhando resumo pelo WhatsApp…');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('success', `Resumo${spec ? ` de ${spec}` : ''} copiado — cole onde precisar.`);
    } catch {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      toast('info', 'Não foi possível copiar — abri o compartilhamento via WhatsApp.');
    }
  };

  const exportSpec = () => {
    const entries = active.filter((e) => !spec || e.specialty === spec);
    downloadJSON(
      `vitalis-${patient.record}-${spec ? spec.toLowerCase().replace(/\s+/g, '-') : 'completo'}.json`,
      {
        app: 'vitalis',
        record: patient.record,
        name: patient.name,
        specialtyFilter: spec || null,
        exportedAt: new Date().toISOString(),
        entries,
      },
    );
    toast('success', `Exportados ${entries.length} registro(s)${spec ? ` de ${spec}` : ''} em JSON.`);
  };

  return (
    <div>
      <button
        onClick={onBack}
        className="rise mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-mute transition-colors hover:text-ink"
      >
        <IconChevronLeft size={16} /> Pacientes
      </button>

      {/* cabeçalho da ficha */}
      <header
        className="rise relative overflow-hidden rounded-xl border border-line bg-card shadow-lift"
        style={{ animationDelay: '40ms' }}
      >
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
              {patient.primarySpecialty && (
                <span className="ml-2 rounded-md bg-moss-100 px-1.5 py-0.5 font-sans text-[11px] font-bold text-moss-700">
                  {patient.primarySpecialty}
                </span>
              )}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-mute">
              <span className="inline-flex items-center gap-1.5">
                <IconCalendar size={15} className="text-moss-600" />
                {formatDateBR(patient.birthDate)}
                {age !== null && (
                  <strong className="text-ink">
                    · {age} ano{age === 1 ? '' : 's'}
                  </strong>
                )}
              </span>
              {patient.cpf && <span className="font-mono text-xs">{patient.cpf}</span>}
              <span className="text-xs">
                {patient.sex === 'F' ? 'Feminino' : patient.sex === 'M' ? 'Masculino' : 'Outro'}
              </span>
            </div>
            {(patient.allergies.length > 0 || patient.conditions.length > 0 || patient.intolerances.length > 0 || patient.specialCare.length > 0 || patient.medications.length > 0 || patient.photo || patient.fingerprint) && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {patient.allergies.map((a) => (
                  <Tag key={a} tone="warn">
                    <IconAlert size={11} className="mr-1" /> alergia: {a}
                  </Tag>
                ))}
                {patient.conditions.map((c) => (
                  <Tag key={c} tone="info">
                    {c}
                  </Tag>
                ))}
                {patient.intolerances.map((i) => (
                  <Tag key={`int-${i}`} tone="warn">
                    intolerância: {i}
                  </Tag>
                ))}
                {patient.specialCare.length > 0 && (
                  <Tag tone="info">
                    <IconAlert size={11} className="mr-1" />
                    {SPECIAL_CARE_META[patient.specialCare[0]].label}
                    {patient.specialCare.length > 1 ? ` +${patient.specialCare.length - 1}` : ''}
                  </Tag>
                )}
                {patient.medications.length > 0 && (
                  <Tag tone="mute">{patient.medications.length} medicação(ões) em uso</Tag>
                )}
                {patient.photo && (
                  <Tag tone="moss">
                    <IconFace size={11} className="mr-1" /> retrato
                  </Tag>
                )}
                {patient.fingerprint && (
                  <Tag tone="moss">
                    <IconFingerprint size={11} className="mr-1" /> digital {patient.fingerprint.quality}%
                  </Tag>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap justify-end gap-2">
              <Btn variant="outline" size="sm" onClick={() => onEditPatient(patient.id)}>
                <IconPencil size={14} /> Editar cadastro
              </Btn>
              <Btn variant="outline" size="sm" onClick={() => void share('copy')}>
                <IconShare size={14} /> Compartilhar{spec ? ` (${spec})` : ''}
              </Btn>
              <Btn variant="outline" size="sm" onClick={() => void share('whatsapp')}>
                <IconShare size={14} /> WhatsApp
              </Btn>
              <Btn variant="dark" size="sm" onClick={exportSpec}>
                <IconDownload size={14} /> Exportar{spec ? ` ${spec}` : ' tudo'}
              </Btn>
            </div>
            <div className="rounded-lg border border-line bg-paper/70 px-3 py-2 text-right">
              <p className="font-mono text-xl font-semibold leading-none text-ink">{active.length}</p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-mute">registros ativos</p>
            </div>
          </div>
        </div>
        {patient.missing.active && (
          <div className="relative flex items-center gap-2 border-t border-danger-500/30 bg-danger-100/70 px-5 py-2 sm:px-6">
            <span className="blink-dot h-2 w-2 rounded-full bg-danger-500" />
            <p className="text-xs font-bold text-danger-600">
              DESAPARECIDA desde {formatDateBR(patient.missing.since)} — gerencie o alerta na tela Desaparecidos.
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

      {/* linha do tempo */}
      <section className="mt-6">
        <div className="rise mb-3 flex flex-wrap items-center gap-2" style={{ animationDelay: '100ms' }}>
          <h2 className="mr-2 font-display text-lg font-bold text-ink">Linha do tempo clínica</h2>
          <button
            onClick={() => setFilter('all')}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
              filter === 'all'
                ? 'border-pine-900 bg-pine-900 text-white'
                : 'border-line bg-card text-mute hover:border-pine-200 hover:text-ink'
            }`}
          >
            Todos · {active.length}
          </button>
          {ENTRY_TYPES.filter((t) => typeCounts.has(t)).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(filter === t ? 'all' : t)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                filter === t
                  ? 'border-pine-900 bg-pine-900 text-white'
                  : 'border-line bg-card text-mute hover:border-pine-200 hover:text-ink'
              }`}
            >
              {ENTRY_META[t].plural} · {typeCounts.get(t)}
            </button>
          ))}
          <Btn size="sm" className="ml-auto" onClick={() => setFormOpen((v) => !v)}>
            {formOpen ? (
              <>
                <IconX size={14} /> Fechar formulário
              </>
            ) : (
              <>
                <IconPlus size={14} /> Novo registro
              </>
            )}
          </Btn>
        </div>

        {/* filtro por especialidade */}
        <div className="rise mb-4 flex flex-wrap items-center gap-2" style={{ animationDelay: '120ms' }}>
          <span className="text-xs font-bold uppercase tracking-wide text-mute">Especialidade:</span>
          <button
            onClick={() => setSpec('')}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
              spec === ''
                ? 'border-moss-600 bg-moss-600 text-white'
                : 'border-line bg-card text-mute hover:border-moss-300 hover:text-ink'
            }`}
          >
            Todas
          </button>
          {specialtiesPresent.map((s) => (
            <button
              key={s}
              onClick={() => setSpec(spec === s ? '' : s)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                spec === s
                  ? 'border-moss-600 bg-moss-600 text-white'
                  : 'border-line bg-card text-mute hover:border-moss-300 hover:text-ink'
              }`}
            >
              {s} · {active.filter((e) => e.specialty === s).length}
            </button>
          ))}
          {(spec || filter !== 'all') && (
            <span className="ml-auto text-[11px] text-mute">
              compartilhamento e exportação valem para o filtro atual
            </span>
          )}
        </div>

        {formOpen && (
          <div className="mb-5">
            <NewEntryForm
              defaultSpecialty={spec || patient.primarySpecialty}
              onCancel={() => setFormOpen(false)}
              onAdd={(e) => {
                onAddEntry(patient.id, e);
                setFormOpen(false);
                toast('success', `${ENTRY_META[e.type].label} registrada no prontuário${e.specialty ? ` (${e.specialty})` : ''}.`);
              }}
            />
          </div>
        )}

        {visible.length === 0 ? (
          <EmptyState
            icon={<IconChart size={22} />}
            title={filter === 'all' && !spec ? 'Prontuário em branco' : 'Nada neste filtro'}
            desc={
              filter === 'all' && !spec
                ? 'Registre a primeira consulta, exame ou medicação para começar o histórico vitalício.'
                : 'Nenhum registro para o filtro selecionado. Troque o filtro ou adicione um novo registro.'
            }
          >
            {filter === 'all' && !spec && (
              <Btn onClick={() => setFormOpen(true)}>
                <IconPlus size={15} /> Adicionar primeiro registro
              </Btn>
            )}
          </EmptyState>
        ) : (
          <ol className="relative ml-3 space-y-3 border-l-2 border-line pl-6">
            {visible.map((e, i) => {
              const v = ENTRY_VISUAL[e.type];
              return (
                <li key={e.id} className="rise relative" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                  <span
                    className={`absolute -left-[31px] top-4 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-paper ${v.node}`}
                  />
                  <div className="group rounded-xl border border-line bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${v.chip}`}>
                        <span className="inline-flex items-center gap-1.5">
                          {v.icon}
                          {ENTRY_META[e.type].label}
                        </span>
                      </span>
                      {e.specialty && <Tag tone="mute">{e.specialty}</Tag>}
                      <h3 className="font-display text-[15px] font-bold text-ink">{e.title}</h3>
                      <span className="ml-auto font-mono text-xs text-mute">{formatDateBR(e.date)}</span>
                      <button
                        onClick={() => setToArchive(e)}
                        className="rounded-md p-1.5 text-mute opacity-0 transition-all hover:bg-warn-100 hover:text-warn-600 group-hover:opacity-100"
                        aria-label={`Arquivar registro ${e.title}`}
                      >
                        <IconArchive size={15} />
                      </button>
                    </div>
                    {e.notes && <p className="mt-2 text-sm leading-relaxed text-mute">{e.notes}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {/* arquivados */}
        {archived.length > 0 && (
          <div className="mt-6 rounded-xl border border-line bg-paper/60 p-4">
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="flex w-full items-center gap-2 text-sm font-bold text-mute transition-colors hover:text-ink"
            >
              <IconArchive size={16} />
              Registros arquivados ({archived.length})
              <span className="ml-auto text-xs font-semibold">{showArchived ? 'ocultar' : 'mostrar'}</span>
            </button>
            {showArchived && (
              <ul className="mt-3 space-y-2">
                {archived.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 opacity-80">
                    <span className="text-[13px] font-semibold text-mute line-through">{e.title}</span>
                    <span className="font-mono text-[11px] text-mute">{formatDateBR(e.date)}</span>
                    <button
                      onClick={() => {
                        onRestoreEntry(patient.id, e.id);
                        toast('success', 'Registro restaurado para a linha do tempo.');
                      }}
                      className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold text-moss-700 transition-colors hover:bg-moss-100"
                    >
                      <IconRefresh size={13} /> Restaurar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <aside
        className="rise mt-8 flex items-start gap-3 rounded-xl border border-info-500/25 bg-info-100/50 px-4 py-3.5 text-[13px] leading-relaxed text-info-600"
        style={{ animationDelay: '160ms' }}
      >
        <IconInfo size={17} className="mt-0.5 shrink-0" />
        <p>
          Esta linha do tempo é o <strong>embrião do prontuário vitalício</strong> — o objetivo principal do
          Vitalis. Nenhum registro é excluído: apenas arquivado, compartilhado ou exportado. Anexos e crescimento
          pediátrico chegam nas próximas versões.
        </p>
      </aside>

      <ConfirmDialog
        open={toArchive !== null}
        onClose={() => setToArchive(null)}
        onConfirm={() => {
          if (toArchive) {
            onArchiveEntry(patient.id, toArchive.id);
            toast('info', 'Registro arquivado — os dados foram preservados.');
          }
        }}
        title="Arquivar registro"
        tone="default"
        confirmLabel="Arquivar"
        message={
          <p>
            <strong className="text-ink">{toArchive?.title}</strong> ({toArchive && formatDateBR(toArchive.date)}) sairá
            da linha do tempo, mas <strong className="text-ink">não será excluído</strong>. Você poderá restaurá-lo na
            seção de arquivados.
          </p>
        }
      />
    </div>
  );
}
