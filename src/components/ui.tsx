import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Patient } from '../lib/types';
import { avatarTone, initials } from '../lib/biometrics';
import { IconAlert, IconCheck, IconInfo, IconMic, IconX } from './icons';

/* ------------------------------- toasts -------------------------------- */

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

const ToastCtx = createContext<(kind: ToastKind, text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: ToastKind, text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  const meta: Record<ToastKind, { cls: string; icon: ReactNode }> = {
    success: { cls: 'border-moss-500/40 bg-moss-600 text-white', icon: <IconCheck size={16} /> },
    error: { cls: 'border-danger-500/40 bg-danger-600 text-white', icon: <IconAlert size={16} /> },
    info: { cls: 'border-pine-700 bg-pine-900 text-pine-100', icon: <IconInfo size={16} /> },
  };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[90] flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-in pointer-events-auto flex w-full items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-semibold shadow-float ${meta[t.kind].cls}`}
          >
            <span className="mt-0.5 shrink-0">{meta[t.kind].icon}</span>
            <span className="flex-1 leading-snug">{t.text}</span>
            <button
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              className="shrink-0 opacity-70 transition-opacity hover:opacity-100"
              aria-label="Fechar aviso"
            >
              <IconX size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------- botões -------------------------------- */

export const inputCls =
  'w-full rounded-lg border border-line bg-white/85 px-3 py-2 text-[16px] leading-snug text-ink placeholder:text-mute/60 transition-colors focus:border-moss-400 focus:outline-none sm:text-sm';

type BtnVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'dark';

export function Btn({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: 'sm' | 'md' | 'lg';
}) {
  const variants: Record<BtnVariant, string> = {
    primary: 'bg-moss-600 text-white hover:bg-moss-700 shadow-sm',
    dark: 'bg-pine-900 text-pine-100 hover:bg-pine-800 shadow-sm',
    outline: 'border border-line bg-card text-ink hover:border-moss-300 hover:bg-moss-50',
    ghost: 'text-mute hover:bg-pine-900/6 hover:text-ink',
    danger: 'bg-danger-500 text-white hover:bg-danger-600 shadow-sm',
  };
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-3 text-base' };
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-all duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/* -------------------------------- modal -------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="overlay-in absolute inset-0 bg-pine-950/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`modal-in relative w-full ${width} max-h-[90vh] overflow-y-auto rounded-xl border border-line bg-card p-5 shadow-float`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-mute">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-mute transition-colors hover:bg-pine-900/6 hover:text-ink" aria-label="Fechar">
            <IconX size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmar',
  tone = 'danger',
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'default';
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-md">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 shrink-0 rounded-full p-2 ${tone === 'danger' ? 'bg-danger-100 text-danger-600' : 'bg-warn-100 text-warn-600'}`}>
          <IconAlert size={18} />
        </span>
        <div className="text-sm leading-relaxed text-mute">{message}</div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
        <Btn
          variant={tone === 'danger' ? 'danger' : 'primary'}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </Btn>
      </div>
    </Modal>
  );
}

/* -------------------------------- field -------------------------------- */

export function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-[13px] font-semibold text-ink">
        <span>
          {label}
          {required && <span className="ml-0.5 text-danger-500">*</span>}
        </span>
        {hint && <span className="text-[11px] font-normal text-mute">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/* --------------------------- ditado por voz ---------------------------- */

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getSpeechCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition as new () => SpeechRecognitionLike) ??
    (w.webkitSpeechRecognition as new () => SpeechRecognitionLike) ??
    null;
}

/** Botão de microfone: dita o texto falado e o anexa ao campo via onAppend. */
export function MicButton({
  onAppend,
  className = '',
  title = 'Ditar por voz',
}: {
  onAppend: (text: string) => void;
  className?: string;
  title?: string;
}) {
  const toast = useToast();
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const intentRef = useRef(false); // usuário quer continuar ditando
  const restartsRef = useRef(0);
  const appendRef = useRef(onAppend);
  appendRef.current = onAppend;

  const teardown = useCallback(() => {
    intentRef.current = false;
    setInterim('');
    try {
      recRef.current?.abort();
    } catch {
      /* já encerrado */
    }
    recRef.current = null;
    setListening(false);
  }, []);

  useEffect(() => {
    return () => {
      intentRef.current = false;
      try {
        recRef.current?.abort();
      } catch {
        /* já encerrado */
      }
    };
  }, []);

  const startSession = useCallback((): boolean => {
    const Ctor = getSpeechCtor();
    if (!Ctor) return false;
    const rec = new Ctor();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = true; // transcrição ao vivo = feedback imediato
    rec.onresult = (e) => {
      let finalText = '';
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      if (interimText) setInterim(interimText);
      if (finalText.trim()) {
        appendRef.current(finalText.trim());
        setInterim('');
      }
    };
    rec.onerror = (e) => {
      const code = e?.error ?? '';
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        intentRef.current = false;
        toast('error', 'Permissão de microfone negada — libere o acesso na barra de endereço do navegador.');
      } else if (code === 'network') {
        intentRef.current = false;
        toast('error', 'Falha de rede no serviço de voz — o reconhecimento usa os servidores do Google; verifique a conexão.');
      } else if (code === 'audio-capture') {
        intentRef.current = false;
        toast('error', 'Nenhum microfone detectado no dispositivo.');
      }
      // 'no-speech' e 'aborted': o onend retoma automaticamente
    };
    rec.onend = () => {
      recRef.current = null;
      // O Chrome encerra a sessão após silêncio — retomamos enquanto o usuário quiser ditar
      if (intentRef.current && restartsRef.current < 15) {
        restartsRef.current += 1;
        window.setTimeout(() => {
          if (intentRef.current) startSession();
        }, 250);
      } else {
        intentRef.current = false;
        setInterim('');
        setListening(false);
      }
    };
    try {
      rec.start();
      recRef.current = rec;
      return true;
    } catch {
      recRef.current = null;
      return false;
    }
  }, [toast]);

  const toggle = () => {
    if (listening) {
      teardown();
      return;
    }
    if (!getSpeechCtor()) {
      toast('error', 'Reconhecimento de voz não é suportado neste navegador — use Chrome ou Edge (desktop ou Android).');
      return;
    }
    restartsRef.current = 0;
    intentRef.current = true;
    setListening(true);
    if (!startSession()) {
      intentRef.current = false;
      setListening(false);
      toast('error', 'Não foi possível iniciar o ditado — a página precisa estar em HTTPS (ou localhost) e fora de ambientes bloqueados.');
    }
  };

  return (
    <span className={`relative inline-flex ${className}`}>
      {listening && (
        <span className="toast-in absolute bottom-full right-0 z-30 mb-1.5 flex w-60 max-w-[72vw] items-start gap-2 rounded-lg border border-pine-700 bg-pine-900 px-3 py-2 shadow-float">
          <span className="blink-dot mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-moss-400" />
          <span className="min-w-0 text-[11px] leading-snug text-pine-100">
            {interim ? (
              <span className="line-clamp-2 italic">{interim}…</span>
            ) : (
              'escutando… fale agora — o texto entra no campo ao terminar a frase'
            )}
          </span>
        </span>
      )}
      <button
        type="button"
        onClick={toggle}
        title={listening ? 'Parar ditado' : title}
        aria-label={listening ? 'Parar ditado por voz' : 'Ditar por voz'}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-bold transition-all active:scale-95 ${
          listening
            ? 'border-danger-500 bg-danger-500 text-white shadow-sm'
            : 'border-line bg-card text-mute hover:border-moss-300 hover:bg-moss-50 hover:text-moss-700'
        }`}
      >
        <span className="relative flex items-center justify-center">
          {listening && <span className="absolute h-4 w-4 animate-ping rounded-full bg-white/50" />}
          <IconMic size={14} className="relative" />
        </span>
        {listening ? 'parar' : 'ditar'}
      </button>
    </span>
  );
}

/* --------------------------------- tag --------------------------------- */

export function Tag({ children, tone }: { children: ReactNode; tone: 'warn' | 'info' | 'moss' | 'mute' | 'danger' }) {
  const tones = {
    warn: 'bg-warn-100 text-warn-600 border-warn-500/25',
    info: 'bg-info-100 text-info-600 border-info-500/25',
    moss: 'bg-moss-100 text-moss-700 border-moss-500/25',
    danger: 'bg-danger-100 text-danger-600 border-danger-500/25',
    mute: 'bg-pine-900/5 text-mute border-line',
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${tones}`}>
      {children}
    </span>
  );
}

/* -------------------------------- avatar ------------------------------- */

export function Avatar({ patient, size = 44, className = '' }: { patient: Patient; size?: number; className?: string }) {
  if (patient.photo) {
    return (
      <img
        src={patient.photo}
        alt={patient.name}
        width={size}
        height={size}
        className={`shrink-0 rounded-full object-cover ring-2 ring-card ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  const tone = avatarTone(patient.name);
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-display font-bold ring-2 ring-card ${className}`}
      style={{ width: size, height: size, background: tone.fg, color: tone.bg, fontSize: size * 0.34 }}
      aria-hidden="true"
    >
      {initials(patient.name)}
    </span>
  );
}

export function BloodBadge({ type, size = 'md' }: { type: string; size?: 'sm' | 'md' }) {
  if (!type) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border border-danger-500/30 bg-danger-100 font-mono font-bold text-danger-600 ${
        size === 'sm' ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-xs'
      }`}
      title="Tipo sanguíneo"
    >
      {type}
    </span>
  );
}

/* ------------------------------ empty state ---------------------------- */

export function EmptyState({
  icon,
  title,
  desc,
  children,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  children?: ReactNode;
}) {
  return (
    <div className="rise mx-auto flex max-w-md flex-col items-center rounded-xl border-2 border-dashed border-line bg-card/60 px-6 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-pine-900 text-moss-300">{icon}</span>
      <h2 className="mt-4 font-display text-xl font-bold text-ink">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-mute">{desc}</p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

/* -------------------------------- corners ------------------------------ */

export function Corners({ className = '' }: { className?: string }) {
  const base = `absolute h-7 w-7 border-[3px] ${className}`;
  return (
    <>
      <span className={`${base} left-3 top-3 border-b-0 border-r-0 rounded-tl-md`} />
      <span className={`${base} right-3 top-3 border-b-0 border-l-0 rounded-tr-md`} />
      <span className={`${base} bottom-3 left-3 border-r-0 border-t-0 rounded-bl-md`} />
      <span className={`${base} bottom-3 right-3 border-l-0 border-t-0 rounded-br-md`} />
    </>
  );
}

/* ---------------------------------- ECG -------------------------------- */

export function Ecg({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 40" preserveAspectRatio="none" className={className} aria-hidden="true">
      <path
        d="M0 20h40l6-8 8 16 6-12 6 6 8-2h30l5-6 10 14 5-8 5 2h35l6-9 9 17 6-11 5 5 9-2h34l5-7 10 15 6-9 5 3h30l6-8 8 15 6-10 5 4 8-1h30"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="ecg-live"
      />
      <path
        d="M0 20h40l6-8 8 16 6-12 6 6 8-2h30l5-6 10 14 5-8 5 2h35l6-9 9 17 6-11 5 5 9-2h34l5-7 10 15 6-9 5 3h30l6-8 8 15 6-10 5 4 8-1h30"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.18"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* --------------------------------- gauge ------------------------------- */

export function Gauge({ value, label, tone }: { value: number; label: string; tone: 'moss' | 'warn' | 'mute' }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const off = C * (1 - Math.max(0, Math.min(100, value)) / 100);
  const colors = { moss: 'stroke-moss-500', warn: 'stroke-warn-500', mute: 'stroke-pine-300' };
  return (
    <div className="flex flex-col items-center">
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={R} fill="none" strokeWidth="10" className="stroke-line" />
        <circle
          cx="65"
          cy="65"
          r={R}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={off}
          transform="rotate(-90 65 65)"
          className={`gauge-arc ${colors[tone]}`}
        />
        <text x="65" y="60" textAnchor="middle" className="fill-ink font-mono" style={{ fontSize: 26, fontWeight: 700 }}>
          {value}%
        </text>
        <text x="65" y="80" textAnchor="middle" className="fill-mute" style={{ fontSize: 10 }}>
          confiança
        </text>
      </svg>
      <p className="text-xs font-semibold text-mute">{label}</p>
    </div>
  );
}
