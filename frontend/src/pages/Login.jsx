import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Login() {
  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(mobileNumber, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={handleSubmit} style={{ background: 'var(--color-surface)', padding: '2.5em', borderRadius: 6, width: 340, border: '1px solid var(--color-border)' }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Ranikuthi</h1>
        <p style={{ color: 'var(--color-text-muted)', marginTop: 0, marginBottom: '1.5em', fontSize: 14 }}>Sign in with your registered mobile number.</p>

        <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Mobile Number</label>
        <input
          type="tel"
          value={mobileNumber}
          onChange={(e) => setMobileNumber(e.target.value)}
          required
          style={{ marginBottom: '1em' }}
        />

        <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ marginBottom: '1.2em' }}
        />

        <button type="submit" className="btn-primary" disabled={submitting} style={{ width: '100%' }}>
          {submitting ? 'Signing in…' : 'Sign In'}
        </button>

        {error && <p className="error-text">{error}</p>}
      </form>
    </div>
  );
}