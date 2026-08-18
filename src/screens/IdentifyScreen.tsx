import { useEffect, useMemo, useState } from 'react';
import type { IdEvent, MatchCandidate, Patient } from '../lib/types';
import { uid } from '../lib/store';
import {
  dHash,
  daysSince,
  ensurePatientHash,
  formatDateBR,
  makeThumb,
  MATCH_THRESHOLD,
  rankCandidates,
  REVIEW_THRESHOLD,
  timeAgo,
} from '../lib/biometrics';
import { Avatar, Btn, Corners, EmptyState, Modal, Tag, useToast } from '../components/ui';
import { CameraCapture } from '../components/CameraCapture';
import { FingerprintPad } from '../components/FingerprintPad';
import { EmergencyCard, ContactRow } from '../components/EmergencyCard';
import {
  IconAlert,
  IconBell,
  IconCamera,
  IconCheck,
  IconChevronRight,
  IconFace,
  IconFingerprint,
  IconMapPin,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSpinner,
  IconUpload,
  IconUsers,
} from '../components/icons';
import { ageFromBirth } from '../lib/biometrics';
import { fileToDataURL } from '../lib/biometrics';

const delay = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

type ScanStatus = 'match' | 'review' | 'none';

interface ScanResult {
  status: ScanStatus;
  candidates: MatchCandidate[];
  confidence: number;
  method: 'face' | 'finger';
  quality: number | null;
}

interface StepState {
  label: string;
  done: boolean;
}

const RESULT_LABEL: Record<IdEvent['result'], { text: string; cls: string }> = {
  match: { text: 'Identidade confirmada', cls: 'bg-moss-100 text-moss-700' },
  review: { text: 'Revisão manual', cls: 'bg-warn-100 text-warn-600' },
  none: { text: 'Sem correspondência', cls: 'bg-pine-900/8 text-mute' },
  notify: { text: 'Avisos enviados', cls: 'bg-info-100 text-info-600' },
  found: { text: 'Pessoa localizada', cls: 'bg-moss-100 text-moss-700' },
};

export function IdentifyScreen({
  patients,
  log,
  accountName,
  onPatientsUpdated,
  onLogEvent,
  onOpenRecord,
  onNewPatientWithPhoto,
  onGoPatients,
}: {
  patients: Patient[];
  log: IdEvent[];
  accountName: string;
  onPatientsUpdated: (p: Patient[]) => void;
  onLogEvent: (e: IdEvent) => void;
  onOpenRecord: (id: string) => void;
  onNewPatientWithPhoto: (photo: string) => void;
  onGoPatients: () => void;
}) {
  const toast = useToast();
  const [method, setMethod] = useState<'face' | 'finger'>('face');
  const [camOpen, setCamOpen] = useState(false);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [steps, setSteps] = useState<StepState[] | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [manualPickId, setManualPickId] = useState<string | null>(null);
  const [notified, setNotified] = useState<Set<string>>(new Set());
  const [foundOpen, setFoundOpen] = useState(false);
  const [foundText, setFoundText] = useState('');

  const identifiable = useMemo(() => patients.filter((p) => p.photo && p.photoHash), [patients]);

  // gera a assinatura visual de retratos cadastrados que ainda não têm hash
  useEffect(() => {
    const pending = patients.filter((p) => p.photo && !p.photoHash);
    if (pending.length === 0) return;
    let cancelled = false;
    Promise.all(pending.map(ensurePatientHash)).then((updated) => {
      if (cancelled) return;
      onPatientsUpdated(patients.map((p) => updated.find((u) => u.id === p.id) ?? p));
    });
    return () => {
      cancelled = true;
    };
  }, [patients, onPatientsUpdated]);

  const markStep = (idx: number) =>
    setSteps((s) => (s ? s.map((st, i) => (i === idx ? { ...st, done: true } : st)) : s));

  const resetScan = () => {
    setResult(null);
    setManualPickId(null);
    setNotified(new Set());
    setCapturedUrl(null);
    setSteps(null);
    setScanning(false);
  };

  const emitLog = (partial: Omit<IdEvent, 'id' | 'at' | 'byName'>) =>
    onLogEvent({ id: uid(), at: Date.now(), byName: accountName, ...partial });

  /* ------------------------- pipeline de retrato ------------------------- */

  const runPhotoPipeline = async (url: string) => {
    setScanning(true);
    setCapturedUrl(url);
    setResult(null);
    setManualPickId(null);
    setNotified(new Set());
    setSteps([
      { label: 'Gerando assinatura visual (dHash 64 bits)', done: false },
      { label: `Comparando com ${identifiable.length} registro(s) da base`, done: false },
      { label: 'Ranqueando candidatos por similaridade', done: false },
    ]);
    try {
      await delay(650);
      const hash = await dHash(url);
      markStep(0);
      await delay(600);
      const cands = rankCandidates(patients, hash);
      markStep(1);
      await delay(550);
      markStep(2);
      await delay(250);

      const best = cands[0];
      let status: ScanStatus = 'none';
      let confidence = 0;
      if (best) {
        confidence = best.confidence;
        if (confidence >= MATCH_THRESHOLD) status = 'match';
        else if (confidence >= REVIEW_THRESHOLD) status = 'review';
      }
      setResult({ status, candidates: cands, confidence, method: 'face', quality: null });
      const thumb = await makeThumb(url, 96).catch(() => url);
      emitLog({
        method: 'face',
        patientId: status === 'match' && best ? best.patient.id : null,
        patientName: status === 'match' && best ? best.patient.name : status === 'review' && best ? best.patient.name : '—',
        confidence,
        quality: null,
        result: status,
        thumb,
      });
      if (status === 'match' && best) {
        toast(
          best.patient.missing.active ? 'info' : 'success',
          best.patient.missing.active
            ? `${best.patient.name} identificada — ATENÇÃO: ela está desaparecida.`
            : `Identidade confirmada: ${best.patient.name} (${confidence}%).`,
        );
      } else if (status === 'review') {
        toast('info', 'Correspondência incerta — revise os candidatos manualmente.');
      } else {
        toast('error', 'Nenhuma correspondência acima do limiar na base local.');
      }
    } catch {
      toast('error', 'Falha ao analisar a imagem. Tente outro retrato.');
      resetScan();
    } finally {
      setScanning(false);
    }
  };

  /* ------------------------- pipeline de digital ------------------------- */

  const onFingerComplete = async (template: string, quality: number) => {
    setScanning(true);
    setResult(null);
    setManualPickId(null);
    setNotified(new Set());
    setSteps([
      { label: 'Extraindo minúcias do template local', done: false },
      { label: 'Comparando com digitais cadastradas', done: false },
    ]);
    await delay(700);
    markStep(0);
    await delay(700);
    markStep(1);
    await delay(350);

    const withFp = patients.filter((p) => p.fingerprint);
    if (withFp.length === 0) {
      setResult({ status: 'none', candidates: [], confidence: 0, method: 'finger', quality });
      emitLog({ method: 'finger', patientId: null, patientName: '—', confidence: 0, quality, result: 'none', thumb: null });
      toast('error', 'Nenhuma digital cadastrada na base para comparação.');
    } else {
      // comparação simulada localmente (a web não expõe leitores biométricos)
      const pick = withFp[Math.floor(Math.random() * withFp.length)];
      const confidence = Math.min(98, Math.round(68 + quality * 0.3));
      const status: ScanStatus = confidence >= MATCH_THRESHOLD ? 'match' : 'review';
      setResult({
        status,
        candidates: withFp.map((p) => ({ patient: p, distance: p.id === pick.id ? 3 : 40, confidence: p.id === pick.id ? confidence : Math.max(8, confidence - 55) })),
        confidence,
        method: 'finger',
        quality,
      });
      emitLog({ method: 'finger', patientId: pick.id, patientName: pick.name, confidence, quality, result: status, thumb: null });
      toast(
        pick.missing.active ? 'info' : 'success',
        pick.missing.active
          ? `${pick.name} identificada — ATENÇÃO: ela está desaparecida.`
          : `Digital confirmada: ${pick.name} (${confidence}%).`,
      );
    }
    setScanning(false);
  };

  /* ------------------------------ resultado ------------------------------ */

  const activePatient = useMemo(() => {
    if (!result) return null;
    if (manualPickId) return patients.find((p) => p.id === manualPickId) ?? null;
    if (result.status === 'match') return result.candidates[0]?.patient ?? null;
    return null;
  }, [result, manualPickId, patients]);

  const logNotifications = () => {
    if (!activePatient || notified.size === 0) return;
    const names = activePatient.contacts.filter((c) => notified.has(c.id)).map((c) => c.name);
    const evt: MissingEventLike = {
      id: uid(),
      at: Date.now(),
      kind: 'notified',
      text: `Avisos enviados via app para: ${names.join(', ')}.`,
    };
    onPatientsUpdated(
      patients.map((p) =>
        p.id === activePatient.id ? { ...p, missing: { ...p.missing, history: [...p.missing.history, evt] } } : p,
      ),
    );
    emitLog({
      method: result?.method ?? 'face',
      patientId: activePatient.id,
      patientName: activePatient.name,
      confidence: result?.confidence ?? 0,
      quality: null,
      result: 'notify',
      thumb: null,
      detail: names.join(', '),
    });
    setNotified(new Set());
    toast('success', `${names.length} aviso(s) registrado(s) na auditoria de ${activePatient.name.split(' ')[0]}.`);
  };

  const confirmFound = () => {
    if (!activePatient) return;
    onPatientsUpdated(
      patients.map((p) =>
        p.id === activePatient.id
          ? {
              ...p,
              missing: {
                ...p.missing,
                active: false,
                history: [
                  ...p.missing.history,
                  { id: uid(), at: Date.now(), kind: 'found', text: foundText.trim() || 'Localizada após identificação no app.' },
                ],
              },
            }
          : p,
      ),
    );
    emitLog({
      method: result?.method ?? 'face',
      patientId: activePatient.id,
      patientName: activePatient.name,
      confidence: result?.confidence ?? 0,
      quality: null,
      result: 'found',
      thumb: null,
    });
    setFoundOpen(false);
    setFoundText('');
    toast('success', `${activePatient.name} marcada como localizada. Caso encerrado.`);
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const url = await fileToDataURL(file, 640, 0.85);
      void runPhotoPipeline(url);
    } catch {
      toast('error', 'Não foi possível ler este arquivo.');
    }
  };

  if (patients.length === 0) {
    return (
      <EmptyState
        icon={<IconFace size={24} />}
        title="Base vazia — nada para comparar"
        desc="A identificação compara o retrato ou a digital com as pessoas cadastradas. Comece criando o cadastro de quem você quer proteger."
      >
        <Btn onClick={onGoPatients}>
          <IconPlus size={15} /> Cadastrar pessoas
        </Btn>
      </EmptyState>
    );
  }

  return (
    <div>
      <header className="rise mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-moss-700">
          objetivo secundário 01 — identificação de pessoas
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink">Central de identificação</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-mute">
          Compare um retrato ou uma digital com a base local. Se a pessoa estiver{' '}
          <strong className="text-danger-600">desaparecida</strong>, o alerta dispara na hora com a rede de avisos
          e o cartão de emergência.
        </p>
      </header>

      <div className="rise mb-5 inline-flex rounded-xl border border-line bg-card p-1 shadow-lift" style={{ animationDelay: '50ms' }}>
        {(
          [
            { key: 'face', label: 'Reconhecimento facial', icon: <IconFace size={16} /> },
            { key: 'finger', label: 'Impressão digital', icon: <IconFingerprint size={16} /> },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setMethod(t.key);
              resetScan();
            }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all ${
              method === t.key ? 'bg-pine-900 text-white shadow-sm' : 'text-mute hover:text-ink'
            }`}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{t.key === 'face' ? 'Facial' : 'Digital'}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ------------------------------ scan ------------------------------ */}
        <section className="rise space-y-4" style={{ animationDelay: '90ms' }}>
          <div className="overflow-hidden rounded-xl border border-line bg-card shadow-lift">
            <div className="relative aspect-[4/3] bg-pine-950">
              {method === 'face' ? (
                <>
                  {capturedUrl ? (
                    <>
                      <img src={capturedUrl} alt="Retrato em análise" className="h-full w-full object-cover" />
                      <Corners className="border-moss-300" />
                      {scanning && (
                        <>
                          <div className="scan-beam pointer-events-none absolute left-3 right-3 h-10 rounded bg-gradient-to-b from-transparent via-moss-300/40 to-transparent" />
                          <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-pine-950/60 to-transparent pb-3">
                            <span className="inline-flex items-center gap-2 font-mono text-xs text-moss-200">
                              <IconSpinner size={13} /> analisando…
                            </span>
                          </div>
                        </>
                      )}
                      {!scanning && result && (
                        <div className="absolute left-3 top-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${RESULT_LABEL[result.status].cls}`}>
                            {result.confidence}% de confiança
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
                      <div className="relative text-pine-200">
                        <IconFace size={64} strokeWidth={1.3} />
                        <span className="bracket-pulse absolute -right-3 -top-3 text-moss-400">
                          <IconSearch size={20} />
                        </span>
                      </div>
                      <p className="text-sm text-pine-200">
                        {identifiable.length > 0 ? (
                          <>
                            Base pronta: <strong className="text-moss-300">{identifiable.length}</strong> retrato(s) com assinatura visual.
                          </>
                        ) : (
                          'Nenhum retrato com assinatura na base — cadastre pessoas com foto.'
                        )}
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        <Btn onClick={() => setCamOpen(true)}>
                          <IconCamera size={15} /> Usar câmera
                        </Btn>
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-pine-700 bg-pine-850 px-3.5 py-2 text-sm font-semibold text-pine-100 transition-all hover:border-moss-400 hover:text-white active:scale-[0.97]">
                          <IconUpload size={15} /> Enviar imagem
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => void onUpload(e.target.files?.[0])} />
                        </label>
                        <Btn variant="ghost" className="text-moss-300 hover:bg-moss-500/10 hover:text-moss-200" onClick={() => void runPhotoPipeline('/portraits/ana.svg')}>
                          Testar com exemplo
                        </Btn>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-full flex-col justify-center gap-3 p-5 sm:p-7">
                  <FingerprintPad
                    onComplete={(t, q) => void onFingerComplete(t, q)}
                    hint="Pressione e segure o sensor para ler a digital"
                  />
                </div>
              )}
            </div>

            {/* etapas do pipeline */}
            {(steps || scanning) && (
              <div className="border-t border-line bg-paper/60 px-4 py-3">
                <ul className="space-y-1.5">
                  {(steps ?? []).map((s, i) => (
                    <li key={s.label} className="flex items-center gap-2.5 text-[13px]">
                      {s.done ? (
                        <span className="text-moss-600">
                          <IconCheck size={15} />
                        </span>
                      ) : i === (steps ?? []).findIndex((x) => !x.done) ? (
                        <IconSpinner size={15} className="text-moss-600" />
                      ) : (
                        <span className="h-[15px] w-[15px] rounded-full border border-line" />
                      )}
                      <span className={s.done ? 'text-ink' : 'text-mute'}>{s.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {capturedUrl && method === 'face' && !scanning && (
              <div className="flex flex-wrap gap-2 border-t border-line bg-card px-4 py-3">
                <Btn variant="outline" size="sm" onClick={resetScan}>
                  <IconRefresh size={14} /> Nova verificação
                </Btn>
                <Btn variant="dark" size="sm" onClick={() => onNewPatientWithPhoto(capturedUrl)}>
                  <IconPlus size={14} /> Cadastrar como nova pessoa
                </Btn>
                {result?.status === 'match' && result.candidates[0] && (
                  <Btn size="sm" className="ml-auto" onClick={() => onOpenRecord(result.candidates[0].patient.id)}>
                    Abrir prontuário <IconChevronRight size={14} />
                  </Btn>
                )}
              </div>
            )}
          </div>

          <p className="flex items-start gap-2 text-[12px] leading-relaxed text-mute">
            <IconAlert size={14} className="mt-0.5 shrink-0 text-warn-500" />
            <span>
              O reconhecimento facial roda <strong>100% neste dispositivo</strong> (assinatura perceptual, sem envio de
              fotos). A leitura de digital é simulada — navegadores não expõem sensores biométricos — e usa um
              template local.
            </span>
          </p>
        </section>

        {/* --------------------------- candidatos --------------------------- */}
        <aside className="rise space-y-4" style={{ animationDelay: '130ms' }}>
          <div className="rounded-xl border border-line bg-card p-4 shadow-lift">
            <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-[0.14em] text-mute">
              Candidatos da base
            </h2>
            {!result && !scanning && (
              <p className="rounded-lg bg-paper px-3 py-4 text-center text-[13px] text-mute">
                Realize uma verificação para ver o ranking de similaridade.
              </p>
            )}
            {scanning && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-mute">
                <IconSpinner size={16} className="text-moss-600" /> comparando assinaturas…
              </div>
            )}
            {result && result.candidates.length === 0 && (
              <p className="rounded-lg bg-paper px-3 py-4 text-center text-[13px] text-mute">
                Nenhum registro biométrico compatível na base.
              </p>
            )}
            {result && result.candidates.length > 0 && (
              <ul className="space-y-2">
                {result.candidates.slice(0, 5).map((c, i) => {
                  const isBest = i === 0 && result.status !== 'none';
                  const picked = manualPickId === c.patient.id;
                  return (
                    <li key={c.patient.id}>
                      <button
                        onClick={() => setManualPickId(picked ? null : c.patient.id)}
                        className={`w-full rounded-lg border p-2.5 text-left transition-all active:scale-[0.98] ${
                          picked
                            ? 'border-moss-500 bg-moss-50 shadow-sm'
                            : isBest
                              ? 'border-moss-500/40 bg-card hover:border-moss-300'
                              : 'border-line bg-card hover:border-pine-200'
                        }`}
                      >
                        <span className="flex items-center gap-2.5">
                          <Avatar patient={c.patient} size={38} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-ink">
                              {c.patient.name}
                              {isBest && <span className="ml-1.5 text-[10px] font-bold uppercase text-moss-600">melhor</span>}
                            </span>
                            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-line">
                              <span
                                className={`bar-fill block h-full rounded-full ${
                                  c.confidence >= MATCH_THRESHOLD ? 'bg-moss-500' : c.confidence >= REVIEW_THRESHOLD ? 'bg-warn-500' : 'bg-pine-300'
                                }`}
                                style={{ width: `${Math.max(3, c.confidence)}%` }}
                              />
                            </span>
                          </span>
                          <span className={`font-mono text-sm font-bold ${c.confidence >= MATCH_THRESHOLD ? 'text-moss-700' : c.confidence >= REVIEW_THRESHOLD ? 'text-warn-600' : 'text-mute'}`}>
                            {c.confidence}%
                          </span>
                        </span>
                        {c.patient.missing.active && (
                          <span className="mt-1.5 inline-flex items-center gap-1 rounded bg-danger-100 px-1.5 py-0.5 text-[10px] font-bold text-danger-600">
                            <span className="blink-dot h-1 w-1 rounded-full bg-danger-500" /> desaparecida
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {result && result.status === 'review' && !manualPickId && (
              <p className="mt-3 rounded-lg bg-warn-100/70 px-3 py-2 text-xs leading-relaxed text-warn-600">
                Confiança abaixo do limiar de confirmação automática ({MATCH_THRESHOLD}%). Toque em um candidato para
                revisar a identidade manualmente.
              </p>
            )}
          </div>

          {/* atividade recente */}
          <div className="rounded-xl border border-line bg-card p-4 shadow-lift">
            <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-[0.14em] text-mute">Atividade recente</h2>
            {log.length === 0 ? (
              <p className="text-[13px] text-mute">Nenhuma verificação registrada ainda.</p>
            ) : (
              <ul className="space-y-2.5">
                {log.slice(0, 6).map((e) => (
                  <li key={e.id} className="flex items-start gap-2.5">
                    {e.thumb ? (
                      <img src={e.thumb} alt="" className="mt-0.5 h-8 w-8 shrink-0 rounded-md border border-line object-cover" />
                    ) : (
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-pine-900/6 text-mute">
                        {e.method === 'face' ? <IconFace size={15} /> : <IconFingerprint size={15} />}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-ink">{e.patientName}</p>
                      <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-mute">
                        <span className={`rounded px-1.5 py-px font-bold ${RESULT_LABEL[e.result].cls}`}>{RESULT_LABEL[e.result].text}</span>
                        {e.confidence > 0 && <span className="font-mono">{e.confidence}%</span>}
                        {e.detail && <span className="truncate">· {e.detail}</span>}
                        <span className="ml-auto font-mono">{timeAgo(e.at)}</span>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {/* ------------------------- área de resultado ------------------------ */}
      {activePatient && (
        <section className="rise mt-7 space-y-5">
          {activePatient.missing.active && (
            <div className="overflow-hidden rounded-xl border-2 border-danger-500 bg-danger-100/70 shadow-lift">
              <div className="flex flex-wrap items-center gap-3 bg-danger-500 px-4 py-2.5 text-white">
                <span className="blink-dot h-2.5 w-2.5 rounded-full bg-white" />
                <p className="font-display text-sm font-bold uppercase tracking-[0.18em]">
                  Pessoa desaparecida — alerta ativo
                </p>
                <span className="ml-auto font-mono text-xs opacity-90">
                  há {daysSince(activePatient.missing.since)} dia(s)
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3.5">
                <p className="text-sm text-ink">
                  Desaparecida desde <strong>{formatDateBR(activePatient.missing.since)}</strong>
                </p>
                {activePatient.missing.lastPlace && (
                  <p className="flex items-center gap-1.5 text-sm text-ink">
                    <IconMapPin size={15} className="text-danger-600" />
                    último local: <strong>{activePatient.missing.lastPlace}</strong>
                  </p>
                )}
                <div className="ml-auto flex gap-2">
                  <Btn variant="dark" size="sm" onClick={() => setFoundOpen(true)}>
                    <IconCheck size={14} /> Marcar como localizada
                  </Btn>
                </div>
              </div>
              {activePatient.missing.notes && (
                <p className="border-t border-danger-500/25 px-4 py-2.5 text-[13px] text-mute">{activePatient.missing.notes}</p>
              )}
            </div>
          )}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
            <EmergencyCard patient={activePatient} />

            {/* rede de avisos */}
            <div className="rounded-xl border border-line bg-card p-4 shadow-lift">
              <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.14em] text-mute">
                <IconBell size={15} className="text-moss-600" /> Rede de avisos
              </h3>
              <p className="mb-3 mt-1 text-xs text-mute">
                {activePatient.missing.active
                  ? 'Avise os responsáveis e registre cada aviso na auditoria.'
                  : 'Contatos autorizados para acionar em caso de necessidade.'}
              </p>
              {activePatient.contacts.length === 0 ? (
                <div className="rounded-lg bg-paper px-3 py-4 text-center">
                  <p className="text-[13px] text-mute">Nenhum contato cadastrado para esta pessoa.</p>
                  <Btn variant="outline" size="sm" className="mt-2" onClick={() => onOpenRecord(activePatient.id)}>
                    <IconUsers size={14} /> Editar ficha e adicionar
                  </Btn>
                </div>
              ) : (
                <>
                  <ul className="space-y-2">
                    {[...activePatient.contacts]
                      .sort((a, b) => a.priority - b.priority)
                      .map((c) => (
                        <ContactRow
                          key={c.id}
                          contact={c}
                          personName={activePatient.name}
                          age={ageFromBirth(activePatient.birthDate)}
                          lastPlace={activePatient.missing.lastPlace}
                          notified={notified.has(c.id)}
                          onToggle={() =>
                            setNotified((s) => {
                              const n = new Set(s);
                              if (n.has(c.id)) n.delete(c.id);
                              else n.add(c.id);
                              return n;
                            })
                          }
                          alertMode={activePatient.missing.active}
                        />
                      ))}
                  </ul>
                  <Btn className="mt-3 w-full" disabled={notified.size === 0} onClick={logNotifications}>
                    <IconCheck size={15} />
                    Registrar {notified.size || ''} aviso(s) na auditoria
                  </Btn>
                  {activePatient.missing.active && (
                    <p className="mt-2 text-center text-[11px] text-mute">
                      Após avisar a rede, marque a pessoa como localizada para encerrar o caso.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      )}

      <CameraCapture
        open={camOpen}
        onClose={() => setCamOpen(false)}
        onCapture={(url) => void runPhotoPipeline(url)}
        title="Identificação por retrato"
      />

      <Modal
        open={foundOpen}
        onClose={() => setFoundOpen(false)}
        title={`Localizar ${activePatient?.name ?? ''}`}
        subtitle="Encerra o alerta de desaparecimento e arquiva o caso."
      >
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold text-ink">Como foi localizada?</span>
          <textarea
            className="w-full rounded-lg border border-line bg-white/80 px-3 py-2 text-sm transition-colors focus:border-moss-400"
            rows={3}
            value={foundText}
            onChange={(e) => setFoundText(e.target.value)}
            placeholder="ex.: reconhecida por foto no terminal central; filha avisada por WhatsApp…"
          />
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Tag tone="info">
            <IconBell size={12} className="mr-1" /> {notified.size} aviso(s) marcados nesta sessão
          </Tag>
          <div className="ml-auto flex gap-2">
            <Btn variant="ghost" onClick={() => setFoundOpen(false)}>Cancelar</Btn>
            <Btn onClick={confirmFound}>
              <IconCheck size={15} /> Confirmar localização
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

type MissingEventLike = {
  id: string;
  at: number;
  kind: 'notified';
  text: string;
};
