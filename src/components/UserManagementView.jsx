import { useEffect, useState } from 'react';
import { fetchUsers, addUser, removeUser } from '../services/api';

const ROLE_LABELS = { admin: 'Admin', supervisor: 'Supervisor', sales: 'Sales Executive' };
const ROLE_COLORS = {
  admin      : 'bg-purple-900/40 text-purple-400 border-purple-700/50',
  supervisor : 'bg-teal-900/40 text-teal-400 border-teal-700/50',
  sales      : 'bg-amber-900/40 text-amber-400 border-amber-700/50',
};

function fmtDate(val) {
  if (!val) return '—';
  return new Date(val).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function UserManagementView({ onClose, user }) {
  const [users, setUsers]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [email, setEmail]         = useState('');
  const [role, setRole]           = useState('sales');
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState(null);
  const [removingEmail, setRemovingEmail] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch {
      setError('Failed to load users.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await addUser(email.trim().toLowerCase(), role);
      setSaveMsg({ type: 'success', text: `${email.trim().toLowerCase()} added as ${ROLE_LABELS[role]}` });
      setEmail('');
      await load();
    } catch (err) {
      setSaveMsg({ type: 'error', text: err?.response?.data?.error || 'Failed to add user' });
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(targetEmail) {
    if (!confirm(`Remove access for ${targetEmail}?`)) return;
    setRemovingEmail(targetEmail);
    try {
      await removeUser(targetEmail);
      setUsers(prev => prev.filter(u => u.Email !== targetEmail));
    } catch (err) {
      alert(err?.response?.data?.error || 'Failed to remove user');
    } finally {
      setRemovingEmail(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#0f1117] font-sans">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-[900px] mx-auto px-6 py-4 flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
              bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className="w-px h-5 bg-slate-700" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-sky-600/80 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold text-white">User Management</h1>
              <p className="text-xs text-slate-500">Add users by email · assign roles · remove access</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-6 py-8 space-y-8">

        {/* Add user form */}
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Add or update a user</h2>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs text-slate-400 mb-1.5">Microsoft account email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@tpscompany.com"
                className="w-full px-3 py-2 text-sm text-slate-100 bg-slate-800 border border-slate-600
                  rounded-lg outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Role</label>
              <select
                value={role}
                onChange={e => setRole(e.target.value)}
                className="px-3 py-2 text-sm text-slate-100 bg-slate-800 border border-slate-600
                  rounded-lg outline-none focus:border-sky-500 appearance-none cursor-pointer"
              >
                <option value="admin">Admin</option>
                <option value="supervisor">Supervisor</option>
                <option value="sales">Sales Executive</option>
              </select>
            </div>
            <button
              onClick={handleAdd}
              disabled={saving || !email.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
                bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white transition-colors"
            >
              {saving ? 'Saving…' : '+ Add user'}
            </button>
          </div>

          {saveMsg && (
            <p className={`mt-3 text-xs ${saveMsg.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
              {saveMsg.type === 'success' ? '✓ ' : '✗ '}{saveMsg.text}
            </p>
          )}

          <p className="mt-4 text-xs text-slate-500">
            If the email already exists, their role will be updated instead.
            The user must sign in with this exact Microsoft account email.
          </p>
        </div>

        {/* Users table */}
        <div>
          <h2 className="text-sm font-semibold text-white mb-3">
            Current users {!loading && `(${users.length})`}
          </h2>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-8 justify-center">
              <div className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
              Loading...
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-900/30 border border-red-700/50 text-red-400 text-sm">{error}</div>
          )}

          {!loading && !error && (
            <div className="rounded-xl border border-slate-700/60 overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-800/80 border-b border-slate-700">
                    {['Email', 'Role', 'Added by', 'Added on', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-left last:text-center">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={u.Email}
                      className={`border-b border-slate-800 ${i % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900/20'}`}
                    >
                      <td className="px-4 py-3 text-xs text-slate-200 font-mono">{u.Email}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${ROLE_COLORS[u.Role] ?? ''}`}>
                          {ROLE_LABELS[u.Role] ?? u.Role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">{u.AddedBy}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{fmtDate(u.AddedAt)}</td>
                      <td className="px-4 py-3 text-center">
                        {u.Email === user.email ? (
                          <span className="text-xs text-slate-600 italic">you</span>
                        ) : (
                          <button
                            onClick={() => handleRemove(u.Email)}
                            disabled={removingEmail === u.Email}
                            className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                          >
                            {removingEmail === u.Email ? 'Removing…' : 'Remove'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}