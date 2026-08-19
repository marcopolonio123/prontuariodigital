import { useCallback, useEffect, useRef, useState } from 'react';
import { Btn, Corners, Modal } from './ui';
import { IconAlert, IconCamera, IconRefresh, IconSpinner, IconUpload } from './icons';
import { captureVideoFrame, fileToDataURL } from '../lib/biometrics';

export function CameraCapture({
  open,
  onClose,
  onCapture,
  title = 'Capturar retrato',
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
  title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<'starting' | 'live' | 'error'>('starting');
  const [errMsg, setErrMsg] = useState('');

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setStatus('starting');
    setErrMsg('');
    stop();
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setStatus('live');
    } catch {
      setStatus('error');
      setErrMsg('Câmera indisponível ou permissão negada neste ambiente.');
    }
  }, [stop]);

  useEffect(() => {
    if (open) void start();
    return stop;
  }, [open, start, stop]);

  const shoot = () => {
    const video = videoRef.current;
    if (!video || status !== 'live') return;
    const frame = captureVideoFrame(video);
    stop();
    onCapture(frame);
    onClose();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const url = await fileToDataURL(file, 640, 0.85);
      stop();
      onCapture(url);
      onClose();
    } catch {
      setErrMsg('Não foi possível ler este arquivo de imagem.');
      setStatus('error');
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        stop();
        onClose();
      }}
      title={title}
      subtitle="O retrato fica armazenado apenas neste dispositivo."
      width="max-w-xl"
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-pine-950">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`h-full w-full -scale-x-100 object-cover transition-opacity duration-300 ${status === 'live' ? 'opacity-100' : 'opacity-0'}`}
        />
        {status === 'live' && (
          <>
            <Corners className="border-moss-300" />
            <div className="scan-beam pointer-events-none absolute left-3 right-3 h-9 rounded bg-gradient-to-b from-transparent via-moss-300/35 to-transparent" />
            <div className="absolute left-1/2 top-1/2 h-32 w-28 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-dashed border-pine-200/40" />
          </>
        )}
        {status === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-pine-200">
            <IconSpinner size={26} className="text-moss-300" />
            <p className="text-sm">Solicitando acesso à câmera…</p>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center text-pine-200">
            <span className="rounded-full bg-danger-500/15 p-3 text-danger-500">
              <IconAlert size={22} />
            </span>
            <p className="text-sm leading-relaxed">{errMsg}</p>
            <Btn variant="outline" size="sm" onClick={() => void start()}>
              <IconRefresh size={14} /> Tentar novamente
            </Btn>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-mute">
          {status === 'live' ? 'Enquadre o rosto na moldura oval.' : 'Você também pode usar um arquivo de imagem.'}
        </p>
        <div className="flex items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-card px-3.5 py-2 text-sm font-semibold text-ink transition-all hover:border-moss-300 hover:bg-moss-50 active:scale-[0.97]">
            <IconUpload size={16} />
            Enviar arquivo
            <input type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
          <button
            onClick={shoot}
            disabled={status !== 'live'}
            aria-label="Capturar foto"
            className="pulse-halo flex h-12 w-12 items-center justify-center rounded-full bg-moss-600 text-white transition-all hover:bg-moss-700 active:scale-90 disabled:pointer-events-none disabled:opacity-40"
          >
            <IconCamera size={22} />
          </button>
        </div>
      </div>
    </Modal>
  );
}
