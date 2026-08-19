import { useRef } from 'react';
import type { AppState } from '../lib/types';
import { exportJSON, parseImport } from '../lib/store';
import { Btn, Tag, useToast } from '../components/ui';
import {
  IconArchive, IconCheck, IconDatabase, IconDownload, IconFace, IconFingerprint,
  IconShield, IconUpload,
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
            Leve todo o Vitalis para outro dispositivo ou entregue o histórico a um médico em um único arquivo JSON.
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
            Por decisão de produto, o Vitalis <strong className="text-ink">não permite excluir dados de saúde</strong>:
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
      </div>

      <p className="rise mt-6 px-1 pb-4 font-mono text-[11px] text-mute" style={{ animationDelay: '180ms' }}>
        Vitalis v0.2.0 — contas & acesso delegado · consultor IA · especialidades · retenção sem exclusão
      </p>
    </div>
  );
}
