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
type DictationTarget = HTMLInputElement | HTMLTextAreaElement;

function speechRecognitionConstructor(): SpeechRecognitionCtor | undefined {
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function reactSetValue(target: DictationTarget, value: string) {
  const prototype = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  setter?.call(target, value);
  target.dispatchEvent(new Event('input', { bubbles: true }));
}

function installDictation(labelPrefix: string, marker: string, selector: 'input' | 'textarea') {
  const labels = Array.from(document.querySelectorAll('label'));
  const label = labels.find((item) => item.textContent?.replace(/\s+/g, ' ').trim().startsWith(labelPrefix));
  if (!label || label.querySelector(`[data-mydoctor-dictation="${marker}"]`)) return;
  const target = label.querySelector(selector) as DictationTarget | null;
  if (!target) return;

  const controls = document.createElement('div');
  controls.className = 'mt-2 flex flex-wrap items-center gap-2';
  controls.dataset.mydoctorDictation = marker;

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
  const finalSegments = new Map<number, string>();

  button.addEventListener('click', () => {
    if (recognition) {
      recognition.stop();
      return;
    }

    const RecognitionApi = speechRecognitionConstructor();
    if (!RecognitionApi) {
      status.textContent = 'Ditado não disponível neste navegador.';
      return;
    }

    const activeRecognition = new RecognitionApi();
    recognition = activeRecognition;
    activeRecognition.lang = 'pt-BR';
    activeRecognition.interimResults = true;
    activeRecognition.continuous = true;
    baseText = target.value.trim();
    finalSegments.clear();

    activeRecognition.onresult = (event) => {
      const interimSegments: string[] = [];

      // Chrome/WebKit pode reenviar segmentos já reconhecidos. Guardamos cada
      // resultado pelo seu índice para que a mesma frase não seja concatenada
      // várias vezes durante uma única sessão de ditado.
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0]?.transcript?.trim() ?? '';
        if (!transcript) continue;
        if (event.results[i].isFinal) finalSegments.set(i, transcript);
        else interimSegments.push(transcript);
      }

      const finalText = [...finalSegments.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, text]) => text)
        .join(' ')
        .trim();
      const interimText = interimSegments.join(' ').trim();
      reactSetValue(target, [baseText, finalText, interimText].filter(Boolean).join(' '));
    };

    activeRecognition.onerror = () => {
      status.textContent = 'Não foi possível continuar o ditado.';
    };
    activeRecognition.onend = () => {
      recognition = null;
      button.textContent = '🎙️ Ditar';
      status.textContent = '';
    };

    button.textContent = '■ Parar ditado';
    status.textContent = 'Ouvindo em português...';
    activeRecognition.start();
  });
}

function installDictationButtons() {
  installDictation('Atendimento(descrição)', 'record-description', 'input');
  installDictation('Sintomas / Queixa principal', 'record-symptoms', 'textarea');
  installDictation('Diagnóstico / Causa / Hipótese', 'record-diagnosis', 'textarea');
  installDictation('Exames', 'record-exams', 'textarea');
  installDictation('Receitas / Prescrições', 'record-prescriptions', 'textarea');
  installDictation('Observações', 'record-notes', 'textarea');
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
