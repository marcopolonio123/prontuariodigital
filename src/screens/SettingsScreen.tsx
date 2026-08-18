import { useRef, useState } from 'react';
import type { AppState } from '../lib/types';
import { exportJSON, parseImport } from '../lib/store';
import { Btn, Tag, useToast } from '../components/ui';
import {
  IconArchive,
  IconCheck,
  IconDatabase,
  IconDownload,
  IconFace,
  IconFingerprint,
  IconShield,
  IconUpload,
} from '../components/icons';

export function SettingsScreen({
  state,
  onImport,
  onLoadDemo,
}: {
  state: AppState;
  onImport: (s: AppState) => void;
  onLoadDemo: () => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

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
    toast('success', 'Backup exportado como arquivo JSON.');
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseImport(text);
      if (!parsed) {
        toast('error', 'Arquivo inválido — não parece um backup do Vitalis.');
        return;
      }
      onImport(parsed);
    } catch {
      toast('error', 'Não foi possível ler o arquivo selecionado.');
    }
  };

  return (
    <div className="max-w-3xl">
      <header className="rise mb-6">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-moss-600">
          Administração · dispositivo local
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Dados & privacidade
        </h1>
        <p className="mt-2 text-sm text-mute">
          Tudo o que o Vitalis guarda vive exclusivamente neste navegador.
        </p>
      </header>

      <div className="space-y-4">
        <section className="rise rounded-xl border border-line bg-card p-5 shadow-lift" style={{ animationDelay: '50ms' }}>
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
            <IconDatabase size={18} className="text-moss-600" /> Armazenamento local
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[
              { label: 'Pacientes', value: String(state.patients.length) },
              { label: 'Registros clínicos', value: String(totalEntries) },
              { label: 'Identificações', value: String(state.log.length) },
              { label: 'Tamanho', value: `${sizeKb} KB` },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-line bg-paper/70 px-3 py-2.5">
                <p className="font-mono text-lg font-semibold leading-none text-ink">{s.value}</p>
                <p className="mt-1.5 text-[11px] font-medium text-mute">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn variant="dark" onClick={doExport} disabled={state.patients.length === 0 && state.log.length === 0}>
              <IconDownload size={16} /> Exportar backup (.json)
            </Btn>
            <Btn variant="outline" onClick={() => fileRef.current?.click()}>
              <IconUpload size={16} /> Importar backup
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
          <p className="mt-2.5 text-xs text-mute">
            A importação substitui toda a base atual pelo conteúdo do arquivo.
          </p>
        </section>

        <section className="rise rounded-xl border border-line bg-card p-5 shadow-lift" style={{ animationDelay: '100ms' }}>
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
            <IconFace size={18} className="text-moss-600" /> Dados de exemplo
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-mute">
            Três pacientes fictícios com retratos, digitais e histórico clínico para testar a identificação e o
            prontuário imediatamente.
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

        <section className="rise rounded-xl border border-line bg-card p-5 shadow-lift" style={{ animationDelay: '150ms' }}>
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
            <IconShield size={18} className="text-moss-600" /> Privacidade por arquitetura
          </h2>
          <ul className="mt-3 space-y-2.5">
            {[
              {
                icon: <IconDatabase size={15} />,
                text: 'Fichas, retratos e registros ficam no armazenamento local do navegador — nenhum servidor é consultado.',
              },
              {
                icon: <IconFace size={15} />,
                text: 'A identificação por retrato usa uma assinatura perceptual de 64 bits (dHash); a comparação acontece no dispositivo.',
              },
              {
                icon: <IconFingerprint size={15} />,
                text: 'Digitais são simuladas: guarda-se apenas um template codificado, jamais uma imagem do dedo.',
              },
            ].map((b, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-mute">
                <span className="mt-0.5 shrink-0 rounded-md bg-moss-100 p-1.5 text-moss-600">{b.icon}</span>
                {b.text}
              </li>
            ))}
          </ul>
        </section>

        <section
          className="rise rounded-xl border border-line bg-card p-5 shadow-lift"
          style={{ animationDelay: '200ms' }}
        >
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
            <IconArchive size={18} className="text-moss-600" /> Retenção de dados — nada é excluído
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-mute">
            Por decisão de produto, o Vitalis <strong className="text-ink">não permite excluir dados de saúde</strong>:
            pessoas e registros são apenas <strong className="text-ink">arquivados</strong> (saem das listas e da
            identificação, mas permanecem íntegros e podem ser restaurados). Para levar os dados para outro
            dispositivo ou entregá-los a um médico, use a exportação JSON ou o compartilhamento por especialidade,
            disponíveis em cada prontuário.
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

        <p className="rise px-1 pb-4 font-mono text-[11px] text-mute" style={{ animationDelay: '240ms' }}>
          Vitalis v0.2.0 — contas & acesso delegado · consultor IA · especialidades · retenção sem exclusão
        </p>
      </div>

    </div>
  );
}
