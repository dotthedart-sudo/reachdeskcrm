import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { updateLeadStatusAndCheckpoint, applySuggestion, REPLY_CHECK_STATUSES, FOLLOW_UP_CHECK_STATUSES } from '../../lib/reminders';
import { celebrateClosedWon } from '../../utils/celebrateWin';

// ConfettiBurst component rendering flat squares in brand colors bursting outwards
function ConfettiBurst() {
  const [particles, setParticles] = React.useState([]);

  React.useEffect(() => {
    const colors = ['#5B8FB9', '#7FB5A0', '#EDF6F9'];
    const generated = Array.from({ length: 28 }).map((_, i) => {
      const angle = Math.random() * Math.PI * 2;
      const distance = 40 + Math.random() * 70;
      const tx = Math.cos(angle) * distance;
      const ty = Math.sin(angle) * distance - 20; // Slight upwards gravity bias
      const rot = Math.random() * 360;
      const rotSpeed = 270 + Math.random() * 360;
      const scale = 0.4 + Math.random() * 0.7;
      const duration = 0.8 + Math.random() * 0.5;
      const delay = Math.random() * 0.12;

      return {
        id: i,
        color: colors[i % colors.length],
        tx,
        ty,
        rot,
        rotSpeed,
        scale,
        duration,
        delay
      };
    });
    setParticles(generated);
  }, []);

  return (
    <div style={{
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
      width: '1px',
      height: '1px',
      zIndex: 999999
    }}>
      {particles.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            width: `${6 + Math.random() * 4}px`,
            height: `${6 + Math.random() * 4}px`,
            backgroundColor: p.color,
            borderRadius: '2px',
            transformOrigin: 'center center',
            animation: `confetti-burst ${p.duration}s cubic-bezier(0.1, 0.8, 0.3, 1) ${p.delay}s forwards`,
            opacity: 0,
            '--tx': `${p.tx}px`,
            '--ty': `${p.ty}px`,
            '--rot': `${p.rot}deg`,
            '--rot-speed': `${p.rotSpeed}deg`,
            '--scale': p.scale
          }}
        />
      ))}
    </div>
  );
}

export default function CheckpointPopover({
  lead,
  anchorEl,
  suggestionRules,
  currentUser,
  onClose,
  onResolved
}) {
  const popoverRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, openUp: false });
  const [showConfetti, setShowConfetti] = useState(false);

  const remindersEnabled = currentUser?.reminders_enabled !== false;
  const isCheckpointDue = remindersEnabled && lead.next_checkpoint_at && new Date(lead.next_checkpoint_at) <= new Date();
  const mode = isCheckpointDue ? 'checkpoint' : 'suggestion';

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target) &&
        anchorEl &&
        !anchorEl.contains(event.target)
      ) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, anchorEl]);

  useEffect(() => {
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const popoverWidth = mode === 'checkpoint' ? 260 : 72;
      
      const isReplyCheck = REPLY_CHECK_STATUSES.includes(lead.status);
      const isFollowUpCheck = FOLLOW_UP_CHECK_STATUSES.includes(lead.status);
      let popoverHeight = 40; // suggestion mode default
      if (mode === 'checkpoint') {
        popoverHeight = isReplyCheck ? 140 : (isFollowUpCheck ? 90 : 40);
      }
      
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < popoverHeight && rect.top > popoverHeight;
      setPos({
        left: Math.max(8, Math.min(rect.left + rect.width / 2 - popoverWidth / 2, window.innerWidth - popoverWidth - 8)),
        width: popoverWidth,
        openUp,
        top: openUp ? rect.top - popoverHeight - 4 : rect.bottom + 4
      });
    } else {
      const popoverWidth = mode === 'checkpoint' ? 260 : 72;
      setPos({
        left: Math.max(8, (window.innerWidth - popoverWidth) / 2),
        width: popoverWidth,
        openUp: false,
        top: Math.max(24, window.innerHeight * 0.25),
      });
    }
  }, [anchorEl, mode, lead.status]);

  const firstName = lead.name?.split(' ')[0] || 'they';

  const handleStatusUpdate = async (newStatus, extra = {}) => {
    try {
      const updated = await updateLeadStatusAndCheckpoint({
        lead,
        newStatus,
        suggestionRules,
        currentUser,
        extraUpdates: extra
      });
      onResolved(updated);
      
      const isConfettiOutcome = ['Positive Reply', 'Booked'].includes(newStatus);
      if (isConfettiOutcome) {
        setShowConfetti(true);
        setTimeout(() => {
          onClose();
        }, 1300);
      } else if (newStatus === 'Closed Won' && lead.status !== 'Closed Won') {
        celebrateClosedWon();
        setTimeout(() => {
          onClose();
        }, 1300);
      } else {
        onClose();
      }
    } catch (err) {
      console.error('Error in popover status update:', err);
    }
  };

  const handleApplySuggestion = async () => {
    try {
      const res = await applySuggestion(lead, suggestionRules, currentUser);
      if (res) {
        onResolved({ ...lead, ...res });
      }
      onClose();
    } catch (err) {
      console.error('Error applying suggestion:', err);
    }
  };

  let content = null;

  if (mode === 'checkpoint') {
    const isReplyCheck = REPLY_CHECK_STATUSES.includes(lead.status);
    const isFollowUpCheck = FOLLOW_UP_CHECK_STATUSES.includes(lead.status);

    if (isReplyCheck) {
      content = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' }}>
            Did {firstName} reply?
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <button
              onClick={() => handleStatusUpdate('Positive Reply', { reply_type: 'positive' })}
              className="btn btn-secondary"
              style={{
                fontSize: '0.75rem',
                padding: '6px',
                borderColor: 'var(--success-color)',
                color: 'var(--success-color)',
                fontWeight: 600
              }}
            >
              Positive reply
            </button>
            <button
              onClick={() => handleStatusUpdate('Booked', { reply_type: 'positive' })}
              className="btn btn-secondary"
              style={{
                fontSize: '0.75rem',
                padding: '6px',
                borderColor: '#8b5cf6',
                color: '#8b5cf6',
                fontWeight: 600
              }}
            >
              Call booked
            </button>
            <button
              onClick={() => handleStatusUpdate('No Show / Rescheduled')}
              className="btn btn-secondary"
              style={{
                fontSize: '0.75rem',
                padding: '6px',
                borderColor: 'var(--warning-color)',
                color: 'var(--warning-color)',
                fontWeight: 600
              }}
            >
              No show
            </button>
            <button
              onClick={() => handleStatusUpdate('Not Interested', { reply_type: 'negative' })}
              className="btn btn-secondary"
              style={{
                fontSize: '0.75rem',
                padding: '6px',
                borderColor: 'var(--danger-color)',
                color: 'var(--danger-color)',
                fontWeight: 600
              }}
            >
              Negative reply
            </button>
          </div>
        </div>
      );
    } else if (isFollowUpCheck) {
      const titleText = lead.status === 'Invite Sent'
        ? 'Did they book a call yet?'
        : `Did you follow up with ${firstName}?`;

      content = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem', alignItems: 'center' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' }}>
            {titleText}
          </div>
          <button
            onClick={() => handleStatusUpdate('Waiting')}
            className="btn btn-primary"
            style={{
              fontSize: '0.8rem',
              padding: '6px 16px',
              fontWeight: 600,
              width: '100%'
            }}
          >
            Mark as done
          </button>
        </div>
      );
    } else {
      console.warn(`CheckpointPopover opened in checkpoint mode for unsupported status: "${lead.status}"`);
      return null;
    }
  } else {
    // Mode B: Suggestion only (checkmark & dismiss buttons)
    content = (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', justifyContent: 'center' }}>
        <button
          onClick={handleApplySuggestion}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '26px',
            height: '26px',
            background: 'transparent',
            border: '0.5px solid var(--border-strong)',
            borderRadius: '4px',
            color: 'var(--success-color)',
            cursor: 'pointer',
            transition: 'var(--transition-fast)'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-card-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          title="Apply Suggestion"
        >
          <Check size={14} />
        </button>
        <button
          onClick={onClose}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '26px',
            height: '26px',
            background: 'transparent',
            border: '0.5px solid var(--border-strong)',
            borderRadius: '4px',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'var(--transition-fast)'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-card-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          title="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return createPortal(
    <div
      ref={popoverRef}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: pos.openUp ? undefined : pos.top,
        bottom: pos.openUp ? window.innerHeight - pos.top : undefined,
        left: pos.left,
        zIndex: 99999,
        width: `${pos.width}px`,
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-strong)',
        borderRadius: '8px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        padding: '8px'
      }}
    >
      {showConfetti && <ConfettiBurst />}
      {content}
    </div>,
    document.body
  );
}
