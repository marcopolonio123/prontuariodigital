import { useRef, useState } from 'react';

type RecognitionResultEvent = Event & { results: { length: number; [index: number]: { 0: { transcript: string }; isFinal: boolean } } };
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

  const stop = () => { recognitionRef.current?.stop(); };
  const start = () => {
    const RecognitionApi = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!RecognitionApi) { setHint('Ditado não disponível neste navegador. Você pode continuar digitando normalmente.'); return; }
    const recognition = new RecognitionApi();
    recognition.lang = 'pt-BR'; recognition.interimResults = true; recognition.continuous = true;
    baseTextRef.current = value.trim(); finalTextRef.current = '';
    recognition.onresult = (event) => {
      let interim = '';
      for (let i = 0; i < event.results.length; i += 1) {
        const transcript = event.results[i][0]?.transcript ?? '';
        if (event.results[i].isFinal) finalTextRef.current += `${transcript.trim()} `;
        else interim += transcript;
      }
      onChange([baseTextRef.current, finalTextRef.current.trim(), interim.trim()].filter(Boolean).join(' '));
    };
    recognition.onerror = () => { setHint('Não foi possível continuar o ditado. Revise o texto e tente novamente.'); setListening(false); };
    recognition.onend = () => { setListening(false); recognitionRef.current = null; };
    recognitionRef.current = recognition; setHint(''); setListening(true); recognition.start();
  };

  return <div>
    <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} className={className} />
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button type="button" onClick={listening ? stop : start} className={`rounded-lg border px-3 py-2 text-xs font-bold ${listening ? 'border-danger-500 bg-danger-50 text-danger-700' : 'border-moss-500 bg-white text-moss-800'}`}>{listening ? '■ Parar ditado' : '🎙️ Ditar'}</button>
      {listening && <span className="text-xs font-semibold text-moss-700">Ouvindo em português...</span>}
    </div>
    {hint && <p className="mt-2 text-xs text-mute">{hint}</p>}
  </div>;
}
