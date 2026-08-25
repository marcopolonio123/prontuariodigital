import { useState } from 'react';
import type { Insurance, InsuranceHolder, InsuranceCoverage } from '../lib/types';
import { INSURANCE_HOLDER_META, INSURANCE_COVERAGE_META } from '../lib/types';
import { uid } from '../lib/store';
import { formatDateBR, fileToDataURL } from '../lib/biometrics';
import { Btn, Field, inputCls, Tag, useToast } from '../components/ui';
import { CameraCapture } from '../components/CameraCapture';
import {
  IconCreditCard, IconCamera, IconUpload, IconTrash, IconPlus, IconChevronUp, IconChevronDown,
} from '../components/icons';

const emptyInsForm = {
  operator: '', plan: '', cardNumber: '', validUntil: '', notes: '', image: null as string | null,
  holder: 'titular' as InsuranceHolder, coverage: 'particular' as InsuranceCoverage,
};

export function InsuranceScreen({ insurances, onChange }: { insurances: Insurance[]; onChange: (v: Insurance[]) => void }) {
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [camOpen, setCamOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyInsForm });
  const [err, setErr] = useState('');

  const save = () => {
    if (!form.operator.trim()) {
      setErr('Informe a operadora ou seguradora.');
      return;
    }
    onChange([
      ...insurances,
      { id: uid(), operator: form.operator.trim(), plan: form.plan.trim(), cardNumber: form.cardNumber.trim(), validUntil: form.validUntil, image: form.image, notes: form.notes.trim(), holder: form.holder, coverage: form.coverage, addedAt: Date.now() },
    ]);
    setForm({ ...emptyInsForm });
    setErr('');
    setShowForm(false);
    toast('success', 'Convênio adicionado com sucesso.');
  };

  const remove = (id: string) => {
    onChange(insurances.filter((x) => x.id !== id));
    toast('success', 'Convênio removido.');
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const url = await fileToDataURL(file, 900, 0.82);
      setForm((f) => ({ ...f, image: url }));
    } catch {
      toast('error', 'Não foi possível ler a imagem da carteirinha.');
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Convênios & Planos de Saúde</h1>
          <p className="text-sm text-mute">Gerencie seus planos de saúde e seguros médicos</p>
        </div>
        <Btn variant="dark" size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? <IconChevronUp size={14} /> : <IconPlus size={14} />} {showForm ? 'Cancelar' : 'Adicionar'}
        </Btn>
      </div>

      {insurances.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-paper/70 p-8 text-center">
          <IconCreditCard size={40} className="mx-auto mb-3 text-mute/50" />
          <p className="font-semibold text-ink">Nenhum convênio cadastrado</p>
          <p className="text-sm text-mute">Adicione seu primeiro plano de saúde ou seguro médico.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {insurances.map((ins) => {
            const expired = !!ins.validUntil && ins.validUntil < today;
            return (
              <li key={ins.id} className="group relative flex items-start gap-3 rounded-xl border border-line bg-white/80 p-3 transition-all hover:border-moss-300">
                {ins.image ? (
                  <img src={ins.image} alt={`Carteirinha ${ins.operator}`} className="h-20 w-28 shrink-0 rounded-lg border border-line object-cover" />
                ) : (
                  <span className="flex h-20 w-28 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-line bg-paper text-mute/60">
                    <IconCreditCard size={28} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold text-ink">{ins.operator}{ins.plan ? ` · ${ins.plan}` : ''}</p>
                  <p className="font-mono text-[11px] text-mute">{ins.cardNumber || 'nº não informado'}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {ins.validUntil ? (
                      <Tag tone={expired ? 'danger' : 'moss'}>{expired ? 'vencido' : `vál. ${formatDateBR(ins.validUntil)}`}</Tag>
                    ) : (
                      <Tag tone="mute">validade n/d</Tag>
                    )}
                    <Tag tone="info">{INSURANCE_HOLDER_META[ins.holder]}</Tag>
                    <Tag tone="mute">{INSURANCE_COVERAGE_META[ins.coverage]}</Tag>
                  </div>
                  {ins.notes && <p className="mt-2 line-clamp-2 text-xs text-mute">{ins.notes}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => remove(ins.id)}
                  className="absolute right-2 top-2 rounded-md p-1.5 text-mute opacity-0 transition-all hover:bg-danger-100 hover:text-danger-600 group-hover:opacity-100"
                  aria-label={`Remover ${ins.operator}`}
                >
                  <IconTrash size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {showForm && (
        <div className="mt-4 rounded-xl border border-line bg-white/80 p-4">
          <p className="mb-3 text-sm font-semibold text-mute">Novo convênio ou seguro saúde — A carteirinha fica armazenada somente neste dispositivo.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Operadora / seguradora" required>
              <input className={`${inputCls} ${err ? 'border-danger-500' : ''}`} value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })} placeholder="ex.: Unimed, Bradesco Saúde" />
              {err && <p className="mt-1 text-xs font-medium text-danger-600">{err}</p>}
            </Field>
            <Field label="Nome do plano">
              <input className={inputCls} value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} placeholder="ex.: Unipart Enfermaria" />
            </Field>
            <Field label="Nº da carteirinha / beneficiário">
              <input className={inputCls} value={form.cardNumber} onChange={(e) => setForm({ ...form, cardNumber: e.target.value })} placeholder="ex.: 0834 5521 7790 02" />
            </Field>
            <Field label="Validade">
              <input type="date" className={inputCls} value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
            </Field>
            <Field label="A pessoa é…">
              <select className={inputCls} value={form.holder} onChange={(e) => setForm({ ...form, holder: e.target.value as InsuranceHolder })}>
                {(Object.keys(INSURANCE_HOLDER_META) as InsuranceHolder[]).map((h) => (
                  <option key={h} value={h}>{INSURANCE_HOLDER_META[h]}</option>
                ))}
              </select>
            </Field>
            <Field label="Tipo de plano">
              <select className={inputCls} value={form.coverage} onChange={(e) => setForm({ ...form, coverage: e.target.value as InsuranceCoverage })}>
                {(Object.keys(INSURANCE_COVERAGE_META) as InsuranceCoverage[]).map((c) => (
                  <option key={c} value={c}>{INSURANCE_COVERAGE_META[c]}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-4">
            <p className="mb-1.5 text-[13px] font-semibold text-ink">Foto da carteirinha</p>
            <div className="flex items-start gap-3">
              {form.image ? (
                <img src={form.image} alt="Carteirinha do plano" className="h-24 rounded-lg border border-line object-cover" />
              ) : (
                <div className="flex h-24 w-40 items-center justify-center rounded-lg border-2 border-dashed border-line bg-paper text-mute">
                  <IconCreditCard size={22} />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Btn variant="outline" size="sm" onClick={() => setCamOpen(true)}>
                  <IconCamera size={13} /> Fotografar
                </Btn>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs font-semibold text-ink transition-all hover:border-moss-300 hover:bg-moss-50 active:scale-[0.97]">
                  <IconUpload size={13} /> Enviar arquivo
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
                </label>
                {form.image && (
                  <Btn variant="ghost" size="sm" onClick={() => setForm({ ...form, image: null })}>
                    <IconTrash size={12} /> Remover
                  </Btn>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <Field label="Observações" hint="opcional">
              <textarea className={`${inputCls} min-h-16 resize-y`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="ex.: dependente no plano do cônjuge, reembolso mediante nota…" />
            </Field>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Btn>
            <Btn onClick={save}>Salvar convênio</Btn>
          </div>
        </div>
      )}

      <CameraCapture open={camOpen} onClose={() => setCamOpen(false)} onCapture={(url) => setForm((f) => ({ ...f, image: url }))} title="Foto da carteirinha" />
    </div>
  );
}
