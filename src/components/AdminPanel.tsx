import { useEffect, useState } from 'react';
import { apiFetch } from '../api/client';
import './AdminPanel.css';

interface AdminUser {
  id: string;
  email: string;
  approved: boolean;
  is_admin: boolean;
  created_at: string;
}

interface Props {
  onClose: () => void;
}

export function AdminPanel({ onClose }: Props) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/users');
      if (res.ok) setUsers(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const approve = async (id: string) => {
    setBusy(id);
    await apiFetch(`/api/admin/users/${id}/approve`, { method: 'POST' });
    await fetchUsers();
    setBusy(null);
  };

  const reject = async (id: string) => {
    setBusy(id);
    await apiFetch(`/api/admin/users/${id}/reject`, { method: 'POST' });
    await fetchUsers();
    setBusy(null);
  };

  const pending = users.filter((u) => !u.approved && !u.is_admin);
  const approved = users.filter((u) => u.approved && !u.is_admin);
  const admins = users.filter((u) => u.is_admin);

  return (
    <div className="admin-backdrop" onClick={onClose}>
      <div className="admin-panel" onClick={(e) => e.stopPropagation()}>
        <div className="admin-header">
          <div>
            <div className="admin-title">User Management</div>
            <div className="admin-subtitle">
              {pending.length} pending · {approved.length} approved · {users.length} total
            </div>
          </div>
          <button className="admin-close" onClick={onClose}>×</button>
        </div>

        {loading ? (
          <div className="admin-loading">Loading users…</div>
        ) : (
          <div className="admin-body">
            {pending.length > 0 && (
              <section>
                <div className="admin-section-title pending-title">
                  ⏳ Pending Approval ({pending.length})
                </div>
                {pending.map((u) => (
                  <div key={u.id} className="admin-row">
                    <div className="admin-user-info">
                      <span className="admin-email">{u.email}</span>
                      <span className="admin-date">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : ''}
                      </span>
                    </div>
                    <div className="admin-actions">
                      <button
                        className="admin-btn approve"
                        onClick={() => approve(u.id)}
                        disabled={busy === u.id}
                      >
                        {busy === u.id ? '…' : 'Approve'}
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            )}

            {approved.length > 0 && (
              <section>
                <div className="admin-section-title approved-title">
                  ✓ Approved Users ({approved.length})
                </div>
                {approved.map((u) => (
                  <div key={u.id} className="admin-row">
                    <div className="admin-user-info">
                      <span className="admin-email">{u.email}</span>
                      <span className="admin-date">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : ''}
                      </span>
                    </div>
                    <div className="admin-actions">
                      <button
                        className="admin-btn revoke"
                        onClick={() => reject(u.id)}
                        disabled={busy === u.id}
                      >
                        {busy === u.id ? '…' : 'Revoke'}
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            )}

            {admins.length > 0 && (
              <section>
                <div className="admin-section-title admin-title-row">
                  ★ Admins
                </div>
                {admins.map((u) => (
                  <div key={u.id} className="admin-row">
                    <div className="admin-user-info">
                      <span className="admin-email">{u.email}</span>
                      <span className="admin-badge">Admin</span>
                    </div>
                  </div>
                ))}
              </section>
            )}

            {users.length === 0 && (
              <div className="admin-empty">No users registered yet.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
