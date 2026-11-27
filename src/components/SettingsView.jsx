// src/components/SettingsView.jsx
// ─────────────────────────────────────────────────────────────
// Full-page Settings panel with four tabs (the last one is admin-only):
//   1. Business Variables — GST, CostOfBusiness, ProfitMargin per category,
//                          overridable per brand (see BusinessVariablesTab.jsx)
//   2. Scraping Config    — ScrapFreqDays, IsScrapEnabled per category
//                          + Global scrape activity banner (everyone)
//                          + Run Scraper button (admin/supervisor only)
//                          + Live log panel (appears when scrape is active)
//   3. Category Mapping   — competitor store slugs -> internal categories
//   4. Salesperson Mapping — read-only category/brand -> salesperson view (admin only)
//
// System defaults shown as placeholders when a value is NULL.
// Saving NULL explicitly reverts to the system default.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import CategoryMappingTab from './CategoryMappingTab';
import SalespersonMappingTab from './SalespersonMappingTab';
import BusinessVariablesTab from './BusinessVariablesTab';
import GlobalCostsControl from './GlobalCostsControl';
import { useToast } from '../context/ToastContext';
import {
  fetchCategorySettings,
  updateCategorySettings,
  getScraperCategories,
  runScraper,
  getScraperJobStatus,
  cancelScraperJob,
  getScraperJobLogs,
  getActiveScraperJobs,
  fetchAppSetting,
  updateAppSetting,
} from '../services/api';

// ── System-wide defaults ──────────────────────────────────────
const SYSTEM_DEFAULTS = {
  GST            : 18,
  CostOfBusiness : 7,
  ProfitMargin   : 5,
  PPLookbackDays : 15,
};

const TABS = { BUSINESS: 'business', SCRAPING: 'scraping', MAPPING: 'mapping' };
const STATUS = { IDLE: 'idle', SAVING: 'saving', SAVED: 'saved', ERROR: 'error' };

// Keep in sync with COMPLETED_LOCK_HOURS in api_server.js
const COMPLETED_LOCK_HOURS = 48;

// ── Formatters ────────────────────────────────────────────────
function fmtDate(val) {
  if (!val) return '—';
  return new Date(val).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Poll global scraper activity — any user, any category ─────
function useActiveScraperJobs(pollMs = 6000) {
  const [activeJobs, setActiveJobs] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const jobs = await getActiveScraperJobs();
        if (!cancelled) setActiveJobs(jobs);
      } catch (err) {
        console.warn('Active scraper jobs poll failed:', err.message);
      }
    }

    poll();
    const interval = setInterval(poll, pollMs);
    return () => { cancelled = true; clearInterval(interval); };
  }, [pollMs]);

  return activeJobs;
}

// ─────────────────────────────────────────────────────────────
// Global Scrape Activity Banner — visible to EVERYONE on Settings,
// not just admin/supervisor. Replaces the static description text
// with live cross-user activity whenever something's running or was
// recently completed/failed.
// ─────────────────────────────────────────────────────────────
function GlobalScrapeActivityBanner() {
  const activeJobs = useActiveScraperJobs();

  function statusLine(job) {
    const who  = job.startedBy || 'Someone';
    const cats = job.categoryNames?.length ? job.categoryNames.join(', ') : '—';
    const when = fmtDate(job.startedAt);

    if (job.status === 'running') {
      return { icon: '🟢', color: 'text-emerald-400',
        text: `${who} started scraping ${cats} at ${when} — still running` };
    }
    if (job.status === 'done') {
      return { icon: '✅', color: 'text-slate-300',
        text: `${who} scraped ${cats} at ${when} — completed (locked for ${COMPLETED_LOCK_HOURS}h)` };
    }
    if (job.status === 'cancelled') {
      return { icon: '🛑', color: 'text-orange-400',
        text: `${who} cancelled a scrape of ${cats} at ${when} — free to retry` };
    }
    return { icon: '❌', color: 'text-red-400',
      text: `${who}'s scrape of ${cats} at ${when} failed — free to retry` };
  }

  return (
    <div className="px-4 py-3 rounded-xl border border-slate-700/60 bg-slate-800/60 mb-3">
      {activeJobs.length === 0 ? (
        <p className="text-sm font-semibold text-white">
          Scrapes all due categories now, regardless of scheduled time. Only scrapes categories configured.
        </p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">
            Scraping activity
          </p>
          {activeJobs.map(job => {
            const line = statusLine(job);
            return (
              <p key={job.jobId} className={`text-sm ${line.color}`}>
                {line.icon} {line.text}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Scraper Control — button + cancel + log panel
// Placed at the top of the Scraping Config tab.
// ─────────────────────────────────────────────────────────────
function ScraperControl({ user, settingsData = [] }) {

  const [availableCategories, setAvailableCategories] = useState([]);
  const [categoryQuery, setCategoryQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState(new Set());
  const logFromRef = useRef(0);

  const [scraperStatus, setScraperStatus] = useState('idle');
  // idle | running | cancelling | done | cancelled | error
  const [jobId,         setJobId]         = useState(null);
  const [msg,           setMsg]           = useState('');
  const [elapsed,       setElapsed]       = useState(0);
  const [logs,          setLogs]          = useState([]);
  const [logFrom,       setLogFrom]       = useState(0);   // incremental fetch
  const [showLogs,      setShowLogs]      = useState(false);

  const pollRef    = useRef(null);
  const timerRef   = useRef(null);
  const logEndRef  = useRef(null);  // auto-scroll anchor

  // ── Global scraper activity — used to block/grey-out categories
  // that another user is currently scraping or completed recently ──
  const activeJobs = useActiveScraperJobs();

  const blockedCategoryMap = useMemo(() => {
    const map = new Map();
    const now = Date.now();
    for (const job of activeJobs) {
      if (!job.categoryNames) continue;
      let blocks = job.status === 'running';
      if (!blocks && job.status === 'done' && job.finishedAt) {
        const hoursSince = (now - new Date(job.finishedAt).getTime()) / 3_600_000;
        blocks = hoursSince < COMPLETED_LOCK_HOURS;
      }
      if (!blocks) continue;
      for (const cat of job.categoryNames) {
        if (!map.has(cat)) map.set(cat, job);
      }
    }
    return map;
  }, [activeJobs]);

  // ── Auto-scroll log to bottom when new lines arrive ────────
  useEffect(() => {
    if (showLogs && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showLogs]);

  // ── Elapsed timer ─────────────────────────────────────────
  function startTimer() {
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
  }
  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }
  function fmtElapsed(s) {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  // ── Cleanup on unmount ────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pollRef.current)  clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    getScraperCategories()
      .then(setAvailableCategories)
      .catch(err => setMsg(err?.response?.data?.error || err.message || 'Failed to load scraper categories'));
  }, []);

  const filteredCategories = availableCategories.filter(category =>
    category.categoryName.toLowerCase().includes(categoryQuery.toLowerCase())
  );

  function toggleCategory(categoryName) {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      next.has(categoryName) ? next.delete(categoryName) : next.add(categoryName);
      return next;
    });
  }

  function selectAllFilteredCategories() {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      filteredCategories.forEach(category => {
        if (!blockedCategoryMap.has(category.categoryName)) next.add(category.categoryName);
      });
      return next;
    });
  }

  function clearSelectedCategories() {
    setSelectedCategories(new Set());
  }

  // ── Start scrape ──────────────────────────────────────────
  async function handleRun() {

    const categoryNames = [...selectedCategories];

    if (categoryNames.length === 0) {
      setMsg('Select at least one category to scrape');
      return;
    }

    if (scraperStatus === 'running' || scraperStatus === 'cancelling') return;

    setScraperStatus('running');
    setMsg('');
    setLogs([]);
    setLogFrom(0);
    setShowLogs(true);
    startTimer();

    try {
      logFromRef.current = 0;
      const response = await runScraper(categoryNames);

      const id = response.jobId;
      if (!id) throw new Error('No job ID returned from server');
      setJobId(id);

      // Poll job status every 4s
      pollRef.current = setInterval(async () => {
        try {
          // Fetch new log lines incrementally
          const logData = await getScraperJobLogs(id, logFromRef.current);

          if (logData.lines && logData.lines.length > 0) {
            setLogs(prev => [...prev, ...logData.lines]);
            setLogFrom(logData.total);
            logFromRef.current = logData.total;
          }

          const job = await getScraperJobStatus(id);

          if (job.status === 'done') {
            clearInterval(pollRef.current);
            stopTimer();
            setScraperStatus('done');
            setMsg('Scrape complete — competitor prices updated');
            setTimeout(() => { setScraperStatus('idle'); setMsg(''); }, 10000);

          } else if (job.status === 'cancelled') {
            clearInterval(pollRef.current);
            stopTimer();
            setScraperStatus('cancelled');
            setMsg('Scrape cancelled — stopped between categories');
            setTimeout(() => { setScraperStatus('idle'); setMsg(''); setElapsed(0); }, 8000);

          } else if (job.status === 'error') {
            clearInterval(pollRef.current);
            stopTimer();
            setScraperStatus('error');
            setMsg(job.error?.substring(0, 120) || 'Scraper failed');
            setTimeout(() => { setScraperStatus('idle'); setMsg(''); setElapsed(0); }, 10000);
          }
        } catch (pollErr) {
          console.warn('Scraper poll error (will retry):', pollErr.message);
        }
      }, 4000);

    } catch (err) {
      stopTimer();
      setScraperStatus('error');
      const data = err?.response?.data;
      if (data?.conflicts?.length) {
        const detail = data.conflicts
          .map(c => `${c.categoryName} (${c.status === 'running' ? `being scraped by ${c.startedBy}` : `done by ${c.startedBy}`})`)
          .join(', ');
        setMsg(`Blocked: ${detail}`);
      } else {
        setMsg((data?.error || err.message || 'Failed to start').substring(0, 160));
      }
      setTimeout(() => { setScraperStatus('idle'); setMsg(''); setElapsed(0); }, 10000);
    }
  }

  // ── Cancel scrape ─────────────────────────────────────────
  async function handleCancel() {
    if (!jobId || scraperStatus !== 'running') return;
    setScraperStatus('cancelling');
    try {
      await cancelScraperJob(jobId);
      setMsg('Cancel requested — finishing current category first...');
    } catch (err) {
      setMsg('Cancel request failed — try again');
      setScraperStatus('running');
    }
  }

  const isActive   = scraperStatus === 'running' || scraperStatus === 'cancelling';
  const isDone     = scraperStatus === 'done';
  const isCancelled = scraperStatus === 'cancelled';
  const isError    = scraperStatus === 'error';

  // ── Log line colorizer ────────────────────────────────────
  function logLineColor(line) {
    if (line.includes('❌') || line.includes('Fatal'))  return 'text-red-400';
    if (line.includes('✅') || line.includes('🎉'))     return 'text-emerald-400';
    if (line.includes('⚠️') || line.includes('⏸️'))    return 'text-amber-400';
    if (line.includes('🛑') || line.includes('Cancel')) return 'text-orange-400';
    if (line.includes('━━━'))                           return 'text-violet-300 font-semibold';
    if (line.includes('🚀') || line.includes('Starting')) return 'text-sky-400';
    return 'text-slate-300';
  }

  function formatLastScraped(isoString) {
    if (!isoString) return null;
    const date = new Date(isoString);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
    });
    // renders as e.g. "13 Jun 26"
  }

  return (
    <div className="mb-6">
      {/* ── Control bar ── */}
      <div className="flex items-center justify-between px-4 py-3
        rounded-xl border border-slate-700/60 bg-slate-800/60 mb-3">

        <div>
          <p className="text-sm font-semibold text-white">
            Select categories below, then run.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Log toggle */}
          {logs.length > 0 && (
            <button
              onClick={() => setShowLogs(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {showLogs ? 'Hide Logs' : `Show Logs (${logs.length})`}
            </button>
          )}

          {/* Cancel button — only when running */}
          {scraperStatus === 'running' && (
            <button
              onClick={handleCancel}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                bg-orange-700/80 hover:bg-orange-600 text-white transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 10h6v4H9z" />
              </svg>
              Stop Scraper
            </button>
          )}

          {/* Cancelling state */}
          {scraperStatus === 'cancelling' && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
              bg-orange-900/50 text-orange-400 border border-orange-700/60">
              <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Stopping...
            </div>
          )}

          {/* Run button */}
          <button
            onClick={handleRun}
            disabled={isActive}
            className={`flex items-center gap-2 px-4 py-1.5 text-xs font-medium rounded-lg
              transition-colors
              ${isActive    ? 'bg-orange-700/60 text-white cursor-not-allowed' :
                isDone      ? 'bg-emerald-600 hover:bg-emerald-500 text-white' :
                isCancelled ? 'bg-slate-600 hover:bg-slate-500 text-white' :
                isError     ? 'bg-red-700 hover:bg-red-600 text-white' :
                              'bg-violet-600 hover:bg-violet-500 text-white'
              }`}
          >
            {/* Icon */}
            {scraperStatus === 'running' ? (
              <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : isDone ? (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : isError ? (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
              </svg>
            )}

            {scraperStatus === 'running'    ? `Scraping… ${fmtElapsed(elapsed)}` :
             scraperStatus === 'cancelling' ? `Stopping…` :
             isDone                         ? '✓ Done' :
             isCancelled                    ? 'Run Again' :
             isError                        ? '✗ Failed — Retry' :
                                             'Run Scraper'}
          </button>
        </div>
      </div>

      {/* ── Category selector ── */}
      <div className="mb-3 rounded-xl border border-slate-700/60 bg-slate-800/60 p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <input
            value={categoryQuery}
            onChange={e => setCategoryQuery(e.target.value)}
            placeholder="Search categories..."
            className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
          />
          <span className="text-xs text-slate-400 whitespace-nowrap">
            {selectedCategories.size} selected
          </span>
        </div>
        <div className="max-h-56 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-2">
          {filteredCategories.map(cat => {
            const settings = settingsData.find(s => s.CategoryName === cat.categoryName);
            const lastScraped = formatLastScraped(settings?.LastScrapedAt);
            const blocker = blockedCategoryMap.get(cat.categoryName);

            return (
              <label
                key={cat.categoryName}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  blocker
                    ? 'border-slate-800 bg-slate-900/40 text-slate-500 cursor-not-allowed'
                    : 'border-slate-700 text-slate-200'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!!blocker}
                  checked={selectedCategories.has(cat.categoryName)}
                  onChange={() => toggleCategory(cat.categoryName)}
                />
                <span className="flex-1 text-sm">{cat.categoryName}</span>
                {blocker && (
                  <span className="text-[10px] text-amber-400 mr-2">
                    🔒 {blocker.status === 'running' ? `${blocker.startedBy} is scraping` : `done by ${blocker.startedBy}`}
                  </span>
                )}
                {lastScraped && !blocker && (
                  <span className="text-xs text-slate-400 mr-2">({lastScraped})</span>
                )}
                <span className="text-xs text-slate-500">{cat.storeCount} stores</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* ── Status message ── */}
      {msg && (
        <p className={`text-xs px-1 mb-3 ${
          isError                        ? 'text-red-400' :
          isCancelled                    ? 'text-orange-400' :
          isDone                         ? 'text-emerald-400' :
                                           'text-slate-400'
        }`}>
          {msg}
        </p>
      )}

      {/* ── Log panel ── */}
      {showLogs && logs.length > 0 && (
        <div className="rounded-xl border border-slate-700/60 overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-3 py-2
            bg-slate-800/80 border-b border-slate-700/60">
            <div className="flex items-center gap-2">
              {/* Live indicator */}
              {isActive ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider">
                    Live
                  </span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                  <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                    {scraperStatus === 'cancelled' ? 'Cancelled' :
                     scraperStatus === 'error'     ? 'Failed' :
                                                     'Completed'}
                  </span>
                </span>
              )}
              <span className="text-[10px] text-slate-600">
                {logs.length} lines
              </span>
            </div>
            <button
              onClick={() => setShowLogs(false)}
              className="text-slate-600 hover:text-slate-400 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Log lines */}
          <div className="h-72 overflow-y-auto bg-[#0a0d14] p-3 font-mono text-[11px] leading-relaxed">
            {logs.map((line, i) => (
              <div key={i} className={logLineColor(line)}>
                {line}
              </div>
            ))}
            {/* Blinking cursor while live */}
            {isActive && (
              <span className="inline-block w-1.5 h-3 bg-violet-400 ml-0.5 animate-pulse" />
            )}
            {/* Scroll anchor */}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Scraping Config Row (unchanged)
// ─────────────────────────────────────────────────────────────
function ScrapingRow({ row, onSaved }) {
  const [editing, setEditing]   = useState(false);
  const [freqVal, setFreqVal]   = useState('');
  const [enabled, setEnabled]   = useState(true);
  const [status, setStatus]     = useState(STATUS.IDLE);
  const [errMsg, setErrMsg]     = useState('');

  function handleEdit() {
    setFreqVal(row.ScrapFreqDays ?? 7);
    setEnabled(row.IsScrapEnabled ?? true);
    setEditing(true);
    setStatus(STATUS.IDLE);
    setErrMsg('');
  }

  function handleCancel() {
    setEditing(false);
    setStatus(STATUS.IDLE);
  }

  async function handleSave() {
    const freq = parseInt(freqVal);
    if (isNaN(freq) || freq < 1 || freq > 365) {
      setErrMsg('Frequency must be 1–365 days');
      return;
    }

    setStatus(STATUS.SAVING);
    setErrMsg('');

    try {
      const payload = {
        GST           : row.GST,
        CostOfBusiness: row.CostOfBusiness,
        ProfitMargin  : row.ProfitMargin,
        ScrapFreqDays : freq,
        IsScrapEnabled: enabled,
      };

      const updated = await updateCategorySettings(row.CategoryName, payload);
      setEditing(false);
      setStatus(STATUS.SAVED);
      onSaved(updated);
      setTimeout(() => setStatus(STATUS.IDLE), 3000);
    } catch (err) {
      setStatus(STATUS.ERROR);
      setErrMsg(err?.response?.data?.error || err.message || 'Save failed');
    }
  }

  const isEnabled = row.IsScrapEnabled === true || row.IsScrapEnabled === 1;

  return (
    <tr className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
      <td className="px-4 py-3 text-left">
        <span className="font-medium text-slate-200 text-sm">{row.CategoryName}</span>
      </td>
      <td className="px-4 py-3 text-center">
        {editing ? (
          <button onClick={() => setEnabled(v => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? 'bg-emerald-600' : 'bg-slate-600'}`}>
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : 'translate-x-1'}`} />
          </button>
        ) : (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium
            ${isEnabled
              ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700/60'
              : 'bg-slate-700/50 text-slate-500 border border-slate-600/60'
            }`}>
            {isEnabled ? '● Active' : '○ Paused'}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        {editing ? (
          <div className="flex items-center justify-center gap-1.5">
            <input type="number" min="1" max="365" value={freqVal} onChange={e => setFreqVal(e.target.value)}
              className="w-16 px-2 py-1 text-xs text-slate-100 bg-slate-700 border border-slate-600 rounded-lg outline-none text-center focus:border-violet-500
                [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
            <span className="text-slate-500 text-xs">days</span>
          </div>
        ) : (
          <span className="text-slate-200 text-sm font-medium">
            {row.ScrapFreqDays ?? 7}
            <span className="text-slate-500 text-xs ml-1">days</span>
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-slate-500 text-xs">{fmtDate(row.NextScrapDueAt)}</span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-slate-500 text-xs">{fmtDate(row.LastScrapedAt)}</span>
      </td>
      <td className="px-4 py-3 text-center">
        {row.UpdatedBy ? (
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-slate-300 text-[11px]">{row.UpdatedBy}</span>
            <span className="text-slate-600 text-[10px]">{fmtDate(row.UpdatedAt)}</span>
          </div>
        ) : (
          <span className="text-slate-600 text-xs">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        {editing ? (
          <div className="flex flex-col items-center gap-1.5">
            {errMsg && <span className="text-[10px] text-red-400">{errMsg}</span>}
            <div className="flex items-center gap-1.5">
              <button onClick={handleSave} disabled={status === STATUS.SAVING}
                className="px-2.5 py-1 text-[10px] font-medium rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white transition-colors">
                {status === STATUS.SAVING ? 'Saving…' : 'Save'}
              </button>
              <button onClick={handleCancel} disabled={status === STATUS.SAVING}
                className="px-2.5 py-1 text-[10px] font-medium rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <button onClick={handleEdit}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </button>
            {status === STATUS.SAVED && <span className="text-[10px] text-emerald-400">✓ Saved</span>}
          </div>
        )}
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────
// Variance Threshold control — editable global setting used by
// /api/push-to-shopify to decide when to show the confirm modal.
// Stored in AppSettings as a decimal (0.20), shown/edited here as
// a whole percentage (20).
// ─────────────────────────────────────────────────────────────
function VarianceThresholdControl() {
  const { showToast } = useToast();
  const [input, setInput]     = useState('');
  const [saved, setSaved]     = useState('');      // last saved value, to know if the input changed
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [meta, setMeta]       = useState(null);

  useEffect(() => {
    fetchAppSetting('VARIANCE_THRESHOLD')
      .then(data => {
        const num = parseFloat(data.SettingValue);
        const v = isNaN(num) ? '' : (num * 100).toFixed(0);
        setInput(v);
        setSaved(v);
        setMeta(data);
      })
      .catch(() => showToast({
        type: 'error',
        title: 'Could not load price variance alert',
        message: 'Check the API server and refresh the page.',
      }))
      .finally(() => setLoading(false));
  }, [showToast]);

  async function handleSave() {
    const pct = parseFloat(input);
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      setInvalid(true);
      showToast({ type: 'error', title: 'Invalid threshold', message: 'Enter a value between 1 and 100.' });
      return;
    }
    setInvalid(false);
    setSaving(true);
    try {
      const data = await updateAppSetting('VARIANCE_THRESHOLD', (pct / 100).toFixed(4));
      setMeta(data);
      setSaved(String(input));
      showToast({ type: 'success', title: 'Saved successfully', message: `Price variance alert threshold set to ${pct}%.` });
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Could not save threshold',
        message: err?.response?.data?.error || err.message || 'Something went wrong. Please try again.',
      });
    } finally {
      setSaving(false);
    }
  }

  const dirty = input !== saved;

  return (
    <section className="mb-6 flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4
      md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-start gap-3.5">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-violet-500/10
          text-violet-400 ring-1 ring-inset ring-violet-500/20">
          <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.7}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
          </svg>
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-100">Price variance alert</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
            Ask for confirmation before pushing a price to Shopify when the variance exceeds this threshold.
          </p>
          {meta?.UpdatedBy && (
            <p className="mt-1.5 text-[11px] text-slate-500">
              Last updated by <span className="text-slate-400">{meta.UpdatedBy}</span> · {fmtDate(meta.UpdatedAt)}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-3">
        <label htmlFor="variance-threshold" className="sr-only">Variance threshold in percent</label>
        <div className="relative">
          <input
            id="variance-threshold"
            type="number"
            min="1"
            max="100"
            value={input}
            disabled={loading}
            onChange={e => { setInput(e.target.value); setInvalid(false); }}
            onKeyDown={e => { if (e.key === 'Enter' && dirty && !saving) handleSave(); }}
            className={`w-24 rounded-lg border bg-slate-800 py-1.5 pl-3 pr-8 text-sm text-slate-100 outline-none transition-colors
              disabled:opacity-50 focus:ring-2
              [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
              ${invalid
                ? 'border-red-500/70 focus:border-red-500 focus:ring-red-500/20'
                : 'border-slate-700 focus:border-violet-500 focus:ring-violet-500/20'}`}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">%</span>
        </div>
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

// ─────────────────────────────────────────────────────────────
// Main SettingsView
// ─────────────────────────────────────────────────────────────
export default function SettingsView({ onClose, user }) {
  const [activeTab, setActiveTab] = useState(TABS.BUSINESS);
  const [data, setData]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchCategorySettings();
      setData(rows);
    } catch (err) {
      setError('Failed to load settings. Check the API server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function handleRowSaved(updated) {
    setData(prev => prev.map(row =>
      row.CategoryName === updated.CategoryName ? { ...row, ...updated } : row
    ));
  }

  // Is current user admin or supervisor?
  const canRunScraper = user?.role === 'admin' || user?.role === 'supervisor';

  // Admin/supervisor see every tab. Salespeople see Business Variables (limited by
  // the server to their assigned brands) and Category Mapping (full access).
  const canManage = canRunScraper;

  // Salesperson Mapping tab is admin-only (the API route is also admin-only)
  const isAdmin = user?.role === 'admin';

  return (
    <div className="min-h-screen bg-[#0f1117] font-sans">

      {/* ── Header ── */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-6 pr-16 sm:pr-20 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <div className="w-px h-5 bg-slate-700" />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-slate-600 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-base font-bold text-white tracking-tight">Settings</h1>
                <p className="text-xs text-slate-500">Category and brand configuration</p>
              </div>
            </div>
          </div>

          <button onClick={loadData} disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg
              bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white transition-colors">
            <svg className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="flex gap-0 border-b border-slate-800 -mb-px">
            {[
              {
                key: TABS.BUSINESS,
                label: 'Business Variables',
                icon: (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                ),
              },
              {
                key: TABS.SCRAPING,
                label: 'Scraping Config',
                icon: (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ),
              },
              {
                key: TABS.MAPPING,
                label: 'Category Mapping',
                icon: (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                ),
              },
              ...(isAdmin ? [{
                key: TABS.SALES_MAP,
                label: 'Salesperson Mapping',
                icon: (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                ),
              }] : []),
            ].filter(tab => canManage || tab.key === TABS.BUSINESS || tab.key === TABS.MAPPING).map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors
                  ${activeTab === tab.key
                    ? 'border-violet-500 text-violet-400'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}>
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-8">

        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 text-sm">Loading settings...</p>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-red-900/30 border border-red-700/50 text-red-400 text-sm">{error}</div>
        )}

        {/* ── Business Variables Tab ── */}
        {!loading && !error && activeTab === TABS.BUSINESS && (
          <>
            {canManage && <VarianceThresholdControl />}

            {canManage && <GlobalCostsControl />}

            <BusinessVariablesTab
              categorySettings={data}
              onCategorySettingsSaved={handleRowSaved}
              ppLookbackDefault={SYSTEM_DEFAULTS.PPLookbackDays}
            />
          </>
        )}

        {/* ── Scraping Config Tab ── */}
        {!loading && !error && canManage && activeTab === TABS.SCRAPING && (
          <>
            {/* Global scraping activity — visible to everyone */}
            <GlobalScrapeActivityBanner />

            {/* Run Scraper control — admin/supervisor only */}
            {canRunScraper && <ScraperControl user={user} settingsData={data} />}

            {/* Info notice */}
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-slate-800/60
              border border-slate-700/60 mb-5 text-xs text-slate-400">
              <svg className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                Controls how often the scheduler scrapes competitor prices for each category.
                Pausing a category skips it entirely in the next scheduler run.
                <span className="text-slate-200 font-medium"> Next scrape due</span> and
                <span className="text-slate-200 font-medium"> Last scraped</span> timestamps
                are updated automatically after each run.
              </span>
            </div>

            <div className="rounded-xl border border-slate-700/60 shadow-2xl overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-800/80 border-b border-slate-700">
                    {['Category', 'Status', 'Scrape Frequency', 'Next Scrape Due', 'Last Scraped', 'Last Updated By', 'Action'].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider first:text-left text-center">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map(row => (
                    <ScrapingRow key={row.CategoryName} row={row} onSaved={handleRowSaved} />
                  ))}
                </tbody>
              </table>
            </div>
          </>

        )}

        {/* ── Category Mapping Tab ── */}
        <div style={{ display: activeTab === TABS.MAPPING ? 'block' : 'none' }}>
          <CategoryMappingTab active={activeTab === TABS.MAPPING} />
        </div>

        {/* ── Salesperson Mapping Tab (admin only, read-only) ── */}
        {isAdmin && activeTab === TABS.SALES_MAP && <SalespersonMappingTab />}

      </main>
    </div>
  );
}