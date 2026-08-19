import { useRef, useState } from 'react';
import type { Attachment } from '../lib/types';
import { formatDateTime } from '../lib/biometrics';
import { downloadAttachment, fileToAttachment, formatSizeKb } from '../lib/attachments';
import { Btn, Modal, useToast } from './ui';
import { IconDownload, IconFileText, IconPaperclip, IconSpinner, IconX } from './icons';

/* ------------------- tira de miniaturas (imagens/PDFs) ------------------- */

export function AttachmentStrip({
  items,
  onView,
  onRemove,
}: {
  items: Attachment[];
  onView: (a: Attachment) => void;
  onRemove?: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((a) =>
        a.kind === 'image' ? (
          <li key={a.id} className="group relative">
            <button
              onClick={() => onView(a)}
              className="block h-16 w-16 overflow-hidden rounded-lg border border-line transition-all hover:-translate-y-0.5 hover:border-moss-400 hover:shadow-lift active:scale-95"
              aria-label={`Ver anexo ${a.name}`}
            >
              <img src={a.dataUrl} alt={a.name} className="h-full w-full object-cover" />
            </button>
            <span className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-lg bg-pine-950/70 px-1 py-0.5 text-center font-mono text-[9px] text-pine-100 opacity-0 transition-opacity group-hover:opacity-100">
              {formatSizeKb(a.sizeKb)}
            </span>
            {onRemove && (
              <button
                onClick={() => onRemove(a.id)}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-danger-500 p-0.5 text-white shadow-sm transition-transform hover:scale-110"
                aria-label={`Remover ${a.name}`}
              >
                <IconX size={11} />
              </button>
            )}
          </li>
        ) : (
          <li key={a.id}>
            <button
              onClick={() => onView(a)}
              className="flex h-16 items-center gap-2 rounded-lg border border-line bg-white/70 px-3 transition-all hover:-translate-y-0.5 hover:border-moss-400 hover:shadow-lift active:scale-95"
            >
              <span className="rounded-md bg-danger-100 p-1.5 text-danger-600">
                <IconFileText size={15} />
              </span>
              <span className="max-w-32 text-left">
                <span className="block truncate text-xs font-bold text-ink">{a.name}</span>
                <span className="block font-mono text-[10px] text-mute">PDF · {formatSizeKb(a.sizeKb)}</span>
              </span>
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

/* ------------------------- lightbox do anexo ---------------------------- */

export function AttachmentModal({ att, onClose }: { att: Attachment | null; onClose: () => void }) {
  if (!att) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={att.name}
      subtitle={`${att.kind === 'image' ? 'Imagem' : 'PDF'} · ${formatSizeKb(att.sizeKb)} · anexado por ${att.addedBy || 'conta local'} em ${formatDateTime(att.addedAt)}`}
      width="max-w-2xl"
    >
      {att.kind === 'image' ? (
        <img src={att.dataUrl} alt={att.name} className="max-h-[62vh] w-full rounded-lg border border-line bg-pine-950/90 object-contain" />
      ) : (
        <iframe title={att.name} src={att.dataUrl} className="h-[62vh] w-full rounded-lg border border-line bg-white" />
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Btn variant="outline" onClick={onClose}>Fechar</Btn>
        <Btn onClick={() => downloadAttachment(att)}>
          <IconDownload size={15} /> Baixar arquivo
        </Btn>
      </div>
    </Modal>
  );
}

/* --------------------- botão "anexar foto/arquivo" ----------------------- */

export function AttachmentPicker({
  onAdd,
  byName,
  label = 'Anexar foto ou arquivo',
  size = 'md',
}: {
  onAdd: (a: Attachment) => void;
  byName: string;
  label?: string;
  size?: 'sm' | 'md';
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const a = await fileToAttachment(file, byName);
      onAdd(a);
      toast('success', `Anexo "${a.name}" adicionado.`);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Não foi possível anexar o arquivo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line bg-white/60 font-semibold text-mute transition-all hover:border-moss-400 hover:bg-moss-50 hover:text-moss-700 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 ${
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-[13px]'
      }`}
    >
      {busy ? <IconSpinner size={14} /> : <IconPaperclip size={14} />}
      {busy ? 'Processando…' : label}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </button>
  );
}
