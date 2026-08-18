import { useEffect, useRef, useState } from 'react';
import type { Patient } from '../lib/types';
import { ageFromBirth } from '../lib/biometrics';
import { analyze, ANALYSIS_STEPS, DISCLAIMER, type Consultation } from '../lib/consultant';
import { Avatar, Btn, EmptyState, Tag } from '../components/ui';
import { IconAlert, IconBrain, IconCheck, IconSend, IconSparkles, IconX } from '../components/icons';

interface ChatMsg {
  id: number;
  role: 'user' | 'assistant';
  text?: string;
  consult?: Consultation;
}

const SUGGESTIONS = [
  'Estou com febre e dor no corpo',
  'Dor de cabeça forte desde ontem',
  'Azia depois de comer',
  'Manchas vermelhas coçando na pele',
  'Não consigo dormir direito',
  'Diarreia desde ontem',
];

function StatusBadge({ status }: { status: 'ok' | 'caution' | 'contra' }) {
  if (status === 'ok')
    return (
      <Tag tone="moss">
        <IconCheck size={11} className="mr-1" /> compatível com o prontuário
      </Tag>
    );
  if (status === 'caution')
    return (
      <Tag tone="warn">
        <IconAlert size={11} className="mr-1" /> cautela
      </Tag>
    );
  return (
    <Tag tone="danger">
      <IconX size={11} className="mr-1" /> evitar
    </Tag>
  );
}

function AssistantCard({ msg, firstName }: { msg: ChatMsg; firstName: string }) {
  const c = msg.consult;
  return (
    <div className="rise max-w-2xl rounded-xl rounded-tl-sm border border-line bg-card p-4 shadow-lift">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-pine-900 text-moss-300">
          <IconBrain size={17} />
        </span>
        <p className="font-display text-sm font-bold text-ink">Consultor Vitalis</p>
        <span className="ml-auto rounded-md bg-warn-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warn-600">
          apoio informativo
        </span>
      </div>

      {!c ? (
        <p className="mt-3 text-sm leading-relaxed text-mute">{msg.text}</p>
      ) : !c.entry ? (
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-mute">
          <p>
            Não reconheci esse sintoma com clareza. Tente descrever com palavras simples, como{' '}
            <strong className="text-ink">febre</strong>, <strong className="text-ink">dor de cabeça</strong>,{' '}
            <strong className="text-ink">azia</strong>, <strong className="text-ink">coceira na pele</strong>,{' '}
            <strong className="text-ink">gripe</strong>, <strong className="text-ink">dor muscular</strong>,{' '}
            <strong className="text-ink">insônia</strong> ou <strong className="text-ink">diarreia</strong>.
          </p>
          {c.recordAlerts.length > 0 && (
            <div className="rounded-lg border border-info-500/25 bg-info-100/60 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-info-600">Contexto do prontuário de {firstName}</p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[13px] text-info-600">
                {c.recordAlerts.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-semibold text-ink">
              Quadro compatível: <span className="text-moss-700">{c.entry.label}</span>
            </p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[13px] text-mute">
              {c.entry.causes.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-mute">Opções analisadas contra o prontuário</p>
            <ul className="mt-2 space-y-2">
              {c.assessments.map((a) => (
                <li
                  key={a.option.name}
                  className={`rounded-lg border p-3 ${
                    a.status === 'contra'
                      ? 'border-danger-500/40 bg-danger-100/50'
                      : a.status === 'caution'
                        ? 'border-warn-500/35 bg-warn-100/50'
                        : 'border-moss-500/30 bg-moss-50/60'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-ink">{a.option.name}</span>
                    <StatusBadge status={a.status} />
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-mute">
                    {a.reasons.map((r, i) => (
                      <span key={r}>
                        {i > 0 && ' · '}
                        {r}
                      </span>
                    ))}
                  </p>
                  <p className="mt-1 text-xs text-mute/80">{a.option.note}</p>
                </li>
              ))}
            </ul>
          </div>

          {c.recordAlerts.length > 0 && (
            <div className="rounded-lg border border-info-500/25 bg-info-100/60 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-info-600">Considerações do prontuário</p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[13px] text-info-600">
                {c.recordAlerts.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-lg border border-danger-500/30 bg-danger-100/60 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-danger-600">Procure emergência se houver</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[13px] text-danger-600">
              {c.entry.redFlags.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-mute">Referências consultadas</p>
            <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-mute">
              {c.sources.map((s) => (
                <li key={s}>• {s}</li>
              ))}
              <li className="text-mute/60">(base de conhecimento offline — v0.2, sem busca externa real)</li>
            </ul>
          </div>
        </div>
      )}

      <p className="mt-4 border-t border-line pt-3 text-[12px] italic leading-relaxed text-warn-600">
        {DISCLAIMER}
      </p>
    </div>
  );
}

export function ConsultantScreen({
  patient,
  onPickRecord,
}: {
  patient: Patient | null;
  onPickRecord: () => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(1);
  const timersRef = useRef<number[]>([]);

  const storageKey = patient ? `vitalis.consultor.${patient.id}` : null;

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      setMessages(raw ? (JSON.parse(raw) as ChatMsg[]) : []);
    } catch {
      setMessages([]);
    }
    return () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current = [];
      setThinking(false);
      setStepIdx(0);
    };
  }, [storageKey]);

  useEffect(() => {
    if (storageKey && !thinking) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(messages));
      } catch {
        /* armazenamento cheio — conversa segue em memória */
      }
    }
  }, [messages, storageKey, thinking]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking, stepIdx]);

  if (!patient) {
    return (
      <EmptyState
        icon={<IconBrain size={24} />}
        title="Consultor precisa de um prontuário ativo"
        desc="Escolha qual prontuário abrir — o Consultor cruza cada pergunta com as alergias, intolerâncias e medicações dessa pessoa."
      >
        <Btn onClick={onPickRecord}>
          <IconSparkles size={15} /> Escolher prontuário
        </Btn>
      </EmptyState>
    );
  }

  const firstName = patient.name.split(' ')[0];
  const age = ageFromBirth(patient.birthDate);

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || thinking) return;
    setInput('');
    setMessages((m) => [...m, { id: idRef.current++, role: 'user', text }]);
    setThinking(true);
    setStepIdx(1);
    const consult = analyze(text, patient);
    timersRef.current = [
      window.setTimeout(() => setStepIdx(2), 900),
      window.setTimeout(() => setStepIdx(3), 1800),
      window.setTimeout(() => {
        setMessages((m) => [...m, { id: idRef.current++, role: 'assistant', consult }]);
        setThinking(false);
        setStepIdx(0);
      }, 2700),
    ];
  };

  return (
    <div className="flex h-[calc(100vh-8.5rem)] flex-col">
      <header className="rise mb-4 flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-pine-900 text-moss-300">
          <IconBrain size={22} />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Consultor Vitalis</h1>
          <p className="text-[13px] text-mute">
            Consultando o prontuário de{' '}
            <strong className="text-ink">
              {patient.name}
              {age !== null ? ` (${age} anos)` : ''}
            </strong>
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Avatar patient={patient} size={34} />
          <Btn variant="outline" size="sm" onClick={() => setMessages([])}>
            Nova conversa
          </Btn>
        </div>
      </header>

      <div className="rise mb-4 flex items-start gap-2.5 rounded-xl border border-warn-500/40 bg-warn-100/70 px-4 py-3 text-[13px] leading-relaxed text-warn-600" style={{ animationDelay: '40ms' }}>
        <IconAlert size={17} className="mt-0.5 shrink-0" />
        <p>
          <strong>Sempre procure um médico ou especialista antes de se medicar.</strong> O Consultor apenas organiza
          informações do prontuário e de referências públicas — ele não diagnostica nem prescreve.
        </p>
      </div>

      <div ref={scrollRef} className="rise flex-1 space-y-4 overflow-y-auto rounded-xl border border-line bg-card/60 p-4 shadow-lift" style={{ animationDelay: '80ms' }}>
        {messages.length === 0 && !thinking && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-pine-900 text-moss-300">
              <IconSparkles size={26} />
            </span>
            <div className="max-w-md">
              <p className="font-display text-lg font-bold text-ink">Como posso ajudar hoje?</p>
              <p className="mt-1 text-sm text-mute">
                Descreva o sintoma de {firstName}. Vou cruzar com as{' '}
                {patient.allergies.length > 0 ? `${patient.allergies.length} alergia(s)` : 'alergias'},{' '}
                {patient.medications.length > 0 ? `${patient.medications.length} medicação(ões) em uso` : 'medicações em uso'} e
                condições registradas no prontuário.
              </p>
            </div>
          </div>
        )}

        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="rise flex justify-end">
              <p className="max-w-[85%] rounded-xl rounded-tr-sm bg-pine-900 px-4 py-2.5 text-sm leading-relaxed text-pine-100 shadow-sm">
                {m.text}
              </p>
            </div>
          ) : (
            <div key={m.id} className="flex justify-start">
              <AssistantCard msg={m} firstName={firstName} />
            </div>
          ),
        )}

        {thinking && (
          <div className="rise flex items-center gap-3 rounded-xl border border-line bg-card p-3.5 shadow-lift">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pine-900 text-moss-300">
              <IconBrain size={17} />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">{ANALYSIS_STEPS[Math.min(stepIdx, ANALYSIS_STEPS.length) - 1]}</p>
              <div className="mt-1.5 flex gap-1.5">
                {ANALYSIS_STEPS.map((s, i) => (
                  <span
                    key={s}
                    className={`h-1.5 w-8 rounded-full transition-colors duration-300 ${i < stepIdx ? 'bg-moss-500' : 'bg-line'}`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rise mt-4" style={{ animationDelay: '120ms' }}>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              disabled={thinking}
              className="rounded-full border border-line bg-card px-3 py-1 text-xs font-semibold text-mute transition-all hover:border-moss-300 hover:bg-moss-50 hover:text-ink active:scale-95 disabled:opacity-40"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send(input)}
            placeholder={`Descreva o sintoma de ${firstName}… (ex.: febre de 38,5 desde ontem)`}
            className="flex-1 rounded-xl border border-line bg-white/90 px-4 py-3 text-sm shadow-lift transition-colors focus:border-moss-400"
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || thinking}
            className="flex w-13 items-center justify-center rounded-xl bg-moss-600 px-4 text-white shadow-sm transition-all hover:bg-moss-700 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
            aria-label="Enviar pergunta"
          >
            <IconSend size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
