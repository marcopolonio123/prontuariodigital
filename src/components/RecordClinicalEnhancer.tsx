import { useEffect } from 'react';

type AttachmentCategory = 'record' | 'prescription' | 'exam';
type RecordAttachment = {
  id: string;
  category: AttachmentCategory;
  name: string;
  type: string;
  size: number;
  data: string;
};

type RecordExtras = {
  symptoms?: string;
  diagnosis?: string;
  exams?: string;
  prescriptions?: string;
  attachments?: RecordAttachment[];
};

type HealthEventLike = {
  id: string;
  type: string;
  payload?: Record<string, unknown>;
};

type MyDoctorWindow = typeof window & {
  __mydoctorPendingRecordExtras?: RecordExtras;
  __mydoctorHealthEvents?: HealthEventLike[];
};

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

function appWindow() {
  return window as MyDoctorWindow;
}

function currentExtras(): RecordExtras {
  const win = appWindow();
  win.__mydoctorPendingRecordExtras ??= {};
  return win.__mydoctorPendingRecordExtras;
}

function setExtraText(key: 'symptoms' | 'diagnosis' | 'exams' | 'prescriptions', value: string) {
  const extras = currentExtras();
  extras[key] = value;
}

function inputClass() {
  return 'block w-full min-w-0 max-w-full box-border rounded-xl border border-line bg-white px-3 py-3 text-sm outline-none focus:border-moss-500';
}

function createTextareaField(labelText: string, key: 'symptoms' | 'diagnosis' | 'exams' | 'prescriptions', placeholder: string) {
  const label = document.createElement('label');
  label.className = 'min-w-0 text-xs font-bold text-mute md:col-span-2';
  label.dataset.mydoctorClinicalExtra = key;
  label.append(document.createTextNode(labelText));

  const textarea = document.createElement('textarea');
  textarea.className = `${inputClass()} mt-1 min-h-20`;
  textarea.placeholder = placeholder;
  textarea.value = currentExtras()[key] ?? '';
  textarea.addEventListener('input', () => setExtraText(key, textarea.value));
  label.appendChild(textarea);
  return label;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function renderPendingAttachments(container: HTMLElement) {
  container.innerHTML = '';
  const attachments = currentExtras().attachments ?? [];
  if (attachments.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-xs text-mute';
    empty.textContent = 'Nenhum arquivo anexado ainda.';
    container.appendChild(empty);
    return;
  }

  attachments.forEach((attachment) => {
    const row = document.createElement('div');
    row.className = 'flex min-w-0 items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-2';
    const info = document.createElement('span');
    info.className = 'min-w-0 truncate text-xs text-ink';
    const categoryLabel = attachment.category === 'prescription' ? 'Receita' : attachment.category === 'exam' ? 'Exame' : 'Atendimento';
    info.textContent = `${categoryLabel}: ${attachment.name}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'shrink-0 text-xs font-bold text-danger-600';
    remove.textContent = 'Remover';
    remove.addEventListener('click', () => {
      const extras = currentExtras();
      extras.attachments = (extras.attachments ?? []).filter((item) => item.id !== attachment.id);
      renderPendingAttachments(container);
    });
    row.append(info, remove);
    container.appendChild(row);
  });
}

function createFilePicker(title: string, category: AttachmentCategory, multiple: boolean, list: HTMLElement) {
  const label = document.createElement('label');
  label.className = 'min-w-0 rounded-xl border border-line bg-white p-3 text-xs font-bold text-mute';
  label.append(document.createTextNode(title));

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,application/pdf';
  input.multiple = multiple;
  input.className = 'mt-2 block w-full min-w-0 max-w-full text-xs';
  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return;
    void (async () => {
      const extras = currentExtras();
      const attachments = extras.attachments ?? [];
      const existingTotal = attachments.reduce((sum, item) => sum + item.size, 0);
      let addedTotal = 0;
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
          window.alert(`${file.name}: o arquivo deve ter no máximo 4 MB.`);
          continue;
        }
        if (existingTotal + addedTotal + file.size > MAX_TOTAL_BYTES) {
          window.alert('O total de anexos deste atendimento deve ter no máximo 10 MB.');
          break;
        }
        const data = await readFileAsDataUrl(file);
        attachments.push({
          id: crypto.randomUUID(),
          category,
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          data,
        });
        addedTotal += file.size;
      }
      extras.attachments = attachments;
      input.value = '';
      renderPendingAttachments(list);
    })();
  });
  label.appendChild(input);
  return label;
}

function installClinicalFields() {
  const labels = Array.from(document.querySelectorAll('label'));
  const notesLabel = labels.find((item) => item.textContent?.replace(/\s+/g, ' ').trim().startsWith('Observações'));
  const grid = notesLabel?.parentElement;
  if (!notesLabel || !grid || grid.querySelector('[data-mydoctor-clinical-extra="symptoms"]')) return;

  const symptoms = createTextareaField('Sintomas / Queixa principal', 'symptoms', 'Ex.: dor, febre, duração, intensidade...');
  const diagnosis = createTextareaField('Diagnóstico / Causa / Hipótese', 'diagnosis', 'Diagnóstico informado ou hipótese clínica, quando houver.');
  const exams = createTextareaField('Exames', 'exams', 'Exames solicitados, realizados e/ou principais resultados.');
  const prescriptions = createTextareaField('Receitas / Prescrições', 'prescriptions', 'Medicamentos, orientações e prescrições relacionadas a este atendimento.');

  grid.insertBefore(symptoms, notesLabel);
  grid.insertBefore(diagnosis, notesLabel);
  grid.insertBefore(exams, notesLabel);
  grid.insertBefore(prescriptions, notesLabel);

  const attachmentSection = document.createElement('div');
  attachmentSection.className = 'md:col-span-2 rounded-xl border border-line bg-paper p-4';
  attachmentSection.dataset.mydoctorClinicalExtra = 'attachments';
  const heading = document.createElement('div');
  heading.innerHTML = '<p class="text-xs font-bold uppercase tracking-wide text-mute">Anexos do atendimento</p><p class="mt-1 text-xs text-mute">Guarde receita, folha/prontuário entregue pela instituição e vários exames. Aceita imagem ou PDF.</p>';

  const list = document.createElement('div');
  list.className = 'mt-3 space-y-2';
  renderPendingAttachments(list);

  const pickers = document.createElement('div');
  pickers.className = 'mt-3 grid min-w-0 gap-3 sm:grid-cols-3';
  pickers.append(
    createFilePicker('Atendimento / prontuário em papel', 'record', false, list),
    createFilePicker('Receita / prescrição', 'prescription', false, list),
    createFilePicker('Exames (vários)', 'exam', true, list),
  );

  attachmentSection.append(heading, pickers, list);
  grid.insertBefore(attachmentSection, notesLabel.nextSibling);
}

function addValueBlock(parent: HTMLElement, title: string, value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return;
  const block = document.createElement('div');
  block.className = 'sm:col-span-2';
  const strong = document.createElement('strong');
  strong.className = 'block text-xs uppercase text-mute';
  strong.textContent = title;
  const text = document.createElement('p');
  text.className = 'mt-1 whitespace-pre-wrap break-words text-ink';
  text.textContent = value;
  block.append(strong, text);
  parent.appendChild(block);
}

function installSavedEventDetails() {
  const events = (appWindow().__mydoctorHealthEvents ?? []).filter((event) => event.type !== 'vital' && event.type !== 'insurance');
  if (events.length === 0) return;

  const details = Array.from(document.querySelectorAll('details.group')) as HTMLDetailsElement[];
  details.forEach((detail, index) => {
    if (detail.dataset.mydoctorClinicalDetails === 'true') return;
    const event = events[index];
    if (!event) return;
    const payload = event.payload ?? {};
    const attachments = Array.isArray(payload.attachments) ? payload.attachments as RecordAttachment[] : [];
    const hasExtras = ['symptoms', 'diagnosis', 'exams', 'prescriptions'].some((key) => typeof payload[key] === 'string' && String(payload[key]).trim()) || attachments.length > 0;
    if (!hasExtras) {
      detail.dataset.mydoctorClinicalDetails = 'true';
      return;
    }

    const detailContent = detail.querySelector('.border-t .grid') as HTMLElement | null;
    if (!detailContent) return;
    addValueBlock(detailContent, 'Sintomas / Queixa principal', payload.symptoms);
    addValueBlock(detailContent, 'Diagnóstico / Causa / Hipótese', payload.diagnosis);
    addValueBlock(detailContent, 'Exames', payload.exams);
    addValueBlock(detailContent, 'Receitas / Prescrições', payload.prescriptions);

    if (attachments.length > 0) {
      const block = document.createElement('div');
      block.className = 'sm:col-span-2';
      const strong = document.createElement('strong');
      strong.className = 'block text-xs uppercase text-mute';
      strong.textContent = 'Anexos';
      const links = document.createElement('div');
      links.className = 'mt-2 flex flex-wrap gap-2';
      attachments.forEach((attachment) => {
        const link = document.createElement('a');
        link.href = attachment.data;
        link.download = attachment.name;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.className = 'rounded-lg border border-moss-500 bg-white px-3 py-2 text-xs font-bold text-moss-800';
        const categoryLabel = attachment.category === 'prescription' ? 'Receita' : attachment.category === 'exam' ? 'Exame' : 'Atendimento';
        link.textContent = `${categoryLabel}: ${attachment.name}`;
        links.appendChild(link);
      });
      block.append(strong, links);
      detailContent.appendChild(block);
    }
    detail.dataset.mydoctorClinicalDetails = 'true';
  });
}

function installEnhancements() {
  installClinicalFields();
  installSavedEventDetails();
}

export default function RecordClinicalEnhancer() {
  useEffect(() => {
    const observer = new MutationObserver(() => installEnhancements());
    observer.observe(document.body, { childList: true, subtree: true });
    installEnhancements();
    return () => observer.disconnect();
  }, []);
  return null;
}
