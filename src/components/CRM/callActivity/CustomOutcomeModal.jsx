import React, { useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { DEFAULT_OUTCOMES, clearCustomOutcomesCache } from '../../../lib/callOutcomes';

export default function CustomOutcomeModal({ onClose, onCreated }) {
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('#10b981');
  const [basedOn, setBasedOn] = useState('Answered');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error: insertError } = await supabase
        .from('custom_call_outcomes')
        .insert([{
          user_id: user.id,
          label: label.trim(),
          color,
          based_on: basedOn
        }])
        .select()
        .single();

      if (insertError) throw insertError;
      
      clearCustomOutcomesCache();
      onCreated?.(data);
    } catch (err) {
      if (err.code === '23514' && err.message.includes('custom_call_outcomes_label_check')) {
        setError('Label cannot be the same as a built-in outcome.');
      } else if (err.code === '23505') {
        setError('An outcome with this label already exists for your team.');
      } else {
        setError(err.message || 'Failed to create outcome.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-content" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Create Custom Outcome</h2>
          <button className="btn btn-icon" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-col gap-3">
          <div className="form-group">
            <label className="form-label">Label</label>
            <input 
              type="text" 
              className="form-input" 
              value={label} 
              onChange={e => setLabel(e.target.value)} 
              required 
              placeholder="E.g., Left with gatekeeper"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Color</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input 
                type="color" 
                value={color} 
                onChange={e => setColor(e.target.value)} 
                style={{ width: 40, height: 40, padding: 0, border: 'none', borderRadius: 4, cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{color}</span>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Behavior (based on)</label>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.25rem' }}>
              Inherits rules, terminal status, and follow-up days from this built-in outcome.
            </p>
            <select 
              className="form-input"
              value={basedOn}
              onChange={e => setBasedOn(e.target.value)}
              required
            >
              {DEFAULT_OUTCOMES.map(o => (
                <option key={o.label} value={o.label}>{o.label}</option>
              ))}
            </select>
          </div>
          {error && <div style={{ color: 'var(--danger-color)', fontSize: '0.85rem' }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !label.trim()}>
              {saving ? 'Saving...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
