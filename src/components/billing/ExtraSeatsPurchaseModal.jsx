import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  EXTRA_SEAT_USD_MONTHLY,
  MAX_EXTRA_SEATS_PER_ACTION,
  TEAMS_INCLUDED_SEATS,
  getExtraSeats,
} from '../../lib/planConfig';

/**
 * Self-serve extra Teams seats for existing subscribers (Configuration / Teams page).
 */
export default function ExtraSeatsPurchaseModal({
  open,
  onClose,
  profile,
  onSuccess,
  title = 'Add team members',
  description = 'Each extra seat beyond your 5 included members is billed at $5/month. New members get full Teams access.',
}) {
  const [seatsToAdd, setSeatsToAdd] = useState(1);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  const currentExtra = getExtraSeats(profile);

  useEffect(() => {
    if (!open) return;
    setSeatsToAdd(1);
    setPreview(null);
    setError('');
    setConfirming(false);
  }, [open]);

  useEffect(() => {
    if (!open || !profile?.id) return undefined;

    let cancelled = false;
    const runPreview = async () => {
      setLoading(true);
      setError('');
      try {
        const { data, error: fnError } = await supabase.functions.invoke('purchase-extra-seat', {
          body: { action: 'preview', seatsToAdd },
        });
        if (fnError) throw fnError;
        if (!data?.success) throw new Error(data?.error || 'Could not preview charge');
        if (!cancelled) setPreview(data);
      } catch (err) {
        if (!cancelled) {
          setPreview(null);
          setError(err.message || 'Could not preview charge');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const timer = setTimeout(runPreview, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, profile?.id, seatsToAdd]);

  const handleConfirm = async () => {
    if (confirming || loading || !preview) return;
    setConfirming(true);
    setError('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('purchase-extra-seat', {
        body: { action: 'confirm', seatsToAdd },
      });
      if (fnError) throw fnError;
      if (!data?.success) throw new Error(data?.error || 'Purchase failed');
      onSuccess?.(data);
      onClose?.();
    } catch (err) {
      setError(err.message || 'Purchase failed. Your card was not charged.');
    } finally {
      setConfirming(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="extra-seats-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={() => {
        if (!confirming && !loading) onClose?.();
      }}
    >
      <div
        className="card"
        style={{ maxWidth: 460, width: '100%', padding: '1.25rem' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
          <h3 id="extra-seats-modal-title" style={{ margin: 0, fontSize: '1.05rem' }}>{title}</h3>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            disabled={confirming || loading}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {description}
        </p>

        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <label htmlFor="extra-seats-qty" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Additional members (beyond {TEAMS_INCLUDED_SEATS} included)
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <input
              id="extra-seats-qty"
              type="number"
              min={1}
              max={MAX_EXTRA_SEATS_PER_ACTION}
              value={seatsToAdd}
              onChange={(e) => setSeatsToAdd(Math.min(MAX_EXTRA_SEATS_PER_ACTION, Math.max(1, Number(e.target.value) || 1)))}
              className="form-input"
              style={{ width: 88 }}
              disabled={confirming}
            />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              × ${EXTRA_SEAT_USD_MONTHLY}/mo each
            </span>
          </div>
          {currentExtra > 0 && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              You already have {currentExtra} paid extra seat{currentExtra === 1 ? '' : 's'} ({TEAMS_INCLUDED_SEATS + currentExtra} total capacity).
            </span>
          )}
        </div>

        {loading ? (
          <p style={{ margin: '1rem 0 0', color: 'var(--text-muted)' }}>Calculating charge…</p>
        ) : preview ? (
          <div style={{
            marginTop: '1rem',
            padding: '0.85rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
          }}
          >
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
              New monthly total
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
              ${Number(preview.newTotalMonthlyUsd).toFixed(2)}/mo
            </div>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
              Teams ${Number(preview.teamsPlanMonthlyUsd).toFixed(2)}/mo + {preview.newExtraSeats} extra seat{preview.newExtraSeats === 1 ? '' : 's'} × ${EXTRA_SEAT_USD_MONTHLY}/mo
            </p>
            <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                Due today (prorated)
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                {preview.immediateCharge?.formatted || preview.immediateChargeFallback || '—'}
              </div>
            </div>
          </div>
        ) : null}

        {error && (
          <div style={{
            marginTop: '0.85rem',
            padding: '0.65rem 0.85rem',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(224, 82, 82, 0.1)',
            border: '1px solid rgba(224, 82, 82, 0.2)',
            color: 'var(--status-hot)',
            fontSize: '0.8rem',
          }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.1rem' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={confirming || loading}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleConfirm}
            disabled={loading || confirming || !preview}
          >
            {confirming ? 'Charging…' : 'Confirm & pay'}
          </button>
        </div>
      </div>
    </div>
  );
}
