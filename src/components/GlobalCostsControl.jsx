// src/components/GlobalCostsControl.jsx
// ─────────────────────────────────────────────────────────────
// Settings → Business Variables: the GLOBAL costs used in every Recommended SP
// (same for all products, no category/brand override):
//   • Shopify platform fee   (% of selling price)
//   • Payment gateway        (% of selling price)
//   • Packing cost           (₹ per product)
//   • Shipping rate          (₹ per kg)
//   • Minimum shipping       (₹ — shipping is never below this)
//
// Values live in dbo.AppSettings (one row each) and are saved through the same
// /api/app-settings/:key route as the variance threshold (admin/supervisor,
// audited). Shipping is only added to a price once product weight data exists.
//
// To add another global cost later: add a row to FIELDS (+ the AppSettings row
// and the server-side map in businessVariablesService.js).
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext';
import { fetchAppSetting, updateAppSetting } from '../services/api';

const FIELDS = [
  { key: 'SHOPIFY_FEE_PCT',      label: 'Shopify platform fee', suffix: '%',    hint: 'of selling price', max: 50 },
  { key: 'PAYMENT_GATEWAY_PCT',  label: 'Payment gateway',      suffix: '%',    hint: 'of selling price', max: 50 },
  { key: 'PACKING_COST',         label: 'Packing cost',         suffix: '₹',    hint: 'per product',      max: 100000 },
  { key: 'SHIPPING_RATE_PER_KG', label: 'Shipping rate',        suffix: '₹/kg', hint: 'per kg of weight', max: 100000 },
  { key: 'SHIPPING_MIN_COST',    label: 'Minimum shipping',     suffix: '₹',    hint: 'never below this', max: 100000 },
];

function fmtDate(val) {
  if (!val) return '';
  const d = new Date(val);
  return isNaN(d) ? '' : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function GlobalCostsControl() {
  const { showToast } = useToast();
  const [inputs, setInputs]   = useState({});   // what is typed
  const [saved, setSaved]     = useState({});   // last saved values
  const [meta, setMeta]       = useState({});   // key -> { UpdatedBy, UpdatedAt }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [invalid, setInvalid] = useState({});

  useEffect(() => {
    let alive = true;
    Promise.allSettled(FIELDS.map((f) => fetchAppSetting(f.key))).then((results) => {
      if (!alive) return;
      const vals = {};
      const info = {};
      let failed = 0;
      results.forEach((r, i) => {
        const key = FIELDS[i].key;
        if (r.status === 'fulfilled') {
          const num = parseFloat(r.value.SettingValue);
          vals[key] = isNaN(num) ? '' : String(num);
          info[key] = r.value;
        } else {
          vals[key] = '';
          failed += 1;
        }
      });
      setInputs(vals);
      setSaved(vals);
      setMeta(info);
      setLoading(false);
      if (failed > 0) {
        showToast({
          type: 'error',
          title: 'Could not load some global costs',
          message: 'Check that the AppSettings rows exist (run the SQL script) and refresh.',
        });
      }
    });
    return () => { alive = false; };
  }, [showToast]);

  const dirtyKeys = FIELDS.filter((f) => inputs[f.key] !== saved[f.key]).map((f) => f.key);
  const dirty = dirtyKeys.length > 0;

  // Latest "last updated" across all five rows
  const latest = Object.values(meta)
    .filter((m) => m?.UpdatedAt)
    .sort((a, b) => new Date(b.UpdatedAt) - new Date(a.UpdatedAt))[0];

  async function handleSave() {
    // validate the changed fields
    const bad = {};
    for (const f of FIELDS) {
      if (!dirtyKeys.includes(f.key)) continue;
      const n = parseFloat(inputs[f.key]);
      if (isNaN(n) || n < 0 || n > f.max) bad[f.key] = true;
    }
    const fee = parseFloat(inputs.SHOPIFY_FEE_PCT) + parseFloat(inputs.PAYMENT_GATEWAY_PCT);
    if (!(fee < 100)) { bad.SHOPIFY_FEE_PCT = true; bad.PAYMENT_GATEWAY_PCT = true; }
    if (Object.keys(bad).length) {
      setInvalid(bad);
      showToast({
        type: 'error',
        title: 'Invalid value',
        message: 'Enter a number of 0 or more. The two percentages must be below 100% in total.',
      });
      return;
    }
    setInvalid({});
    setSaving(true);
    try {
      const nextMeta = { ...meta };
      const nextSaved = { ...saved };
      for (const key of dirtyKeys) {
        const data = await updateAppSetting(key, String(parseFloat(inputs[key])));
        nextMeta[key]  = data;
        nextSaved[key] = inputs[key];
      }
      setMeta(nextMeta);
      setSaved(nextSaved);
      showToast({
        type: 'success',
        title: 'Saved successfully',
        message: 'Global costs updated. Prices pick them up when the tables reload — press Recalculate SP to refresh the Intelligence table now.',
      });
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Could not save global costs',
        message: err?.response?.data?.error || err.message || 'Something went wrong. Please try again.',
      });
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setInputs(saved);
    setInvalid({});
  }

  return (
    <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
      <div className="flex min-w-0 items-start gap-3.5">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-violet-500/10
          text-violet-400 ring-1 ring-inset ring-violet-500/20">
          <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.7}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-100">Global costs</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
            Added to every Recommended SP, same for all products. GST, cost of business and profit margin
            stay in the category / brand table below. Shipping is applied only once product weight data is available.
          </p>
          {latest?.UpdatedBy && (
            <p className="mt-1.5 text-[11px] text-slate-500">
              Last updated by <span className="text-slate-400">{latest.UpdatedBy}</span> · {fmtDate(latest.UpdatedAt)}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {FIELDS.map((f) => (
          <div key={f.key} className="flex flex-col gap-1">
            <label htmlFor={`gc-${f.key}`} className="text-xs font-medium text-slate-300">{f.label}</label>
            <div className="relative">
              <input
                id={`gc-${f.key}`}
                type="number"
                min="0"
                step="any"
                value={inputs[f.key] ?? ''}
                disabled={loading || saving}
                onChange={(e) => {
                  setInputs((p) => ({ ...p, [f.key]: e.target.value }));
                  setInvalid((p) => ({ ...p, [f.key]: false }));
                }}
                onKeyDown={(e) => { if (e.key === 'Enter' && dirty && !saving) handleSave(); }}
                className={`w-full rounded-lg border bg-slate-800 py-1.5 pl-3 pr-12 text-sm text-slate-100 outline-none transition-colors
                  disabled:opacity-50 focus:ring-2
                  [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
                  ${invalid[f.key]
                    ? 'border-red-500/70 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-slate-700 focus:border-violet-500 focus:ring-violet-500/20'}`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                {f.suffix}
              </span>
            </div>
            <span className="text-[11px] text-slate-500">{f.hint}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        {dirty && (
          <button
            onClick={handleCancel}
            disabled={saving}
            className="rounded-lg bg-slate-800 px-4 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700">
            Cancel
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving || loading || !dirty}
          className="rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-medium text-white transition-colors
            hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </section>
  );
}