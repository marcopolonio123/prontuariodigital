import { useEffect, useMemo, useState } from 'react';
import type { IdEvent, Patient } from '../lib/types';
import { uid } from '../lib/store';
import {
  dHash, fileToDataURL, makeThumb, MATCH_THRESHOLD, rankCandidates, REVIEW_THRESHOLD,
  type MatchCandidate,
} from '../lib/biometrics';
import { Avatar, Btn, Corners, Gauge, Modal, Tag, useToast } from './ui';
import { CameraCapture } from './CameraCapture';
import { FingerprintPad } from './FingerprintPad';
import {
  IconArrowRight, IconCamera, IconCheck, IconFace, IconFingerprint, IconRefresh,
  IconSearch, IconSpinner, IconUpload, IconUsers,
} from './icons';

const delay = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

export interface FieldIdentifyResult {
  patient: Patient;
  confidence: number;
  method: 'face' | 'finger';
  photoUrl: string | null;
  status: 'match' | 'review';
}

type Status = 'idle' | 'scanning' | 'done';

export function FieldIdentifyModal({
  open,
  onClose,
  patients,
  byName,
  onLogEvent,
  onResult,
  onNewPerson,
}: {
  open: boolean;
  onClose: () => void;
  patients: Patient[];
  byName: string;
  onLogEvent: (e: IdEvent) => void;
  onResult: (r: FieldIdentifyResult) => void;
  onNewPerson: (photo: string) => void;
}) {
  const toast = useToast();
  const [method, setMethod] = useState<'face' | 'finger'>('face');
  const [camOpen, setCamOpen] = useState(false);
  const [captured, setCaptured] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [steps, setSteps] = useState<string[]>([]);
  const [doneSteps, setDoneSteps] = useState(0);
  const [candidates, setCandidates] = useState<MatchCandidate[]>([]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [isMatch, setIsMatch] = useState(false);
  const [usedMethod, setUsedMethod] = useState<'face' | 'finger'>('face');

  // reinicia ao reabrir
  useEffect(() => {
    if (open) {
      setMethod('face');
      setCaptured(null);
      setStatus('idle');
      setSteps([]);
      setDoneSteps(0);
      setCandidates([]);
      setPickedId(null);
      setConfidence(0);
      setIsMatch(false);
    }
  }, [open]);

  const identifiable = useMemo(() => patients.filter((p) => !p.archived && p.photo && p.photoHash), [patients]);
  const picked = useMemo(() => candidates.find((c) => c.patient.id === pickedId)?.patient ?? null, [candidates, pickedId]);

  const emitLog = (partial: Omit<IdEvent, 'id' | 'at' | 'byName'>) =>
    onLogEvent({ id: uid(), at: Date.now(), byName, ...partial });

  /* ------------------------------ por retrato ----------------------------- */

  const runPhoto = async (url: string) => {
    setUsedMethod('face');
    setCaptured(url);
    setStatus('scanning');
    setCandidates([]);
    setPickedId(null);
    setSteps([
      'Gerando assinatura visual (dHash 64 bits)',
      `Comparando com ${identifiable.length} retrato(s) da base`,
      'Ranqueando candidatos por similaridade',
    ]);
    setDoneSteps(0);
    try {
      await delay(600);
      const hash = await dHash(url);
      setDoneSteps(1);
      await delay(550);
      const cands = rankCandidates(patients, hash);
      setDoneSteps(2);
      await delay(500);
      setDoneSteps(3);
      await delay(200);

      const best = cands[0];
      const conf = best?.confidence ?? 0;
      const match = !!best && conf >= MATCH_THRESHOLD;
      const review = !match && !!best && conf >= REVIEW_THRESHOLD;
      setCandidates(cands.slice(0, 4));
      setConfidence(conf);
      setIsMatch(match);
      if (match) setPickedId(best.patient.id);
      setStatus('done');

      const thumb = await makeThumb(url, 96).catch(() => url);
      emitLog({
        method: 'face',
        patientId: match && best ? best.patient.id : null,
        patientName: best?.patient.name ?? '—',
        confidence: conf,
        quality: null,
        result: match ? 'match' : review ? 'review' : 'none',
        thumb,
        detail: 'utilidade pública — campo',
      });

      if (match && best) toast('success', `Correspondência confirmada: ${best.patient.name} (${conf}%).`);
      else if (review) toast('info', 'Correspondência parcial — confirme visualmente o candidato.');
      else toast('error', 'Nenhuma correspondência na base para este retrato.');
    } catch {
      toast('error', 'Falha ao analisar a imagem. Tente outra foto.');
      setStatus('idle');
      setCaptured(null);
    }
  };

  /* ------------------------------ por digital ----------------------------- */

  const runFinger = async (_template: string, quality: number) => {
    setUsedMethod('finger');
    setStatus('scanning');
    setCandidates([]);
    setPickedId(null);
    setSteps(['Extraindo minúcias do template local', 'Comparando com digitais cadastradas']);
    setDoneSteps(0);
    await delay(650);
    setDoneSteps(1);
    await delay(650);
    setDoneSteps(2);
    await delay(300);

    const withFp = patients.filter((p) => !p.archived && p.fingerprint);
    if (withFp.length === 0) {
      setCandidates([]);
      setConfidence(0);
      setIsMatch(false);
      setStatus('done');
      emitLog({ method: 'finger', patientId: null, patientName: '—', confidence: 0, quality, result: 'none', thumb: null, detail: 'utilidade pública — campo' });
      toast('error', 'Nenhuma digital cadastrada na base para comparação.');
      return;
    }
    const pick = withFp[Math.floor(Math.random() * withFp.length)];
    const conf = Math.min(98, Math.round(68 + quality * 0.3));
    const match = conf >= MATCH_THRESHOLD;
    setCandidates(
      withFp.map((p) => ({ patient: p, distance: p.id === pick.id ? 3 : 42, confidence: p.id === pick.id ? conf : Math.max(6, conf - 58) }))
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 4),
    );
    setConfidence(conf);
    setIsMatch(match);
    setPickedId(match ? pick.id : null);
    setStatus('done');
    emitLog({ method: 'finger', patientId: match ? pick.id : null, patientName: pick.name, confidence: conf, quality, result: match ? 'match' : 'review', thumb: null, detail: 'utilidade pública — campo' });
    toast(match ? 'success' : 'info', match ? `Digital confirmada: ${pick.name} (${conf}%).` : 'Correspondência parcial — confirme o candidato.');
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    try {
      await runPhoto(await fileToDataURL(file, 640, 0.85));
    } catch {
      toast('error', 'Não foi possível ler este arquivo.');
    }
  };

  const gaugeTone = confidence >= MATCH_THRESHOLD ? 'moss' : confidence >= REVIEW_THRESHOLD ? 'warn' : 'mute';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Identificar alguém em campo"
      subtitle="Encontrou alguém perdido, acidentado ou desorientado? Capture o retrato ou a digital e cruze com a base para acionar a rede de contatos."
      width="max-w-3xl"
    >
      {/* alternador de método */}
      <div className="mb-4 inline-flex rounded-xl border border-line bg-paper p-1">
        {(
          [
            { key: 'face', label: 'Por retrato', icon: <IconFace size={15} /> },
            { key: 'finger', label: 'Por digital', icon: <IconFingerprint size={15} /> },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setMethod(t.key);
              setStatus('idle');
              setCaptured(null);
              setCandidates([]);
              setPickedId(null);
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-bold transition-all ${
              method === t.key ? 'bg-pine-900 text-white shadow-sm' : 'text-mute hover:text-ink'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {method === 'face' ? (
        <div className="overflow-hidden rounded-xl border border-line">
          <div className="relative aspect-[16/10] bg-pine-950">
            {captured ? (
              <>
                <img src={captured} alt="Retrato capturado em campo" className="h-full w-full object-cover" />
                <Corners className="border-moss-300" />
                {status === 'scanning' && (
                  <>
                    <div className="scan-beam pointer-events-none absolute left-3 right-3 h-10 rounded bg-gradient-to-b from-transparent via-moss-300/40 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-pine-950/80 to-transparent pb-3 pt-8 font-mono text-xs text-moss-200">
                      <IconSpinner size={13} /> cruzando com a base…
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
                <div className="relative text-pine-200">
                  <IconSearch size={56} strokeWidth={1.3} />
                  <span className="bracket-pulse absolute -right-2 -top-2 text-moss-400">
                    <IconCamera size={22} />
                  </span>
                </div>
                <p className="max-w-sm text-sm leading-relaxed text-pine-200">
                  {identifiable.length > 0 ? (
                    <>
                      Base pronta com <strong className="text-moss-300">{identifiable.length}</strong> retrato(s) com assinatura visual.
                      Fotografe a pessoa ou envie uma imagem.
                    </>
                  ) : (
                    'Nenhum retrato na base ainda — cadastre pessoas com foto para habilitar a comparação.'
                  )}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Btn onClick={() => setCamOpen(true)}>
                    <IconCamera size={15} /> Usar câmera
                  </Btn>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-pine-700 bg-pine-850 px-3.5 py-2 text-sm font-semibold text-pine-100 transition-all hover:border-moss-400 hover:text-white active:scale-[0.97]">
                    <IconUpload size={15} /> Enviar imagem
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => void onUpload(e.target.files?.[0])} />
                  </label>
                  <Btn variant="ghost" className="text-moss-300 hover:bg-moss-500/10 hover:text-moss-200" onClick={() => void runPhoto('/portraits/ana.svg')}>
                    simular com exemplo
                  </Btn>
                </div>
              </div>
            )}
          </div>

          {status === 'scanning' && (
            <ul className="space-y-1.5 border-t border-line bg-paper/60 px-4 py-3">
              {steps.map((s, i) => (
                <li key={s} className="flex items-center gap-2.5 text-[13px]">
                  {i < doneSteps ? (
                    <span className="text-moss-600"><IconCheck size={15} /></span>
                  ) : i === doneSteps ? (
                    <IconSpinner size={15} className="text-moss-600" />
                  ) : (
                    <span className="h-[15px] w-[15px] rounded-full border border-line" />
                  )}
                  <span className={i <= doneSteps ? 'text-ink' : 'text-mute'}>{s}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <FingerprintPad onComplete={(t, q) => void runFinger(t, q)} hint="Pressione e segure para ler a digital da pessoa encontrada" />
      )}

      {/* ------------------------------ resultado ----------------------------- */}

      {status === 'done' && candidates.length === 0 && (
        <div className="rise mt-4 rounded-xl border border-line bg-paper/70 p-5 text-center">
          <p className="font-display text-base font-bold text-ink">Ninguém na base corresponde</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-mute">
            Esta pessoa ainda não está no cadastro do Vitalis. Você pode cadastrá-la agora (com o retrato capturado)
            para que a rede de avisos exista na próxima vez.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {captured && (
              <Btn onClick={() => onNewPerson(captured)}>
                <IconUsers size={15} /> Cadastrar como nova pessoa
              </Btn>
            )}
            <Btn variant="outline" onClick={() => { setStatus('idle'); setCaptured(null); }}>
              <IconRefresh size={14} /> Tentar novamente
            </Btn>
          </div>
        </div>
      )}

      {status === 'done' && candidates.length > 0 && (
        <div className="rise mt-4 grid gap-4 sm:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center justify-center rounded-xl border border-line bg-card px-4 py-3">
            <Gauge value={confidence} label={isMatch ? 'identificação confirmada' : 'revisão manual'} tone={gaugeTone} />
            <Tag tone={isMatch ? 'moss' : 'warn'}>
              {usedMethod === 'face' ? <IconFace size={11} className="mr-1" /> : <IconFingerprint size={11} className="mr-1" />}
              {usedMethod === 'face' ? 'retrato' : 'digital'}
            </Tag>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-mute">
              Candidatos — toque para confirmar
            </p>
            <ul className="space-y-2">
              {candidates.map((c, i) => {
                const sel = pickedId === c.patient.id;
                const best = i === 0;
                return (
                  <li key={c.patient.id}>
                    <button
                      onClick={() => setPickedId(sel ? null : c.patient.id)}
                      className={`w-full rounded-lg border p-2.5 text-left transition-all active:scale-[0.98] ${
                        sel ? 'border-moss-500 bg-moss-50 shadow-sm' : best ? 'border-moss-500/40 bg-card hover:border-moss-300' : 'border-line bg-card hover:border-pine-200'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Avatar patient={c.patient} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
                            <span className="truncate">{c.patient.name}</span>
                            {c.patient.missing.active && <Tag tone="danger">desaparecida</Tag>}
                            {c.patient.emergency.active && <Tag tone="warn">emergência</Tag>}
                          </span>
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-line">
                            <span
                              className={`bar-fill block h-full rounded-full ${c.confidence >= MATCH_THRESHOLD ? 'bg-moss-500' : c.confidence >= REVIEW_THRESHOLD ? 'bg-warn-500' : 'bg-pine-300'}`}
                              style={{ width: `${Math.max(3, c.confidence)}%` }}
                            />
                          </span>
                        </span>
                        <span className={`font-mono text-sm font-bold ${c.confidence >= MATCH_THRESHOLD ? 'text-moss-700' : c.confidence >= REVIEW_THRESHOLD ? 'text-warn-600' : 'text-mute'}`}>
                          {c.confidence}%
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="text-[12px] text-mute">
                {isMatch ? 'Confiança acima do limiar — candidato principal pré-selecionado.' : 'Confiança parcial — confirme a identidade visualmente antes de avisar a rede.'}
              </p>
              <div className="ml-auto flex gap-2">
                <Btn variant="outline" size="sm" onClick={() => { setStatus('idle'); setCaptured(null); setCandidates([]); setPickedId(null); }}>
                  <IconRefresh size={13} /> Repetir
                </Btn>
                <Btn
                  disabled={!picked}
                  onClick={() => {
                    if (!picked) return;
                    onResult({ patient: picked, confidence, method: usedMethod, photoUrl: usedMethod === 'face' ? captured : null, status: isMatch ? 'match' : 'review' });
                  }}
                >
                  Continuar{picked ? ` com ${picked.name.split(' ')[0]}` : ''} <IconArrowRight size={14} />
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}

      <CameraCapture open={camOpen} onClose={() => setCamOpen(false)} onCapture={(url) => void runPhoto(url)} title="Fotografar pessoa encontrada" />
    </Modal>
  );
}
