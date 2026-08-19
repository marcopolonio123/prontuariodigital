import { useMemo, useState } from 'react';
import type { EmergencySituation, IdEvent, Patient } from '../lib/types';
import { EMERGENCY_SITUATIONS, EMERGENCY_SITUATION_META } from '../lib/types';
import { uid } from '../lib/store';
import {
  ageFromBirth, daysSince, emergencyAlertText, formatDateBR, formatDateTime, missingAlertText, waLink,
} from '../lib/biometrics';
import { Avatar, BloodBadge, Btn, EmptyState, Field, inputCls, Modal, Tag, useToast } from '../components/ui';
import { ContactRow } from '../components/EmergencyCard';
import {
  IconAlert, IconBell, IconChart, IconCheck, IconEye, IconMapPin, IconMegaphone, IconMessage, IconPlus, IconUsers,
} from '../components/icons';

type Tab = 'missing' | 'emergency';

/* --------------------------- linha de eventos --------------------------- */

function EventLog({ history, empty }: { history: Array<{ id: string; at: number; kind: string; text: string }>; empty: string }) {
  if (history.length === 0) {
    return <p className="mt-2 text-xs text-mute">{empty}</p>;
  }
  const meta: Record<string, { label: string; cls: string }> = {
    missing: { label: 'Desaparecimento', cls: 'bg-danger-100 text-danger-600' },
    found: { label: 'Localizada', cls: 'bg-moss-100 text-moss-700' },
    sighting: { label: 'Avistamento', cls: 'bg-warn-100 text-warn-600' },
    notified: { label: 'Avisos', cls: 'bg-info-100 text-info-600' },
    emergency: { label: 'Emergência', cls: 'bg-warn-100 text-warn-600' },
    resolved: { label: 'Resolvida', cls: 'bg-moss-100 text-moss-700' },
    update: { label: 'Atualização', cls: 'bg-pine-900/6 text-mute' },
  };
  return (
    <div className="mt-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-mute">Linha do tempo do caso</p>
      <ul className="mt-1.5 space-y-1.5">
        {[...history].reverse().map((e) => {
          const m = meta[e.kind] ?? meta.update;
          return (
            <li key={e.id} className="flex items-start gap-2 text-[13px]">
              <span className={`mt-0.5 shrink-0 rounded px-1.5 py-px text-[10px] font-bold ${m.cls}`}>{m.label}</span>
              <span className="min-w-0 flex-1 text-ink">{e.text}</span>
              <span className="shrink-0 font-mono text-[11px] text-mute">{formatDateTime(e.at)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------ quem consultou a ficha ------------------------ */

function ConsultTrail({ log, patientId }: { log: IdEvent[]; patientId: string }) {
  const consults = log.filter((e) => e.patientId === patientId && ['match', 'review', 'notify', 'found'].includes(e.result));
  return (
    <div className="mt-3 rounded-lg border border-line bg-paper/70 p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-mute">Quem consultou esta ficha (logado)</p>
      {consults.length === 0 ? (
        <p className="mt-1.5 text-xs text-mute">
          Nenhuma identificação registrada ainda. Toda consulta exige conta logada e fica auditada com nome e horário.
        </p>
      ) : (
        (() => {
          const label: Record<string, string> = {
            match: 'identificou por biometria',
            review: 'revisou a identidade manualmente',
            notify: 'registrou avisos à rede',
            found: 'confirmou a localização/resolução',
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
        })()
      )}
    </div>
  );
}

/* ------------------------ folha de avisos à rede ------------------------ */

function NotifySheet({
  patient,
  mode,
  onClose,
  onLogged,
}: {
  patient: Patient;
  mode: 'missing' | 'emergency';
  onClose: () => void;
  onLogged: (names: string[]) => void;
}) {
  const [notified, setNotified] = useState<Set<string>>(new Set());
  const age = ageFromBirth(patient.birthDate);
  const alertText =
    mode === 'emergency'
      ? emergencyAlertText(
          patient.name,
          age,
          patient.emergency.situation ? EMERGENCY_SITUATION_META[patient.emergency.situation].label : 'emergência',
          patient.emergency.location,
        )
      : missingAlertText(patient.name, age, patient.missing.lastPlace);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Avisar rede — ${patient.name}`}
      subtitle={
        mode === 'emergency'
          ? 'A pessoa está em situação de emergência. Abra o WhatsApp ou ligue, depois registre cada aviso.'
          : 'A pessoa está desaparecida. Abra o WhatsApp ou ligue, depois registre cada aviso.'
      }
      width="max-w-xl"
    >
      {patient.contacts.length === 0 ? (
        <p className="rounded-lg bg-paper px-3 py-4 text-center text-sm text-mute">
          Nenhum contato cadastrado para esta pessoa. Edite a ficha para adicionar a rede de avisos.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {[...patient.contacts].sort((a, b) => a.priority - b.priority).map((c) => (
              <ContactRow
                key={c.id}
                contact={c}
                alertText={alertText}
                notified={notified.has(c.id)}
                onToggle={() =>
                  setNotified((s) => {
                    const n = new Set(s);
                    if (n.has(c.id)) n.delete(c.id);
                    else n.add(c.id);
                    return n;
                  })
                }
                alertMode
              />
            ))}
          </ul>
          <div className="mt-4 flex items-center gap-2">
            <p className="text-xs text-mute">{notified.size} aviso(s) marcado(s)</p>
            <Btn
              className="ml-auto"
              disabled={notified.size === 0}
              onClick={() => {
                onLogged(patient.contacts.filter((c) => notified.has(c.id)).map((c) => c.name));
                onClose();
              }}
            >
              <IconCheck size={15} /> Registrar na auditoria
            </Btn>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ------------------------------ tela principal --------------------------- */

export function PublicUtilityScreen({
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
  const [tab, setTab] = useState<Tab>('missing');

  // desaparecidos
  const [reportOpen, setReportOpen] = useState(false);
  const [rPerson, setRPerson] = useState('');
  const [rSince, setRSince] = useState(() => new Date().toISOString().slice(0, 10));
  const [rPlace, setRPlace] = useState('');
  const [rNotes, setRNotes] = useState('');
  const [rErr, setRErr] = useState('');
  const [sightingFor, setSightingFor] = useState<Patient | null>(null);
  const [sightingText, setSightingText] = useState('');
  const [foundFor, setFoundFor] = useState<Patient | null>(null);
  const [foundText, setFoundText] = useState('');
  const [notifyMissingFor, setNotifyMissingFor] = useState<Patient | null>(null);

  // emergências
  const [eOpen, setEOpen] = useState(false);
  const [ePerson, setEPerson] = useState('');
  const [eSituation, setESituation] = useState<EmergencySituation | ''>('');
  const [eLocation, setELocation] = useState('');
  const [eSince, setESince] = useState(() => new Date().toISOString().slice(0, 10));
  const [eNotes, setENotes] = useState('');
  const [eErr, setEErr] = useState('');
  const [resolvedFor, setResolvedFor] = useState<Patient | null>(null);
  const [resolvedText, setResolvedText] = useState('');
  const [notifyEmergencyFor, setNotifyEmergencyFor] = useState<Patient | null>(null);

  const missing = useMemo(
    () =>
      patients
        .filter((p) => !p.archived && p.missing.active)
        .sort((a, b) => a.missing.since.localeCompare(b.missing.since)),
    [patients],
  );
  const missingResolved = useMemo(
    () =>
      patients
        .filter((p) => !p.archived && !p.missing.active && p.missing.history.length > 0)
        .sort((a, b) => (b.missing.history[b.missing.history.length - 1]?.at ?? 0) - (a.missing.history[a.missing.history.length - 1]?.at ?? 0)),
    [patients],
  );
  const emergencies = useMemo(
    () => patients.filter((p) => !p.archived && p.emergency.active).sort((a, b) => b.emergency.since.localeCompare(a.emergency.since)),
    [patients],
  );
  const emergenciesResolved = useMemo(
    () =>
      patients
        .filter((p) => !p.archived && !p.emergency.active && p.emergency.history.length > 0)
        .sort((a, b) => (b.emergency.history[b.emergency.history.length - 1]?.at ?? 0) - (a.emergency.history[a.emergency.history.length - 1]?.at ?? 0)),
    [patients],
  );

  const networkSize = patients.filter((p) => !p.archived).reduce((s, p) => s + p.contacts.length, 0);
  const eligibleMissing = patients.filter((p) => !p.archived && !p.missing.active);
  const eligibleEmergency = patients.filter((p) => !p.archived && !p.emergency.active);
  const hasPeople = patients.some((p) => !p.archived);

  const submitReport = () => {
    const person = patients.find((p) => p.id === rPerson);
    if (!person || !rSince) {
      setRErr('Selecione a pessoa e a data do desaparecimento.');
      return;
    }
    onUpdate({
      ...person,
      missing: {
        active: true,
        since: rSince,
        lastPlace: rPlace.trim(),
        notes: rNotes.trim(),
        history: [
          ...person.missing.history,
          { id: uid(), at: Date.now(), kind: 'missing', text: `Desaparecimento registrado${rPlace.trim() ? ` — último local: ${rPlace.trim()}` : ''}.` },
        ],
      },
    });
    toast('success', `Alerta ativado: ${person.name} agora aparece como desaparecida na identificação.`);
    setReportOpen(false);
    setRPerson('');
    setRPlace('');
    setRNotes('');
    setRErr('');
  };

  const markFound = () => {
    if (!foundFor) return;
    onUpdate({
      ...foundFor,
      missing: {
        ...foundFor.missing,
        active: false,
        history: [
          ...foundFor.missing.history,
          { id: uid(), at: Date.now(), kind: 'found', text: foundText.trim() || 'Localizada — caso encerrado.' },
        ],
      },
    });
    toast('success', `${foundFor.name} marcada como localizada. Caso encerrado.`);
    setFoundFor(null);
    setFoundText('');
  };

  const logSighting = () => {
    if (!sightingFor) return;
    if (!sightingText.trim()) {
      toast('error', 'Descreva o avistamento (local, horário, circunstâncias).');
      return;
    }
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

  const submitEmergency = () => {
    const person = patients.find((p) => p.id === ePerson);
    if (!person || !eSituation) {
      setEErr('Selecione a pessoa e o tipo de situação.');
      return;
    }
    const label = EMERGENCY_SITUATION_META[eSituation].label;
    onUpdate({
      ...person,
      emergency: {
        active: true,
        since: eSince,
        situation: eSituation,
        location: eLocation.trim(),
        notes: eNotes.trim(),
        history: [
          ...person.emergency.history,
          { id: uid(), at: Date.now(), kind: 'emergency', text: `${label} registrada${eLocation.trim() ? ` — ${eLocation.trim()}` : ''}.` },
        ],
      },
    });
    toast('success', `Alerta de emergência ativado para ${person.name}.`);
    setEOpen(false);
    setEPerson('');
    setESituation('');
    setELocation('');
    setENotes('');
    setEErr('');
  };

  const markResolved = () => {
    if (!resolvedFor) return;
    onUpdate({
      ...resolvedFor,
      emergency: {
        ...resolvedFor.emergency,
        active: false,
        history: [
          ...resolvedFor.emergency.history,
          { id: uid(), at: Date.now(), kind: 'resolved', text: resolvedText.trim() || 'Situação resolvida — caso encerrado.' },
        ],
      },
    });
    toast('success', `Emergência de ${resolvedFor.name} marcada como resolvida.`);
    setResolvedFor(null);
    setResolvedText('');
  };

  const statCards =
    tab === 'missing'
      ? [
          { value: missing.length, label: 'desaparecidas agora', cls: 'text-danger-600' },
          { value: networkSize, label: 'contatos na rede de avisos', cls: 'text-ink' },
          { value: missingResolved.length, label: 'casos localizados', cls: 'text-moss-700' },
        ]
      : [
          { value: emergencies.length, label: 'emergências ativas', cls: 'text-warn-600' },
          { value: networkSize, label: 'contatos na rede de avisos', cls: 'text-ink' },
          { value: emergenciesResolved.length, label: 'situações resolvidas', cls: 'text-moss-700' },
        ];

  return (
    <div>
      <header className="rise mb-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-moss-700">utilidade pública</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink">Utilidade pública</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-mute">
          Central de proteção à vida: <strong className="text-ink">pessoas desaparecidas</strong> e{' '}
          <strong className="text-ink">pessoas em situação de emergência</strong> (acidentes, internações sem contato,
          encontradas desorientadas). Ao identificar alguém na base, o Vitalis dispara o alerta e a rede de avisos.
        </p>
      </header>

      <div className="rise mb-5 inline-flex max-w-full overflow-x-auto rounded-xl border border-line bg-card p-1 shadow-lift no-scrollbar" style={{ animationDelay: '40ms' }}>
        {(
          [
            { key: 'missing', label: `Desaparecidos · ${missing.length}` },
            { key: 'emergency', label: `Situações de emergência · ${emergencies.length}` },
          ] as Array<{ key: Tab; label: string }>
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-bold transition-all ${
              tab === t.key
                ? t.key === 'missing'
                  ? 'bg-danger-600 text-white shadow-sm'
                  : 'bg-warn-500 text-white shadow-sm'
                : 'text-mute hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rise mb-6 grid gap-3 sm:grid-cols-3" style={{ animationDelay: '60ms' }}>
        {statCards.map((s) => (
          <div key={s.label} className="rounded-xl border border-line bg-card px-4 py-3.5 shadow-lift">
            <p className={`font-mono text-2xl font-bold ${s.cls}`}>{s.value}</p>
            <p className="text-xs font-semibold uppercase tracking-wide text-mute">{s.label}</p>
          </div>
        ))}
      </div>

      {!hasPeople ? (
        <EmptyState icon={<IconUsers size={24} />} title="Nenhuma pessoa na base" desc="Para ativar alertas de desaparecimento ou emergência é preciso primeiro cadastrar a pessoa com dados básicos e contatos.">
          <Btn onClick={onGoPatients}>
            <IconPlus size={15} /> Ir para o cadastro
          </Btn>
        </EmptyState>
      ) : tab === 'missing' ? (
        /* ============================= DESAPARECIDOS ============================= */
        <>
          <div className="rise mb-4 flex justify-end" style={{ animationDelay: '80ms' }}>
            <Btn onClick={() => setReportOpen(true)} disabled={eligibleMissing.length === 0} title={eligibleMissing.length === 0 ? 'Todos já estão com alerta ou não há pessoas' : undefined}>
              <IconPlus size={16} /> Reportar desaparecimento
            </Btn>
          </div>

          {missing.length === 0 ? (
            <EmptyState icon={<IconCheck size={24} />} title="Nenhuma pessoa desaparecida" desc="Todos os cadastrados estão em segurança. Se alguém sumir, registre aqui para ativar o fluxo de avisos na identificação.">
              {eligibleMissing.length > 0 && (
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
                      <div className="flex flex-wrap items-center gap-3 border-b border-danger-500/25 bg-danger-100/50 px-4 py-2.5">
                        <span className="blink-dot h-2.5 w-2.5 shrink-0 rounded-full bg-danger-500" />
                        <p className="font-display text-sm font-bold uppercase tracking-[0.14em] text-danger-600">
                          Desaparecida há {days} dia{days === 1 ? '' : 's'}
                        </p>
                        <span className="ml-auto font-mono text-xs text-mute">desde {formatDateBR(p.missing.since)}</span>
                      </div>
                      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[auto_1fr_260px]">
                        <Avatar patient={p} size={92} className="mx-auto lg:mx-0" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-display text-xl font-bold text-ink">{p.name}</h2>
                            <BloodBadge type={p.bloodType} size="sm" />
                            {p.specialCare.length > 0 && <Tag tone="info">{p.specialCare.length} cuidado(s) especial(is)</Tag>}
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
                          <EventLog history={p.missing.history} empty="Sem eventos ainda." />
                          <ConsultTrail log={log} patientId={p.id} />
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
                              <IconMessage size={14} /> WhatsApp — 1º contato
                            </a>
                          )}
                          <Btn variant="outline" size="sm" onClick={() => setNotifyMissingFor(p)}>
                            <IconBell size={14} /> Avisar rede de contatos
                          </Btn>
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

          {missingResolved.length > 0 && (
            <section className="rise mt-8" style={{ animationDelay: '120ms' }}>
              <h2 className="mb-3 font-display text-base font-bold text-mute">Casos encerrados</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {missingResolved.slice(0, 4).map((p) => {
                  const last = [...p.missing.history].reverse().find((e) => e.kind === 'found');
                  return (
                    <li key={p.id} className="flex items-center gap-3 rounded-xl border border-line bg-card px-3.5 py-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-moss-100 text-moss-700">
                        <IconCheck size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-ink">{p.name}</p>
                        <p className="truncate text-[11px] text-mute">
                          {last ? last.text : 'Localizada'}
                          {last ? ` · ${formatDateTime(last.at)}` : ''}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      ) : (
        /* ============================= EMERGÊNCIAS ============================= */
        <>
          <div className="rise mb-4 flex justify-end" style={{ animationDelay: '80ms' }}>
            <Btn className="bg-warn-500 hover:bg-warn-600" onClick={() => setEOpen(true)} disabled={eligibleEmergency.length === 0} title={eligibleEmergency.length === 0 ? 'Não há pessoas elegíveis' : undefined}>
              <IconAlert size={16} /> Registrar situação de emergência
            </Btn>
          </div>

          {emergencies.length === 0 ? (
            <EmptyState
              icon={<IconMegaphone size={24} />}
              title="Nenhuma emergência ativa"
              desc="Se alguém for encontrado em situação crítica — acidente, internação sem contato com a família, desorientação — registre aqui para acionar a rede de avisos e exibir o cartão de emergência na identificação."
            >
              {eligibleEmergency.length > 0 && (
                <Btn variant="outline" onClick={() => setEOpen(true)}>
                  <IconAlert size={15} /> Registrar emergência
                </Btn>
              )}
            </EmptyState>
          ) : (
            <ul className="space-y-4">
              {emergencies.map((p, i) => {
                const age = ageFromBirth(p.birthDate);
                const days = daysSince(p.emergency.since);
                const label = p.emergency.situation ? EMERGENCY_SITUATION_META[p.emergency.situation].label : 'Emergência';
                const primary = [...p.contacts].sort((a, b) => a.priority - b.priority)[0];
                return (
                  <li key={p.id} className="rise" style={{ animationDelay: `${Math.min(i, 5) * 60}ms` }}>
                    <div className="overflow-hidden rounded-xl border border-warn-500/50 bg-card shadow-lift">
                      <div className="flex flex-wrap items-center gap-3 border-b border-warn-500/25 bg-warn-100/60 px-4 py-2.5">
                        <span className="blink-dot h-2.5 w-2.5 shrink-0 rounded-full bg-warn-500" />
                        <p className="font-display text-sm font-bold uppercase tracking-[0.14em] text-warn-600">
                          {label} · há {days} dia{days === 1 ? '' : 's'}
                        </p>
                        <span className="ml-auto font-mono text-xs text-mute">desde {formatDateBR(p.emergency.since)}</span>
                      </div>
                      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[auto_1fr_260px]">
                        <Avatar patient={p} size={92} className="mx-auto lg:mx-0" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-display text-xl font-bold text-ink">{p.name}</h2>
                            <BloodBadge type={p.bloodType} size="sm" />
                            {p.allergies.length > 0 && <Tag tone="danger">{p.allergies.length} alergia(s)</Tag>}
                            {p.medications.length > 0 && <Tag tone="moss">{p.medications.length} medicação(ões) contínuas</Tag>}
                          </div>
                          <p className="mt-0.5 text-sm text-mute">
                            {age !== null ? `${age} anos` : 'idade n/d'} · ficha <span className="font-mono">{p.record}</span>
                          </p>
                          {p.emergency.location && (
                            <p className="mt-2 flex items-start gap-1.5 text-sm text-ink">
                              <IconMapPin size={15} className="mt-0.5 shrink-0 text-warn-500" />
                              <span><strong>Local:</strong> {p.emergency.location}</span>
                            </p>
                          )}
                          {p.emergency.notes && <p className="mt-1.5 text-[13px] leading-relaxed text-mute">{p.emergency.notes}</p>}
                          <EventLog history={p.emergency.history} empty="Sem eventos ainda." />
                          <ConsultTrail log={log} patientId={p.id} />
                        </div>
                        <div className="flex flex-col gap-2 border-t border-line pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-mute">Ações</p>
                          {primary && (
                            <a
                              href={waLink(
                                primary.phone,
                                emergencyAlertText(p.name, age, label, p.emergency.location),
                              )}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-warn-500 px-3 py-2 text-xs font-bold text-white transition-all hover:bg-warn-600 active:scale-95"
                            >
                              <IconMessage size={14} /> WhatsApp — 1º contato
                            </a>
                          )}
                          <Btn variant="outline" size="sm" onClick={() => setNotifyEmergencyFor(p)}>
                            <IconBell size={14} /> Avisar rede de contatos
                          </Btn>
                          <Btn variant="outline" size="sm" onClick={() => onOpenRecord(p.id)}>
                            <IconChart size={14} /> Ver prontuário e cartão
                          </Btn>
                          <Btn variant="dark" size="sm" onClick={() => setResolvedFor(p)}>
                            <IconCheck size={14} /> Marcar como resolvida
                          </Btn>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {emergenciesResolved.length > 0 && (
            <section className="rise mt-8" style={{ animationDelay: '120ms' }}>
              <h2 className="mb-3 font-display text-base font-bold text-mute">Situações resolvidas</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {emergenciesResolved.slice(0, 4).map((p) => {
                  const last = [...p.emergency.history].reverse().find((e) => e.kind === 'resolved');
                  return (
                    <li key={p.id} className="flex items-center gap-3 rounded-xl border border-line bg-card px-3.5 py-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-moss-100 text-moss-700">
                        <IconCheck size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-ink">{p.name}</p>
                        <p className="truncate text-[11px] text-mute">
                          {last ? last.text : 'Resolvida'}
                          {last ? ` · ${formatDateTime(last.at)}` : ''}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}

      {/* ------------------------------- modais ------------------------------- */}

      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Reportar desaparecimento" subtitle="Ativa o alerta para a próxima identificação desta pessoa.">
        <div className="space-y-3">
          <Field label="Pessoa" required>
            <select className={inputCls} value={rPerson} onChange={(e) => setRPerson(e.target.value)}>
              <option value="">Selecione…</option>
              {eligibleMissing.map((p) => (
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

      <Modal open={sightingFor !== null} onClose={() => setSightingFor(null)} title={`Avistamento — ${sightingFor?.name ?? ''}`} subtitle="Registre onde e quando a pessoa foi vista.">
        <Field label="Descrição do avistamento" required>
          <textarea className={`${inputCls} min-h-20 resize-y`} value={sightingText} onChange={(e) => setSightingText(e.target.value)} placeholder="ex.: vista às 14h perto do terminal central, com blusa verde…" />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Btn variant="ghost" onClick={() => setSightingFor(null)}>Cancelar</Btn>
          <Btn onClick={logSighting}>
            <IconEye size={15} /> Registrar
          </Btn>
        </div>
      </Modal>

      <Modal open={eOpen} onClose={() => setEOpen(false)} title="Registrar situação de emergência" subtitle="Ativa o alerta de emergência para a próxima identificação.">
        <div className="space-y-3">
          <Field label="Pessoa" required>
            <select className={inputCls} value={ePerson} onChange={(e) => setEPerson(e.target.value)}>
              <option value="">Selecione…</option>
              {eligibleEmergency.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Tipo de situação" required>
            <select className={inputCls} value={eSituation} onChange={(e) => setESituation(e.target.value as EmergencySituation | '')}>
              <option value="">Selecione…</option>
              {EMERGENCY_SITUATIONS.map((s) => (
                <option key={s} value={s}>{EMERGENCY_SITUATION_META[s].label}</option>
              ))}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Data">
              <input type="date" className={inputCls} value={eSince} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setESince(e.target.value)} />
            </Field>
            <Field label="Local">
              <input className={inputCls} value={eLocation} onChange={(e) => setELocation(e.target.value)} placeholder="ex.: Hospital São Lucas — Emergência" />
            </Field>
          </div>
          <Field label="Descrição da situação">
            <textarea className={`${inputCls} min-h-16 resize-y`} value={eNotes} onChange={(e) => setENotes(e.target.value)} placeholder="Estado da pessoa, circunstâncias, quem registrou…" />
          </Field>
          {eErr && <p className="text-xs font-medium text-danger-600">{eErr}</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Btn variant="ghost" onClick={() => setEOpen(false)}>Cancelar</Btn>
          <Btn className="bg-warn-500 hover:bg-warn-600" onClick={submitEmergency}>
            <IconAlert size={15} /> Ativar alerta de emergência
          </Btn>
        </div>
      </Modal>

      <Modal open={resolvedFor !== null} onClose={() => setResolvedFor(null)} title={`Resolver emergência — ${resolvedFor?.name ?? ''}`} subtitle="Encerra o alerta de emergência.">
        <Field label="Como foi resolvida?">
          <textarea className={`${inputCls} min-h-20 resize-y`} value={resolvedText} onChange={(e) => setResolvedText(e.target.value)} placeholder="ex.: família chegou ao hospital; alta médica…" />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Btn variant="ghost" onClick={() => setResolvedFor(null)}>Cancelar</Btn>
          <Btn onClick={markResolved}>
            <IconCheck size={15} /> Confirmar resolução
          </Btn>
        </div>
      </Modal>

      {notifyMissingFor && (
        <NotifySheet
          patient={notifyMissingFor}
          mode="missing"
          onClose={() => setNotifyMissingFor(null)}
          onLogged={(names) => {
            onUpdate({
              ...notifyMissingFor,
              missing: {
                ...notifyMissingFor.missing,
                history: [
                  ...notifyMissingFor.missing.history,
                  { id: uid(), at: Date.now(), kind: 'notified', text: `Avisos enviados via app para: ${names.join(', ')}.` },
                ],
              },
            });
            toast('success', `${names.length} aviso(s) registrado(s) na auditoria.`);
          }}
        />
      )}

      {notifyEmergencyFor && (
        <NotifySheet
          patient={notifyEmergencyFor}
          mode="emergency"
          onClose={() => setNotifyEmergencyFor(null)}
          onLogged={(names) => {
            onUpdate({
              ...notifyEmergencyFor,
              emergency: {
                ...notifyEmergencyFor.emergency,
                history: [
                  ...notifyEmergencyFor.emergency.history,
                  { id: uid(), at: Date.now(), kind: 'notified', text: `Avisos enviados via app para: ${names.join(', ')}.` },
                ],
              },
            });
            toast('success', `${names.length} aviso(s) registrado(s) na auditoria.`);
          }}
        />
      )}
    </div>
  );
}
