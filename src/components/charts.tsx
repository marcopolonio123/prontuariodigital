import { useId, useMemo, useRef, useState } from 'react';
import type { VitalMetric, VitalSample } from '../lib/types';
import { assess, fmtVital, metricMeta } from '../lib/vitals';
import { formatDateTime } from '../lib/biometrics';

/* ------------------------------ paleta -------------------------------- */

const STATUS_COLOR: Record<string, string> = {
  normal: '#268760',
  caution: '#d3921f',
  critical: '#c74a3c',
  neutral: '#8ba79a',
};

const fmtTick = (ts: number, long: boolean) => {
  const d = new Date(ts);
  return long
    ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
        ' ' +
        d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

/* ========================= gráfico de variação ========================== */

export function VitalLineChart({
  samples,
  metric,
  height = 250,
}: {
  samples: VitalSample[];
  metric: VitalMetric;
  height?: number;
}) {
  const meta = metricMeta(metric);
  const gid = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const data = useMemo(() => [...samples].sort((a, b) => a.at - b.at), [samples]);

  if (data.length === 0) return null;

  const W = 720;
  const H = height;
  const PAD = { top: 16, right: 16, bottom: 30, left: 46 };

  const values = data.map((s) => s.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (meta.normal[0] >= 0) {
    min = Math.min(min, meta.normal[0]);
    max = Math.max(max, meta.normal[1]);
  }
  const padV = (max - min || 1) * 0.14;
  min -= padV;
  max += padV;

  const t0 = data[0].at;
  const t1 = Math.max(data[data.length - 1].at, t0 + 1);

  const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0 || 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min || 1)) * (H - PAD.top - PAD.bottom);

  const path = data.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(s.at).toFixed(1)} ${y(s.value).toFixed(1)}`).join(' ');
  const area = `${path} L${x(t1).toFixed(1)} ${(H - PAD.bottom).toFixed(1)} L${x(t0).toFixed(1)} ${(H - PAD.bottom).toFixed(1)} Z`;

  const yTicks = [0, 1, 2, 3].map((i) => min + ((max - min) * i) / 3);
  const hasBand = meta.normal[0] >= 0;
  const bandTop = hasBand ? y(meta.normal[1]) : 0;
  const bandBottom = hasBand ? y(meta.normal[0]) : 0;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const el = svgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bd = Infinity;
    data.forEach((s, i) => {
      const d = Math.abs(x(s.at) - px);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(best);
  };

  const hs = hover !== null ? data[hover] : null;
  const hsMeta = hs ? assess(metric, hs.value) : 'neutral';

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Variação de ${meta.label}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`grad-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#268760" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#268760" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* faixa de normalidade */}
        {hasBand && (
          <>
            <rect
              x={PAD.left}
              y={bandTop}
              width={W - PAD.left - PAD.right}
              height={Math.max(2, bandBottom - bandTop)}
              fill="#268760"
              opacity="0.08"
            />
            <line x1={PAD.left} x2={W - PAD.right} y1={bandTop} y2={bandTop} stroke="#268760" strokeOpacity="0.35" strokeDasharray="4 5" strokeWidth="1" />
            <line x1={PAD.left} x2={W - PAD.right} y1={bandBottom} y2={bandBottom} stroke="#268760" strokeOpacity="0.35" strokeDasharray="4 5" strokeWidth="1" />
            <text x={W - PAD.right - 4} y={bandTop - 4} textAnchor="end" fontSize="9.5" fill="#268760" opacity="0.8">
              normal {fmtVital(metric, meta.normal[1])}
            </text>
            <text x={W - PAD.right - 4} y={bandBottom + 11} textAnchor="end" fontSize="9.5" fill="#268760" opacity="0.8">
              normal {fmtVital(metric, meta.normal[0])}
            </text>
          </>
        )}

        {/* grades e eixo Y */}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#dbe3dc" strokeWidth="1" />
            <text x={PAD.left - 7} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="#5d6f67" fontFamily="IBM Plex Mono, monospace">
              {fmtVital(metric, v)}
            </text>
          </g>
        ))}

        {/* eixo X */}
        <text x={PAD.left} y={H - 8} fontSize="10" fill="#5d6f67" fontFamily="IBM Plex Mono, monospace">
          {fmtTick(t0, data[data.length - 1].at - t0 < 48 * 3_600_000)}
        </text>
        <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize="10" fill="#5d6f67" fontFamily="IBM Plex Mono, monospace">
          {fmtTick(t1, data[data.length - 1].at - t0 < 48 * 3_600_000)}
        </text>

        {/* área + linha */}
        <path d={area} fill={`url(#grad-${gid})`} />
        <path d={path} fill="none" stroke="#0f6e4e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />

        {/* pontos coloridos por status */}
        {data.map((s, i) => (
          <circle
            key={s.id}
            cx={x(s.at)}
            cy={y(s.value)}
            r={hover === i ? 5 : data.length > 40 ? 2.4 : 3.4}
            fill={STATUS_COLOR[assess(metric, s.value)] ?? STATUS_COLOR.neutral}
            stroke="#fbfcfa"
            strokeWidth="1.4"
            style={{ transition: 'r 0.15s ease' }}
          />
        ))}

        {/* linha-guia do hover */}
        {hs && (
          <line x1={x(hs.at)} x2={x(hs.at)} y1={PAD.top} y2={H - PAD.bottom} stroke="#13221c" strokeOpacity="0.25" strokeDasharray="3 4" strokeWidth="1" />
        )}
      </svg>

      {/* tooltip */}
      {hs && svgRef.current && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-line bg-pine-950 px-3 py-2 text-white shadow-float"
          style={{
            left: `${(PAD.left + ((hs.at - t0) / (t1 - t0 || 1)) * (W - PAD.left - PAD.right)) / (W / 100)}%`,
            top: `${(y(hs.value) / H) * 100}%`,
            transform: 'translate(-50%, -120%)',
          }}
        >
          <p className="whitespace-nowrap font-mono text-sm font-bold" style={{ color: STATUS_COLOR[hsMeta] }}>
            {fmtVital(metric, hs.value)} {meta.unit}
          </p>
          <p className="whitespace-nowrap font-mono text-[10px] text-pine-200">
            {formatDateTime(hs.at)} · {hsMeta}
            {hs.note ? ` · ${hs.note}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}

/* ============================ correlação ================================ */

/** Coeficiente de Pearson — relação linear entre dois sinais. */
export function pearson(pairs: Array<{ a: number; b: number }>): number | null {
  const n = pairs.length;
  if (n < 3) return null;
  const ma = pairs.reduce((s, p) => s + p.a, 0) / n;
  const mb = pairs.reduce((s, p) => s + p.b, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (const p of pairs) {
    num += (p.a - ma) * (p.b - mb);
    da += (p.a - ma) ** 2;
    db += (p.b - mb) ** 2;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? null : num / den;
}

export function interpretCorrelation(r: number): { label: string; tone: 'moss' | 'warn' | 'mute' } {
  const abs = Math.abs(r);
  if (abs >= 0.7) return { label: r > 0 ? 'correlação forte (direta)' : 'correlação forte (inversa)', tone: 'moss' };
  if (abs >= 0.4) return { label: r > 0 ? 'correlação moderada (direta)' : 'correlação moderada (inversa)', tone: 'moss' };
  if (abs >= 0.2) return { label: r > 0 ? 'correlação fraca (direta)' : 'correlação fraca (inversa)', tone: 'warn' };
  return { label: 'sem correlação significativa', tone: 'mute' };
}

export function ScatterCorrelation({
  points,
  metricA,
  metricB,
  height = 250,
}: {
  points: Array<{ a: number; b: number; at: number }>;
  metricA: VitalMetric;
  metricB: VitalMetric;
  height?: number;
}) {
  const metaA = metricMeta(metricA);
  const metaB = metricMeta(metricB);
  const gid = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (points.length === 0) return null;

  const W = 720;
  const H = height;
  const PAD = { top: 16, right: 18, bottom: 36, left: 46 };

  const as = points.map((p) => p.a);
  const bs = points.map((p) => p.b);
  let minX = Math.min(...as);
  let maxX = Math.max(...as);
  let minY = Math.min(...bs);
  let maxY = Math.max(...bs);
  const padX = (maxX - minX || 1) * 0.14;
  const padY = (maxY - minY || 1) * 0.14;
  minX -= padX;
  maxX += padX;
  minY -= padY;
  maxY += padY;

  const x = (v: number) => PAD.left + ((v - minX) / (maxX - minX || 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - minY) / (maxY - minY || 1)) * (H - PAD.top - PAD.bottom);

  // regressão linear (mínimos quadrados)
  const r = pearson(points);
  let regLine: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (r !== null) {
    const n = points.length;
    const ma = as.reduce((s, v) => s + v, 0) / n;
    const mb = bs.reduce((s, v) => s + v, 0) / n;
    const slope = points.reduce((s, p) => s + (p.a - ma) * (p.b - mb), 0) / (points.reduce((s, p) => s + (p.a - ma) ** 2, 0) || 1);
    const intercept = mb - slope * ma;
    regLine = { x1: minX, y1: slope * minX + intercept, x2: maxX, y2: slope * maxX + intercept };
  }

  const xTicks = [0, 1, 2, 3].map((i) => minX + ((maxX - minX) * i) / 3);
  const yTicks = [0, 1, 2, 3].map((i) => minY + ((maxY - minY) * i) / 3);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const el = svgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H;
    let best = 0;
    let bd = Infinity;
    points.forEach((p, i) => {
      const d = Math.hypot(x(p.a) - px, y(p.b) - py);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(bd < 40 ? best : null);
  };

  const hs = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Relação entre ${metaA.label} e ${metaB.label}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`scatter-${gid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#268760" />
            <stop offset="100%" stopColor="#3e7cb1" />
          </linearGradient>
        </defs>

        {/* grades */}
        {yTicks.map((v) => (
          <g key={`y-${v}`}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#dbe3dc" strokeWidth="1" />
            <text x={PAD.left - 7} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="#3e7cb1" fontFamily="IBM Plex Mono, monospace">
              {fmtVital(metricB, v)}
            </text>
          </g>
        ))}
        {xTicks.map((v) => (
          <text key={`x-${v}`} x={x(v)} y={H - 12} textAnchor="middle" fontSize="10" fill="#268760" fontFamily="IBM Plex Mono, monospace">
            {fmtVital(metricA, v)}
          </text>
        ))}

        {/* títulos dos eixos */}
        <text x={W / 2} y={H - 0.5} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#0c5a40">
          {metaA.label} ({metaA.unit}) →
        </text>
        <text x={12} y={H / 2} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#2f6392" transform={`rotate(-90 12 ${H / 2})`}>
          {metaB.label} ({metaB.unit}) →
        </text>

        {/* linha de tendência */}
        {regLine && (
          <line
            x1={x(Math.max(minX, regLine.x1))}
            y1={y(Math.min(maxY, Math.max(minY, regLine.y1)))}
            x2={x(Math.min(maxX, regLine.x2))}
            y2={y(Math.min(maxY, Math.max(minY, regLine.y2)))}
            stroke={`url(#scatter-${gid})`}
            strokeWidth="2"
            strokeDasharray="6 5"
            strokeLinecap="round"
          />
        )}

        {/* pontos */}
        {points.map((p, i) => (
          <circle
            key={`${p.at}-${i}`}
            cx={x(p.a)}
            cy={y(p.b)}
            r={hover === i ? 6 : 4.2}
            fill="#0f6e4e"
            fillOpacity="0.75"
            stroke="#fbfcfa"
            strokeWidth="1.4"
            style={{ transition: 'r 0.15s ease' }}
          />
        ))}
      </svg>

      {hs && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-line bg-pine-950 px-3 py-2 text-white shadow-float"
          style={{
            left: `${(PAD.left + ((hs.a - minX) / (maxX - minX || 1)) * (W - PAD.left - PAD.right)) / (W / 100)}%`,
            top: `${(y(hs.b) / H) * 100}%`,
            transform: 'translate(-50%, -120%)',
          }}
        >
          <p className="whitespace-nowrap font-mono text-xs font-bold">
            <span className="text-moss-300">{metaA.short} {fmtVital(metricA, hs.a)}</span>
            <span className="mx-1 text-pine-200">×</span>
            <span className="text-info-100">{metaB.short} {fmtVital(metricB, hs.b)}</span>
          </p>
          <p className="whitespace-nowrap font-mono text-[10px] text-pine-200">{formatDateTime(hs.at)}</p>
        </div>
      )}
    </div>
  );
}
