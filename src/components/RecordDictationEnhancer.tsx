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

function installDictationButton() {
  const labels = Array.from(document.querySelectorAll('label'));
  const label = labels.find((item) => item.textContent?.replace(/\s+/g, ' ').trim().startsWith('Atendimento(descrição)'));
  if (!label || label.querySelector('[data-mydoctor-record-dictation="true"]')) return;
  const input = label.querySelector('input') as HTMLInputElement | null;
  if (!input) return;

  const controls = document.createElement('div');
  controls.className = 'mt-2 flex flex-wrap items-center gap-2';
  controls.dataset.mydoctorRecordDictation = 'true';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'rounded-lg border border-moss-500 bg-white px-3 py-2 text-xs font-bold text-moss-800';
  button.textContent = '🎙️ Ditar';
  const status = document.createElement('span');
  status.className = 'text-xs font-semibold text-moss-700';
  controls.append(button, status);
  label.appendChild(controls);

  let recognition: SpeechRecognitionLike | null = null;
  let baseText = '';
  let finalText = '';
  const setValue = (value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  button.addEventListener('click', () => {
    if (recognition) { recognition.stop(); return; }
    const RecognitionApi = speechRecognitionConstructor();
    if (!RecognitionApi) { status.textContent = 'Ditado não disponível neste navegador.'; return; }
    const activeRecognition = new RecognitionApi();
    recognition = activeRecognition;
    activeRecognition.lang = 'pt-BR';
    activeRecognition.interimResults = true;
    activeRecognition.continuous = true;
    baseText = input.value.trim();
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
    activeRecognition.onerror = () => { status.textContent = 'Não foi possível continuar o ditado.'; };
    activeRecognition.onend = () => { recognition = null; button.textContent = '🎙️ Ditar'; status.textContent = ''; };
    button.textContent = '■ Parar ditado';
    status.textContent = 'Ouvindo em português...';
    activeRecognition.start();
  });
}

export default function RecordDictationEnhancer() {
  useEffect(() => {
    const observer = new MutationObserver(() => installDictationButton());
    observer.observe(document.body, { childList: true, subtree: true });
    installDictationButton();
    return () => observer.disconnect();
  }, []);
  return null;
}
