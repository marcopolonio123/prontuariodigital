import { useEffect, useMemo, useRef, useState } from 'react';
import type { AccessGrant, Account, Patient, VitalMetric, VitalSample } from '../lib/types';
import { uid } from '../lib/store';
import {
  assess, createMonitorSession, fmtVital, getProvider, latestByMetric, makeSamples,
  metricMeta, SOURCE_META, STATUS_META, VITAL_METRICS,
} from '../lib/vitals';
import { formatDateTime, timeAgo } from '../lib/biometrics';
import { Avatar, Btn, EmptyState, Field, inputCls, Tag, useToast } from '../components/ui';
import {
  IconActivity, IconAlert, IconCheck, IconClock, IconHeartPulse, IconInfo, IconPlus, IconX,
} from '../components/icons';

/* ------------------------------ sparkline ------------------------------ */

function Sparkline({ values, status }: { values: number[]; status: keyof typeof STATUS_META }) {
  if (values.length < 2) return <span className="font-mono text-[10px] text-mute">—</span>;
  const w = 118;
  const h = 34;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * (w - 6) + 3,
    h - 4 - ((v - min) / span) * (h - 8),
  ]);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const color =
    status === 'normal' ? 'var(--color-moss-500)' : status === 'caution' ? 'var(--color-warn-500)' : status === 'critical' ? 'var(--color-danger-500)' : 'var(--color-pine-300)';
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill={color} />
    </svg>
  );
}

/* ------------------------------- tela ------------------------------------ */

export function VitalsScreen({
  patients,
  patient,
  account,
  grants,
  onUpdate,
  onSelect,
}: {
  patients: Patient[];
  patient: Patient | null;
  account: Account;
  grants: AccessGrant[];
  onUpdate: (p: Patient) => void;
  onSelect: (id: string) => void;
}) {
  const toast = useToast();
  const provider = useMemo(() => getProvider(), []);

  const [monitoring, setMonitoring] = useState(false);
  const [recording, setRecording] = useState(true);
  const [live, setLive] = useState<VitalSample[]>([]);
  const [pendingSave, setPendingSave] = useState<VitalSample[] | null>(null);
  const [filter, setFilter] = useState<'all' | VitalMetric>('all');
  const [mMetric, setMMetric] = useState<VitalMetric>('glucose');
  const [mValue, setMValue] = useState('');
  const [mNote, setMNote] = useState('');
  const [mWhen, setMWhen] = useState(() => toLocalInput(Date.now()));
  const [mErr, setMErr] = useState('');
  const sessionRef = useRef<{ stop: () => void } | null>(null);
  const liveRef = useRef<VitalSample[]>([]);

  // "agora" em formato aceito pelo input datetime-local (YYYY-MM-DDTHH:mm)
  function toLocalInput(ts: number): string {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // encerra a sessão ao desmontar / trocar de prontuário
  useEffect(
    () => () => {
      sessionRef.current?.stop();
      sessionRef.current = null;
    },
    [patient?.id],
  );

  const commitSamples = (samples: VitalSample[]) => {
    if (!patient || samples.length === 0) return;
    onUpdate({ ...patient, vitals: [...patient.vitals, ...samples] });
  };

  const startSession = () => {
    setMonitoring(true);
    setLive([]);
    liveRef.current = [];
    sessionRef.current = createMonitorSession((bundle) => {
      const source = provider.kind === 'native' ? (provider.label.includes('HealthKit') ? 'healthkit' : 'healthconnect') : 'monitor';
      const samples = makeSamples(bundle, source, uid);
      liveRef.current = [...samples, ...liveRef.current];
      setLive(liveRef.current);
      if (recording && patient) {
        commitSamples(samples);
      }
    });
  };

  const stopSession = () => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setMonitoring(false);
    if (!recording && liveRef.current.length > 0) {
      setPendingSave(liveRef.current);
    } else if (recording && liveRef.current.length > 0) {
      toast('success', `${liveRef.current.length} medições gravadas no histórico de ${patient?.name.split(' ')[0]}.`);
    }
  };

  const saveManual = () => {
    const value = Number(mValue.replace(',', '.'));
    if (!mValue.trim() || Number.isNaN(value) || value <= 0) {
      setMErr('Informe um valor numérico válido.');
      return;
    }
    setMErr('');
    const when = mWhen ? new Date(mWhen).getTime() : Date.now();
    commitSamples([
      { id: uid(), metric: mMetric, value, at: Number.isNaN(when) ? Date.now() : when, source: 'manual', note: mNote.trim() || undefined },
    ]);
    setMValue('');
    setMNote('');
    setMWhen(toLocalInput(Date.now()));
    toast('success', `${metricMeta(mMetric).label} registrada no histórico.`);
  };

  /* --------------------------------- dados -------------------------------- */

  const samples = patient?.vitals ?? [];
  const latest = useMemo(() => latestByMetric(samples), [samples]);
  const sorted = useMemo(() => [...samples].sort((a, b) => b.at - a.at), [samples]);
  const visible = filter === 'all' ? sorted : sorted.filter((s) => s.metric === filter);
  const abnormalCount = useMemo(
    () => [...latest.values()].filter((s) => assess(s.metric, s.value) === 'critical' || assess(s.metric, s.value) === 'caution').length,
    [latest],
  );
  const grant = patient ? grants.find((g) => g.accountId === account.id && g.patientId === patient.id) : undefined;

  if (!patient) {
    return (
      <div>
        <header className="rise mb-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-moss-700">monitoramento</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink">Sinais vitais</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-mute">
            Escolha o prontuário a monitorar — o seu ou o de alguém sob sua responsabilidade (filho, pai/mãe, curador).
          </p>
        </header>
        {patients.length === 0 ? (
          <EmptyState icon={<IconActivity size={24} />} title="Nenhum prontuário acessível" desc="Cadastre uma pessoa para começar a monitorar os sinais vitais dela." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {patients.map((p) => {
              const g = grants.find((x) => x.accountId === account.id && x.patientId === p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => onSelect(p.id)}
                  className="rise rounded-xl border border-line bg-card p-4 text-left shadow-lift transition-all hover:-translate-y-1 hover:border-moss-300 hover:shadow-float active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <Avatar patient={p} size={44} />
                    <div className="min-w-0">
                      <p className="truncate font-display text-[15px] font-bold text-ink">{p.name}</p>
                      <p className="text-xs text-mute">{p.vitals.length} medição(ões) no histórico</p>
                    </div>
                  </div>
                  <p className="mt-2.5">
                    {g ? <Tag tone="info">delegado por {g.grantedByName || 'titular'} · {g.level}</Tag> : <Tag tone="moss">você como {account.role}</Tag>}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const firstName = patient.name.split(' ')[0];
  const liveLatest = latestByMetric(live);

  return (
    <div>
      {/* cabeçalho + seletor */}
      <header className="rise mb-5 flex flex-wrap items-center gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-moss-700">monitoramento</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink">Sinais vitais</h1>
        </div>
        <div className="ml-auto flex items-center gap-2.5 rounded-xl border border-line bg-card px-3 py-2 shadow-lift">
          <Avatar patient={patient} size={34} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold leading-tight text-ink">{patient.name}</p>
            <p className="text-[10px] uppercase tracking-wider text-mute">
              {grant ? `delegado por ${grant.grantedByName || 'titular'} · ${grant.level}` : `você como ${account.role}`}
            </p>
          </div>
          {patients.length > 1 && (
            <select className={inputCls} value={patient.id} onChange={(e) => onSelect(e.target.value)} style={{ width: 44, padding: '4px 6px' }} aria-label="Trocar prontuário">
              {patients.map((p) => (
                <option key={p.id} value={p.id}>{p.name.split(' ')[0]}</option>
              ))}
            </select>
          )}
        </div>
      </header>

      {/* faixa do provedor */}
      <p className="rise mb-5 flex items-start gap-2.5 rounded-xl border border-info-500/25 bg-info-100/50 px-4 py-3 text-[13px] leading-relaxed text-info-600" style={{ animationDelay: '40ms' }}>
        <IconInfo size={16} className="mt-0.5 shrink-0" />
        <span>
          Fonte de leitura: <strong>{provider.label}</strong>.
          {provider.kind === 'native'
            ? ' Leituras reais dos serviços gratuitos do sistema, gravadas no prontuário com seu consentimento.'
            : ' No APK, esta tela lê do Health Connect (Android) e HealthKit (iOS) — serviços gratuitos da plataforma. No navegador, use a sessão demonstrativa ou a entrada manual.'}
          {' '}Tudo fica salvo no prontuário de <strong>{firstName}</strong>.
        </span>
      </p>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* --------------------- painel de monitoramento --------------------- */}
        <section className="space-y-5">
          <div className="rise relative overflow-hidden rounded-xl border border-pine-800 bg-pine-900 shadow-lift" style={{ animationDelay: '70ms' }}>
            <div className="scanlines pointer-events-none absolute inset-0" />
            <div className="relative p-5">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
                  <IconHeartPulse size={20} className={monitoring ? 'text-danger-500' : 'text-moss-300'} />
                  Sessão de monitoramento
                </h2>
                {monitoring && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-danger-500">
                    <span className="blink-dot h-1.5 w-1.5 rounded-full bg-danger-500" /> ao vivo
                  </span>
                )}
                <div className="ml-auto flex items-center gap-3">
                  <button
                    onClick={() => setRecording((v) => !v)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all active:scale-95 ${
                      recording
                        ? 'border-moss-500/40 bg-moss-500/15 text-moss-300'
                        : 'border-pine-700 bg-pine-850 text-pine-200 hover:text-white'
                    }`}
                    title="Grava cada medição no histórico do prontuário"
                  >
                    <span className={`h-2 w-2 rounded-full ${recording ? 'bg-moss-400' : 'bg-pine-600'}`} />
                    gravar no histórico
                  </button>
                  {!monitoring ? (
                    <Btn onClick={startSession}>
                      <IconActivity size={15} /> Iniciar
                    </Btn>
                  ) : (
                    <Btn variant="danger" onClick={stopSession}>
                      <IconX size={15} /> Parar
                    </Btn>
                  )}
                </div>
              </div>

              {/* leituras ao vivo */}
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {(['heart', 'systolic', 'diastolic', 'spo2', 'temp'] as VitalMetric[]).map((m) => {
                  const meta = metricMeta(m);
                  const sample = liveLatest.get(m);
                  const status = sample ? assess(m, sample.value) : 'neutral';
                  const st = STATUS_META[status];
                  return (
                    <div key={m} className="rounded-lg border border-pine-700 bg-pine-850 p-3">
                      <p className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-pine-200">
                        {meta.short}
                        {monitoring && m === 'heart' && <IconHeartPulse size={12} className="text-danger-500" />}
                      </p>
                      <p className={`mt-1 font-mono text-2xl font-semibold leading-none ${sample ? st.text.replace('text-moss-700', 'text-moss-300').replace('text-mute', 'text-pine-200') : 'text-pine-300'}`}>
                        {sample ? fmtVital(m, sample.value) : '—'}
                        <span className="ml-1 text-[10px] font-normal text-pine-200/70">{meta.unit}</span>
                      </p>
                      <p className={`mt-1.5 text-[10px] font-bold uppercase tracking-wide ${sample ? st.text.replace('text-moss-700', 'text-moss-300').replace('text-warn-600', 'text-warn-500').replace('text-danger-600', 'text-danger-500').replace('text-mute', 'text-pine-300') : 'text-pine-300/60'}`}>
                        {sample ? st.label : 'aguardando'}
                      </p>
                    </div>
                  );
                })}
              </div>

              {!monitoring && live.length === 0 && (
                <p className="mt-4 text-[13px] text-pine-200/80">
                  Inicie a sessão para ler FC, pressão, SpO₂ e temperatura em tempo real. Com “gravar no histórico”
                  ativo, cada medição entra direto no prontuário de {firstName}.
                </p>
              )}
              {monitoring && (
                <p className="mt-4 font-mono text-[11px] text-pine-200/70">
                  {live.length} leitura(s) na sessão · nova medição a cada ~2,6 s
                </p>
              )}
            </div>
          </div>

          {/* salvar sessão não gravada */}
          {pendingSave && (
            <div className="rise flex flex-wrap items-center gap-3 rounded-xl border border-warn-500/40 bg-warn-100/70 px-4 py-3">
              <IconAlert size={17} className="shrink-0 text-warn-600" />
              <p className="flex-1 text-[13px] font-medium text-warn-600">
                A sessão terminou com <strong>{pendingSave.length} medições não gravadas</strong>. Quer salvá-las no
                histórico de {firstName}?
              </p>
              <div className="flex gap-2">
                <Btn
                  size="sm"
                  onClick={() => {
                    commitSamples(pendingSave);
                    setPendingSave(null);
                    toast('success', `${pendingSave.length} medições gravadas no histórico.`);
                  }}
                >
                  <IconCheck size={14} /> Salvar
                </Btn>
                <Btn variant="ghost" size="sm" onClick={() => setPendingSave(null)}>
                  Descartar
                </Btn>
              </div>
            </div>
          )}

          {/* entrada manual */}
          <div className="rise rounded-xl border border-line bg-card p-4 shadow-lift" style={{ animationDelay: '100ms' }}>
            <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.14em] text-mute">
              <IconPlus size={15} className="text-moss-600" /> Registrar manualmente
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_120px_1fr_200px_auto]">
              <Field label="Sinal">
                <select className={inputCls} value={mMetric} onChange={(e) => setMMetric(e.target.value as VitalMetric)}>
                  {VITAL_METRICS.map((m) => (
                    <option key={m.key} value={m.key}>{m.label} ({m.unit})</option>
                  ))}
                </select>
              </Field>
              <Field label={`Valor (${metricMeta(mMetric).unit})`}>
                <input
                  className={`${inputCls} ${mErr ? 'border-danger-500' : ''}`}
                  value={mValue}
                  onChange={(e) => setMValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveManual()}
                  placeholder="ex.: 120"
                  inputMode="decimal"
                />
              </Field>
              <Field label="Observação" hint="opcional">
                <input className={inputCls} value={mNote} onChange={(e) => setMNote(e.target.value)} placeholder="ex.: em jejum, pós-esforço…" />
              </Field>
              <Field label="Data e hora" hint="sugerido: agora">
                <div className="flex items-center gap-1.5">
                  <input
                    type="datetime-local"
                    className={inputCls}
                    value={mWhen}
                    max={toLocalInput(Date.now())}
                    onChange={(e) => setMWhen(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setMWhen(toLocalInput(Date.now()))}
                    title="Usar data e hora atuais"
                    className="shrink-0 rounded-lg border border-line bg-paper p-2 text-mute transition-all hover:border-moss-300 hover:text-moss-700 active:scale-95"
                  >
                    <IconClock size={15} />
                  </button>
                </div>
              </Field>
              <div className="flex items-end sm:col-span-2 lg:col-span-1">
                <Btn onClick={saveManual} className="w-full sm:w-auto">
                  <IconCheck size={15} /> Registrar
                </Btn>
              </div>
            </div>
            {mErr && <p className="mt-2 text-xs font-medium text-danger-600">{mErr}</p>}
          </div>
        </section>

        {/* --------------------------- painel lateral ------------------------ */}
        <aside className="space-y-4">
          {/* resumo */}
          <div className="rise grid grid-cols-3 divide-x divide-line rounded-xl border border-line bg-card text-center shadow-lift" style={{ animationDelay: '90ms' }}>
            <div className="px-2 py-3.5">
              <p className="font-mono text-xl font-semibold text-ink">{samples.length}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-mute">medições</p>
            </div>
            <div className="px-2 py-3.5">
              <p className="font-mono text-sm font-semibold text-ink">{sorted[0] ? formatDateTime(sorted[0].at) : '—'}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-mute">última medição</p>
            </div>
            <div className="px-2 py-3.5">
              <p className={`font-mono text-xl font-semibold ${abnormalCount > 0 ? 'text-warn-600' : 'text-moss-700'}`}>{abnormalCount}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-mute">alertas</p>
            </div>
          </div>

          {/* cartões por métrica */}
          <div className="rise space-y-2" style={{ animationDelay: '120ms' }}>
            <h3 className="font-display text-sm font-bold uppercase tracking-[0.14em] text-mute">Últimas por sinal</h3>
            {VITAL_METRICS.filter((m) => latest.has(m.key)).map((m) => {
              const s = latest.get(m.key)!;
              const status = assess(m.key, s.value);
              const st = STATUS_META[status];
              const series = sorted.filter((x) => x.metric === m.key).slice(0, 14).reverse().map((x) => x.value);
              return (
                <div key={m.key} className="flex items-center gap-3 rounded-xl border border-line bg-card p-3 shadow-lift transition-all hover:border-pine-200">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${st.dot}`} title={st.label} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-ink">{m.label}</p>
                    <p className="text-[11px] text-mute">{timeAgo(s.at)} · {SOURCE_META[s.source]}</p>
                  </div>
                  <Sparkline values={series} status={status} />
                  <p className="w-20 text-right">
                    <span className="font-mono text-lg font-semibold text-ink">{fmtVital(m.key, s.value)}</span>
                    <span className="block text-[10px] text-mute">{m.unit}</span>
                  </p>
                </div>
              );
            })}
            {latest.size === 0 && (
              <p className="rounded-xl border border-dashed border-line bg-card/60 px-4 py-6 text-center text-[13px] text-mute">
                Sem medições ainda — inicie uma sessão ou registre manualmente.
              </p>
            )}
          </div>
        </aside>
      </div>

      {/* ------------------------------ histórico ---------------------------- */}
      <section className="rise mt-7" style={{ animationDelay: '140ms' }}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-2 font-display text-lg font-bold text-ink">Histórico de {firstName}</h2>
          <button
            onClick={() => setFilter('all')}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
              filter === 'all' ? 'border-pine-900 bg-pine-900 text-white' : 'border-line bg-card text-mute hover:border-pine-200 hover:text-ink'
            }`}
          >
            Todos · {sorted.length}
          </button>
          {VITAL_METRICS.filter((m) => samples.some((s) => s.metric === m.key)).map((m) => (
            <button
              key={m.key}
              onClick={() => setFilter(filter === m.key ? 'all' : m.key)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                filter === m.key ? 'border-pine-900 bg-pine-900 text-white' : 'border-line bg-card text-mute hover:border-pine-200 hover:text-ink'
              }`}
            >
              {m.short}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={<IconClock size={22} />}
            title="Histórico vazio"
            desc="As medições gravadas — da sessão de monitoramento, manuais ou do Health Connect/HealthKit — aparecem aqui, sempre no prontuário da pessoa autorizada."
          />
        ) : (
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {visible.slice(0, 24).map((s) => {
              const meta = metricMeta(s.metric);
              const status = assess(s.metric, s.value);
              const st = STATUS_META[status];
              return (
                <li key={s.id} className="flex items-center gap-3 rounded-xl border border-line bg-card px-3.5 py-2.5 shadow-lift">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${st.dot}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-ink">
                      {meta.label}
                      {s.note && <span className="ml-1.5 font-normal italic text-mute">· {s.note}</span>}
                    </p>
                    <p className="text-[11px] text-mute">
                      {formatDateTime(s.at)} · {SOURCE_META[s.source]}
                    </p>
                  </div>
                  <p className="text-right">
                    <span className={`font-mono text-base font-semibold ${st.text}`}>{fmtVital(s.metric, s.value)}</span>
                    <span className="block text-[10px] text-mute">{meta.unit}</span>
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        {visible.length > 24 && (
          <p className="mt-3 text-center font-mono text-[11px] text-mute">mostrando as 24 mais recentes de {visible.length}</p>
        )}
      </section>
    </div>
  );
}
