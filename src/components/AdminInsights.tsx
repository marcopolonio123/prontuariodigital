import { useEffect, useRef, useState, type DependencyList } from 'react';
import type { MyDoctorV1Api } from '../lib/api-v1';
import type { AdminAccountFilters, AdminAccountIdentity, AdminAccountRow, AdminLinkKind, AdminPage } from '../lib/admin-insights';

const card = 'min-w-0 rounded-2xl border border-line bg-white p-4';
const button = 'min-h-11 rounded-xl border border-line bg-white px-3 py-2 text-sm font-bold disabled:opacity-50';
const primary = 'min-h-11 rounded-xl bg-pine-900 px-3 py-2 text-sm font-bold text-white';
const field = 'mt-1 w-full min-w-0 rounded-xl border border-line bg-white px-3 py-2 text-sm';
const number = new Intl.NumberFormat('pt-BR');
const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const money = (amount: number, currency: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amount / 100);
const table = 'w-full text-left text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2 [&_tr]:border-b [&_tr]:border-line';
const defaults: AdminAccountFilters = { q: '', plan: '', cart: '', dependents: '', received: '', granted: '', sort: 'name-asc' };
const linkLabels = {
  profiles: 'Prontuários da conta', dependents: 'Dependentes sob tutela',
  received: 'Acessos recebidos', granted: 'Acessos concedidos',
} as const;
const grantStatus = {
  active: 'Vigente', expired: 'Expirado', revoked: 'Revogado', scheduled: 'Futuro', archived: 'Prontuário arquivado',
};

function useRead<T>(read: (signal: AbortSignal) => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<{ data?: T; error?: string }>({});
  useEffect(() => {
    const controller = new AbortController();
    setState({});
    void read(controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ data });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ error: error instanceof Error ? error.message : 'Consulta indisponível.' });
    });
    return () => controller.abort();
  }, deps);
  return state;
}

function ReadStatus({ error, loading }: { error?: string; loading: boolean }) {
  return error ? <p role="alert" className="rounded-xl border border-line bg-white p-3 text-sm">{error}</p>
    : loading ? <p role="status" className="text-sm text-mute">Carregando…</p> : null;
}

function Pager({ data, onPage, label }: { data: AdminPage<unknown>; onPage: (page: number) => void; label: string }) {
  const pages = Math.ceil(data.total / data.size);
  return pages > 1 ? <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
    <span>Página {data.page} de {pages}</span>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button} disabled={data.page <= 1} onClick={() => onPage(1)}>Primeira</button>
      <button type="button" className={button} disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>Anterior</button>
      <button type="button" className={button} disabled={data.page >= pages} onClick={() => onPage(data.page + 1)}>Próxima</button>
      <button type="button" className={button} disabled={data.page >= pages} onClick={() => onPage(pages)}>Última</button>
    </div>
  </nav> : null;
}

export function AdminStoragePlansPanel({ api }: { api: MyDoctorV1Api }) {
  const { data, error } = useRead(signal => api.getAdminStoragePlans(signal), [api]);
  return <section className={card}>
    <ReadStatus error={error} loading={!data} />
    {data && <>
      <div className="overflow-x-auto"><table className={table}>
        <caption className="pb-3 text-left text-sm text-mute">Catálogo de planos do Meu HD</caption>
        <thead><tr>{['Plano', 'Espaço total', 'Preço', 'Validade', 'Disponibilidade'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{data.plans.map(plan => <tr key={plan.gb}>
          <th scope="row">{plan.period === 'unlimited' ? 'Gratuito' : `Plano de ${plan.gb} GB`}</th><td>{plan.gb} GB</td>
          <td>{money(plan.priceCents, plan.currency)}{plan.period === 'month' ? ' / mês' : ''}</td>
          <td>{plan.period === 'month' ? '1 mês' : 'Sem vencimento'}</td>
          <td>{plan.period === 'unlimited' ? 'Incluído na conta' : plan.purchasable ? 'Disponível' : 'Aguardando pagamento integrado'}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="mt-3 text-sm text-mute">O espaço total é compartilhado pelos arquivos pessoais e pelos documentos do MyDoctor.</p>
      {!data.checkoutEnabled && <p className="mt-2 text-sm text-mute">O carrinho registra a escolha, mas não cobra nem aumenta a cota.</p>}
    </>}
  </section>;
}

const identity = (account: AdminAccountIdentity | null) => account ? `${account.name} · Nº ${account.userNumber}` : 'Não registrado';

function Relationships({ api, account, onClose }: { api: MyDoctorV1Api; account: AdminAccountRow; onClose: () => void }) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus(); }, []);
  const [kind, setKind] = useState<AdminLinkKind>('dependents');
  const [page, setPage] = useState(1);
  const { data, error } = useRead(signal => api.listAdminRelationships(account.userNumber, kind, page, signal), [api, account.userNumber, kind, page]);
  return <section aria-label="Vínculos da conta" className={card}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 ref={title} tabIndex={-1} className="break-words font-bold">Vínculos de {identity(account)}</h3>
      <button type="button" className={button} onClick={onClose}>Fechar vínculos</button>
    </div>
    <label className="my-3 block text-sm font-semibold">Tipo de vínculo
      <select className={field} value={kind} onChange={e => { setKind(e.target.value as AdminLinkKind); setPage(1); }}>
        {Object.entries(linkLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    <ReadStatus error={error} loading={!data} />
    {data && (data.total === 0 ? <p className="text-sm text-mute">Nenhum vínculo deste tipo.</p> : <>
      <Pager data={data} onPage={setPage} label="Páginas de vínculos acima da lista" />
      <ul className="grid gap-2 sm:grid-cols-2">
        {data.items.map(row => 'patient' in row ? <li key={row.id} className="min-w-0 break-words rounded-xl border border-line p-3 text-sm">
          <strong>{row.patient.name} · Prontuário {row.patient.recordNumber}</strong>
          <p>{grantStatus[row.status]} · {row.permission === 'read_write_consultation' ? 'Leitura e atendimento' : 'Leitura'}</p>
          <p>{kind === 'received' ? 'Concedido por: ' + identity(row.grantedByUser) : 'Concedido a: ' + identity(row.account)}</p>
          <p className="text-mute">De {date.format(new Date(row.validFrom))} · {row.validUntil ? 'Até ' + date.format(new Date(row.validUntil)) : 'Sem vencimento'}</p>
        </li> : <li key={row.recordNumber} className="min-w-0 break-words rounded-xl border border-line p-3 text-sm">
          <strong>{row.name} · Prontuário {row.recordNumber}</strong>
          <p>Conta de origem: {identity(row.owner)}</p>
          {row.tutor && <p>Tutor atual: {identity(row.tutor)}</p>}
        </li>)}
      </ul>
      <Pager data={data} onPage={setPage} label="Páginas de vínculos abaixo da lista" />
    </>)}
  </section>;
}

export function AdminAccountsPanel({ api, heading = false }: { api: MyDoctorV1Api; heading?: boolean }) {
  const [draft, setDraft] = useState(defaults), [filters, setFilters] = useState(defaults);
  const [page, setPage] = useState(1), [selected, setSelected] = useState<AdminAccountRow | null>(null);
  const [refresh, setRefresh] = useState(0);
  const { data, error } = useRead(signal => api.listAdminAccounts(filters, page, signal), [api, filters, page, refresh]);
  const filtered = Object.keys(defaults).some(key => key !== 'sort' && !!filters[key as keyof AdminAccountFilters]);
  function apply(next: AdminAccountFilters) {
    setFilters(next); setPage(1); setSelected(null); setRefresh(x => x + 1);
  }
  function changePage(next: number) { setPage(next); setSelected(null); }
  return <div className="space-y-3">
    <section className={card} aria-label="Consulta de usuários">
      {heading && <h2 className="mb-2 text-lg font-bold">Usuários e vínculos</h2>}
      <p className="mb-3 text-sm text-mute">Veja a cota liberada, a opção no carrinho, os acessos vigentes e os dependentes sob tutela. Selecione o nome de uma conta para consultar seus vínculos.</p>
      <details className="rounded-xl border border-line p-3">
        <summary className="cursor-pointer text-sm font-bold">Filtros{filtered ? ' · Filtro ativo' : ''}{data ? ` · ${number.format(data.total)} conta(s)` : ''}</summary>
        <form className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={e => { e.preventDefault(); apply({ ...draft, q: draft.q.trim() }); }}>
          <label className="text-sm font-semibold">Nome, e-mail, nº do usuário ou prontuário<input className={field} maxLength={160} value={draft.q} onChange={e => setDraft({ ...draft, q: e.target.value })} /></label>
          <label className="text-sm font-semibold">Cota liberada<select className={field} value={draft.plan} onChange={e => setDraft({ ...draft, plan: e.target.value })}>
            <option value="">Todas</option>{[1, 5, 10, 20].map(gb => <option key={gb} value={gb}>{gb} GB</option>)}<option value="other">Outras</option>
          </select></label>
          <label className="text-sm font-semibold">Plano no carrinho<select className={field} value={draft.cart} onChange={e => setDraft({ ...draft, cart: e.target.value })}>
            <option value="">Todos</option>{[5, 10, 20].map(gb => <option key={gb} value={gb}>{gb} GB</option>)}
          </select></label>
          {(['dependents', 'received', 'granted'] as const).map(key => <label key={key} className="text-sm font-semibold">{linkLabels[key]}{key !== 'dependents' && ' vigentes'}
            <select className={field} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })}>
              <option value="">Todos</option><option value="yes">Com vínculos</option><option value="no">Sem vínculos</option>
            </select>
          </label>)}
          <label className="text-sm font-semibold">Ordenar<select className={field} value={draft.sort} onChange={e => setDraft({ ...draft, sort: e.target.value as AdminAccountFilters['sort'] })}>
            <option value="name-asc">Nome A–Z</option><option value="name-desc">Nome Z–A</option>
          </select></label>
          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
            <button className={primary}>Pesquisar</button>
            <button type="button" className={button} onClick={() => { setDraft(defaults); apply(defaults); }}>Limpar filtros</button>
          </div>
        </form>
      </details>
      <div className="mt-3"><ReadStatus error={error} loading={!data} /></div>
      {data && (data.total === 0 ? <p className="text-sm text-mute">Nenhuma conta encontrada neste filtro.</p> : <>
        <Pager data={data} onPage={changePage} label="Páginas de usuários acima da tabela" />
        <div className="overflow-x-auto"><table className={`min-w-[700px] ${table}`}>
          <thead><tr>{['Conta', 'Cota liberada', 'No carrinho', 'Prontuários', 'Dependentes', 'Recebidos', 'Concedidos'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{data.items.map(row => <tr key={row.userNumber}>
            <th scope="row" className="min-w-[150px] max-w-[240px] break-words">
              <button type="button" className="min-h-11 max-w-full break-words text-left text-moss-800 underline" aria-expanded={selected?.userNumber === row.userNumber}
                onClick={() => setSelected(selected?.userNumber === row.userNumber ? null : row)}>{identity(row)}</button>
              <span className="block font-normal text-mute">{row.email}</span>
            </th>
            <td>{row.limitBytes === 1e9 ? '1 GB · Gratuito' : `${number.format(row.limitBytes / 1e9)} GB`}</td>
            <td>{row.cartGb ? `${row.cartGb} GB` : '—'}</td>
            <td>{row.profiles}</td><td>{row.dependents}</td><td>{row.received}</td><td>{row.granted}</td>
          </tr>)}</tbody>
        </table></div>
        <Pager data={data} onPage={changePage} label="Páginas de usuários abaixo da tabela" />
      </>)}
    </section>
    {selected && <Relationships key={selected.userNumber} api={api} account={selected} onClose={() => setSelected(null)} />}
  </div>;
}

export function AdminHealthPanel({ api }: { api: MyDoctorV1Api }) {
  const [refresh, setRefresh] = useState(0);
  const { data, error } = useRead(signal => api.getAdminOverview(signal), [api, refresh]);
  const metricLabels = {
    accounts: 'Contas cadastradas', profiles: 'Prontuários ativos', dependents: 'Dependentes sob tutela',
    tutors: 'Contas com dependentes', accesses: 'Autorizações de acesso vigentes',
    professionals: 'Profissionais aprovados', storageAccounts: 'Contas com cota registrada',
  } as const;
  return <div className="space-y-4">
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Estado do sistema</h2>
        <button type="button" className={button} onClick={() => setRefresh(x => x + 1)}>Atualizar painel</button>
      </div>
      <ReadStatus error={error} loading={!data} />
      {data && <>
        <p className="mt-2 text-sm text-mute">Verificado em {date.format(new Date(data.observedAt))} (Brasília).</p>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['API', 'Respondendo'], ['Banco de dados', 'Respondendo'],
            ['Armazenamento', data.storageMode === 's3' ? 'S3/R2 selecionado' : 'Modo padrão selecionado'],
            ['Pagamento', data.checkoutEnabled ? 'Ativado' : 'Desativado'],
          ].map(([label, value]) => <div key={label} className="rounded-xl border border-line p-3">
            <dt className="text-sm text-mute">{label}</dt><dd className="font-bold">{value}</dd>
          </div>)}
        </dl>
        <p className="mt-2 text-xs text-mute">Armazenamento e pagamento mostram a configuração, sem testar serviços externos.</p>
        <h2 className="mb-2 mt-5 text-lg font-bold">Contas e relações</h2>
        <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {Object.entries(metricLabels).map(([key, label]) => <div key={key} className="rounded-xl bg-paper p-3">
            <dt className="text-sm text-mute">{label}</dt>
            <dd className="text-xl font-bold">{number.format(data.totals[key as keyof typeof metricLabels])}</dd>
          </div>)}
          <div className="rounded-xl bg-paper p-3">
            <dt className="text-sm text-mute">Espaço em arquivos pessoais</dt>
            <dd className="text-xl font-bold">{number.format(data.personalBytes / 1e6)} MB</dd>
          </div>
        </dl>
      </>}
    </section>
    <AdminAccountsPanel api={api} heading />
  </div>;
}
