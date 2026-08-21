import { useEffect, useRef, useState } from 'react';
import type { AccessGrant, Account, Patient } from '../lib/types';
import { ageFromBirth } from '../lib/biometrics';
import {
  analyze, ANALYSIS_STEPS, analyzeWithRemoteAI, buildRecordContext, DEFAULT_AI_CONFIG, DISCLAIMER,
  greetingResponse, loadAiConfig, saveAiConfig, type AiConfig, type Consultation,
} from '../lib/consultant';
import { Avatar, Btn, EmptyState, inputCls, MicButton, Modal, Tag, useToast } from '../components/ui';
import { IconAlert, IconBrain, IconCheck, IconGear, IconSend, IconSparkles, IconX } from '../components/icons';

interface ChatMsg {
  id: number;
  role: 'user' | 'assistant';
  text?: string; // texto livre (saudações e respostas da IA externa)
  consult?: Consultation; // resposta estruturada do motor local
  engine?: 'local' | 'ia';
}

const SUGGESTIONS = [
  'Estou com febre e dor no corpo',
  'Dor de cabeça forte desde ontem',
  'Dor de garganta e tosse',
  'Azia depois de comer',
  'Dor de barriga e gases',
  'Dor de ouvido',
  'Pressão alta hoje',
  'Falta de ar e chiado',
  'Não consigo dormir direito',
];

function StatusBadge({ status }: { status: 'ok' | 'caution' | 'contra' }) {
  if (status === 'ok')
    return (
      <Tag tone="moss">
        <IconCheck size={11} className="mr-1" /> compatível
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

/** Converte **negrito** em <strong> dentro de um parágrafo. */
function renderRich(text: string) {
  const parts = text.split('**');
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i} className="font-semibold text-ink">{part}</strong> : <span key={i}>{part}</span>));
}

function AssistantCard({ msg, firstName }: { msg: ChatMsg; firstName: string }) {
  const c = msg.consult;
  return (
    <div className="rise max-w-2xl rounded-xl rounded-tl-sm border border-line bg-card p-4 shadow-lift">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-pine-900 text-moss-300">
          <IconBrain size={17} />
        </span>
        <p className="font-display text-sm font-bold text-ink">Consultor My Doctor</p>
        <span className="ml-auto rounded-md bg-warn-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warn-600">
          apoio informativo
        </span>
        {msg.engine === 'ia' && (
          <span className="rounded-md bg-info-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-info-600">
            IA externa
          </span>
        )}
      </div>

      {msg.engine === 'ia' && msg.text ? (
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink">{msg.text}</p>
      ) : !c ? (
        <p className="mt-3 text-sm leading-relaxed text-mute">{msg.text}</p>
      ) : !c.entry ? (
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-mute">
          <p>
            Ainda não tenho informação confiável sobre esse sintoma específico — e, por segurança, prefiro não palpitar.
            Consigo ajudar com:{' '}
            <strong className="text-ink">febre</strong>, <strong className="text-ink">dor de cabeça</strong>,{' '}
            <strong className="text-ink">dor de garganta/gripe</strong>, <strong className="text-ink">azia/estômago</strong>,{' '}
            <strong className="text-ink">dor de barriga</strong>, <strong className="text-ink">vômito</strong>,{' '}
            <strong className="text-ink">dor de ouvido</strong>, <strong className="text-ink">dor de dente</strong>,{' '}
            <strong className="text-ink">coceira na pele</strong>, <strong className="text-ink">dor muscular</strong>,{' '}
            <strong className="text-ink">pressão alta</strong>, <strong className="text-ink">falta de ar</strong>,{' '}
            <strong className="text-ink">insônia</strong> ou <strong className="text-ink">diarreia</strong>.
          </p>
          <p className="text-[13px]">
            Se for algo fora dessa lista, ou se houver <strong className="text-danger-600">dor no peito, dificuldade para respirar,
            sangramento ou confusão mental</strong>, procure atendimento médico imediatamente (SAMU 192 em emergências).
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
          {/* Resposta humanizada — já cruzada com o prontuário */}
          <div className="space-y-3 border-l-[3px] border-moss-500/50 pl-3.5 text-sm leading-relaxed text-mute">
            {c.narrative.split('\n\n').map((para, i) => (
              <p key={i}>{renderRich(para)}</p>
            ))}
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

      <p className="mt-4 border-t border-line pt-3 text-[12px] italic leading-relaxed text-warn-600">{DISCLAIMER}</p>
    </div>
  );
}

export function ConsultantScreen({
  patients,
  patient,
  account,
  grants,
  onSelect,
}: {
  patients: Patient[];
  patient: Patient | null;
  account: Account;
  grants: AccessGrant[];
  onSelect: (id: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(1);
  const timersRef = useRef<number[]>([]);

  // IA externa (opcional) — chave própria do usuário, guardada só neste dispositivo
  const [aiCfg, setAiCfg] = useState<AiConfig>(() => loadAiConfig());
  const [aiModal, setAiModal] = useState(false);
  const [aiDraft, setAiDraft] = useState<AiConfig>({ ...DEFAULT_AI_CONFIG });
  const [aiTest, setAiTest] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const toast = useToast();

  const storageKey = patient ? `vitalis.consultor.${patient.id}` : null;

  const testAi = async () => {
    setAiTest('testing');
    try {
      const res = await fetch(`${aiDraft.baseUrl.replace(/\/$/, '')}/models`, {
        headers: { Authorization: `Bearer ${aiDraft.apiKey.trim()}` },
      });
      setAiTest(res.ok ? 'ok' : 'fail');
    } catch {
      setAiTest('fail');
    }
  };

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
        /* armazenamento cheio */
      }
    }
  }, [messages, storageKey, thinking]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking, stepIdx]);

  if (!patient) {
    return (
      <div>
        <header className="rise mb-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-moss-700">consultor ia</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink">Consultor My Doctor</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-mute">
            Disponível para qualquer pessoa com acesso. Escolha o prontuário que será analisado —{' '}
            <strong className="text-ink">o seu ou um delegado</strong> (filho, pai, curador…). Cada resposta cruza o
            sintoma com as alergias, intolerâncias e medicações dessa pessoa.
          </p>
        </header>
        {patients.length === 0 ? (
          <EmptyState
            icon={<IconBrain size={24} />}
            title="Nenhum prontuário com acesso"
            desc="Você ainda não tem prontuário próprio nem acesso delegado. Cadastre uma pessoa ou peça a um titular para delegar acesso."
          />
        ) : (
          <ul className="rise grid gap-3 sm:grid-cols-2 xl:grid-cols-3" style={{ animationDelay: '60ms' }}>
            {patients.map((p) => {
              const g = grants.find((x) => x.accountId === account.id && x.patientId === p.id);
              const pAge = ageFromBirth(p.birthDate);
              return (
                <li key={p.id} className="rise">
                  <button
                    onClick={() => onSelect(p.id)}
                    className="flex h-full w-full flex-col rounded-xl border border-line bg-card p-4 text-left shadow-lift transition-all duration-200 hover:-translate-y-1 hover:border-moss-300 hover:shadow-float active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar patient={p} size={48} />
                      <div className="min-w-0">
                        <p className="truncate font-display text-[15px] font-bold text-ink">{p.name}</p>
                        <p className="text-xs text-mute">{pAge !== null ? `${pAge} anos` : 'idade n/d'}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {p.allergies.length > 0 && <Tag tone="danger">{p.allergies.length} alergia(s)</Tag>}
                      {p.medications.length > 0 && <Tag tone="moss">{p.medications.length} medicação(ões)</Tag>}
                      {g ? <Tag tone="info">delegado por {g.grantedByName.split(' ')[0]}</Tag> : <Tag tone="mute">prontuário titular</Tag>}
                    </div>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-moss-700">
                      <IconSparkles size={15} /> Consultar sobre {p.name.split(' ')[0]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  const grant = grants.find((x) => x.accountId === account.id && x.patientId === patient.id);
  const firstName = patient.name.split(' ')[0];
  const age = ageFromBirth(patient.birthDate);

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || thinking) return;
    setInput('');
    setMessages((m) => [...m, { id: idRef.current++, role: 'user', text }]);
    setThinking(true);
    setStepIdx(1);

    // Saudações / conversa livre recebem resposta direta, sem análise clínica
    const greet = greetingResponse(text, patient.name);
    if (greet) {
      timersRef.current = [
        window.setTimeout(() => {
          setMessages((m) => [...m, { id: idRef.current++, role: 'assistant', text: greet, engine: 'local' }]);
          setThinking(false);
          setStepIdx(0);
        }, 700),
      ];
      return;
    }

    // IA externa (se o usuário configurou uma chave)
    const useRemote = aiCfg.provider === 'openai' && aiCfg.apiKey.trim().length > 0;
    if (useRemote) {
      setStepIdx(2);
      void analyzeWithRemoteAI(text, patient, aiCfg)
        .then((answer) => {
          setMessages((m) => [...m, { id: idRef.current++, role: 'assistant', text: answer, engine: 'ia' }]);
        })
        .catch((err) => {
          setMessages((m) => [
            ...m,
            {
              id: idRef.current++,
              role: 'assistant',
              engine: 'ia',
              text: `Não consegui falar com a IA externa (${err instanceof Error ? err.message : 'erro de conexão'}). Vou responder com o motor local.\n\n` + greetingFreeLocal(text, patient),
            },
          ]);
        })
        .finally(() => {
          setThinking(false);
          setStepIdx(0);
        });
      return;
    }

    const consult = analyze(text, patient);
    timersRef.current = [
      window.setTimeout(() => setStepIdx(2), 900),
      window.setTimeout(() => setStepIdx(3), 1800),
      window.setTimeout(() => {
        setMessages((m) => [...m, { id: idRef.current++, role: 'assistant', consult, engine: 'local' }]);
        setThinking(false);
        setStepIdx(0);
      }, 2700),
    ];
  };

  // Resposta local em texto livre (fallback quando a IA externa falha)
  const greetingFreeLocal = (text: string, p: Patient) => {
    const c = analyze(text, p);
    if (!c.entry) return 'Descreva o sintoma com palavras simples (ex.: febre, dor de cabeça, azia) para eu analisar com o prontuário.';
    const opts = c.assessments.map((a) => `${a.option.name} — ${a.status === 'contra' ? 'EVITAR' : a.status === 'caution' ? 'cautela' : 'compatível'}`).join('\n');
    return `Quadro compatível: ${c.entry.label}.\n${opts}\n\nLembre-se de procurar um médico antes de se medicar.`;
  };

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-6.5rem)]">
      <header className="rise mb-4 flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-pine-900 text-moss-300">
          <IconBrain size={22} />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Consultor My Doctor</h1>
          <p className="text-[13px] text-mute">
            Analisando o prontuário de{' '}
            <strong className="text-ink">
              {patient.name}
              {age !== null ? ` (${age} anos)` : ''}
            </strong>
            {grant ? (
              <>
                {' '}— acesso <strong className="text-info-600">delegado por {grant.grantedByName}</strong>
              </>
            ) : (
              <> — você como {account.name}</>
            )}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={patient.id}
            onChange={(e) => onSelect(e.target.value)}
            aria-label="Trocar prontuário analisado"
            className="rounded-lg border border-line bg-white/85 px-2.5 py-1.5 text-xs font-semibold text-ink transition-colors focus:border-moss-400"
          >
            {patients.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <Btn
            variant={aiCfg.provider === 'openai' && aiCfg.apiKey ? 'primary' : 'outline'}
            size="sm"
            onClick={() => {
              setAiDraft({ ...aiCfg });
              setAiTest('idle');
              setAiModal(true);
            }}
            title="Configurar IA externa"
          >
            <IconGear size={14} />
            {aiCfg.provider === 'openai' && aiCfg.apiKey ? `IA: ${aiCfg.model}` : 'Usar IA externa'}
          </Btn>
          <Btn variant="outline" size="sm" onClick={() => setMessages([])}>
            Nova conversa
          </Btn>
        </div>
      </header>

      <div className="rise mb-4 flex items-start gap-2.5 rounded-xl border border-warn-500/40 bg-warn-100/70 px-4 py-3 text-[13px] leading-relaxed text-warn-600" style={{ animationDelay: '40ms' }}>
        <IconAlert size={17} className="mt-0.5 shrink-0" />
        <p>
          <strong>Sempre procure um médico ou especialista antes de se medicar.</strong> O Consultor apenas organiza
          informações do prontuário e de referências públicas — ele não diagnostica nem prescreve. Cada resposta
          analisa o prontuário de <strong>{firstName}</strong> (a pessoa logada ou sob sua responsabilidade), cruzando
          alergias, intolerâncias, medicações e cuidados especiais.
        </p>
      </div>

      <div ref={scrollRef} className="rise min-h-[46vh] flex-1 space-y-4 overflow-y-auto rounded-xl border border-line bg-card/60 p-3 sm:p-4 shadow-lift lg:min-h-0" style={{ animationDelay: '80ms' }}>
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
                {patient.medications.length > 0 ? `${patient.medications.length} medicação(ões) em uso` : 'medicações em uso'} e as
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
                  <span key={s} className={`h-1.5 w-8 rounded-full transition-colors duration-300 ${i < stepIdx ? 'bg-moss-500' : 'bg-line'}`} />
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
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send(input)}
              placeholder={`Descreva ou dite o sintoma de ${firstName}… (ex.: febre de 38,5 desde ontem)`}
              className="w-full rounded-xl border border-line bg-white/90 py-3 pl-4 pr-20 text-sm shadow-lift transition-colors focus:border-moss-400"
            />
            <MicButton
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onAppend={(t) => setInput((v) => (v ? v + ' ' : '') + t)}
            />
          </div>
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || thinking}
            className="flex items-center justify-center rounded-xl bg-moss-600 px-4 py-3 text-white shadow-sm transition-all hover:bg-moss-700 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
            aria-label="Enviar pergunta"
          >
            <IconSend size={18} />
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-mute">
          Toque no microfone para <strong>falar</strong> em vez de digitar — a transcrição aparece no campo (requer permissão de microfone).
        </p>
      </div>

      {/* ------------------------- configuração da IA ------------------------- */}
      <Modal
        open={aiModal}
        onClose={() => setAiModal(false)}
        title="IA externa no Consultor"
        subtitle="Conecte um modelo de IA (compatível com a API da OpenAI) para respostas mais completas, sempre analisando o prontuário."
        width="max-w-xl"
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            {(
              [
                { key: 'local', label: 'Motor local (padrão, sem chave)' },
                { key: 'openai', label: 'IA externa (chave própria)' },
              ] as const
            ).map((o) => (
              <button
                key={o.key}
                onClick={() => setAiDraft({ ...aiDraft, provider: o.key })}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-bold transition-all ${
                  aiDraft.provider === o.key
                    ? 'border-pine-900 bg-pine-900 text-white'
                    : 'border-line bg-card text-mute hover:border-pine-200 hover:text-ink'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {aiDraft.provider === 'openai' && (
            <>
              <label className="block">
                <span className="mb-1 block text-[13px] font-semibold text-ink">URL da API (compatível OpenAI)</span>
                <input className={inputCls} value={aiDraft.baseUrl} onChange={(e) => setAiDraft({ ...aiDraft, baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[13px] font-semibold text-ink">Chave de API (sk-…)</span>
                <input className={inputCls} type="password" value={aiDraft.apiKey} onChange={(e) => setAiDraft({ ...aiDraft, apiKey: e.target.value })} placeholder="sk-…" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[13px] font-semibold text-ink">Modelo</span>
                <input className={inputCls} value={aiDraft.model} onChange={(e) => setAiDraft({ ...aiDraft, model: e.target.value })} placeholder="gpt-4o-mini" />
              </label>
              <p className="rounded-lg bg-paper px-3 py-2 text-[11px] leading-relaxed text-mute">
                A chave fica armazenada <strong>somente neste dispositivo</strong> (não vai para o servidor do app). O
                prontuário de {firstName} é enviado como contexto a cada pergunta.
              </p>
            </>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
            {aiDraft.provider === 'openai' && (
              <Btn variant="outline" size="sm" onClick={() => void testAi()} disabled={aiTest === 'testing' || !aiDraft.apiKey.trim()}>
                {aiTest === 'testing' ? 'Testando…' : aiTest === 'ok' ? 'Conectado ✓' : aiTest === 'fail' ? 'Falhou — tentar de novo' : 'Testar conexão'}
              </Btn>
            )}
            <div className="ml-auto flex gap-2">
              <Btn variant="ghost" size="sm" onClick={() => setAiModal(false)}>Cancelar</Btn>
              <Btn
                size="sm"
                onClick={() => {
                  saveAiConfig(aiDraft);
                  setAiCfg(aiDraft);
                  setAiModal(false);
                  toast('success', aiDraft.provider === 'openai' && aiDraft.apiKey ? `IA externa ativada (${aiDraft.model}).` : 'Usando o motor local.');
                }}
              >
                <IconCheck size={14} /> Salvar
              </Btn>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
