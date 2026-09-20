import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAppContext } from '../App';
import { X } from 'lucide-react';
import UpgradeLockModal from './UpgradeLockModal';
import { getEffectivePlan, getEffectiveBillingCycle } from '../lib/planConfig';

export default function PlanLimitBanner({ featureType }) {
  const { profile, subStatus } = useAppContext();
  const [show, setShow] = useState(false);
  const [data, setData] = useState(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const fetchStatus = async () => {
      try {
        const effectivePlan = getEffectivePlan(profile);
        const cycle = getEffectiveBillingCycle(profile);

        const { data: limits } = await supabase.from('plan_limits').select('*').eq('plan', effectivePlan).single();
        if (!limits) return;

        let limit = null;
        let count = 0;

        if (featureType === 'leads') {
          limit = limits.max_leads;
          if (effectivePlan === 'starter' && cycle === 'yearly') limit = 2000;
          else if (effectivePlan === 'pro' && cycle === 'yearly') limit *= 2;
          const { count: c } = await supabase.from('leads').select('id', { count: 'exact', head: true }).eq('user_id', profile.id);
          count = c || 0;
        } else if (featureType === 'templates') {
          limit = limits.max_templates;
          const { count: c } = await supabase.from('email_templates').select('id', { count: 'exact', head: true }).eq('user_id', profile.id);
          count = c || 0;
        } else if (featureType === 'notes') {
          limit = cycle === 'yearly' ? limits.max_notes_yearly : limits.max_notes;
          const { count: c } = await supabase.from('notes').select('id', { count: 'exact', head: true }).eq('user_id', profile.id);
          count = c || 0;
        } else if (featureType === 'folders') {
          limit = limits.max_folders;
          const { count: c } = await supabase.from('folders').select('id', { count: 'exact', head: true }).eq('user_id', profile.id);
          count = c || 0;
        }

        if (limit === null) return; // unlimited

        const percentage = (count / limit) * 100;
        let activeThreshold = null;
        if (percentage >= 95) activeThreshold = 95;
        else if (percentage >= 90) activeThreshold = 90;

        if (!activeThreshold) return;

        const dismissKey = `dismissed_banner_${featureType}`;
        const lastDismissRaw = localStorage.getItem(dismissKey);
        if (lastDismissRaw) {
          try {
            const lastDismiss = JSON.parse(lastDismissRaw);
            const today = new Date().toDateString();
            if (lastDismiss.date === today && lastDismiss.threshold >= activeThreshold) {
              return; // already dismissed today for this threshold (or higher)
            }
          } catch(e) {}
        }

        setData({ count, limit, percentage, activeThreshold, effectivePlan });
        setShow(true);
      } catch (err) {
        console.warn('Failed to fetch plan limit banner status', err);
      }
    };

    fetchStatus();
  }, [profile, featureType]);

  if (!show || !data) return null;

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem(`dismissed_banner_${featureType}`, JSON.stringify({
      date: new Date().toDateString(),
      threshold: data.activeThreshold
    }));
  };

  const nameMap = {
    leads: 'leads',
    templates: 'templates',
    notes: 'notes',
    folders: 'lists'
  };

  const planName = data.effectivePlan.charAt(0).toUpperCase() + data.effectivePlan.slice(1);

  return (
    <>
    <div style={{
      background: 'rgba(245, 158, 11, 0.15)',
      borderBottom: '1px solid rgba(245, 158, 11, 0.3)',
      padding: '0.75rem 1rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1rem',
      color: 'var(--text-primary)',
      fontSize: '0.875rem'
    }}>
      <span>
        <strong>{data.count} of {data.limit} {nameMap[featureType]} used</strong> on {planName}.
      </span>
      <button onClick={() => setShowUpgradeModal(true)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-blue)', fontWeight: 600, cursor: 'pointer', textDecoration: 'none' }}>
        Upgrade
      </button>
      <button onClick={handleDismiss} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
        <X size={16} />
      </button>
    </div>
    {showUpgradeModal && (
        <UpgradeLockModal
          featureName={`${nameMap[featureType]} limit`}
          currentUser={profile}
          onClose={() => setShowUpgradeModal(false)}
          isSubscriptionActive={subStatus === 'subscription_active'}
        />
      )}
    </>
  );
}
