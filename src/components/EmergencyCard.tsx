import type { ReactNode } from 'react';
import type { Contact, Patient } from '../lib/types';
import { RELATIONSHIP_META, SPECIAL_CARE_META } from '../lib/types';
import { ageFromBirth, formatPhone, telLink, waLink } from '../lib/biometrics';
import { BloodBadge, Tag } from './ui';
import {
  IconActivity,
  IconAlert,
  IconClock,
  IconDroplet,
  IconInfo,
  IconMessage,
  IconPhone,
  IconPill,
} from './icons';

const CARE_ICON: Record<string, ReactNode> = {
  alzheimer: <IconClock size={13} />,
  autismo: <IconInfo size={13} />,
  diabetes: <IconDroplet size={13} />,
  epilepsia: <IconActivity size={13} />,
  cardiaco: <IconActivity size={13} />,
  nao_verbal: <IconMessage size={13} />,
  mobilidade: <IconInfo size={13} />,
  outro: <IconInfo size={13} />,
};

function Section({ title, children, empty }: { title: string; children: ReactNode; empty?: boolean }) {
  if (empty) return null;
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-mute">{title}</p>
      {children}
    </div>
  );
}

export function EmergencyCard({ patient, compact = false }: { patient: Patient; compact?: boolean }) {
  const age = ageFromBirth(patient.birthDate);
  const hasMedical =
    patient.allergies.length > 0 ||
    patient.intolerances.length > 0 ||
    patient.conditions.length > 0 ||
    patient.medications.length > 0 ||
    patient.specialCare.length > 0;

  return (
    <article className="overflow-hidden rounded-xl border-2 border-danger-500/50 bg-card shadow-lift">
      {/* faixa superior de emergência */}
      <header className="flex items-center gap-3 border-b-2 border-danger-500/40 bg-danger-500 px-4 py-2.5 text-white">
        <IconAlert size={18} className="shrink-0" />
        <div className="min-w-0">
          <p className="font-display text-sm font-bold uppercase tracking-[0.18em]">Cartão de emergência</p>
        </div>
        <span className="ml-auto hidden font-mono text-[11px] opacity-80 sm:block">
          ficha {patient.record}
        </span>
      </header>

      <div className="grid gap-5 p-4 sm:grid-cols-[auto_1fr] sm:p-5">
        {/* tipo sanguíneo em destaque */}
        <div className="flex flex-row items-center gap-4 sm:flex-col sm:items-stretch sm:gap-2">
          <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-xl border-2 border-danger-500 bg-danger-100 text-danger-600 sm:h-28 sm:w-28">
            <span className="font-display text-4xl font-bold leading-none">
              {patient.bloodType || '—'}
            </span>
            <span className="mt-1 text-[10px] font-bold uppercase tracking-widest">sangue</span>
          </div>
          {!compact && (
            <div className="text-sm text-mute sm:text-center">
              <p className="font-semibold text-ink">{patient.name.split(' ')[0]}</p>
              <p>
                {age !== null ? `${age} anos` : 'idade n/d'} ·{' '}
                {patient.sex === 'F' ? 'fem.' : patient.sex === 'M' ? 'masc.' : '—'}
              </p>
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <Section title="Alergias" empty={patient.allergies.length === 0}>
            <div className="flex flex-wrap gap-1.5">
              {patient.allergies.map((a) => (
                <Tag key={a} tone="danger">
                  <IconAlert size={11} className="mr-1" />
                  {a}
                </Tag>
              ))}
            </div>
          </Section>

          <Section title="Intolerâncias alimentares" empty={patient.intolerances.length === 0}>
            <div className="flex flex-wrap gap-1.5">
              {patient.intolerances.map((i) => (
                <Tag key={i} tone="warn">
                  {i}
                </Tag>
              ))}
            </div>
          </Section>

          <Section title="Condições & cuidados especiais" empty={patient.specialCare.length === 0 && patient.conditions.length === 0}>
            <div className="flex flex-wrap gap-1.5">
              {patient.specialCare.map((c) => (
                <span
                  key={c}
                  title={SPECIAL_CARE_META[c].detail}
                  className="inline-flex cursor-help items-center gap-1.5 rounded-md bg-pine-900 px-2.5 py-1 text-[12px] font-bold text-pine-100"
                >
                  {CARE_ICON[c]}
                  {SPECIAL_CARE_META[c].label}
                </span>
              ))}
              {patient.conditions.map((c) => (
                <Tag key={c} tone="info">
                  {c}
                </Tag>
              ))}
            </div>
            <ul className="mt-2 space-y-1">
              {patient.specialCare.map((c) => (
                <li key={c} className="text-[13px] leading-snug text-mute">
                  <strong className="text-ink">{SPECIAL_CARE_META[c].label}:</strong>{' '}
                  {SPECIAL_CARE_META[c].detail}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Medicações em uso" empty={patient.medications.length === 0}>
            <ul className="space-y-1">
              {patient.medications.map((m) => (
                <li key={m} className="flex items-start gap-2 text-[13px] text-ink">
                  <IconPill size={14} className="mt-0.5 shrink-0 text-moss-600" />
                  {m}
                </li>
              ))}
            </ul>
          </Section>

          {!hasMedical && (
            <p className="rounded-lg bg-paper px-3 py-2 text-[13px] text-mute">
              Nenhuma restrição médica cadastrada até o momento.
            </p>
          )}

          {patient.emergencyNotes && (
            <div className="rounded-lg border border-warn-500/40 bg-warn-100/60 px-3.5 py-3">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-warn-600">
                <IconInfo size={13} /> Instruções para quem encontrar
              </p>
              <p className="text-sm font-medium leading-relaxed text-ink">{patient.emergencyNotes}</p>
            </div>
          )}
        </div>
      </div>

      {!compact && patient.bloodType && (
        <footer className="border-t border-line bg-paper/60 px-4 py-2 text-[11px] text-mute">
          Em transfusão de emergência sem provas cruzadas disponíveis, o tipo registrado acima orienta a equipe — a
          confirmação laboratorial permanece obrigatória.
        </footer>
      )}
    </article>
  );
}

export function ContactRow({
  contact,
  personName,
  age,
  lastPlace,
  notified,
  onToggle,
  alertMode,
}: {
  contact: Contact;
  personName: string;
  age: number | null;
  lastPlace: string;
  notified: boolean;
  onToggle: () => void;
  alertMode: boolean;
}) {
  const prio = ['1º contato', '2º contato', '3º contato'][contact.priority - 1];
  const msg = alertMode
    ? `Olá! Alerta do app Vitalis: ${personName}${age !== null ? ` (${age} anos)` : ''} foi localizado(a) agora há pouco. Por favor, confirme o recebimento deste aviso.`
    : `Olá ${contact.name.split(' ')[0]}, aqui é do app Vitalis, sobre ${personName}.`;
  return (
    <li
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5 transition-colors ${
        notified ? 'border-moss-300 bg-moss-50' : 'border-line bg-card hover:border-moss-200'
      }`}
    >
      <label className="flex cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          checked={notified}
          onChange={onToggle}
          className="h-4 w-4 accent-moss-600"
          aria-label={`Marcar ${contact.name} como avisado`}
        />
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-ink">{contact.name}</span>
          <span className="block text-xs text-mute">
            {RELATIONSHIP_META[contact.relationship]}
            {contact.note ? ` · ${contact.note}` : ''} · <span className="font-mono">{formatPhone(contact.phone)}</span>
          </span>
        </span>
      </label>
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
          contact.priority === 1 ? 'bg-danger-100 text-danger-600' : 'bg-pine-900/8 text-mute'
        }`}
      >
        {prio}
      </span>
      <span className="ml-auto flex items-center gap-1.5">
        <a
          href={waLink(contact.phone, msg)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-bold text-moss-700 transition-all hover:border-moss-300 hover:bg-moss-50 active:scale-95"
        >
          <IconMessage size={13} /> WhatsApp
        </a>
        <a
          href={telLink(contact.phone)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-pine-900 px-2.5 py-1.5 text-xs font-bold text-pine-100 transition-all hover:bg-pine-800 active:scale-95"
        >
          <IconPhone size={13} /> Ligar
        </a>
      </span>
    </li>
  );
}

export function PriorityContacts({ patient, limit = 3 }: { patient: Patient; limit?: number }) {
  const sorted = [...patient.contacts].sort((a, b) => a.priority - b.priority).slice(0, limit);
  if (sorted.length === 0) {
    return <p className="text-sm text-mute">Nenhum contato cadastrado na rede de avisos.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {sorted.map((c) => (
        <a
          key={c.id}
          href={waLink(c.phone, `Olá ${c.name.split(' ')[0]}, aqui é do app Vitalis, sobre ${patient.name}.`)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs font-semibold text-ink transition-all hover:border-moss-300 hover:bg-moss-50"
        >
          <IconPhone size={13} className="text-moss-600" />
          {c.name.split(' ')[0]} · {RELATIONSHIP_META[c.relationship]}
        </a>
      ))}
    </div>
  );
}

export function BloodBig({ type }: { type: Patient['bloodType'] }) {
  return <BloodBadge type={type} />;
}
