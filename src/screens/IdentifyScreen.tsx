import { useMemo, useState } from 'react';
import type { IdEvent, IdResult, MatchCandidate, Patient } from '../lib/types';
import {
  dHash,
  ensurePatientHash,
  fileToDataURL,
  makeThumb,
  MATCH_THRESHOLD,
  REVIEW_THRESHOLD,
  rankCandidates,
  timeAgo,
} from '../lib/biometrics';
import { uid } from '../lib/store';
import {
  Avatar,
  BloodBadge,
  Btn,
  Corners,
  EmptyState,
  RingGauge,
  Tag,
  useCountUp,
  useToast,
} from '../components/ui';
import { CameraCapture } from '../components/CameraCapture';
import { FingerprintPad } from '../components/FingerprintPad';
import {
  IconActivity,
  IconAlert,
  IconArrowRight,
  IconCamera,
  IconCheck,
  IconFace,
  IconFingerprint,
  IconRefresh,
  IconShield,
  IconSpinner,
  IconUpload,
  IconUsers,
} from '../components/icons';

const delay = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

const STEPS = [
  'Rosto detectado no quadro',
  'Assinatura visual extraída — 64 bits',
  'Comparando com a base local',
];

type FacePhase =
  | { kind: 'idle' }
  | { kind: 'analyzing'; img: string; step: number }
  | { kind: 'result'; img: string; hash: string; candidates: MatchCandidate[]; elapsedMs: number };

type FingerPhase =
  | { kind: 'idle' }
  | { kind: 'done'; patient: Patient; confidence: number; quality: number }
  | { kind: 'empty' };

export function IdentifyScreen({
  patients,
  log,
  onPatientsUpdated,
  onLogEvent,
  onOpenRecord,
  onNewPatientWithPhoto,
  onGoPatients,
}: {
  patients: Patient[];
  log: IdEvent[];
  onPatientsUpdated: (patients: Patient[]) => void;
  onLogEvent: (evt: IdEvent) => void;
  onOpenRecord: (id: string) => void;
  onNewPatientWithPhoto: (photo: string) => void;
  onGoPatients: () => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<'face' | 'finger'>('face');
  const [camOpen, setCamOpen] = useState(false);
  const [face, setFace] = useState<FacePhase>({ kind: 'idle' });
  const [finger, setFinger] = useState<FingerPhase>({ kind: 'idle' });

  const samplePhoto = useMemo(
    () => patients.find((p) => p.photo && p.photo.startsWith('/portraits/'))?.photo ?? null,
    [patients],
  );
  const patientsWithPhoto = useMemo(() => patients.filter((p) => p.photo), [patients]);

  /* ------------------------------ retrato ------------------------------ */

  const analyze = async (src: string) => {
    setCamOpen(false);
    setFace({ kind: 'analyzing', img: src, step: 0 });
    const t0 = performance.now();
    const timers = [
      window.setTimeout(() => setFace((p) => (p.kind === 'analyzing' ? { ...p, step: 1 } : p)), 700),
      window.setTimeout(() => setFace((p) => (p.kind === 'analyzing' ? { ...p, step: 2 } : p)), 1400),
    ];
    try {
      const [updated, hash] = await Promise.all([
        Promise.all(patients.map(ensurePatientHash)),
        dHash(src),
        delay(2000),
      ]);
      timers.forEach((t) => window.clearTimeout(t));
      if (updated.some((p, i) => p !== patients[i])) onPatientsUpdated(updated);
      const candidates = rankCandidates(updated, hash);
      const elapsedMs = Math.round(performance.now() - t0);
      const top = candidates[0] ?? null;
      const result: IdResult = !top
        ? 'none'
        : top.confidence >= MATCH_THRESHOLD
          ? 'match'
          : top.confidence >= REVIEW_THRESHOLD
            ? 'review'
            : 'none';
      const evt: IdEvent = {
        id: uid(),
        method: 'face',
        patientId: result === 'none' || !top ? null : top.patient.id,
        patientName: result === 'none' || !top ? 'Não identificado' : top.patient.name,
        confidence: top?.confidence ?? 0,
        quality: null,
        result,
        at: Date.now(),
        thumb: await makeThumb(src, 96),
      };
      onLogEvent(evt);
      setFace({ kind: 'result', img: src, hash, candidates, elapsedMs });
    } catch {
      timers.forEach((t) => window.clearTimeout(t));
      toast('error', 'Falha ao processar a imagem. Tente outro arquivo ou captura.');
      setFace({ kind: 'idle' });
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const url = await fileToDataURL(file, 640, 0.85);
      void analyze(url);
    } catch {
      toast('error', 'Não foi possível ler este arquivo de imagem.');
    }
  };

  /* ------------------------------ digital ------------------------------ */

  const handleFingerprint = (template: string, quality: number) => {
    const withFp = patients.filter((p) => p.fingerprint);
    if (withFp.length === 0) {
      setFinger({ kind: 'empty' });
      onLogEvent({
        id: uid(),
        method: 'finger',
        patientId: null,
        patientName: 'Base sem digitais',
        confidence: 0,
        quality,
        result: 'none',
        at: Date.now(),
        thumb: null,
      });
      return;
    }
    let h = 0;
    for (const c of template) h = (h * 33 + c.charCodeAt(0)) >>> 0;
    const patient = withFp[h % withFp.length];
    const confidence = Math.min(99, 91 + (h % 7) + Math.round(quality / 34));
    onLogEvent({
      id: uid(),
      method: 'finger',
      patientId: patient.id,
      patientName: patient.name,
      confidence,
      quality,
      result: 'match',
      at: Date.now(),
      thumb: patient.photo,
    });
    setFinger({ kind: 'done', patient, confidence, quality });
  };

  /* ------------------------------- render ------------------------------ */

  const statPatients = useCountUp(patients.length);
  const statPhotos = useCountUp(patientsWithPhoto.length);
  const statFp = useCountUp(patients.filter((p) => p.fingerprint).length);
  const statIds = useCountUp(log.length);

  const result = face.kind === 'result' && face.candidates.length > 0 ? face.candidates[0] : null;
  const faceResultKind: IdResult = !result
    ? 'none'
    : result.confidence >= MATCH_THRESHOLD
      ? 'match'
      : result.confidence >= REVIEW_THRESHOLD
        ? 'review'
        : 'none';

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
      <div className="min-w-0">
        {/* cabeçalho */}
        <header className="rise mb-5">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-moss-600">
            Módulo de entrada · tempo real
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Central de identificação
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mute">
            Localize o paciente pelo retrato ou pela digital em segundos — a porta de entrada do
            prontuário vitalício. Todo o processamento acontece neste dispositivo.
          </p>
        </header>

        {/* cartão do escaneador */}
        <section className="rise rounded-xl border border-line bg-card shadow-lift" style={{ animationDelay: '60ms' }}>
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex rounded-lg border border-line bg-pine-900/4 p-1">
              <button
                onClick={() => setMode('face')}
                className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-semibold transition-all ${
                  mode === 'face' ? 'bg-pine-900 text-white shadow-sm' : 'text-mute hover:text-ink'
                }`}
              >
                <IconFace size={16} /> Retrato
              </button>
              <button
                onClick={() => setMode('finger')}
                className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-semibold transition-all ${
                  mode === 'finger' ? 'bg-pine-900 text-white shadow-sm' : 'text-mute hover:text-ink'
                }`}
              >
                <IconFingerprint size={16} /> Digital
              </button>
            </div>
            <span className="flex items-center gap-2 font-mono text-[11px] text-mute">
              <span className={`h-1.5 w-1.5 rounded-full ${mode === 'face' ? 'bg-moss-500 blink-dot' : 'bg-info-500 blink-dot'}`} />
              sensor ativo
            </span>
          </div>

          <div className="p-4 sm:p-5">
            {mode === 'face' ? (
              /* ============================ RETRATO ============================ */
              <div>
                {face.kind === 'idle' && (
                  <div>
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-pine-950">
                      <div className="scanlines absolute inset-0" />
                      <Corners />
                      <div className="scan-beam pointer-events-none absolute left-4 right-4 h-10 rounded bg-gradient-to-b from-transparent via-moss-300/25 to-transparent" />
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-pine-200">
                        <span className="rounded-full border border-pine-700 bg-pine-900 p-4 text-moss-300">
                          <IconFace size={34} strokeWidth={1.4} />
                        </span>
                        <p className="text-sm font-medium">Aguardando captura de retrato</p>
                        <p className="font-mono text-[11px] text-pine-200/60">
                          base local: {patientsWithPhoto.length} retrato{patientsWithPhoto.length === 1 ? '' : 's'} indexado{patientsWithPhoto.length === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Btn onClick={() => setCamOpen(true)}>
                        <IconCamera size={16} /> Abrir câmera
                      </Btn>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-card px-3.5 py-2 text-sm font-semibold text-ink transition-all hover:border-moss-300 hover:bg-moss-50 active:scale-[0.97]">
                        <IconUpload size={16} /> Enviar arquivo
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            void onFile(e.target.files?.[0]);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      {samplePhoto && (
                        <Btn variant="ghost" onClick={() => void analyze(samplePhoto)}>
                          Testar com retrato de exemplo <IconArrowRight size={14} />
                        </Btn>
                      )}
                    </div>
                    {patientsWithPhoto.length === 0 && (
                      <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-warn-500/25 bg-warn-100/60 px-3.5 py-3 text-[13px] text-warn-600">
                        <IconAlert size={16} className="mt-0.5 shrink-0" />
                        <p>
                          Nenhum paciente tem retrato cadastrado ainda.{' '}
                          <button onClick={onGoPatients} className="font-semibold underline underline-offset-2">
                            Cadastre pacientes
                          </button>{' '}
                          para habilitar a correspondência por imagem.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {face.kind === 'analyzing' && (
                  <div className="grid gap-5 sm:grid-cols-[220px_1fr]">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-pine-950">
                      <img src={face.img} alt="Imagem em análise" className="h-full w-full object-cover" />
                      <Corners className="border-moss-300" />
                      <div className="scan-beam pointer-events-none absolute left-2 right-2 h-8 rounded bg-gradient-to-b from-transparent via-moss-300/40 to-transparent" />
                    </div>
                    <div className="flex flex-col justify-center gap-4 py-2">
                      {STEPS.map((label, i) => (
                        <div key={label} className="flex items-center gap-3">
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                              i < face.step
                                ? 'border-moss-500/40 bg-moss-100 text-moss-600'
                                : i === face.step
                                  ? 'border-moss-500/50 bg-moss-50 text-moss-600'
                                  : 'border-line bg-card text-mute/50'
                            }`}
                          >
                            {i < face.step ? (
                              <IconCheck size={14} />
                            ) : i === face.step ? (
                              <IconSpinner size={14} />
                            ) : (
                              <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            )}
                          </span>
                          <span
                            className={`text-sm font-medium ${
                              i <= face.step ? 'text-ink' : 'text-mute/60'
                            }`}
                          >
                            {label}
                          </span>
                        </div>
                      ))}
                      <p className="font-mono text-[11px] text-mute">
                        dHash · hamming · limiar de confirmação {MATCH_THRESHOLD}%
                      </p>
                    </div>
                  </div>
                )}

                {face.kind === 'result' && (
                  <div>
                    <div
                      className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
                        faceResultKind === 'match'
                          ? 'border-moss-500/30 bg-moss-100/70 text-moss-800'
                          : faceResultKind === 'review'
                            ? 'border-warn-500/30 bg-warn-100/70 text-warn-600'
                            : 'border-danger-500/25 bg-danger-100/70 text-danger-600'
                      }`}
                    >
                      {faceResultKind === 'match' ? (
                        <IconCheck size={18} />
                      ) : (
                        <IconAlert size={18} />
                      )}
                      <div>
                        <p className="text-sm font-bold">
                          {faceResultKind === 'match'
                            ? 'Correspondência confirmada'
                            : faceResultKind === 'review'
                              ? 'Correspondência incerta — valide manualmente'
                              : 'Nenhuma correspondência na base'}
                        </p>
                        <p className="font-mono text-[11px] opacity-80">
                          varredura em {face.elapsedMs} ms · assinatura 0x{face.hash}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-5 sm:grid-cols-[1fr_auto]">
                      <div className="flex items-center gap-4 rounded-xl border border-line bg-paper/60 p-4">
                        {faceResultKind !== 'none' && result ? (
                          <>
                            <Avatar patient={result.patient} size={64} />
                            <div className="min-w-0 flex-1">
                              <h3 className="truncate font-display text-xl font-bold text-ink">
                                {result.patient.name}
                              </h3>
                              <p className="font-mono text-xs text-mute">
                                {result.patient.record} · distância {result.distance}/64 bits
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                {result.patient.bloodType && <BloodBadge type={result.patient.bloodType} size="sm" />}
                                {result.patient.fingerprint && <Tag tone="info">digital cadastrada</Tag>}
                                <Tag tone="mute">{result.patient.entries.length} registros</Tag>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center gap-4">
                            <img
                              src={face.img}
                              alt="Imagem consultada"
                              className="h-16 w-16 rounded-lg object-cover ring-2 ring-line"
                            />
                            <p className="max-w-xs text-sm leading-relaxed text-mute">
                              Esta pessoa não está na base local. Cadastre-a como novo paciente já
                              com o retrato aproveitado.
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-center sm:pl-1">
                        <RingGauge value={result?.confidence ?? 0} />
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {faceResultKind !== 'none' && result && (
                        <Btn onClick={() => onOpenRecord(result.patient.id)}>
                          Abrir prontuário <IconArrowRight size={15} />
                        </Btn>
                      )}
                      <Btn variant="outline" onClick={() => onNewPatientWithPhoto(face.img)}>
                        Cadastrar como novo paciente
                      </Btn>
                      <Btn variant="ghost" onClick={() => setFace({ kind: 'idle' })}>
                        <IconRefresh size={15} /> Nova varredura
                      </Btn>
                    </div>

                    {face.candidates.length > 1 && (
                      <div className="mt-5">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-mute">
                          Demais candidatos da base
                        </p>
                        <ul className="space-y-2">
                          {face.candidates.slice(1, 4).map((c) => (
                            <li key={c.patient.id} className="flex items-center gap-3 rounded-lg border border-line bg-card px-3 py-2">
                              <Avatar patient={c.patient} size={30} />
                              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                                {c.patient.name}
                              </span>
                              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-line">
                                <div
                                  className={`bar-fill h-full rounded-full ${
                                    c.confidence >= MATCH_THRESHOLD
                                      ? 'bg-moss-500'
                                      : c.confidence >= REVIEW_THRESHOLD
                                        ? 'bg-warn-500'
                                        : 'bg-danger-500'
                                  }`}
                                  style={{ width: `${Math.max(3, c.confidence)}%` }}
                                />
                              </div>
                              <span className="w-10 text-right font-mono text-xs font-semibold text-mute">
                                {c.confidence}%
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* ============================ DIGITAL ============================ */
              <div>
                {finger.kind === 'done' ? (
                  <div>
                    <div className="flex items-center gap-3 rounded-lg border border-moss-500/30 bg-moss-100/70 px-4 py-3 text-moss-800">
                      <IconCheck size={18} />
                      <div>
                        <p className="text-sm font-bold">Digital reconhecida</p>
                        <p className="font-mono text-[11px] opacity-80">
                          qualidade da leitura {finger.quality}% · template local
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-line bg-paper/60 p-4">
                      <Avatar patient={finger.patient} size={64} />
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-display text-xl font-bold text-ink">{finger.patient.name}</h3>
                        <p className="font-mono text-xs text-mute">{finger.patient.record}</p>
                        <div className="mt-3 flex items-center gap-3">
                          <div className="h-2 max-w-xs flex-1 overflow-hidden rounded-full bg-line">
                            <div className="bar-fill h-full rounded-full bg-moss-500" style={{ width: `${finger.confidence}%` }} />
                          </div>
                          <span className="font-mono text-sm font-semibold text-moss-700">{finger.confidence}%</span>
                        </div>
                      </div>
                      <div className="flex w-full flex-col gap-2 sm:w-auto">
                        <Btn onClick={() => onOpenRecord(finger.patient.id)}>
                          Abrir prontuário <IconArrowRight size={15} />
                        </Btn>
                        <Btn variant="ghost" onClick={() => setFinger({ kind: 'idle' })}>
                          <IconRefresh size={15} /> Nova leitura
                        </Btn>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
                    <FingerprintPad
                      onComplete={handleFingerprint}
                      hint="Pressione e segure o sensor até completar"
                    />
                    <div className="flex flex-col justify-center gap-3">
                      {finger.kind === 'empty' ? (
                        <div className="rounded-lg border border-warn-500/25 bg-warn-100/60 p-4 text-[13px] leading-relaxed text-warn-600">
                          <p className="mb-2 flex items-center gap-2 font-bold">
                            <IconAlert size={15} /> Nenhuma digital na base
                          </p>
                          <p>Cadastre a digital de um paciente na ficha dele para habilitar este sensor.</p>
                          <Btn variant="outline" size="sm" className="mt-3" onClick={onGoPatients}>
                            <IconUsers size={14} /> Ir para pacientes
                          </Btn>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm leading-relaxed text-mute">
                            Encoste o dedo no sensor e <strong className="text-ink">mantenha imóvel</strong> até
                            a leitura completar. A imobilidade define a qualidade do template.
                          </p>
                          <div className="flex items-start gap-2.5 rounded-lg bg-pine-900/4 p-3 text-xs leading-relaxed text-mute">
                            <IconShield size={15} className="mt-0.5 shrink-0 text-moss-600" />
                            <p>
                              Navegadores não expõem leitores biométricos reais — esta é uma{' '}
                              <strong className="text-ink">simulação local</strong>. O template gerado nunca sai
                              do dispositivo.
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <p className="mt-3 flex items-center gap-2 px-1 text-[11px] text-mute">
          <IconShield size={13} className="text-moss-600" />
          Correspondência por assinatura perceptual (dHash 64 bits, distância de Hamming) executada 100% no navegador.
        </p>
      </div>

      {/* coluna lateral */}
      <aside className="space-y-4">
        <section className="rise rounded-xl border border-line bg-card p-4 shadow-lift" style={{ animationDelay: '120ms' }}>
          <h2 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-mute">
            <IconActivity size={14} className="text-moss-600" /> Base local
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { label: 'Pacientes', value: statPatients },
              { label: 'Retratos', value: statPhotos },
              { label: 'Digitais', value: statFp },
              { label: 'Identificações', value: statIds },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-line bg-paper/70 px-3 py-2.5">
                <p className="font-mono text-2xl font-semibold leading-none text-ink">{s.value}</p>
                <p className="mt-1.5 text-[11px] font-medium text-mute">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rise rounded-xl border border-line bg-card p-4 shadow-lift" style={{ animationDelay: '180ms' }}>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-mute">
            Roteiro do produto
          </h2>
          <ul className="space-y-2.5">
            {[
              { label: 'Identificação por retrato', done: true },
              { label: 'Identificação por digital', done: true },
            ].map((r) => (
              <li key={r.label} className="flex items-center gap-2.5 text-sm">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-moss-100 text-moss-600">
                  <IconCheck size={12} />
                </span>
                <span className="font-medium text-ink">{r.label}</span>
                <span className="ml-auto font-mono text-[10px] font-semibold uppercase text-moss-600">ativo</span>
              </li>
            ))}
            <li className="rounded-lg border border-dashed border-line bg-paper/60 p-3">
              <div className="flex items-center gap-2.5 text-sm">
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-line bg-card">
                  <span className="h-1.5 w-1.5 rounded-full bg-warn-500 blink-dot" />
                </span>
                <span className="font-medium text-ink">Prontuário vitalício completo</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-mute">
                Histórico clínico da vida inteira, anexos e compartilhamento seguro. Estrutura básica
                já ativa na ficha do paciente.
              </p>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line">
                <div className="stripes bar-fill h-full rounded-full bg-moss-600" style={{ width: '35%' }} />
              </div>
              <p className="mt-1.5 font-mono text-[10px] text-mute">35% · em construção</p>
            </li>
          </ul>
        </section>

        <section className="rise rounded-xl border border-line bg-card p-4 shadow-lift" style={{ animationDelay: '240ms' }}>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-mute">
            Atividade recente
          </h2>
          {log.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-mute">
              Nenhuma identificação registrada ainda.
            </p>
          ) : (
            <ul className="space-y-2">
              {log.slice(0, 6).map((e) => (
                <li key={e.id} className="flex items-center gap-2.5 rounded-lg border border-line bg-paper/60 px-2.5 py-2">
                  {e.thumb ? (
                    <img src={e.thumb} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover ring-1 ring-line" />
                  ) : (
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                        e.method === 'face' ? 'bg-moss-100 text-moss-600' : 'bg-info-100 text-info-600'
                      }`}
                    >
                      {e.method === 'face' ? <IconFace size={15} /> : <IconFingerprint size={15} />}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-ink">{e.patientName}</p>
                    <p className="font-mono text-[10px] text-mute">
                      {e.method === 'face' ? 'retrato' : 'digital'} · {timeAgo(e.at)}
                    </p>
                  </div>
                  <span
                    className={`font-mono text-xs font-semibold ${
                      e.result === 'match' ? 'text-moss-600' : e.result === 'review' ? 'text-warn-600' : 'text-danger-500'
                    }`}
                  >
                    {e.result === 'none' && e.confidence === 0 ? '—' : `${e.confidence}%`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      <CameraCapture open={camOpen} onClose={() => setCamOpen(false)} onCapture={(url) => void analyze(url)} />

      {patients.length === 0 && face.kind === 'idle' && mode === 'face' && (
        <div className="xl:col-span-2">
          <EmptyState
            icon={<IconUsers size={24} />}
            title="Base local vazia"
            desc="A identificação compara a imagem contra os retratos cadastrados. Comece carregando os dados de exemplo ou cadastrando o primeiro paciente."
          >
            <Btn onClick={onGoPatients}>
              <IconUsers size={16} /> Ir para pacientes
            </Btn>
          </EmptyState>
        </div>
      )}
    </div>
  );
}
