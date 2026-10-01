import { useEffect, useRef, useState } from 'react';
import type { AccountProfileV1, MyDoctorV1Api, VerificationDocumentV1 } from './lib/api-v1';
const field = 'mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm';
const question = 'Você é um profissional da saúde e deseja clinicar pelo APP? (Médico, fisioterapeuta, nutricionista...)';
export default function AccountProfilePanel({ api, onSaved, onContinue, onProfessional }: { api: MyDoctorV1Api; onSaved: (account: AccountProfileV1) => Promise<void>; onContinue: () => void; onProfessional: () => void }) {
  const [data, setData] = useState<AccountProfileV1 | null>(null);
  const [document, setDocument] = useState<VerificationDocumentV1 | null>(null);
  const [kind, setKind] = useState('CNH'); const [file, setFile] = useState<File | null>(null);
  const lastCep = useRef('');
  const [cepLoading, setCepLoading] = useState(false);
  const [cepMessage, setCepMessage] = useState('');
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  useEffect(() => { let current = true; Promise.all([api.getAccount(), api.getIdentityDocument()]).then(([item, doc]) => { if (current) { lastCep.current = item.street && item.city && item.state ? (item.postalCode ?? '').replace(/\D/g, '') : ''; setData(item); setDocument(doc); if (doc) setKind(doc.kind); } }).catch(error => { if (current) setMessage(error.message); }); return () => { current = false; }; }, [api]);
  useEffect(() => {
    const cep = (data?.postalCode ?? '').replace(/\D/g, '');
    if (!data || !['brasil', 'brazil', 'br'].includes((data.country || 'Brasil').trim().toLowerCase()) || cep.length !== 8) { setCepLoading(false); setCepMessage(''); return; }
    if (cep === lastCep.current) { setCepLoading(false); return; }
    let current = true; const controller = new AbortController();
    setCepLoading(true); setCepMessage('Buscando endereço...');
    const before = { street: data.street, neighborhood: data.neighborhood, city: data.city, state: data.state };
    let timeout: ReturnType<typeof setTimeout>;
    const debounce = setTimeout(async () => {
      timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!response.ok) throw new Error('Busca indisponível');
        const address = await response.json() as { erro?: boolean | string; logradouro?: string; bairro?: string; localidade?: string; uf?: string; cep?: string };
        if (!current) return;
        if (address.erro) { setCepMessage('CEP não encontrado. Confira o número ou preencha o endereço manualmente.'); return; }
        if (!address.localidade || !address.uf || !/^[A-Z]{2}$/.test(address.uf) || (address.cep ?? '').replace(/\D/g, '') !== cep) throw new Error('Resposta inválida');
        setData(previous => {
          if (!previous || previous.postalCode.replace(/\D/g, '') !== cep) return previous;
          return { ...previous,
            street: previous.street === before.street ? (address.logradouro ?? '').slice(0,180) : previous.street,
            neighborhood: previous.neighborhood === before.neighborhood ? (address.bairro ?? '').slice(0,100) : previous.neighborhood,
            city: previous.city === before.city ? address.localidade!.slice(0,100) : previous.city,
            state: previous.state === before.state ? address.uf! : previous.state };
        });
        lastCep.current = cep;
        setCepMessage(address.logradouro ? 'Endereço preenchido. Informe número e complemento e confira os dados.' : 'Cidade e UF preenchidas. Informe rua, bairro e número.');
      } catch { if (current) setCepMessage('Não foi possível consultar o CEP. Você pode preencher o endereço manualmente.'); }
      finally { clearTimeout(timeout); if (current) setCepLoading(false); }
    }, 350);
    return () => { current = false; clearTimeout(debounce); clearTimeout(timeout); controller.abort(); };
  }, [data?.postalCode, data?.country]);
  async function save() {
    if (!data || busy || cepLoading) return; setBusy(true); setMessage('');
    try {
      const saved = await api.saveAccount({ ...data, phone: data.phone ?? '' }); setData(saved);
      if (file) { const doc = await api.saveIdentityDocument(kind, file, document?.id ?? null); setDocument(doc); setFile(null); }
      await onSaved(saved); setMessage('Cadastro salvo.');
      if (saved.isHealthProfessional) onProfessional();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  async function selectAvatar(imageFile?: File) {
    if (!imageFile || !data) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(imageFile.type) || imageFile.size > 10 * 1024 * 1024) return setMessage('Use uma foto ou avatar JPG, PNG ou WEBP de até 10 MB.');
    setBusy(true); setMessage('');
    try {
      const source = URL.createObjectURL(imageFile);
      try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Não foi possível ler a imagem.')); img.src = source; });
        const canvas = window.document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
        const context = canvas.getContext('2d'); if (!context) throw new Error('Não foi possível preparar a imagem.');
        context.fillStyle = '#ffffff'; context.fillRect(0, 0, 256, 256);
        const size = Math.min(image.naturalWidth, image.naturalHeight);
        context.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2, size, size, 0, 0, 256, 256);
        setData({ ...data, avatarDataUrl: canvas.toDataURL('image/jpeg', 0.85) });
      } finally { URL.revokeObjectURL(source); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar a imagem.'); }
    finally { setBusy(false); }
  }
  function text(label: string, key: 'name' | 'phone' | 'cpf' | 'rg' | 'postalCode' | 'street' | 'number' | 'complement' | 'neighborhood' | 'city' | 'country', maxLength: number, autoComplete?: string) {
    if (!data) return null;
    return <label className="min-w-0 text-xs font-bold">{label}<input required={key === 'name'} minLength={key === 'name' ? 2 : undefined} maxLength={maxLength} autoComplete={autoComplete} type={key === 'phone' ? 'tel' : 'text'} inputMode={['cpf', 'postalCode'].includes(key) ? 'numeric' : undefined} value={data[key] ?? ''} onChange={e => setData({ ...data, [key]: e.target.value })} className={field} /></label>;
  }
  return <section className="rounded-xl border border-line bg-card p-4 shadow-lift">
    <h2 className="text-xl font-bold">Meu cadastro</h2><p className="mt-1 text-sm text-mute">{data?.completed ? 'Confira e atualize seus dados pessoais.' : 'Complete seus dados após o primeiro acesso. Você poderá editá-los aqui depois.'}</p>
    {message && <p role="status" className="mt-3 rounded-lg bg-paper p-3 text-sm">{message}</p>}
    {data ? <form className="mt-4 space-y-4" onSubmit={e => { e.preventDefault(); void save(); }}>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white p-3">
        {data.avatarDataUrl ? <img src={data.avatarDataUrl} alt="Sua foto ou avatar" className="h-20 w-20 rounded-full border border-line object-cover" /> : <span className="flex h-20 w-20 items-center justify-center rounded-full bg-moss-50 text-2xl font-bold text-moss-800" aria-label="Sem foto de perfil">{data.name.trim().slice(0,1).toUpperCase() || '?'}</span>}
        <div className="min-w-0"><label className="block text-xs font-bold">Foto ou avatar<input disabled={busy} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { void selectAvatar(e.target.files?.[0]); e.target.value = ''; }} className="mt-2 block w-full min-w-0 text-xs" /></label><p className="mt-1 text-xs text-mute">JPG, PNG ou WEBP, até 10 MB. A imagem será ajustada para o perfil.</p>{data.avatarDataUrl && <button disabled={busy} type="button" onClick={() => setData({ ...data, avatarDataUrl: '' })} className="mt-2 text-xs text-danger-600">Remover foto / avatar</button>}</div>
      </div>
      <fieldset disabled={busy} className="grid min-w-0 gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-bold">Dados pessoais</legend>
        {text('Nome completo *', 'name', 150, 'name')}<label className="text-xs font-bold">E-mail de acesso<input readOnly value={data.email} className={field} /></label>
        <label className="text-xs font-bold">Data de nascimento *<input required type="date" min="1900-01-01" max={new Date().toISOString().slice(0,10)} value={data.birthDate} onChange={e => setData({ ...data, birthDate: e.target.value })} className={field} /></label>
        {text('Celular', 'phone', 25, 'tel')}
        <label className="text-xs font-bold">Sexo<select value={data.sex} onChange={e => setData({ ...data, sex: e.target.value })} className={field}><option value="">Não informado</option><option value="female">Feminino</option><option value="male">Masculino</option><option value="other">Outro</option><option value="unknown">Prefiro não informar</option></select></label>
      </fieldset>
      <fieldset disabled={busy} className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-sm font-bold">Endereço completo</legend>
        <div>{text('CEP', 'postalCode', 9, 'postal-code')}<p aria-live="polite" className="mt-1 text-xs font-normal text-mute">{cepMessage || 'Digite 8 números para preencher o endereço.'}</p></div>{text('Rua / Avenida', 'street', 180, 'address-line1')}{text('Número', 'number', 20)}{text('Complemento', 'complement', 100, 'address-line2')}{text('Bairro', 'neighborhood', 100)}{text('Cidade', 'city', 100, 'address-level2')}
        <label className="text-xs font-bold">UF<select value={data.state} onChange={e => setData({ ...data, state: e.target.value })} className={field}><option value="">Selecione</option>{'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').map(uf => <option key={uf}>{uf}</option>)}</select></label>{text('País', 'country', 80, 'country-name')}
      </fieldset>
      <fieldset disabled={busy} className="grid min-w-0 gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-bold">Identificação</legend>
        {text('CPF (opcional)', 'cpf', 14)}{text('RG (opcional)', 'rg', 30)}
        <p className="text-xs text-mute sm:col-span-2">Você também pode guardar um documento de identificação. Se solicitar acesso profissional, o administrador poderá consultá-lo na validação.</p>
        <label className="text-xs font-bold">Tipo de documento<select value={kind} onChange={e => setKind(e.target.value)} className={field}><option>CNH</option><option>RG</option><option>Passaporte</option><option>Certidão de nascimento</option></select></label>
        <label className="min-w-0 text-xs font-bold">Anexar documento (opcional)<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] ?? null)} className={field} /><span className="mt-1 block font-normal text-mute">PDF ou imagem, até 3 MB. {file && `Selecionado: ${file.name}`}</span></label>
        {document && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3 text-xs sm:col-span-2"><span className="min-w-0 break-words">{document.kind} · {document.filename}</span><button type="button" className="font-bold text-moss-700 underline" onClick={() => void api.openVerificationDocument('account:' + document.id).catch(error => setMessage(error.message))}>Abrir</button><button type="button" className="text-danger-600" onClick={() => { if (!window.confirm('Remover o documento de identificação?')) return; setBusy(true); void api.removeIdentityDocument(document.id).then(() => setDocument(null)).catch(error => setMessage(error.message)).finally(() => setBusy(false)); }}>Remover</button></div>}
      </fieldset>
      <label className="flex items-start gap-2 text-sm"><input disabled={busy} type="checkbox" checked={data.isHealthProfessional} onChange={e => setData({ ...data, isHealthProfessional: e.target.checked })} style={{ width: 16, height: 16, maxWidth: 16, flex: '0 0 16px', marginTop: 2 }} />{question}</label>
      {data.isHealthProfessional && <p className="text-xs text-mute">Ao salvar, você seguirá para os dados profissionais e o comprovante do conselho. Clinicar depende da aprovação do administrador.</p>}
      <div className="flex flex-wrap items-center gap-2"><button disabled={busy || cepLoading} type="submit" className="rounded-lg bg-pine-900 px-4 py-2 text-sm font-bold text-white">{busy ? 'Salvando...' : 'Salvar cadastro'}</button><button disabled={busy} type="button" onClick={onContinue} className="rounded-lg border border-line px-4 py-2 text-sm">Ir para o início</button></div>
    </form> : <p className="mt-3 text-sm">Carregando cadastro...</p>}
  </section>;
}
