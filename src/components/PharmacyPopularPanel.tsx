import { useEffect, useState } from 'react';
import type { MyDoctorV1Api, PharmacyPopularPageV1 } from '../lib/api-v1';

const button = 'min-h-11 rounded-xl border border-line bg-white px-3 py-2 text-sm font-bold disabled:opacity-50';
const source = 'https://www.gov.br/saude/pt-br/composicao/sectics/farmacia-popular';
const cmed = 'https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/cmed/precos/precos';
const dateLabel = (date: string) => date.split('-').reverse().join('/');

export default function PharmacyPopularPanel({ api }: { api: MyDoctorV1Api }) {
  const [draft, setDraft] = useState(''), [query, setQuery] = useState('');
  const [page, setPage] = useState(1), [sort, setSort] = useState<'asc' | 'desc'>('asc');
  const [data, setData] = useState<PharmacyPopularPageV1>(), [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(undefined); setError('');
    void api.searchPharmacyPopular(query, page, sort, controller.signal)
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Consulta indisponível.'); });
    return () => controller.abort();
  }, [api, query, page, sort, refresh]);

  const pages = data ? Math.ceil(data.total / data.size) : 0;
  const pagination = (label: string) => data && pages > 1 && <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-2 text-sm">
    <span>Página {data.page} de {pages}</span>
    <div className="flex flex-wrap gap-2">
      <button className={button} type="button" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>Anterior</button>
      <button className={button} type="button" disabled={data.page >= pages} onClick={() => setPage(data.page + 1)}>Próxima</button>
    </div>
  </nav>;

  return <section className="min-w-0 space-y-4 rounded-2xl border border-line bg-white p-4 sm:p-5">
    <div>
      <h2 className="font-display text-2xl font-bold">Medicamentos gratuitos</h2>
      <p className="mt-2 text-sm text-mute">Consulte embalagens listadas no Farmácia Popular. Confira o código de barras: a cobertura pode variar entre embalagens do mesmo medicamento.</p>
    </div>
    <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); setQuery(draft.trim()); setPage(1); setRefresh(x => x + 1); }}>
      <label className="min-w-0 flex-[1_1_260px] text-sm font-bold">
        Medicamento, marca, registro Anvisa ou código de barras
        <input value={draft} maxLength={100} onChange={event => setDraft(event.target.value)} className="mt-1 w-full min-w-0 rounded-xl border border-line bg-white px-3 py-2 text-sm" />
      </label>
      <button className="min-h-11 rounded-xl bg-pine-900 px-4 py-2 text-sm font-bold text-white">Pesquisar</button>
      {(draft || query) && <button type="button" className={button} onClick={() => { setDraft(''); setQuery(''); setPage(1); }}>Limpar filtro</button>}
    </form>
    {error ? <p role="alert" className="text-sm">{error}</p> : !data && <p role="status" className="text-sm text-mute">Carregando lista…</p>}
    {data && <>
      <p role="status" className="text-sm text-mute">{data.total} {data.total === 1 ? 'código encontrado' : 'códigos encontrados'} · Lista de {dateLabel(data.edition)}.</p>
      {data.items.length === 0 ? <p className="text-sm">Nenhuma embalagem encontrada nesta edição. Consulte a fonte oficial para conferir atualizações.</p> : <>
        {pagination('Páginas de medicamentos acima da tabela')}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] text-left text-sm">
            <thead><tr className="border-b border-line">
              <th scope="col" className="p-2" aria-sort={sort === 'asc' ? 'ascending' : 'descending'}>
                <button type="button" className="min-h-11 font-bold underline" onClick={() => { setSort(sort === 'asc' ? 'desc' : 'asc'); setPage(1); }}>Medicamento <span aria-hidden="true">{sort === 'asc' ? '↑' : '↓'}</span></button>
              </th>
              <th scope="col" className="p-2">Código de barras</th><th scope="col" className="p-2">Benefício</th>
            </tr></thead>
            <tbody>{data.items.map(row => <tr className="border-b border-line" key={row.ean}>
              <th scope="row" className="max-w-md break-words p-2 font-semibold">
                {row.product}
                {row.brand && <span className="block text-xs font-normal text-mute">{row.brand}{row.presentation && ' · ' + row.presentation}</span>}
                {row.registration && <span className="block text-xs font-normal text-mute">Registro Anvisa: {row.registration}</span>}
              </th>
              <td className="p-2 tabular-nums">{row.ean}</td>
              <td className="p-2"><span className="inline-block rounded-lg bg-moss-50 px-2 py-1 text-xs font-bold text-moss-800">Gratuito no programa</span></td>
            </tr>)}</tbody>
          </table>
        </div>
        {pagination('Páginas de medicamentos abaixo da tabela')}
      </>}
    </>}
    <p className="text-sm text-mute">A retirada depende das regras do programa e do estoque de uma farmácia credenciada. Confira as orientações na fonte oficial.</p>
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-moss-800">
      <a className="underline" href={source} target="_blank" rel="noreferrer">Farmácia Popular: regras e farmácias</a>
      <a className="underline" href={cmed} target="_blank" rel="noreferrer">Consultar preços máximos na CMED</a>
    </div>
    <p className="text-xs text-mute">O preço máximo da CMED não é o preço praticado pela farmácia nem indica desconto.</p>
  </section>;
}
