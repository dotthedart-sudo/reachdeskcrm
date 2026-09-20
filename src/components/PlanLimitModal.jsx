import React, { useEffect, useState } from 'react';
import { X, Lock, AlertCircle } from 'lucide-react';
import UpgradeLockModal from './UpgradeLockModal';

export default function PlanLimitModal({ currentUser, forceClose, isSubscriptionActive }) {
  const [errorDetails, setErrorDetails] = useState(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  useEffect(() => {
    const handleLimitError = (e) => {
      console.log('[PlanLimitModal] Captured limit error:', e.detail);
      // Don't show if already showing one, or just overwrite it
      setErrorDetails(e.detail);
    };

    window.addEventListener('reachdesk:limit-error', handleLimitError);
    return () => window.removeEventListener('reachdesk:limit-error', handleLimitError);
  }, []);

  useEffect(() => {
    if (forceClose) {
      setErrorDetails(null);
      setShowUpgradeModal(false);
    }
  }, [forceClose]);

  if (!errorDetails) return null;

  const { msg, table, code } = errorDetails;
  
  let title = 'Plan limit reached';
  let body = 'You have reached the limits for your current plan. Upgrade to unlock more capacity.';
  
  const isFree = currentUser?.plan === 'free';
  const isStarter = currentUser?.plan === 'starter';
  const isYearly = currentUser?.billing_cycle === 'yearly';

  if (msg.includes('Lead limit reached') || table === 'leads') {
    title = 'Lead limit reached';
    if (isFree) {
      body = "You've used all 100 leads on the Free plan. Upgrade to add more — your existing leads stay safe.";
    } else {
      const match = msg.match(/\(([^)]+)\)/);
      const cap = match ? match[1] : 'your leads';
      body = `You've used all ${cap}. Upgrade to add more — your existing leads stay safe.`;
    }
  } else if (msg.includes('Note limit reached') || msg.includes('Notes are not available') || table === 'notes') {
    title = 'Note limit reached';
    if (isFree) {
      body = 'Notes are available from Starter.';
    } else {
      body = `You've used all 20 notes (40 on yearly). Upgrade to Pro for unlimited.`;
    }
  } else if (msg.includes('Template limit reached') || table === 'email_templates') {
    title = 'Template limit reached';
    const match = msg.match(/\(([^)]+)\)/);
    const cap = match ? match[1] : 'your templates';
    body = `Template limit reached for your plan (${cap}). Upgrade to add more.`;
  } else if (msg.includes('List (folder) limit reached') || table === 'folders') {
    title = 'List limit reached';
    const match = msg.match(/\(([^)]+)\)/);
    const cap = match ? match[1] : 'your limits';
    body = `List (folder) limit reached for your plan (${cap}).`;
  } else if (code === '42501' || msg.includes('row-level security')) {
    // Determine feature based on table
    if (table === 'invoices') {
      title = 'Invoices locked';
      body = 'Invoices are available from Starter.';
    } else if (table === 'revenue_entries') {
      title = 'Revenue Tracker locked';
      body = 'Revenue Tracker is available from Starter.';
    } else if (table === 'user_snippets') {
      title = 'Snippets locked';
      body = 'Snippets are available from Starter.';
    } else if (table === 'reports') {
      title = 'Reports locked';
      body = 'Reports are available from Pro.';
    } else {
      title = 'Feature locked';
      body = 'This feature is not available on your current plan.';
    }
  }

  const handleClose = () => {
    setErrorDetails(null);
  };

  const handleUpgrade = () => {
    setShowUpgradeModal(true);
  };

  return (
    <>
      <div className="rd-modal-overlay">
        <div className="rd-modal" style={{ maxWidth: '420px', padding: '2rem', textAlign: 'center' }}>
          <button className="rd-modal-close" onClick={handleClose}>
            <X size={20} />
          </button>
          
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
            <div style={{ width: 56, height: 56, background: '#fee2e2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
              <Lock size={28} />
            </div>
          </div>
          
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.75rem' }}>
            {title}
          </h2>
          
          <p style={{ color: '#475569', fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '2rem' }}>
            {body}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleUpgrade}>
              Upgrade
            </button>
            <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleClose}>
              Not now
            </button>
          </div>
        </div>
      </div>

      {showUpgradeModal && (
        <UpgradeLockModal
          featureName={title}
          currentUser={currentUser}
          onClose={() => setShowUpgradeModal(false)}
          isSubscriptionActive={isSubscriptionActive}
        />
      )}
    </>
  );
}
