import { useEffect, useRef, useState } from 'react';

type RecognitionResultEvent = Event & { resultIndex: number; results: { length: number; [index: number]: { 0: { transcript: string }; isFinal: boolean } } };
type RecognitionErrorEvent = Event & { error?: string };
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((event: RecognitionResultEvent) => void) | null; onerror: ((event: RecognitionErrorEvent) => void) | null; onend: (() => void) | null };
type RecognitionConstructor = new () => Recognition;

declare global { interface Window { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor; } }

export default function DictationTextarea({ value, onChange, rows = 5, placeholder, className = '' }: { value: string; onChange: (value: string) => void; rows?: number; placeholder?: string; className?: string }) {
  const recognitionRef = useRef<Recognition | null>(null);
  const baseTextRef = useRef('');
  const finalTextRef = useRef('');
  const [listening, setListening] = useState(false);
  const [hint, setHint] = useState('');

  useEffect(() => () => {
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.stop();
    }
  }, []);

  const stop = () => { recognitionRef.current?.stop(); };
  const start = () => {
    const RecognitionApi = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!RecognitionApi) { setHint('Ditado não disponível neste navegador. Você pode continuar digitando normalmente.'); return; }
    const recognition = new RecognitionApi();
    recognition.lang = 'pt-BR'; recognition.interimResults = true; recognition.continuous = true;
    baseTextRef.current = value.trim(); finalTextRef.current = '';
    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0]?.transcript?.trim() ?? '';
        if (!transcript) continue;
        if (event.results[i].isFinal) finalTextRef.current += `${transcript} `;
        else interim += `${transcript} `;
      }
      onChange([baseTextRef.current, finalTextRef.current.trim(), interim.trim()].filter(Boolean).join(' '));
    };
    recognition.onerror = () => { setHint('Não foi possível continuar o ditado. Revise o texto e tente novamente.'); setListening(false); };
    recognition.onend = () => { setListening(false); recognitionRef.current = null; };
    recognitionRef.current = recognition; setHint(''); setListening(true); recognition.start();
  };

  return <div data-mydoctor-record-dictation="true">
    <div className="flex min-w-0 items-start gap-2">
      <div className="min-w-0 flex-1"><textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} className={className} /></div>
      <button type="button" aria-pressed={listening} onClick={listening ? stop : start} className={`mt-1 min-h-11 shrink-0 rounded-lg border px-3 py-2 text-xs font-bold ${listening ? 'border-danger-500 bg-danger-50 text-danger-700' : 'border-moss-500 bg-white text-moss-800'}`}>{listening ? '■ Parar' : '🎙️ Ditar'}</button>
    </div>
    {listening && <p role="status" className="mt-1 text-xs font-semibold text-moss-700">Ouvindo em português...</p>}
    {hint && <p role="status" className="mt-1 text-xs text-mute">{hint}</p>}
  </div>;
}
