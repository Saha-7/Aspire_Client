// src/components/PriceTable.jsx
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import StatusBadge    from './StatusBadge';
import RefreshButton  from './RefreshButton';
import CompetitorCell from './CompetitorCell';
import TakeActionCell from './TakeActionCell';
import { pricingBreakdownLines, rowToBreakdown } from '../utils/pricingTooltip';

const fmt = (val) =>
  val != null
    ? '₹' + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })
    : '—';

export default function PriceTable({ data: initialData }) {
  const [rows, setRows]               = useState(initialData);
  const [competitorCache, setCompetitorCache] = useState({});

  useMemo(() => setRows(initialData), [initialData]);

  function handleRowRefreshed(skuId, result) {
    setRows(prev => prev.map(row => {
      if (row.SKU_ID !== skuId) return row;
      return {
        ...row,
        CompetitorPrice : result.newCompetitorPrice ?? row.CompetitorPrice,
        RecommendedSP   : result.newRecommendedSP   ?? row.RecommendedSP,
        // Extra profit = how far the new price sits above the floor (BaseFloor comes from the server)
        ExtraProfitPct  : (row.BaseFloor > 0 && result.newRecommendedSP != null)
          ? parseFloat((((result.newRecommendedSP - row.BaseFloor) / row.BaseFloor) * 100).toFixed(2))
          : row.ExtraProfitPct,
      };
    }));

    // Invalidate the competitor cache for this SKU so next hover re-fetches fresh data
    setCompetitorCache(prev => {
      const next = { ...prev };
      delete next[skuId];
      return next;
    });
  }

  const columns = useMemo(() => [
    // ── # index column removed ──────────────────────────────

    {
      accessorKey: 'SKU_ID',
      header: 'Product SKU',
      cell: (info) => (
        <span className="font-mono text-xs text-violet-300 break-all">{info.getValue()}</span>
      ),
    },
    {
      accessorKey: 'Title',
      header: 'Title',
      cell: (info) => (
        <span className="text-slate-200 text-xs leading-snug">{info.getValue()}</span>
      ),
    },
    {
      accessorKey: 'PP',
      header: 'PP (₹)',
      cell: (info) => (
        <span className="text-slate-300 font-medium text-xs">{fmt(info.getValue())}</span>
      ),
    },
    {
      accessorKey: 'SP',
      header: 'Current SP (₹)',
      cell: (info) => (
        <span className="text-slate-300 text-xs">{fmt(info.getValue())}</span>
      ),
    },
    {
      accessorKey: 'RecommendedSP',
      header: 'Recommended SP (₹)',
      cell: (info) => {
        const row   = info.row.original;
        const lines = pricingBreakdownLines(rowToBreakdown(row));
        return (
          <div className="relative group inline-block">
            <span className="text-emerald-400 font-semibold text-xs cursor-default">
              {fmt(info.getValue())}
            </span>
            <div className="
              absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2
              px-2.5 py-1.5 rounded-lg bg-slate-700 border border-slate-600
              text-xs text-slate-200 whitespace-nowrap shadow-xl
              opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150
            ">
              <div className="font-semibold text-slate-100 mb-0.5">Includes</div>
              {lines.map((line) => <div key={line}>{line}</div>)}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-600" />
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'ExtraProfitPct',
      header: 'Extra Profit',
      cell: (info) => {
        const val = info.getValue();
        if (val == null || val <= 0) return <span className="text-slate-500">—</span>;
        return (
          <span className="inline-flex items-center justify-center gap-1 text-amber-400 font-semibold text-xs">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd"
                d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z"
                clipRule="evenodd" />
            </svg>
            +{Number(val).toFixed(2)}%
          </span>
        );
      },
    },
    {
      // Replaces the old flat CompetitorPrice + Link columns
      id    : 'competitorCell',
      header: 'Competitor Price (₹)',
      cell  : (info) => {
        const row = info.row.original;
        return (
          <CompetitorCell
            skuId                 = {row.SKU_ID}
            competitorPrice       = {row.CompetitorPrice}
            storeName             = {row.StoreName}
            competitorUrl         = {row.CompetitorURL}
            competitorStockStatus = {row.CompetitorStockStatus}
            cache                 = {competitorCache}
            setCache              = {setCompetitorCache}
          />
        );
      },
    },
    {
      accessorKey: 'CompetitorStockStatus',
      header: 'Comp. Stock',
      cell: (info) => <StatusBadge status={info.getValue()} />,
    },

// New Push to Shopify

    {
      id    : 'takeAction',
      header: 'Take Action',
      cell  : (info) => {
        const row = info.row.original;
        return (
          <TakeActionCell
            skuId         = {row.SKU_ID}
            recommendedSP = {row.RecommendedSP}
            onPushed      = {(skuId, result) => {
              setRows(prev => prev.map(r => r.SKU_ID === skuId ? { ...r, RecommendedSP: result.RecommendedSP } : r));
            }}
          />
        );
      },
    },



    {
      id    : 'refresh',
      header: 'Refresh',
      cell  : (info) => {
        const row = info.row.original;
        return (
          <RefreshButton
            skuId         = {row.SKU_ID}
            competitorUrl = {row.CompetitorURL}
            onRefreshed   = {handleRowRefreshed}
          />
        );
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [competitorCache]);

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    // overflow-visible is required so the tooltip/expand panel
    // is not clipped by the table's rounded border
    <div className="rounded-xl border border-slate-700/60 shadow-2xl overflow-visible">
      <table className="w-full text-sm border-collapse table-fixed">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="bg-slate-800/80 border-b border-slate-700">
              {headerGroup.headers.map((header) => (
                <th key={header.id}
                  className="px-2 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, i) => (
            <tr key={row.id}
              className={`border-b border-slate-800 transition-colors
                ${i % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900/20'} hover:bg-slate-800/50`}
              style={{ verticalAlign: 'middle' }}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-2 py-3 text-center align-middle relative">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}