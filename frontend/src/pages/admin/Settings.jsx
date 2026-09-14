import { useState, useEffect } from 'react';
import { apiRequest } from '../../api/client';
import { useAuth } from '../../auth/AuthContext

const SETTING_OPTIONS = {function renderInput() {
  BILLING_RATE_MODE: ['PER_SQFT', 'GLOBAL_FLAT'],
  PENALTY_MODE: ['FLAT_RATE', 'PERCENTAGE', 'PER_DAY'],
};

function SettingRow({ setting, currentRole, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(setting.setting_value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const canEdit = !setting.editable_by_role || setting.editable_by_role === currentRole;

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      await apiRequest(`/settings/${setting.setting_key}`, { method: 'PATCH', body: { value } });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function renderInput() {
    const fixedOptions = SETTING_OPTIONS[setting.setting_key];
    if (fixedOptions) {
      return (
        <select value={value} onChange={(e) => setValue(e.target.value)} style={{ width: 200, padding: '0.4em 0.6em', border: '1px solid var(--color-border)', borderRadius: 4 }}>
          {fixedOptions.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }
    if (setting.value_type === 'BOOLEAN') {
      return (
        <select value={value} onChange={(e) => setValue(e.target.value)} style={{ width: 140, padding: '0.4em 0.6em', border: '1px solid var(--color-border)', borderRadius: 4 }}>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    }
    if (setting.value_type === 'JSON') {
      return (
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={3}
          style={{ width: 300, fontFamily: 'monospace', fontSize: 13, padding: '0.5em', border: '1px solid var(--color-border)', borderRadius: 4 }}
        />
      );
    }
    return (
      <input
        type={setting.value_type === 'NUMBER' ? 'number' : 'text'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ width: 200 }}
      />
    );
  }

  return (
    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
      <td style={{ padding: '0.8em 1em', fontSize: 13, fontFamily: 'monospace', color: 'var(--color-text-muted)', verticalAlign: 'top' }}>
        {setting.setting_key}
      </td>
      <td style={{ padding: '0.8em 1em', fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 320, verticalAlign: 'top' }}>
        {setting.description}
      </td>
      <td style={{ padding: '0.8em 1em', fontSize: 14, verticalAlign: 'top' }}>
        {editing ? (
          <div>
            {renderInput()}
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ fontSize: 13, padding: '0.4em 0.9em' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => { setEditing(false); setValue(setting.setting_value); setError(null); }} style={{ fontSize: 13, padding: '0.4em 0.9em' }}>
                Cancel
              </button>
            </div>
            {error && <p className="error-text">{error}</p>}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={setting.value_type === 'NUMBER' ? 'num' : ''} style={{ fontWeight: 500 }}>
              {setting.setting_value}
            </span>
            {canEdit ? (
              <button onClick={() => setEditing(true)} style={{ fontSize: 12, padding: '0.25em 0.6em' }}>Edit</button>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>({setting.editable_by_role} only)</span>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadSettings() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest('/settings');
      setSettings(data.settings);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSettings(); }, []);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Global Settings</h2>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: '1.5em' }}>
        Changes here take effect immediately across the whole system — bills, penalties, and thresholds all read live from these values.
      </p>

      {loading && <p>Loading…</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.7em 1em', fontSize: 13, fontWeight: 600, borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>Key</th>
              <th style={{ textAlign: 'left', padding: '0.7em 1em', fontSize: 13, fontWeight: 600, borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>Description</th>
              <th style={{ textAlign: 'left', padding: '0.7em 1em', fontSize: 13, fontWeight: 600, borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>Value</th>
            </tr>
          </thead>
          <tbody>
            {settings.map((s) => (
              <SettingRow key={s.setting_key} setting={s} currentRole={user.role_name} onSaved={loadSettings} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
