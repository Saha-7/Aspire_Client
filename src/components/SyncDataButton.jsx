// src/components/SyncDataButton.jsx
import { useEffect, useRef, useState } from 'react';

// TODO: use the same base URL your other API calls use
const API = import.meta.env.VITE_API_URL || '';

export default function SyncDataButton({ onDone }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const timer = useRef(null);

  const stopPolling = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const poll = () => {
    stopPolling();
    timer.current = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/sync/status`, { credentials: 'include' });
        const s = await res.json();
        if (!s.running) {
          stopPolling();
          setBusy(false);
          if (s.error) {
            setMessage(`Sync failed: ${s.error}`);
          } else {
            setMessage('Sync complete');
            onDone?.(s);
          }
        }
      } catch (e) {
        stopPolling();
        setBusy(false);
        setMessage(`Could not check sync status: ${e.message}`);
      }
    }, 2500);
  };

  // If a sync is already running (started by someone else or the scheduler),
  // pick it up when the page loads
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/sync/status`, { credentials: 'include' });
        const s = await res.json();
        if (s.running) {
          setBusy(true);
          setMessage('Sync in progress…');
          poll();
        }
      } catch { /* ignore */ }
    })();
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    setBusy(true);
    setMessage('Starting sync…');
    try {
      const res = await fetch(`${API}/api/sync/all`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.status === 409) setMessage('A sync is already running…');
      else if (res.ok) setMessage('Sync in progress…');
      else throw new Error(`HTTP ${res.status}`);
      poll();
    } catch (e) {
      setBusy(false);
      setMessage(`Could not start sync: ${e.message}`);
    }
  };

  return (
    <span>
      <button onClick={start} disabled={busy}>
        {busy ? 'Syncing…' : 'Sync data'}
      </button>
      {message && <span style={{ marginLeft: 8 }}>{message}</span>}
    </span>
  );
}