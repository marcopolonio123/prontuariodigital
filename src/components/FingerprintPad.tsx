import { useEffect, useRef, useState } from 'react';
import { IconCheck, IconFingerprint } from './icons';
import { makeFingerprintTemplate, qualityFromSamples } from '../lib/biometrics';

export function FingerprintPad({
  onComplete,
  onAbort,
  size = 'lg',
  autoReset = true,
  hint = 'Pressione e segure o sensor',
}: {
  onComplete: (template: string, quality: number) => void;
  onAbort?: () => void;
  size?: 'lg' | 'sm';
  autoReset?: boolean;
  hint?: string;
}) {
  const [progress, setProgress] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [done, setDone] = useState<{ quality: number } | null>(null);
  const [message, setMessage] = useState('');
  const timerRef = useRef<number | null>(null);
  const samplesRef = useRef<Array<{ x: number; y: number }>>([]);
  const posRef = useRef<{ x: number; y: number } | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  const start = (e: React.PointerEvent<HTMLDivElement>) => {
    if (done) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* teclado / ponteiro sintético — segue sem captura */
    }
    samplesRef.current = [];
    posRef.current = { x: e.clientX, y: e.clientY };
    setScanning(true);
    setMessage('Mantenha o dedo imóvel…');
    timerRef.current = window.setInterval(() => {
      if (posRef.current) samplesRef.current.push(posRef.current);
      setProgress((p) => {
        const next = p + 2.1 + Math.random() * 0.7;
        if (next >= 100) {
          clearTimer();
          const quality = qualityFromSamples(samplesRef.current);
          setScanning(false);
          setDone({ quality });
          setMessage('Leitura concluída');
          onComplete(makeFingerprintTemplate(), quality);
          if (autoReset) {
            window.setTimeout(() => {
              setDone(null);
              setProgress(0);
              setMessage('');
            }, 1800);
          }
          return 100;
        }
        return next;
      });
    }, 50);
  };

  const cancel = () => {
    if (done) return;
    clearTimer();
    if (scanning) {
      setScanning(false);
      setProgress(0);
      setMessage('Leitura interrompida — segure até completar.');
      onAbort?.();
      window.setTimeout(() => setMessage(''), 2400);
    }
  };

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (scanning) posRef.current = { x: e.clientX, y: e.clientY };
  };

  const h = size === 'lg' ? 'h-60' : 'h-44';
  const iconSize = size === 'lg' ? 104 : 72;

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Sensor de digital"
        onPointerDown={start}
        onPointerMove={onMove}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !scanning && !done) {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            start({
              pointerId: 0,
              clientX: rect.left + rect.width / 2,
              clientY: rect.top + rect.height / 2,
              currentTarget: e.currentTarget,
            } as unknown as React.PointerEvent<HTMLDivElement>);
            window.setTimeout(cancel, 2600);
          }
        }}
        className={`relative ${h} w-full cursor-pointer touch-none select-none overflow-hidden rounded-xl border border-pine-700 bg-pine-900 transition-shadow ${
          scanning ? 'shadow-[inset_0_0_40px_rgb(38_135_96/0.15)]' : 'hover:border-pine-600'
        }`}
      >
        {/* anéis concêntricos decorativos */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {[190, 150, 110].map((d) => (
            <span
              key={d}
              className="absolute rounded-full border border-pine-700/70"
              style={{ width: d, height: d }}
            />
          ))}
        </div>

        {/* digital base */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-pine-600">
          <IconFingerprint size={iconSize} strokeWidth={1.4} />
        </div>

        {/* digital revelada pelo progresso */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center overflow-hidden transition-[height] duration-150 ease-linear"
          style={{ height: `${progress}%` }}
        >
          <div
            className={`flex w-full justify-center ${done ? 'text-moss-300' : 'text-moss-400'}`}
            style={{ height: size === 'lg' ? 240 : 176, alignItems: 'center' }}
          >
            <IconFingerprint size={iconSize} strokeWidth={1.4} />
          </div>
        </div>

        {scanning && (
          <div className="scan-beam pointer-events-none absolute left-0 right-0 h-10 bg-gradient-to-b from-transparent via-moss-300/30 to-transparent" />
        )}

        {done && (
          <div className="overlay-in absolute inset-0 flex items-center justify-center bg-pine-950/70">
            <div className="flex flex-col items-center gap-2 text-moss-300">
              <span className="rounded-full bg-moss-500/15 p-3">
                <IconCheck size={28} />
              </span>
              <span className="font-mono text-sm">qualidade {done.quality}%</span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-3">
        <p className={`text-xs ${message ? 'text-warn-600' : 'text-mute'}`}>
          {message || (done ? 'Template local gerado com sucesso.' : hint)}
        </p>
        <span className="font-mono text-xs font-semibold text-moss-600">
          {scanning ? `${Math.min(99, Math.round(progress))}%` : done ? '100%' : '—'}
        </span>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full transition-[width] duration-150 ease-linear ${
            done ? 'bg-moss-500' : 'stripes bg-moss-600'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
