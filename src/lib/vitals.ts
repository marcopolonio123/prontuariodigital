import type { VitalMetric, VitalSample, VitalSource } from './types';

/* ------------------------- métricas & referências ----------------------- */

export interface VitalMeta {
  key: VitalMetric;
  label: string;
  short: string;
  unit: string;
  decimals: number;
  /** [min,max] normal · fora de [cautionMin,cautionMax] = crítico */
  normal: [number, number];
  caution: [number, number];
  monitor: boolean; // entra na sessão de monitoramento contínuo
}

export const VITAL_METRICS: VitalMeta[] = [
  { key: 'heart', label: 'Frequência cardíaca', short: 'FC', unit: 'bpm', decimals: 0, normal: [60, 100], caution: [45, 130], monitor: true },
  { key: 'systolic', label: 'Pressão sistólica', short: 'PAS', unit: 'mmHg', decimals: 0, normal: [90, 129], caution: [80, 160], monitor: true },
  { key: 'diastolic', label: 'Pressão diastólica', short: 'PAD', unit: 'mmHg', decimals: 0, normal: [60, 84], caution: [50, 100], monitor: true },
  { key: 'spo2', label: 'Saturação de O₂', short: 'SpO₂', unit: '%', decimals: 0, normal: [95, 100], caution: [90, 100], monitor: true },
  { key: 'temp', label: 'Temperatura', short: 'Temp', unit: '°C', decimals: 1, normal: [35.5, 37.2], caution: [34.5, 38.5], monitor: true },
  { key: 'glucose', label: 'Glicemia', short: 'Glic', unit: 'mg/dL', decimals: 0, normal: [70, 99], caution: [55, 180], monitor: false },
  { key: 'respiratory', label: 'Frequência respiratória', short: 'FR', unit: 'irpm', decimals: 0, normal: [12, 20], caution: [9, 26], monitor: false },
  { key: 'weight', label: 'Peso', short: 'Peso', unit: 'kg', decimals: 1, normal: [-1, 999], caution: [-1, 999], monitor: false },
];

export const metricMeta = (m: VitalMetric): VitalMeta =>
  VITAL_METRICS.find((x) => x.key === m) ?? VITAL_METRICS[0];

export type VitalStatus = 'normal' | 'caution' | 'critical' | 'neutral';

export function assess(metric: VitalMetric, value: number): VitalStatus {
  const m = metricMeta(metric);
  if (m.normal[0] < 0) return 'neutral';
  if (value >= m.normal[0] && value <= m.normal[1]) return 'normal';
  if (value >= m.caution[0] && value <= m.caution[1]) return 'caution';
  return 'critical';
}

export const STATUS_META: Record<VitalStatus, { label: string; dot: string; text: string; chip: string }> = {
  normal: { label: 'normal', dot: 'bg-moss-500', text: 'text-moss-700', chip: 'bg-moss-100 text-moss-700 border-moss-500/25' },
  caution: { label: 'atenção', dot: 'bg-warn-500', text: 'text-warn-600', chip: 'bg-warn-100 text-warn-600 border-warn-500/25' },
  critical: { label: 'crítico', dot: 'bg-danger-500', text: 'text-danger-600', chip: 'bg-danger-100 text-danger-600 border-danger-500/25' },
  neutral: { label: 'registrado', dot: 'bg-pine-300', text: 'text-mute', chip: 'bg-pine-900/5 text-mute border-line' },
};

export const SOURCE_META: Record<VitalSource, string> = {
  manual: 'manual',
  monitor: 'monitoramento',
  healthconnect: 'Health Connect',
  healthkit: 'HealthKit',
};

export const fmtVital = (metric: VitalMetric, value: number): string =>
  value.toFixed(metricMeta(metric).decimals);

/* ----------------------- provedores de leitura -------------------------- */
/* No APK (Capacitor), a ponte nativa conversa com Health Connect (Android)  */
/* e HealthKit (iOS) — serviços gratuitos dos sistemas. No navegador, roda   */
/* o provedor demonstrativo (valores realistas com deriva) + entrada manual. */

export interface VitalsProvider {
  kind: 'native' | 'web';
  label: string;
}

interface NativeBridge {
  available: boolean;
  start: (onSample: (metric: VitalMetric, value: number, source: VitalSource) => void) => void;
  stop: () => void;
}

function getNativeBridge(): NativeBridge | null {
  const w = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> };
    VitalisHealth?: { start: NativeBridge['start']; stop: () => void };
  };
  if (w.Capacitor?.isNativePlatform?.() && w.VitalisHealth) {
    return { available: true, start: w.VitalisHealth.start, stop: w.VitalisHealth.stop };
  }
  return null;
}

export function getProvider(): VitalsProvider {
  const native = getNativeBridge();
  if (native) {
    const ios = /iphone|ipad/i.test(navigator.userAgent);
    return { kind: 'native', label: ios ? 'HealthKit (Apple)' : 'Health Connect (Android)' };
  }
  return { kind: 'web', label: 'navegador — sessão demonstrativa + entrada manual' };
}

/* ---------------------- sessão de monitoramento ------------------------- */

export interface MonitorBundle {
  at: number;
  readings: Array<{ metric: VitalMetric; value: number }>;
}

/** Gera leituras encadeadas com deriva realista (random walk fisiológico). */
export function createMonitorSession(onBundle: (b: MonitorBundle) => void): { stop: () => void } {
  const base: Record<string, number> = { heart: 76, systolic: 118, diastolic: 76, spo2: 97, temp: 36.4 };
  const walk = (v: number, step: number, min: number, max: number) =>
    Math.min(max, Math.max(min, v + (Math.random() - 0.5) * step));

  const tick = () => {
    base.heart = Math.round(walk(base.heart, 7, 55, 115));
    base.systolic = Math.round(walk(base.systolic, 5, 96, 142));
    base.diastolic = Math.round(walk(base.diastolic, 4, 58, 90));
    base.spo2 = Math.round(walk(base.spo2, 1.4, 92, 100));
    base.temp = Math.round(walk(base.temp, 0.16, 35.6, 37.6) * 10) / 10;
    onBundle({
      at: Date.now(),
      readings: [
        { metric: 'heart', value: base.heart },
        { metric: 'systolic', value: base.systolic },
        { metric: 'diastolic', value: base.diastolic },
        { metric: 'spo2', value: base.spo2 },
        { metric: 'temp', value: base.temp },
      ],
    });
  };
  tick();
  const timer = window.setInterval(tick, 2600);
  return { stop: () => window.clearInterval(timer) };
}

export function makeSamples(
  bundle: MonitorBundle,
  source: VitalSource,
  newId: () => string,
): VitalSample[] {
  return bundle.readings.map((r) => ({
    id: newId(),
    metric: r.metric,
    value: r.value,
    at: bundle.at,
    source,
  }));
}

export function latestByMetric(samples: VitalSample[]): Map<VitalMetric, VitalSample> {
  const m = new Map<VitalMetric, VitalSample>();
  for (const s of samples) {
    const cur = m.get(s.metric);
    if (!cur || s.at >= cur.at) m.set(s.metric, s);
  }
  return m;
}
