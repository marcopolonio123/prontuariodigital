import type { Contact, Patient } from '../lib/types';
import { RELATIONSHIP_META, SPECIAL_CARE_META } from '../lib/types';
import { ageFromBirth, formatDateBR, formatPhone, missingAlertText, telLink, waLink } from '../lib/biometrics';
import { Avatar, BloodBadge, Tag } from './ui';
import { IconAlert, IconCheck, IconCreditCard, IconDroplet, IconInfo, IconMessage, IconPhone, IconPill, IconUsers } from './icons';

export function ContactRow({
  contact,
  alertText,
  notified,
  onToggle,
  alertMode,
}: {
  contact: Contact;
  alertText: string;
  notified: boolean;
  onToggle: () => void;
  alertMode: boolean;
}) {
  return (
    <li className={`rounded-lg border p-3 transition-all ${notified ? 'border-moss-500/40 bg-moss-50' : 'border-line bg-white/70'}`}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{contact.name}</p>
          <p className="text-[11px] text-mute">
            {RELATIONSHIP_META[contact.relationship]}
            {contact.priority === 1 && <span className="ml-1 font-bold text-danger-600">· 1º contato</span>}
            {contact.note ? ` · ${contact.note}` : ''}
          </p>
        </div>
        <span className="shrink-0 font-mono text-xs text-mute">{formatPhone(contact.phone)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <a
          href={waLink(contact.phone, alertText)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md bg-moss-600 px-2.5 py-1 text-xs font-bold text-white transition-all hover:bg-moss-700 active:scale-95"
        >
          <IconMessage size={13} /> WhatsApp
        </a>
        <a
          href={telLink(contact.phone)}
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card px-2.5 py-1 text-xs font-bold text-ink transition-all hover:border-moss-300 hover:bg-moss-50 active:scale-95"
        >
          <IconPhone size={13} /> Ligar
        </a>
        {alertMode && (
          <button
            onClick={onToggle}
            className={`ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold transition-all active:scale-95 ${
              notified
                ? 'border-moss-500 bg-moss-600 text-white'
                : 'border-line text-mute hover:border-moss-300 hover:text-ink'
            }`}
          >
            {notified ? (
              <>
                <IconCheck size={12} /> avisado
              </>
            ) : (
              'marcar avisado'
            )}
          </button>
        )}
      </div>
    </li>
  );
}

export function EmergencyCard({ patient }: { patient: Patient }) {
  const age = ageFromBirth(patient.birthDate);
  const hasAlerts =
    patient.allergies.length > 0 ||
    patient.intolerances.length > 0 ||
    patient.specialCare.length > 0 ||
    patient.conditions.length > 0;

  return (
    <section className="rise overflow-hidden rounded-xl border-2 border-danger-500/40 bg-card shadow-lift">
      <div className="flex items-center gap-2.5 bg-danger-500 px-4 py-2.5 text-white">
        <IconAlert size={17} />
        <p className="font-display text-sm font-bold uppercase tracking-[0.18em]">Cartão de emergência</p>
        <span className="ml-auto font-mono text-[11px] opacity-85">ficha {patient.record}</span>
      </div>

      <div className="grid gap-5 p-4 sm:p-5 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-2 md:w-40">
          <Avatar patient={patient} size={104} />
          <div className="text-center">
            <p className="font-display text-base font-bold leading-tight text-ink">{patient.name}</p>
            <p className="mt-0.5 text-xs text-mute">
              {age !== null ? `${age} anos` : 'idade n/d'} · {patient.sex === 'F' ? 'F' : patient.sex === 'M' ? 'M' : '—'}
            </p>
          </div>
          {patient.bloodType ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-danger-500/30 bg-danger-100 px-3 py-1.5">
              <IconDroplet size={15} className="text-danger-600" />
              <span className="font-mono text-lg font-bold text-danger-600">{patient.bloodType}</span>
            </div>
          ) : (
            <Tag tone="mute">tipo sanguíneo n/d</Tag>
          )}
        </div>

        <div className="space-y-3.5">
          {patient.allergies.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-danger-600">Alergias</p>
              <div className="flex flex-wrap gap-1.5">
                {patient.allergies.map((a) => (
                  <Tag key={a} tone="danger">
                    <IconAlert size={11} className="mr-1" /> {a}
                  </Tag>
                ))}
              </div>
            </div>
          )}

          {patient.intolerances.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-warn-600">Intolerâncias alimentares</p>
              <div className="flex flex-wrap gap-1.5">
                {patient.intolerances.map((i) => (
                  <Tag key={i} tone="warn">{i}</Tag>
                ))}
              </div>
            </div>
          )}

          {patient.specialCare.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-info-600">Cuidados especiais</p>
              <ul className="space-y-1.5">
                {patient.specialCare.map((c) => (
                  <li key={c} className="rounded-lg bg-info-100/70 px-3 py-2 text-[13px] leading-snug text-info-600">
                    <strong className="text-ink">{SPECIAL_CARE_META[c].label}:</strong> {SPECIAL_CARE_META[c].detail}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {patient.conditions.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-mute">Condições crônicas</p>
              <div className="flex flex-wrap gap-1.5">
                {patient.conditions.map((c) => (
                  <Tag key={c} tone="info">{c}</Tag>
                ))}
              </div>
            </div>
          )}

          {patient.medications.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-mute">
                <IconPill size={13} /> Medicamentos de uso contínuo
              </p>
              <ul className="space-y-1">
                {patient.medications.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-ink">
                    <span className="h-1 w-1 shrink-0 translate-y-[-2px] rounded-full bg-moss-500" />
                    <strong>{m.name}</strong>
                    {m.dose && <span className="font-mono text-xs text-mute">{m.dose}</span>}
                    {m.frequency && <span className="text-xs text-mute">· {m.frequency}</span>}
                    {m.reason && <span className="text-xs italic text-mute/80">({m.reason})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {patient.insurances.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-mute">
                <IconCreditCard size={13} /> Convênios / seguro saúde
              </p>
              <ul className="space-y-1.5">
                {patient.insurances.map((ins) => {
                  const expired = !!ins.validUntil && ins.validUntil < new Date().toISOString().slice(0, 10);
                  return (
                    <li key={ins.id} className="flex items-center gap-2.5 rounded-lg border border-line bg-white/70 px-2.5 py-2">
                      {ins.image ? (
                        <img src={ins.image} alt={`Carteirinha ${ins.operator}`} className="h-9 w-14 shrink-0 rounded border border-line object-cover" />
                      ) : (
                        <span className="flex h-9 w-14 shrink-0 items-center justify-center rounded border border-dashed border-line text-mute">
                          <IconCreditCard size={15} />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold text-ink">{ins.operator}{ins.plan ? ` · ${ins.plan}` : ''}</span>
                        <span className="block font-mono text-[11px] text-mute">{ins.cardNumber || 'nº não informado'}</span>
                      </span>
                      {ins.validUntil ? (
                        <Tag tone={expired ? 'danger' : 'moss'}>{expired ? 'vencido' : `vál. ${formatDateBR(ins.validUntil)}`}</Tag>
                      ) : (
                        <Tag tone="mute">validade n/d</Tag>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {patient.emergencyNotes && (
            <div className="rounded-lg border border-info-500/30 bg-info-100/50 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-info-600">
                <IconInfo size={13} /> Instruções para quem encontrar
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink">{patient.emergencyNotes}</p>
            </div>
          )}

          {!hasAlerts && !patient.medications.length && !patient.emergencyNotes && (
            <p className="rounded-lg bg-paper px-3 py-3 text-sm text-mute">
              Nenhum alerta crítico registrado. Complete a ficha para enriquecer o cartão de emergência.
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-line bg-paper/60 px-4 py-2 text-[11px] text-mute">
        Ficha aberta em {formatDateBR(new Date(patient.createdAt).toISOString().slice(0, 10))} · dados exibidos para
        socorro imediato · <IconUsers size={11} className="inline" /> {patient.contacts.length} contato(s) na rede de avisos
      </div>
    </section>
  );
}
