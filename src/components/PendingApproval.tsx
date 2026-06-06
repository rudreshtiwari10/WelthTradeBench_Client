import { useState } from 'react';
import { useAuthStore } from '../state/authStore';
import './PendingApproval.css';

export function PendingApproval() {
  const { user, logout } = useAuthStore();
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);

  const checkStatus = async () => {
    setChecking(true);
    setChecked(false);
    await useAuthStore.getState().init();
    setChecking(false);
    setChecked(true);
  };

  return (
    <div className="pending-root">
      <div className="pending-card">
        <div className="pending-icon">⏳</div>
        <h2>Account Pending Approval</h2>
        <p>
          Your account <strong>{user?.email}</strong> has been created and is
          awaiting admin approval before you can access the platform.
        </p>
        <p className="pending-sub">
          An admin will review and approve your account. Once approved, you can
          log in and start using WelthTradeBench with full cloud sync.
        </p>

        {checked && (
          <div className="pending-notice">
            Still pending — please check back later.
          </div>
        )}

        <div className="pending-actions">
          <button className="pending-btn primary" onClick={checkStatus} disabled={checking}>
            {checking ? 'Checking…' : 'Check Approval Status'}
          </button>
          <button className="pending-btn secondary" onClick={logout}>
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
