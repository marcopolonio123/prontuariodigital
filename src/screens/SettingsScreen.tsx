import { useRef, useState } from 'react';
import type { AppState } from '../lib/types';
import { exportJSON, parseImport } from '../lib/store';
import { formatDateTime } from '../lib/biometrics';
import { Btn, ConfirmDialog, Tag, useToast } from '../components/ui';
import {
  IconArchive, IconCheck, IconCloud, IconDatabase, IconDownload, IconFace, IconFingerprint,
  IconLock, IconShield, IconTrash, IconUpload,
} from '../components/icons';

export function SettingsScreen({
  state,
  onImport,
  onLoadDemo,
  onWipe,
  onRevokeConsent,
  onOpenCloud,
}: {
  state: AppState;
  onImport: (s: AppState) => void;
  onLoadDemo: () => void;
  onWipe: () => void;
  onRevokeConsent: () => void;
  onOpenCloud: () => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const totalEntries = state.patients.reduce((s, p) => s + p.entries.length, 0);
  const sizeKb = (new Blob([JSON.stringify(state)]).size / 1024).toFixed(1);

  const doExport = () => {
    const blob = new Blob([exportJSON(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vitalis-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('success', 'Backup JSON exportado.');
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseImport(text);
      if (!parsed) {
        toast('error', 'Arquivo de backup inválido.');
        return;
      }
      onImport(parsed);
    } catch {
      toast('error', 'Não foi possível ler o arquivo.');
    }
  };

  return (
    <div>
      <header className="rise mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-moss-700">dados & privacidade</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink">Seus dados, no seu dispositivo</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-mute">
          {state.patients.length} pessoa(s) · {totalEntries} registro(s) clínico(s) · {state.log.length} identificação(ões) · ~{sizeKb} KB
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rise rounded-xl border border-line bg-card p-5 shadow-lift">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
            <IconDownload size={18} className="text-moss-600" /> Backup & portabilidade
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-mute">
            Leve todo o Minha Vida para outro dispositivo ou entregue o histórico a um médico em um único arquivo JSON.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn onClick={doExport}>
              <IconDownload size={15} /> Exportar backup
            </Btn>
            <Btn variant="outline" onClick={() => fileRef.current?.click()}>
              <IconUpload size={15} /> Importar backup
            </Btn>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                void doImport(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
          <p className="mt-2.5 text-xs text-mute">A importação substitui toda a base atual pelo conteúdo do arquivo.</p>
        </section>

        <section className="rise rounded-xl border border-line bg-card p-5 shadow-lift" style={{ animationDelay: '60ms' }}>
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
            <IconFace size={18} className="text-moss-600" /> Dados de exemplo
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-mute">
            Três pessoas fictícias com retratos, digitais, contas e uma rede de avisos para testar a identificação e o
            fluxo de desaparecidos imediatamente.
          </p>
          <div className="mt-3">
            {state.seeded ? (
              <Tag tone="moss">
                <IconCheck size={12} className="mr-1" /> já carregados na base
              </Tag>
            ) : (
              <Btn variant="outline" onClick={onLoadDemo}>
                <IconDatabase size={16} /> Carregar dados de exemplo
              </Btn>
            )}
          </div>
        </section>

        <section className="rise rounded-xl border border-line bg-card p-5 shadow-lift" style={{ animationDelay: '100ms' }}>
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
            <IconShield size={18} className="text-moss-600" /> Privacidade por arquitetura
          </h2>
          <ul className="mt-3 space-y-2.5">
            {[
              { icon: <IconDatabase size={15} />, text: 'Fichas, retratos e registros ficam no armazenamento local do navegador — nenhum servidor é consultado.' },
              { icon: <IconFace size={15} />, text: 'A identificação por retrato usa uma assinatura perceptual de 64 bits (dHash); a comparação acontece no dispositivo.' },
              { icon: <IconFingerprint size={15} />, text: 'Digitais são simuladas: guarda-se apenas um template codificado, jamais uma imagem do dedo.' },
            ].map((b, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-mute">
                <span className="mt-0.5 shrink-0 rounded-md bg-moss-100 p-1.5 text-moss-600">{b.icon}</span>
                {b.text}
              </li>
            ))}
          </ul>
        </section>

        <section className="rise rounded-xl border border-line bg-card p-5 shadow-lift" style={{ animationDelay: '140ms' }}>
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
            <IconArchive size={18} className="text-moss-600" /> Retenção de dados — nada é excluído
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-mute">
            Por decisão de produto, o Minha Vida <strong className="text-ink">não permite excluir dados de saúde</strong>:
            pessoas e registros são apenas <strong className="text-ink">arquivados</strong> (saem das listas e da
            identificação, mas permanecem íntegros e podem ser restaurados). Para levar os dados a um médico, use a
            exportação JSON ou o compartilhamento por especialidade, disponíveis em cada prontuário.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Tag tone="moss">
              <IconCheck size={12} className="mr-1" /> arquivamento reversível
            </Tag>
            <Tag tone="info">
              <IconDownload size={12} className="mr-1" /> exportação por especialidade
            </Tag>
            <Tag tone="info">
              <IconCheck size={12} className="mr-1" /> auditoria de quem consulta
            </Tag>
          </div>
        </section>

        <section className="rise rounded-xl border border-moss-500/30 bg-card p-5 shadow-lift lg:col-span-2" style={{ animationDelay: '160ms' }}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
              <IconLock size={18} className="text-moss-600" /> Direitos do titular — LGPD (art. 18)
            </h2>
            <span className="ml-auto">
              {state.lgpdConsentedAt ? (
                <Tag tone="moss">
                  <IconCheck size={12} className="mr-1" /> consentimento dado em {formatDateTime(state.lgpdConsentedAt)}
                </Tag>
              ) : (
                <Tag tone="warn">consentimento pendente</Tag>
              )}
            </span>
          </div>

          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-mute">
            O Minha Vida trata <strong className="text-ink">dados pessoais sensíveis de saúde</strong> (LGPD, art. 5º, II)
            exclusivamente <strong className="text-ink">neste dispositivo</strong>. Você mantém o controle total — os
            direitos abaixo podem ser exercidos a qualquer momento, sem burocracia:
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-line bg-paper/60 p-3">
              <p className="flex items-center gap-1.5 text-[13px] font-bold text-ink"><IconDownload size={14} className="text-moss-600" /> Acesso & portabilidade</p>
              <p className="mt-1 text-xs leading-relaxed text-mute">Exporte toda a base em JSON (acima) e leve a outro dispositivo ou entregue a um profissional.</p>
            </div>
            <div className="rounded-lg border border-line bg-paper/60 p-3">
              <p className="flex items-center gap-1.5 text-[13px] font-bold text-ink"><IconCheck size={14} className="text-moss-600" /> Correção</p>
              <p className="mt-1 text-xs leading-relaxed text-mute">Edite fichas, contatos e registros clínicos sempre que houver dado incompleto ou desatualizado.</p>
            </div>
            <div className="rounded-lg border border-line bg-paper/60 p-3">
              <p className="flex items-center gap-1.5 text-[13px] font-bold text-ink"><IconTrash size={14} className="text-danger-600" /> Eliminação</p>
              <p className="mt-1 text-xs leading-relaxed text-mute">Apague definitivamente a base local deste navegador quando não quiser mais os dados aqui.</p>
              <Btn variant="danger" size="sm" className="mt-2" onClick={() => setWipeOpen(true)}>
                <IconTrash size={13} /> Apagar base local
              </Btn>
            </div>
            <div className="rounded-lg border border-line bg-paper/60 p-3">
              <p className="flex items-center gap-1.5 text-[13px] font-bold text-ink"><IconLock size={14} className="text-warn-600" /> Revogação</p>
              <p className="mt-1 text-xs leading-relaxed text-mute">Retire o consentimento de privacidade; o aviso voltará a ser exibido no próximo uso.</p>
              <Btn variant="outline" size="sm" className="mt-2" onClick={() => setRevokeOpen(true)}>
                <IconLock size={13} /> Revogar consentimento
              </Btn>
            </div>
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-mute">
            Base legal: consentimento do titular (LGPD, art. 7º, I) e tutela da saúde (art. 11, II, “f”). Nenhum dado é
            compartilhado com terceiros nem transferido a outro país — o processamento é 100% local.
          </p>
        </section>
      </div>

      <ConfirmDialog
        open={wipeOpen}
        onClose={() => setWipeOpen(false)}
        onConfirm={onWipe}
        title="Eliminar base local (direito LGPD)"
        confirmLabel="Apagar tudo deste navegador"
        message={
          <p>
            Todos os pacientes, prontuários, contatos, contas e o log de identificações serão{' '}
            <strong className="text-danger-600">removidos permanentemente deste navegador</strong>. Se quiser guardar uma
            cópia antes, use “Exportar backup”. Esta ação atende ao direito de eliminação (art. 18, VI).
          </p>
        }
      />

      <ConfirmDialog
        open={revokeOpen}
        onClose={() => setRevokeOpen(false)}
        onConfirm={onRevokeConsent}
        title="Revogar consentimento"
        confirmLabel="Revogar"
        tone="default"
        message={
          <p>
            O aviso de privacidade voltará a ser exibido na próxima vez que o app abrir. Seus dados{' '}
            <strong className="text-ink">não</strong> são apagados — use “Apagar base local” para eliminá-los.
          </p>
        }
      />

      <section
        className="rise mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-line bg-pine-900 p-5 text-pine-100 shadow-lift"
        style={{ animationDelay: '160ms' }}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pine-800 text-moss-300">
          <IconCloud size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-bold text-white">Nuvem & servidor</h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-pine-200">
            {state.cloud.mode === 'off' ? (
              'Modo local ativo. Conecte ao servidor (demonstração ou oficial) para acessar os prontuários em outros dispositivos.'
            ) : state.cloud.mode === 'demo' ? (
              <>Conectado ao <strong className="text-moss-300">servidor de demonstração</strong> como {state.cloud.userName}.</>
            ) : (
              <>Conectado a <strong className="text-moss-300">{state.cloud.baseUrl}</strong> como {state.cloud.userName}.</>
            )}
          </p>
        </div>
        <Btn variant="outline" className="border-pine-700 bg-pine-850 text-pine-100 hover:border-moss-400 hover:bg-pine-800 hover:text-moss-300" onClick={onOpenCloud}>
          <IconCloud size={15} /> Abrir Nuvem
        </Btn>
      </section>

      <p className="rise mt-6 px-1 pb-4 font-mono text-[11px] text-mute" style={{ animationDelay: '180ms' }}>
        Minha Vida v0.2.0 (minhavida.med.br) — contas & acesso delegado · consultor IA · especialidades · retenção sem exclusão
      </p>
    </div>
  );
}
