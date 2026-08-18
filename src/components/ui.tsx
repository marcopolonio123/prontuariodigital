import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { IconAlert, IconCheck, IconInfo, IconX } from './icons';
import { avatarTone, initials } from '../lib/biometrics';
import type { Patient } from '../lib/types';

/* ------------------------------- Toasts ------------------------------- */

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  msg: string;
}

const ToastCtx = createContext<(kind: ToastKind, msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

const TOAST_STYLE: Record<ToastKind, { bar: string; icon: ReactNode }> = {
  success: { bar: 'bg-moss-400', icon: <IconCheck size={16} className="text-moss-300" /> },
  error: { bar: 'bg-danger-500', icon: <IconAlert size={16} className="text-danger-500" /> },
  info: { bar: 'bg-info-500', icon: <IconInfo size={16} className="text-info-500" /> },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(1);

  const push = useCallback((kind: ToastKind, msg: string) => {
    const id = idRef.current++;
    setToasts((t) => [...t.slice(-3), { id, kind, msg }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-5 right-5 z-[90] flex w-[min(92vw,380px)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="toast-in relative flex items-start gap-3 overflow-hidden rounded-lg border border-pine-700 bg-pine-900 py-3 pl-4 pr-9 text-sm text-pine-100 shadow-float"
          >
            <span className={`absolute inset-y-0 left-0 w-1 ${TOAST_STYLE[t.kind].bar}`} />
            <span className="mt-0.5 shrink-0">{TOAST_STYLE[t.kind].icon}</span>
            <p className="leading-snug">{t.msg}</p>
            <button
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              className="absolute right-2 top-2.5 text-pine-200/70 transition-colors hover:text-white"
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

/* ------------------------------- Botões ------------------------------- */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'dark' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
};

export function Btn({ variant = 'primary', size = 'md', className = '', ...rest }: BtnProps) {
  const variants = {
    primary: 'bg-moss-600 text-white hover:bg-moss-700 shadow-sm',
    dark: 'bg-pine-900 text-pine-100 hover:bg-pine-800',
    outline: 'border border-line bg-card text-ink hover:border-moss-300 hover:bg-moss-50',
    ghost: 'text-mute hover:bg-pine-900/6 hover:text-ink',
    danger: 'bg-danger-500 text-white hover:bg-danger-600 shadow-sm',
  }[variant];
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3.5 py-2 text-sm', lg: 'px-5 py-2.5 text-[15px]' }[size];
  return (
    <button
      className={`inline-flex select-none items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 ${variants} ${sizes} ${className}`}
      {...rest}
    />
  );
}

export const inputCls =
  'w-full rounded-lg border border-line bg-white/80 px-3 py-2 text-sm text-ink placeholder:text-mute/60 transition-colors focus:border-moss-400 focus:bg-white';

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
      <span className="mb-1.5 flex items-baseline gap-1 text-[13px] font-semibold text-ink">
        {label}
        {required && <span className="text-danger-500">*</span>}
        {hint && <span className="ml-auto text-xs font-normal text-mute">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/* ---------------------------- Modal / Drawer --------------------------- */

function useEsc(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEsc(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <div className="overlay-in absolute inset-0 bg-pine-950/60 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`modal-in relative w-full ${width} max-h-[92vh] overflow-auto rounded-xl border border-line bg-card shadow-float`}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-card/95 px-5 py-4 backdrop-blur">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-mute">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-mute transition-colors hover:bg-pine-900/6 hover:text-ink"
            aria-label="Fechar"
          >
            <IconX size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="sticky bottom-0 border-t border-line bg-card/95 px-5 py-3.5 backdrop-blur">{footer}</div>}
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
        <span
          className={`mt-0.5 shrink-0 rounded-full p-2 ${
            tone === 'danger' ? 'bg-danger-100 text-danger-600' : 'bg-warn-100 text-warn-600'
          }`}
        >
          <IconAlert size={18} />
        </span>
        <div className="text-sm leading-relaxed text-mute">{message}</div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Btn variant="outline" onClick={onClose}>
          Cancelar
        </Btn>
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

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  useEsc(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]">
      <div className="overlay-in absolute inset-0 bg-pine-950/55" onClick={onClose} />
      <div className="drawer-in absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l border-pine-700 bg-card shadow-float">
        <div className="flex items-start justify-between gap-4 border-b border-line bg-moss-50/60 px-6 py-4">
          <div>
            <h2 className="font-display text-xl font-bold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-mute">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-mute transition-colors hover:bg-pine-900/6 hover:text-ink"
            aria-label="Fechar painel"
          >
            <IconX size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

/* ----------------------------- Primitivas ------------------------------ */

export function Avatar({ patient, size = 44, className = '' }: { patient: Patient; size?: number; className?: string }) {
  const tone = avatarTone(patient.name);
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
      className={`inline-flex items-center gap-1 rounded-md border border-danger-500/25 bg-danger-100 font-mono font-semibold text-danger-600 ${
        size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs'
      }`}
      title="Tipo sanguíneo"
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2.9S6.2 9.3 6.2 13.6a5.8 5.8 0 0 0 11.6 0C17.8 9.3 12 2.9 12 2.9z" />
      </svg>
      {type}
    </span>
  );
}

export function Tag({
  children,
  tone,
}: {
  children: ReactNode;
  tone: 'warn' | 'info' | 'moss' | 'mute';
}) {
  const tones = {
    warn: 'bg-warn-100 text-warn-600 border-warn-500/25',
    info: 'bg-info-100 text-info-600 border-info-500/25',
    moss: 'bg-moss-100 text-moss-700 border-moss-500/25',
    mute: 'bg-pine-900/5 text-mute border-line',
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${tones}`}>
      {children}
    </span>
  );
}

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
    <div className="rise flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-card/60 px-6 py-14 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-moss-100 text-moss-600">
        {icon}
      </span>
      <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-mute">{desc}</p>
      {children && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  );
}

/* --------------------------- Eletrocardiograma -------------------------- */

function beatPath(offset: number): string {
  const pts: Array<[number, number]> = [
    [0, 20], [26, 20], [34, 20], [40, 11], [46, 27], [52, 3], [58, 35], [64, 20],
    [84, 20], [92, 15], [100, 20], [128, 20],
  ];
  return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x + offset} ${y}`).join(' ');
}
const ECG_D = [0, 128, 256, 384, 512].map(beatPath).join(' ');

export function Ecg({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 640 40" className={className} preserveAspectRatio="none" aria-hidden="true">
      <path d={ECG_D} fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.5" />
      <path d={ECG_D} fill="none" stroke="currentColor" strokeWidth="1.8" className="ecg-live" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------ Escaneador ------------------------------ */

export function Corners({ className = 'border-moss-300' }: { className?: string }) {
  const base = `absolute h-6 w-6 border-2 ${className} bracket-pulse`;
  return (
    <>
      <span className={`${base} left-3 top-3 rounded-tl-md border-b-0 border-r-0`} />
      <span className={`${base} right-3 top-3 rounded-tr-md border-b-0 border-l-0`} />
      <span className={`${base} bottom-3 left-3 rounded-bl-md border-t-0 border-r-0`} />
      <span className={`${base} bottom-3 right-3 rounded-br-md border-t-0 border-l-0`} />
    </>
  );
}

/* ------------------------------ Count-up ------------------------------- */

export function useCountUp(target: number, duration = 700): number {
  const [val, setVal] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    const to = target;
    prev.current = target;
    if (from === to) {
      setVal(to);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      setVal(Math.round(from + (to - from) * e));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

/* ------------------------------ RingGauge ------------------------------ */

export function RingGauge({
  value,
  size = 104,
  stroke = 9,
  caption = 'confiança',
}: {
  value: number;
  size?: number;
  stroke?: number;
  caption?: string;
}) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = window.setTimeout(() => setShown(value), 60);
    return () => window.clearTimeout(t);
  }, [value]);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = value >= 62 ? 'var(--color-moss-500)' : value >= 45 ? 'var(--color-warn-500)' : 'var(--color-danger-500)';
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(100, shown) / 100)}
          className="gauge-arc"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-xl font-semibold leading-none text-ink">{value}%</span>
        <span className="mt-1 text-[10px] font-medium uppercase tracking-wider text-mute">{caption}</span>
      </div>
    </div>
  );
}
