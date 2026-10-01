import { useEffect, useRef, useState } from 'react';
import { formatCpf, formatCep, formatRg, validCpf, rgError, BRAZIL_UFS } from '../server/src/document-validation';
import type { AccountProfileV1, MyDoctorV1Api, VerificationDocumentV1 } from './lib/api-v1';
const field = 'mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm';
const question = 'Você é um profissional da saúde e deseja clinicar pelo APP? (Médico, fisioterapeuta, nutricionista...)';
function under18(birthDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return false;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value);
  const [year, month, day] = birthDate.split('-').map(Number);
  const today = `${value('year')}-${String(value('month')).padStart(2,'0')}-${String(value('day')).padStart(2,'0')}`;
  const parsed = new Date(birthDate + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === birthDate && birthDate <= today && year >= 1900 && value('year') - year - (value('month') < month || (value('month') === month && value('day') < day) ? 1 : 0) < 18;
}
export default function AccountProfilePanel({ api, onSaved, onContinue, onProfessional }: { api: MyDoctorV1Api; onSaved: (account: AccountProfileV1) => Promise<void>; onContinue: () => void; onProfessional: () => void }) {
  const [data, setData] = useState<AccountProfileV1 | null>(null);
  const [document, setDocument] = useState<VerificationDocumentV1 | null>(null);
  const [kind, setKind] = useState('CNH'); const [file, setFile] = useState<File | null>(null);
  const lastCep = useRef('');
  const [cepLoading, setCepLoading] = useState(false);
  const [cepMessage, setCepMessage] = useState('');
  const [touched, setTouched] = useState<{ cpf?: boolean; rg?: boolean; postalCode?: boolean }>({});
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
        const address = await api.lookupAddress(cep, controller.signal);
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
  useEffect(() => { if (kind === 'Certidão de nascimento' && !under18(data?.birthDate ?? '')) { setKind('CNH'); setFile(null); } }, [data?.birthDate, kind]);
  async function save() {
    if (!data || busy) return;
    setTouched({ cpf: true, rg: true, postalCode: true });
    const cpfIssue = data.cpf && !validCpf(data.cpf) ? 'CPF inválido. Confira os dígitos verificadores.' : '';
    const rgIssue = rgError(data.rg ?? '', data.rgUf ?? '', data.rgType ?? 'RG');
    const cepIssue = data.postalCode && data.postalCode.replace(/\D/g,'').length !== 8 ? 'CEP deve ter 8 números.' : '';
    if (cpfIssue || rgIssue || cepIssue) { setMessage(cpfIssue || rgIssue || cepIssue); window.document.getElementById(cpfIssue ? 'account-cpf' : rgIssue ? 'account-rg' : 'account-postalCode')?.focus(); return; }
    if (data.rgType === 'CIN' && data.rg && data.cpf && data.rg.replace(/\D/g,'') !== data.cpf.replace(/\D/g,'')) return setMessage('Os dois campos de CPF devem conter o mesmo número.');
    setBusy(true); setMessage('');
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
  const errors = {
    cpf: data?.cpf && !validCpf(data.cpf) ? 'CPF inválido. Confira os 11 números e os dígitos verificadores.' : '',
    rg: rgError(data?.rg ?? '', data?.rgUf ?? '', data?.rgType ?? 'RG'),
    postalCode: data?.postalCode && data.postalCode.replace(/\D/g,'').length !== 8 ? 'CEP deve ter 8 números.' : '',
  };
  function text(label: string, key: 'name' | 'phone' | 'cpf' | 'rg' | 'postalCode' | 'street' | 'number' | 'complement' | 'neighborhood' | 'city' | 'country', maxLength: number, autoComplete?: string, layout = '') {
    if (!data) return null;
    const mask = (value: string) => key === 'cpf' ? formatCpf(value) : key === 'postalCode' ? formatCep(value) : key === 'rg' ? formatRg(value, data.rgUf ?? '', data.rgType ?? 'RG') : value;
    const issue = key === 'cpf' || key === 'rg' || key === 'postalCode' ? (touched[key] ? errors[key] : '') : '';
    return <label className={`block min-w-0 text-xs font-bold ${layout}`}>{label}<input id={`account-${key}`} required={key === 'name'} minLength={key === 'name' ? 2 : undefined} maxLength={maxLength} autoComplete={autoComplete} type={key === 'phone' ? 'tel' : 'text'} inputMode={['cpf', 'postalCode'].includes(key) || (key === 'rg' && data.rgType === 'CIN') ? 'numeric' : undefined} value={mask(data[key] ?? '')} onBlur={() => { if (key === 'cpf' || key === 'rg' || key === 'postalCode') setTouched(previous => ({ ...previous, [key]: true })); }} onChange={e => setData({ ...data, [key]: mask(e.target.value) })} aria-invalid={Boolean(issue)} aria-describedby={issue ? `error-${key}` : undefined} className={`${field} ${issue ? 'border-danger-500' : ''}`} />{issue && <span id={`error-${key}`} role="alert" className="mt-1 block font-normal text-danger-600">{issue}</span>}</label>;
  }
  return <section className="rounded-xl border border-line bg-card p-4 shadow-lift">
    <h2 className="text-xl font-bold">Meu cadastro</h2><p className="mt-1 text-sm text-mute">{data?.completed ? 'Confira e atualize seus dados pessoais.' : 'Complete seus dados após o primeiro acesso. Você poderá editá-los aqui depois.'}</p>
    {message && <p role="status" className="mt-3 rounded-lg bg-paper p-3 text-sm">{message}</p>}
    {data ? <form className="mt-4 space-y-4" onInvalid={e => { const input = e.target as HTMLInputElement; setMessage(input.validity.valueMissing ? 'Preencha os campos obrigatórios: nome completo e data de nascimento.' : 'Confira o campo destacado antes de salvar.'); }} onSubmit={e => { e.preventDefault(); void save(); }}>
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
      <fieldset disabled={busy} className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-12">
        <legend className="mb-2 text-sm font-bold">Endereço completo</legend>
        {text('CEP', 'postalCode', 9, 'postal-code', 'sm:col-span-2')}
        {text('Rua / Avenida', 'street', 180, 'address-line1', 'col-span-2 sm:col-span-8')}
        {text('Número', 'number', 20, undefined, 'sm:col-span-2')}
        <p aria-live="polite" className="-mt-1 text-xs font-normal text-mute col-span-2 sm:col-span-12">{cepMessage || 'Digite o CEP para preencher o endereço; informe número e complemento.'}</p>
        {text('Complemento', 'complement', 100, 'address-line2', 'col-span-2 sm:col-span-6')}
        {text('Bairro', 'neighborhood', 100, undefined, 'col-span-2 sm:col-span-6')}
        {text('Cidade', 'city', 100, 'address-level2', 'col-span-2 sm:col-span-7')}
        <label className="min-w-0 text-xs font-bold sm:col-span-2">UF<select value={data.state} onChange={e => setData({ ...data, state: e.target.value })} className={field}><option value="">Selecione</option>{BRAZIL_UFS.map(uf => <option key={uf}>{uf}</option>)}</select></label>
        {text('País', 'country', 80, 'country-name', 'sm:col-span-3')}
      </fieldset>
      <fieldset disabled={busy} className="grid min-w-0 gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-bold">Identificação</legend>
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:col-span-2 lg:grid-cols-12">
          {text('CPF (opcional)', 'cpf', 14, undefined, 'col-span-2 lg:col-span-3')}
          <label className="min-w-0 text-xs font-bold col-span-2 lg:col-span-4">Identidade<select value={data.rgType ?? 'RG'} onChange={e => { setData({ ...data, rgType: e.target.value as 'RG' | 'CIN' }); setTouched(previous => ({ ...previous, rg: false })); }} className={field}><option value="RG">RG estadual</option><option value="CIN">CPF</option></select></label>
          {text(data.rgType === 'CIN' ? 'CPF da identidade (opcional)' : 'RG (opcional)', 'rg', data.rgType === 'CIN' ? 14 : 30, undefined, 'lg:col-span-3')}
          {data.rgType !== 'CIN' && <label className="min-w-0 text-xs font-bold lg:col-span-2">UF emissora<select value={data.rgUf ?? ''} onChange={e => setData({ ...data, rgUf: e.target.value })} className={field}><option value="">Selecione</option>{BRAZIL_UFS.map(uf => <option key={uf}>{uf}</option>)}</select></label>}
        </div>
        <p className="text-xs text-mute sm:col-span-2">{data.rgType === 'CIN' ? 'Informe o CPF que consta na identidade; os dígitos verificadores serão conferidos.' : data.rgUf === 'SP' ? 'RG-SP: informe os 8 números e o dígito verificador, incluindo X quando constar no documento.' : data.rgUf ? 'Nesta UF, conferimos o formato. A conferência do RG deve ser feita pelo documento; o dígito não é validado automaticamente.' : 'Informe a UF que emitiu o RG, mesmo que seja diferente da UF do seu endereço.'}</p>
        <p className="text-xs text-mute sm:col-span-2">Você também pode guardar um documento de identificação. Certidão de nascimento é permitida apenas para menores de 18 anos. Se solicitar acesso profissional, o administrador poderá consultá-lo na validação.</p>
        <label className="text-xs font-bold">Tipo de documento<select value={kind} onChange={e => setKind(e.target.value)} className={field}><option>CNH</option><option>RG</option><option>Passaporte</option>{under18(data.birthDate) && <option>Certidão de nascimento</option>}</select></label>
        <label className="min-w-0 text-xs font-bold">Anexar documento (opcional)<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] ?? null)} className={field} /><span className="mt-1 block font-normal text-mute">PDF ou imagem, até 3 MB. {file && `Selecionado: ${file.name}`}</span></label>
        {document && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3 text-xs sm:col-span-2"><span className="min-w-0 break-words">{document.kind} · {document.filename}</span><button type="button" className="font-bold text-moss-700 underline" onClick={() => void api.openVerificationDocument('account:' + document.id).catch(error => setMessage(error.message))}>Abrir</button><button type="button" className="text-danger-600" onClick={() => { if (!window.confirm('Remover o documento de identificação?')) return; setBusy(true); void api.removeIdentityDocument(document.id).then(() => setDocument(null)).catch(error => setMessage(error.message)).finally(() => setBusy(false)); }}>Remover</button></div>}
      </fieldset>
      <label className="flex items-start gap-2 text-sm"><input disabled={busy} type="checkbox" checked={data.isHealthProfessional} onChange={e => setData({ ...data, isHealthProfessional: e.target.checked })} style={{ width: 16, height: 16, maxWidth: 16, flex: '0 0 16px', marginTop: 2 }} />{question}</label>
      {data.isHealthProfessional && <p className="text-xs text-mute">Ao salvar, você seguirá para os dados profissionais e o comprovante do conselho. Clinicar depende da aprovação do administrador.</p>}
      {message && <p role="status" className="rounded-lg bg-paper p-3 text-sm">{message}</p>}
      <div className="flex flex-wrap items-center gap-2"><button disabled={busy} type="submit" className="rounded-lg bg-pine-900 px-4 py-2 text-sm font-bold text-white">{busy ? 'Salvando...' : 'Salvar cadastro'}</button><button disabled={busy} type="button" onClick={onContinue} className="rounded-lg border border-line px-4 py-2 text-sm">Ir para o início</button></div>
    </form> : <p className="mt-3 text-sm">Carregando cadastro...</p>}
  </section>;
}

