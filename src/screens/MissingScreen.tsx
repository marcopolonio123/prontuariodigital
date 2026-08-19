import { useMemo, useState } from 'react';
import type { IdEvent, MissingStatus, Patient } from '../lib/types';
import { RELATIONSHIP_META } from '../lib/types';
import { uid } from '../lib/store';
import { ageFromBirth, daysSince, formatDateTime, formatDateBR, waLink } from '../lib/biometrics';
import { Avatar, BloodBadge, Btn, EmptyState, Field, inputCls, Modal, Tag, useToast } from '../components/ui';
import { IconBell, IconCheck, IconChart, IconEye, IconMapPin, IconMessage, IconPlus, IconUsers } from '../components/icons';

const EVENT_META: Record<MissingStatus['history'][number]['kind'], { label: string; cls: string }> = {
  missing: { label: 'Desaparecimento', cls: 'bg-danger-100 text-danger-600' },
  sighting: { label: 'Avistamento', cls: 'bg-warn-100 text-warn-600' },
  notified: { label: 'Avisos enviados', cls: 'bg-info-100 text-info-600' },
  found: { label: 'Localizada', cls: 'bg-moss-100 text-moss-700' },
};

function EventLog({ history }: { history: MissingStatus['history'][number][] }) {
  if (history.length === 0) return null;
  const sorted = [...history].sort((a, b) => b.at - a.at);
  return (
    <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
      {sorted.map((e) => (
        <li key={e.id} className="flex items-start gap-2 text-[13px]">
          <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${EVENT_META[e.kind].cls}`}>
            {EVENT_META[e.kind].label}
          </span>
          <span className="min-w-0 flex-1 text-ink">{e.text}</span>
          <span className="shrink-0 font-mono text-[11px] text-mute">{formatDateTime(e.at)}</span>
        </li>
      ))}
    </ul>
  );
}

export function MissingScreen({
  patients,
  log,
  onUpdate,
  onOpenRecord,
  onGoPatients,
}: {
  patients: Patient[];
  log: IdEvent[];
  onUpdate: (p: Patient) => void;
  onOpenRecord: (id: string) => void;
  onGoPatients: () => void;
}) {
  const toast = useToast();
  const [reportOpen, setReportOpen] = useState(false);
  const [foundFor, setFoundFor] = useState<Patient | null>(null);
  const [sightingFor, setSightingFor] = useState<Patient | null>(null);
  const [foundText, setFoundText] = useState('');
  const [sightingText, setSightingText] = useState('');
  const [rPerson, setRPerson] = useState('');
  const [rSince, setRSince] = useState(() => new Date().toISOString().slice(0, 10));
  const [rPlace, setRPlace] = useState('');
  const [rNotes, setRNotes] = useState('');
  const [rErr, setRErr] = useState('');

  const missing = useMemo(
    () =>
      patients
        .filter((p) => !p.archived && p.missing.active)
        .sort((a, b) => a.missing.since.localeCompare(b.missing.since)),
    [patients],
  );
  const resolved = useMemo(
    () =>
      patients
        .filter((p) => !p.archived && !p.missing.active && p.missing.history.length > 0)
        .sort((a, b) => {
          const la = a.missing.history[a.missing.history.length - 1]?.at ?? 0;
          const lb = b.missing.history[b.missing.history.length - 1]?.at ?? 0;
          return lb - la;
        }),
    [patients],
  );
  const eligible = patients.filter((p) => !p.archived && !p.missing.active);
  const networkSize = missing.reduce((s, p) => s + p.contacts.length, 0);

  const submitReport = () => {
    const person = patients.find((p) => p.id === rPerson);
    if (!person) {
      setRErr('Selecione a pessoa desaparecida.');
      return;
    }
    if (!rSince) {
      setRErr('Informe a data do desaparecimento.');
      return;
    }
    setRErr('');
    onUpdate({
      ...person,
      missing: {
        active: true,
        since: rSince,
        lastPlace: rPlace.trim(),
        notes: rNotes.trim(),
        history: [...person.missing.history, { id: uid(), at: Date.now(), kind: 'missing', text: 'Desaparecimento registrado no Vitalis.' }],
      },
    });
    setReportOpen(false);
    setRPerson('');
    setRPlace('');
    setRNotes('');
    toast('info', `${person.name} marcada como desaparecida. A rede de avisos está pronta para ser acionada.`);
  };

  const markFound = () => {
    if (!foundFor) return;
    onUpdate({
      ...foundFor,
      missing: {
        ...foundFor.missing,
        active: false,
        history: [...foundFor.missing.history, { id: uid(), at: Date.now(), kind: 'found', text: foundText.trim() || 'Marcada como localizada.' }],
      },
    });
    toast('success', `${foundFor.name} marcada como localizada. Caso encerrado.`);
    setFoundFor(null);
    setFoundText('');
  };

  const addSighting = () => {
    if (!sightingFor || !sightingText.trim()) return;
    onUpdate({
      ...sightingFor,
      missing: {
        ...sightingFor.missing,
        history: [...sightingFor.missing.history, { id: uid(), at: Date.now(), kind: 'sighting', text: sightingText.trim() }],
      },
    });
    toast('success', 'Avistamento registrado na linha do tempo.');
    setSightingFor(null);
    setSightingText('');
  };

  return (
    <div>
      <header className="rise mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-moss-700">localização de pessoas</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink">Desaparecidos</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-mute">
            Ao identificar uma pessoa na base — por retrato ou digital — o Vitalis alerta se ela está desaparecida e
            libera a rede de avisos para notificar parentes e responsáveis.
          </p>
        </div>
        <Btn onClick={() => setReportOpen(true)} disabled={eligible.length === 0} title={eligible.length === 0 ? 'Cadastre pessoas primeiro' : undefined}>
          <IconPlus size={16} /> Reportar desaparecimento
        </Btn>
      </header>

      <div className="rise mb-6 grid gap-3 sm:grid-cols-3" style={{ animationDelay: '60ms' }}>
        <div className="rounded-xl border border-line bg-card px-4 py-3.5 shadow-lift">
          <p className="font-mono text-2xl font-bold text-danger-600">{missing.length}</p>
          <p className="text-xs font-semibold uppercase tracking-wide text-mute">desaparecidas agora</p>
        </div>
        <div className="rounded-xl border border-line bg-card px-4 py-3.5 shadow-lift">
          <p className="font-mono text-2xl font-bold text-ink">{networkSize}</p>
          <p className="text-xs font-semibold uppercase tracking-wide text-mute">contatos na rede de avisos</p>
        </div>
        <div className="rounded-xl border border-line bg-card px-4 py-3.5 shadow-lift">
          <p className="font-mono text-2xl font-bold text-moss-700">{resolved.length}</p>
          <p className="text-xs font-semibold uppercase tracking-wide text-mute">casos localizados</p>
        </div>
      </div>

      {patients.filter((p) => !p.archived).length === 0 ? (
        <EmptyState icon={<IconUsers size={24} />} title="Nenhuma pessoa na base" desc="Para reportar um desaparecimento é preciso primeiro cadastrar a pessoa com dados básicos.">
          <Btn onClick={onGoPatients}>
            <IconPlus size={15} /> Ir para o cadastro
          </Btn>
        </EmptyState>
      ) : missing.length === 0 ? (
        <EmptyState icon={<IconCheck size={24} />} title="Nenhuma pessoa desaparecida" desc="Todos os cadastrados estão em segurança. Se alguém sumir, registre aqui para ativar o fluxo de avisos na identificação.">
          {eligible.length > 0 && (
            <Btn variant="outline" onClick={() => setReportOpen(true)}>
              <IconBell size={15} /> Reportar desaparecimento
            </Btn>
          )}
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {missing.map((p, i) => {
            const age = ageFromBirth(p.birthDate);
            const days = daysSince(p.missing.since);
            const primary = [...p.contacts].sort((a, b) => a.priority - b.priority)[0];
            return (
              <li key={p.id} className="rise" style={{ animationDelay: `${Math.min(i, 5) * 60}ms` }}>
                <div className="overflow-hidden rounded-xl border border-danger-500/40 bg-card shadow-lift">
                  <div className="flex items-center gap-3 border-b border-danger-500/25 bg-danger-100/50 px-4 py-2.5">
                    <span className="blink-dot h-2.5 w-2.5 shrink-0 rounded-full bg-danger-500" />
                    <p className="font-display text-sm font-bold uppercase tracking-[0.14em] text-danger-600">
                      Desaparecida há {days} dia{days === 1 ? '' : 's'}
                    </p>
                    <span className="ml-auto font-mono text-xs text-mute">desde {formatDateBR(p.missing.since)}</span>
                  </div>
                  <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[auto_1fr_280px]">
                    <Avatar patient={p} size={92} className="mx-auto lg:mx-0" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-display text-xl font-bold text-ink">{p.name}</h2>
                        <BloodBadge type={p.bloodType} size="sm" />
                        {p.specialCare.length > 0 && (
                          <Tag tone="info">{p.specialCare.length} cuidado(s) especial(is)</Tag>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-mute">
                        {age !== null ? `${age} anos` : 'idade n/d'} · ficha <span className="font-mono">{p.record}</span>
                      </p>
                      {p.missing.lastPlace && (
                        <p className="mt-2 flex items-start gap-1.5 text-sm text-ink">
                          <IconMapPin size={15} className="mt-0.5 shrink-0 text-danger-500" />
                          <span><strong>Último local conhecido:</strong> {p.missing.lastPlace}</span>
                        </p>
                      )}
                      {p.missing.notes && <p className="mt-1.5 text-[13px] leading-relaxed text-mute">{p.missing.notes}</p>}
                      <EventLog history={p.missing.history} />
                      <div className="mt-3 rounded-lg border border-line bg-paper/70 p-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-mute">Quem consultou esta ficha (logado)</p>
                        {(() => {
                          const consults = log.filter(
                            (e) => e.patientId === p.id && ['match', 'review', 'notify', 'found'].includes(e.result),
                          );
                          if (consults.length === 0)
                            return (
                              <p className="mt-1.5 text-xs text-mute">
                                Nenhuma identificação registrada ainda. Toda consulta exige conta logada e fica auditada
                                com nome e horário.
                              </p>
                            );
                          const label: Record<string, string> = {
                            match: 'identificou por biometria',
                            review: 'revisou a identidade manualmente',
                            notify: 'registrou avisos à rede',
                            found: 'confirmou a localização',
                          };
                          return (
                            <ul className="mt-1.5 space-y-1">
                              {consults.slice(0, 5).map((e) => (
                                <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                                  <span className="font-bold text-ink">{e.byName || 'conta local'}</span>
                                  <span className="text-mute">{label[e.result] ?? e.result}</span>
                                  {e.confidence > 0 && <span className="font-mono text-[11px] text-mute">({e.confidence}%)</span>}
                                  <span className="ml-auto font-mono text-[11px] text-mute">{formatDateTime(e.at)}</span>
                                </li>
                              ))}
                            </ul>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 border-t border-line pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-mute">Ações</p>
                      {primary && (
                        <a
                          href={waLink(
                            primary.phone,
                            `Olá ${primary.name.split(' ')[0]}! Alerta do app Vitalis: ${p.name} está sendo procurada (desaparecida desde ${formatDateBR(p.missing.since)}). Qualquer informação, responda por aqui.`,
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-moss-600 px-3 py-2 text-xs font-bold text-white transition-all hover:bg-moss-700 active:scale-95"
                        >
                          <IconMessage size={14} /> WhatsApp — {RELATIONSHIP_META[primary.relationship]}
                        </a>
                      )}
                      <Btn variant="outline" size="sm" onClick={() => setSightingFor(p)}>
                        <IconEye size={14} /> Registrar avistamento
                      </Btn>
                      <Btn variant="outline" size="sm" onClick={() => onOpenRecord(p.id)}>
                        <IconChart size={14} /> Ver prontuário
                      </Btn>
                      <Btn variant="dark" size="sm" onClick={() => setFoundFor(p)}>
                        <IconCheck size={14} /> Marcar como localizada
                      </Btn>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {resolved.length > 0 && (
        <section className="rise mt-8" style={{ animationDelay: '120ms' }}>
          <h2 className="mb-3 font-display text-base font-bold text-mute">Casos encerrados</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {resolved.slice(0, 4).map((p) => {
              const last = [...p.missing.history].reverse().find((e) => e.kind === 'found');
              return (
                <li key={p.id} className="flex items-center gap-3 rounded-xl border border-line bg-card px-3.5 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-moss-100 text-moss-700">
                    <IconCheck size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{p.name}</p>
                    <p className="truncate text-[11px] text-mute">{last ? last.text : 'Localizada'}{last ? ` · ${formatDateTime(last.at)}` : ''}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Reportar desaparecimento" subtitle="Ativa o alerta para a próxima identificação desta pessoa.">
        <div className="space-y-3">
          <Field label="Pessoa" required>
            <select className={inputCls} value={rPerson} onChange={(e) => setRPerson(e.target.value)}>
              <option value="">Selecione…</option>
              {eligible.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Data do desaparecimento" required>
            <input type="date" className={inputCls} value={rSince} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setRSince(e.target.value)} />
          </Field>
          <Field label="Último local conhecido">
            <input className={inputCls} value={rPlace} onChange={(e) => setRPlace(e.target.value)} placeholder="ex.: Praça da Matriz, Centro" />
          </Field>
          <Field label="Observações">
            <textarea className={`${inputCls} min-h-16 resize-y`} value={rNotes} onChange={(e) => setRNotes(e.target.value)} placeholder="Roupas, horários, circunstâncias…" />
          </Field>
          {rErr && <p className="text-xs font-medium text-danger-600">{rErr}</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Btn variant="ghost" onClick={() => setReportOpen(false)}>Cancelar</Btn>
          <Btn onClick={submitReport}>
            <IconBell size={15} /> Ativar alerta
          </Btn>
        </div>
      </Modal>

      <Modal open={foundFor !== null} onClose={() => setFoundFor(null)} title={`Localizar ${foundFor?.name ?? ''}`} subtitle="Encerra o alerta de desaparecimento.">
        <Field label="Como foi localizada?">
          <textarea className={`${inputCls} min-h-20 resize-y`} value={foundText} onChange={(e) => setFoundText(e.target.value)} placeholder="ex.: reconhecida por foto; família avisada…" />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Btn variant="ghost" onClick={() => setFoundFor(null)}>Cancelar</Btn>
          <Btn onClick={markFound}>
            <IconCheck size={15} /> Confirmar localização
          </Btn>
        </div>
      </Modal>

      <Modal open={sightingFor !== null} onClose={() => setSightingFor(null)} title={`Avistamento — ${sightingFor?.name ?? ''}`} subtitle="Registre um possível avistamento na linha do tempo.">
        <Field label="Onde e quando?" required>
          <textarea className={`${inputCls} min-h-20 resize-y`} value={sightingText} onChange={(e) => setSightingText(e.target.value)} placeholder="ex.: vista próxima à feira da Rua das Flores, por volta das 10h…" />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Btn variant="ghost" onClick={() => setSightingFor(null)}>Cancelar</Btn>
          <Btn onClick={addSighting} disabled={!sightingText.trim()}>
            <IconEye size={15} /> Registrar avistamento
          </Btn>
        </div>
      </Modal>
    </div>
  );
}
