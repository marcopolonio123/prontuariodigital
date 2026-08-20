import { useState } from 'react';
import type { CloudState, IdEvent, Patient } from '../lib/types';
import { EMPTY_CLOUD } from '../lib/types';
import { ApiError, DemoApi, HttpApi, makeApi, syncNow, type SyncProgress } from '../lib/api';
import { formatDateTime, timeAgo } from '../lib/biometrics';
import { Btn, Field, inputCls, Modal, Tag, useToast } from '../components/ui';
import {
  IconCheck, IconCloud, IconLock, IconServer, IconSpinner, IconUsers, IconX,
} from '../components/icons';

const demoHelp = [
  'Crie uma conta no servidor de demonstração (ou entre com uma existente).',
  'Sincronize: suas fichas locais sobem para o servidor e voltam como fonte da verdade.',
  'Crie uma segunda conta, sincronize e comprove: cada usuário enxerga apenas as próprias fichas e as delegadas.',
];

export function CloudScreen({
  patients,
  log,
  cloud,
  onCloud,
  onPatientsUpdated,
}: {
  patients: Patient[];
  log: IdEvent[];
  cloud: CloudState;
  onCloud: (c: CloudState) => void;
  onPatientsUpdated: (p: Patient[]) => void;
}) {
  const toast = useToast();
  const connected = cloud.mode !== 'off';

  // conexão
  const [mode, setMode] = useState<'demo' | 'server'>('demo');
  const [baseUrl, setBaseUrl] = useState('https://');
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'connect' | 'sync' | null>(null);
  const [err, setErr] = useState('');
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [lastResult, setLastResult] = useState<{ pushed: number; pulled: number; at: number } | null>(null);
  const [discOpen, setDiscOpen] = useState(false);

  const connect = async () => {
    setErr('');
    setBusy('connect');
    try {
      let api: DemoApi | HttpApi;
      if (mode === 'demo') {
        api = new DemoApi();
      } else {
        let url: URL;
        try {
          url = new URL(baseUrl.trim());
        } catch {
          throw new ApiError('URL inválida — use o formato https://seu-dominio.com');
        }
        if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
          throw new ApiError('Por segurança (LGPD), o servidor precisa estar em HTTPS.');
        }
        api = new HttpApi(url.toString(), '');
        await api.health();
      }
      const creds =
        authTab === 'register'
          ? await api.register({ name, email, password })
          : await api.login({ email, password });
      onCloud({
        mode,
        baseUrl: mode === 'demo' ? 'demo://vitalis' : baseUrl.trim().replace(/\/$/, ''),
        token: creds.token,
        userId: creds.user.id,
        userName: creds.user.name,
        userEmail: creds.user.email,
        connectedAt: Date.now(),
        lastSyncAt: 0,
      });
      toast(
        'success',
        mode === 'demo'
          ? `Conectado ao servidor de demonstração como ${creds.user.name}.`
          : `Conectado a ${baseUrl} como ${creds.user.name}.`,
      );
      setPassword('');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Não foi possível conectar.');
    } finally {
      setBusy(null);
    }
  };

  const runSync = async () => {
    setBusy('sync');
    setProgress({ phase: 'push', current: 0, total: patients.length, label: 'Iniciando…' });
    try {
      const api = makeApi(cloud);
      const res = await syncNow(api, patients, log, setProgress);
      onPatientsUpdated(res.patients);
      const done = { pushed: res.pushed, pulled: res.pulled, at: Date.now() };
      setLastResult(done);
      onCloud({ ...cloud, lastSyncAt: done.at });
      toast('success', `Sincronizado: ${res.pushed} ficha(s) enviadas, ${res.pulled} recebidas do servidor.`);
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'Falha na sincronização.');
    } finally {
      setBusy(null);
      window.setTimeout(() => setProgress(null), 1200);
    }
  };

  const pct =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : progress
        ? 100
        : 0;

  return (
    <div>
      <header className="rise mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-moss-700">servidor & sincronização</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink">Nuvem Minha Vida</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-mute">
          Conecte o app ao servidor web com banco de dados para acessar seus prontuários em qualquer dispositivo,
          com contas individuais e auditoria central. Sem conexão, o Minha Vida segue funcionando 100% local.
        </p>
      </header>

      {!connected ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* servidor de demonstração */}
          <section className="rise rounded-xl border-2 border-moss-500/40 bg-card p-5 shadow-lift">
            <div className="flex items-center gap-2.5">
              <span className="rounded-lg bg-moss-600 p-2 text-white"><IconCloud size={18} /></span>
              <div>
                <h2 className="font-display text-lg font-bold text-ink">Servidor de demonstração</h2>
                <p className="text-xs text-mute">embutido no navegador · para testar o fluxo agora</p>
              </div>
              <Tag tone="moss"><IconCheck size={11} className="mr-1" /> recomendado</Tag>
            </div>
            <ol className="mt-4 space-y-1.5">
              {demoHelp.map((s, i) => (
                <li key={s} className="flex gap-2.5 text-[13px] leading-relaxed text-mute">
                  <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-moss-100 font-mono text-[10px] font-bold text-moss-700">
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
            <p className="mt-3 rounded-lg bg-paper px-3 py-2 text-[11px] leading-relaxed text-mute">
              Simula a API real (latência, contas, senhas com SHA-256 e visibilidade por dono/delegação), com os
              dados guardados em uma área separada do armazenamento local.
            </p>
          </section>

          {/* servidor real */}
          <section className="rise rounded-xl border border-line bg-card p-5 shadow-lift" style={{ animationDelay: '60ms' }}>
            <div className="flex items-center gap-2.5">
              <span className="rounded-lg bg-pine-900 p-2 text-moss-300"><IconServer size={18} /></span>
              <div>
                <h2 className="font-display text-lg font-bold text-ink">Servidor Minha Vida oficial</h2>
                <p className="text-xs text-mute">API Node + banco de dados · veja o guia HOSTINGER.md</p>
              </div>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-mute">
              Suba a pasta <code className="rounded bg-pine-900/8 px-1.5 py-0.5 font-mono text-[11px] text-ink">server/</code> em
              um VPS (Node + PostgreSQL) e aponte o app para a URL pública com HTTPS.
            </p>
            <ul className="mt-3 space-y-1 text-[13px] text-mute">
              {['Autenticação com senha criptografada (bcrypt) e token JWT', 'Banco de dados com auditoria e regra de “nunca excluir”', 'Mesmo contrato da demo — o app não muda nada ao trocar'].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <IconCheck size={14} className="mt-0.5 shrink-0 text-moss-600" /> {t}
                </li>
              ))}
            </ul>
          </section>

          {/* formulário de conexão */}
          <section className="rise rounded-xl border border-line bg-card p-5 shadow-lift lg:col-span-2" style={{ animationDelay: '100ms' }}>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h3 className="mr-2 font-display text-base font-bold text-ink">Conectar</h3>
              <div className="inline-flex rounded-lg border border-line bg-paper p-0.5">
                {(
                  [
                    { key: 'demo', label: 'Demonstração' },
                    { key: 'server', label: 'Servidor real' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => {
                      setMode(t.key);
                      setErr('');
                    }}
                    className={`rounded-md px-3.5 py-1.5 text-xs font-bold transition-all ${
                      mode === t.key ? 'bg-pine-900 text-white shadow-sm' : 'text-mute hover:text-ink'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {mode === 'server' && (
                <Field label="URL do servidor" required>
                  <input className={inputCls} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.seudominio.com" inputMode="url" />
                </Field>
              )}
              <Field label="Nome" required={authTab === 'register'}>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" disabled={authTab === 'login'} />
              </Field>
              <Field label="E-mail" required>
                <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" inputMode="email" />
              </Field>
              <Field label="Senha" required>
                <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </Field>
            </div>

            {err && (
              <p className="mt-3 flex items-start gap-2 rounded-lg border border-danger-500/30 bg-danger-100/60 px-3 py-2.5 text-[13px] font-medium text-danger-600">
                <IconX size={15} className="mt-0.5 shrink-0" /> {err}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Btn onClick={() => void connect()} disabled={busy !== null || !email.trim() || !password || (authTab === 'register' && !name.trim())}>
                {busy === 'connect' ? <IconSpinner size={15} /> : <IconLock size={15} />}
                {busy === 'connect' ? 'Conectando…' : authTab === 'login' ? 'Entrar no servidor' : 'Criar conta e conectar'}
              </Btn>
              <button
                onClick={() => setAuthTab(authTab === 'login' ? 'register' : 'login')}
                className="text-[13px] font-semibold text-moss-700 underline-offset-2 hover:underline"
              >
                {authTab === 'login' ? 'Não tem conta? Criar agora' : 'Já tem conta? Entrar'}
              </button>
              <p className="ml-auto flex items-center gap-1.5 text-[11px] text-mute">
                <IconLock size={12} /> credenciais enviadas apenas ao servidor, por HTTPS
              </p>
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-4">
          {/* status */}
          <section className="rise relative overflow-hidden rounded-xl border border-line bg-card shadow-lift">
            <div className="scanlines pointer-events-none absolute inset-0 opacity-30" />
            <div className="relative flex flex-wrap items-center gap-4 p-5">
              <span className="pulse-halo flex h-12 w-12 items-center justify-center rounded-full bg-moss-600 text-white">
                <IconCloud size={24} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-xl font-bold text-ink">
                  {cloud.mode === 'demo' ? 'Servidor de demonstração' : cloud.baseUrl}
                </p>
                <p className="mt-0.5 text-[13px] text-mute">
                  conectado como <strong className="text-ink">{cloud.userName}</strong> ({cloud.userEmail}) · desde{' '}
                  {formatDateTime(cloud.connectedAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Btn onClick={() => void runSync()} disabled={busy !== null}>
                  {busy === 'sync' ? <IconSpinner size={15} /> : <IconCloud size={15} />}
                  {busy === 'sync' ? 'Sincronizando…' : 'Sincronizar agora'}
                </Btn>
                <Btn variant="outline" onClick={() => setDiscOpen(true)}>Desconectar</Btn>
              </div>
            </div>
            <div className="relative flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-line bg-paper/60 px-5 py-2.5 text-xs text-mute">
              <span>
                Última sincronização:{' '}
                <strong className="text-ink">{cloud.lastSyncAt ? timeAgo(cloud.lastSyncAt) : 'nunca'}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="blink-dot h-1.5 w-1.5 rounded-full bg-moss-500" /> conexão ativa
              </span>
              {cloud.mode === 'demo' && <Tag tone="warn">demonstração — dados ficam neste navegador</Tag>}
            </div>
          </section>

          {/* progresso / resultado */}
          {(progress || lastResult) && (
            <section className="rise rounded-xl border border-line bg-card p-5 shadow-lift" style={{ animationDelay: '60ms' }}>
              {progress ? (
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <p className="font-semibold text-ink">{progress.label}</p>
                    <span className="font-mono text-xs text-mute">
                      {progress.phase === 'log' ? 'auditoria' : `${progress.current}/${progress.total}`}
                    </span>
                  </div>
                  <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-line">
                    <div className="stripes h-full rounded-full bg-moss-600 transition-[width] duration-300" style={{ width: `${Math.max(6, pct)}%` }} />
                  </div>
                </div>
              ) : (
                lastResult && (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-moss-100 p-2 text-moss-700"><IconCheck size={18} /></span>
                    <p className="text-sm text-ink">
                      <strong>{lastResult.pushed}</strong> ficha(s) enviadas · <strong>{lastResult.pulled}</strong> recebidas do servidor
                    </p>
                    <span className="ml-auto font-mono text-xs text-mute">{formatDateTime(lastResult.at)}</span>
                  </div>
                )
              )}
            </section>
          )}

          {/* como funciona */}
          <section className="rise grid gap-4 sm:grid-cols-3" style={{ animationDelay: '100ms' }}>
            {[
              { icon: <IconCloud size={17} />, title: 'Push', text: 'Suas fichas locais são enviadas ao servidor (criação e atualização).' },
              { icon: <IconServer size={17} />, title: 'Fonte da verdade', text: 'Após o envio, o servidor devolve a lista oficial — visível só para você e delegados.' },
              { icon: <IconUsers size={17} />, title: 'Multiusuário', text: 'Cada conta enxerga apenas seus prontuários e os que recebeu por delegação.' },
            ].map((c) => (
              <div key={c.title} className="rounded-xl border border-line bg-card p-4">
                <span className="inline-flex rounded-lg bg-moss-100 p-2 text-moss-700">{c.icon}</span>
                <h3 className="mt-2.5 font-display text-sm font-bold text-ink">{c.title}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-mute">{c.text}</p>
              </div>
            ))}
          </section>
        </div>
      )}

      <Modal
        open={discOpen}
        onClose={() => setDiscOpen(false)}
        title="Desconectar do servidor"
        subtitle="Os dados já sincronizados permanecem no servidor; este dispositivo volta ao modo local."
      >
        <p className="text-sm leading-relaxed text-mute">
          As fichas atuais continuam neste dispositivo. Para voltar a sincronizar, conecte-se novamente com a mesma
          conta ({cloud.userEmail}).
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Btn variant="ghost" onClick={() => setDiscOpen(false)}>Cancelar</Btn>
          <Btn
            variant="danger"
            onClick={() => {
              onCloud({ ...EMPTY_CLOUD });
              setDiscOpen(false);
              setLastResult(null);
              toast('info', 'Desconectado — o app voltou ao modo local.');
            }}
          >
            Desconectar
          </Btn>
        </div>
      </Modal>
    </div>
  );
}
