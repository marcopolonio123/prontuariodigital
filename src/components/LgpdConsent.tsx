import { useState } from 'react';
import { Btn } from './ui';
import { IconChevronRight, IconShield } from './icons';

/**
 * Aviso de privacidade (LGPD — Lei 13.709/2018).
 * Como o Minha Vida trata dados pessoais sensíveis de saúde (art. 5º, II),
 * o titular deve ciência inequívoca antes de começar a usar o app.
 */
export function LgpdConsent({ onAccept }: { onAccept: () => void }) {
  const [openDetails, setOpenDetails] = useState(false);

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] px-3 pb-3 sm:px-6 sm:pb-5">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-xl border border-pine-700 bg-pine-900 shadow-float">
        <div className="flex items-center gap-2.5 border-b border-pine-800 bg-pine-850 px-4 py-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-moss-500/15 text-moss-300">
            <IconShield size={16} />
          </span>
          <p className="font-display text-sm font-bold text-white">Privacidade & LGPD — seus dados de saúde</p>
          <span className="ml-auto hidden rounded-full border border-moss-500/40 bg-moss-500/10 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-moss-300 sm:inline">
            Lei 13.709/2018
          </span>
        </div>

        <div className="px-4 py-3.5 sm:px-5">
          <p className="text-[13px] leading-relaxed text-pine-100">
            O Minha Vida processa <strong className="text-white">dados pessoais sensíveis de saúde</strong> (alergias,
            medicações, diagnóstico, biometria). Tudo fica <strong className="text-white">somente no seu dispositivo</strong>{' '}
            — nada é enviado a servidores — e a comunicação com o site é protegida por{' '}
            <strong className="text-white">criptografia HTTPS</strong>.
          </p>

          <button
            onClick={() => setOpenDetails((v) => !v)}
            className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold text-moss-300 transition-colors hover:text-moss-200"
          >
            <IconChevronRight size={13} className={`transition-transform duration-200 ${openDetails ? 'rotate-90' : ''}`} />
            {openDetails ? 'Ocultar seus direitos' : 'Ver seus direitos (LGPD, art. 18)'}
          </button>

          {openDetails && (
            <ul className="mt-2.5 grid gap-x-5 gap-y-1.5 rounded-lg border border-pine-800 bg-pine-950/60 p-3 text-[12px] leading-relaxed text-pine-200 sm:grid-cols-2">
              <li><strong className="text-moss-300">Acesso & portabilidade:</strong> exporte tudo em JSON a qualquer momento.</li>
              <li><strong className="text-moss-300">Correção:</strong> edite fichas e registros quando quiser.</li>
              <li><strong className="text-moss-300">Eliminação:</strong> apague a base local em Dados & privacidade.</li>
              <li><strong className="text-moss-300">Revogação:</strong> retire o consentimento quando desejar.</li>
            </ul>
          )}

          <div className="mt-3.5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-pine-200/70">
              Ao continuar, você declara ciência e aceita o tratamento local desses dados.
            </p>
            <Btn onClick={onAccept} className="shrink-0">
              <IconShield size={15} /> Li e aceito — começar
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
