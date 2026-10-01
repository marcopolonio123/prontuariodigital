import { useEffect } from 'react';

type SpeechResult = { 0: { transcript: string }; isFinal: boolean };
type SpeechEvent = Event & { resultIndex: number; results: { length: number; [index: number]: SpeechResult } };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function speechRecognitionConstructor(): SpeechRecognitionCtor | undefined {
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function installDictationButtonForLabel(labelPrefix: string) {
  const labels = Array.from(document.querySelectorAll('label'));
  const label = labels.find((item) => item.textContent?.replace(/\s+/g, ' ').trim().startsWith(labelPrefix));
  if (!label || label.querySelector('[data-mydoctor-record-dictation="true"]')) return;
  const field = label.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null;
  if (!field) return;

  label.classList.add('grid', 'grid-cols-[minmax(0,1fr)_auto]', 'gap-x-2', 'items-start');
  field.classList.add('col-start-1', 'row-start-2', 'min-w-0');
  const controls = document.createElement('div');
  controls.className = 'col-start-2 row-start-2 mt-1 flex flex-col gap-1';
  controls.dataset.mydoctorRecordDictation = 'true';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'min-h-11 shrink-0 rounded-lg border border-moss-500 bg-white px-3 py-2 text-xs font-bold text-moss-800';
  button.textContent = '🎙️ Ditar';
  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'min-h-11 rounded-lg border border-line bg-white px-3 py-2 text-xs font-bold text-mute';
  clearButton.textContent = 'Limpar';
  const status = document.createElement('span');
  status.className = 'col-span-2 row-start-3 mt-1 text-xs font-semibold text-moss-700';
  status.setAttribute('role', 'status');
  status.hidden = true;
  const setStatus = (text: string) => { status.textContent = text; status.hidden = !text; };
  controls.append(button, clearButton);
  label.append(controls, status);

  let recognition: SpeechRecognitionLike | null = null;
  let baseText = '';
  let finalText = '';
  const setValue = (value: string) => {
    const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  };

  clearButton.addEventListener('click', () => {
    if (recognition) { recognition.onresult = null; recognition.onerror = null; recognition.onend = null; recognition.stop(); recognition = null; }
    button.textContent = '🎙️ Ditar'; setStatus(''); setValue('');
  });

  button.addEventListener('click', () => {
    if (recognition) { recognition.stop(); return; }
    const RecognitionApi = speechRecognitionConstructor();
    if (!RecognitionApi) { setStatus('Ditado não disponível neste navegador.'); return; }
    const activeRecognition = new RecognitionApi();
    recognition = activeRecognition;
    activeRecognition.lang = 'pt-BR';
    activeRecognition.interimResults = true;
    activeRecognition.continuous = true;
    baseText = field.value.trim();
    finalText = '';
    activeRecognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0]?.transcript?.trim() ?? '';
        if (!transcript) continue;
        if (event.results[i].isFinal) finalText += `${transcript} `;
        else interim += `${transcript} `;
      }
      setValue([baseText, finalText.trim(), interim.trim()].filter(Boolean).join(' '));
    };
    activeRecognition.onerror = () => { setStatus('Não foi possível continuar o ditado.'); };
    activeRecognition.onend = () => { recognition = null; button.textContent = '🎙️ Ditar'; setStatus(''); };
    button.textContent = '■ Parar';
    setStatus('Ouvindo em português...');
    activeRecognition.start();
  });
}

function installDictationButtons() {
  [
    'Atendimento(descrição)',
    'Sintomas / Queixa principal',
    'Diagnóstico / Causa / Hipótese',
    'Exames',
    'Receitas / Prescrições',
    'Observações',
    'O que está acontecendo?',
  ].forEach(installDictationButtonForLabel);
}
export default function RecordDictationEnhancer() {
  useEffect(() => {
    const observer = new MutationObserver(() => installDictationButtons());
    observer.observe(document.body, { childList: true, subtree: true });
    installDictationButtons();
    return () => observer.disconnect();
  }, []);
  return null;
}

