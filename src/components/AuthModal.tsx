import { useState } from 'react';
import { useAuthStore } from '../state/authStore';
import './AuthModal.css';

interface Props {
  onClose: () => void;
}

export function AuthModal({ onClose }: Props) {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, register, loading, error } = useAuthStore();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (tab === 'login') await login(email, password);
      else await register(email, password);
      onClose();
    } catch {
      // error is set in store
    }
  };

  return (
    <div className="auth-backdrop" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <button className="auth-close" onClick={onClose}>×</button>
        <div className="auth-brand">WelthTradeBench</div>

        <div className="auth-tabs">
          <button
            className={tab === 'login' ? 'active' : ''}
            onClick={() => { setTab('login'); useAuthStore.setState({ error: null }); }}
          >
            Login
          </button>
          <button
            className={tab === 'register' ? 'active' : ''}
            onClick={() => { setTab('register'); useAuthStore.setState({ error: null }); }}
          >
            Register
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="auth-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>
          <div className="auth-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={tab === 'register' ? 'At least 6 characters' : ''}
              required
              minLength={6}
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? 'Please wait…' : tab === 'login' ? 'Login' : 'Create Account'}
          </button>
        </form>

        <p className="auth-switch">
          {tab === 'login' ? (
            <>No account? <button type="button" onClick={() => setTab('register')}>Register free</button></>
          ) : (
            <>Already have an account? <button type="button" onClick={() => setTab('login')}>Login</button></>
          )}
        </p>
      </div>
    </div>
  );
}
