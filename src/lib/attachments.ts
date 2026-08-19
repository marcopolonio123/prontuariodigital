import type { Attachment } from './types';
import { uid } from './store';
import { fileToDataURL } from './biometrics';

/** limite por anexo (localStorage é finito; imagens são redimensionadas antes) */
export const MAX_ATTACHMENT_KB = 1600;

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

export function formatSizeKb(kb: number): string {
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

/** Converte arquivo em anexo local (imagem redimensionada ou PDF). */
export async function fileToAttachment(file: File, addedBy: string): Promise<Attachment> {
  const isImage = file.type.startsWith('image/');
  const isPdf = file.type === 'application/pdf';
  if (!isImage && !isPdf) {
    throw new Error('Formato não suportado — anexe uma imagem (foto/scan) ou PDF.');
  }
  const dataUrl = isImage ? await fileToDataURL(file, 1024, 0.72) : await readFileAsDataURL(file);
  const sizeKb = Math.round((dataUrl.length * 3) / 4 / 1024);
  if (sizeKb > MAX_ATTACHMENT_KB) {
    throw new Error(`Arquivo muito grande (${formatSizeKb(sizeKb)}). Limite: ${formatSizeKb(MAX_ATTACHMENT_KB)} por anexo.`);
  }
  return {
    id: uid(),
    name: file.name,
    kind: isImage ? 'image' : 'pdf',
    mime: file.type || (isImage ? 'image/jpeg' : 'application/pdf'),
    sizeKb,
    dataUrl,
    addedAt: Date.now(),
    addedBy,
  };
}

export function downloadAttachment(a: Attachment): void {
  const link = document.createElement('a');
  link.href = a.dataUrl;
  link.download = a.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
