import React, { useState } from 'react';

import { QUICK_LOG_OUTCOMES, useCustomCallOutcomes } from '../../../lib/callOutcomes';
import CustomOutcomeModal from './CustomOutcomeModal';

export default function QuickLogChips({ onLog, onMore, disabled = false, compact = false }) {
  const [logging, setLogging] = useState(null);
  const [showAddOutcome, setShowAddOutcome] = useState(false);
  const availableOutcomes = useCustomCallOutcomes();
  
  const customOutcomes = availableOutcomes.filter(o => o.is_custom && !o.is_archived);

  const handleClick = async (outcome) => {
    if (disabled || logging) return;
    setLogging(outcome);
    try {
      await onLog?.(outcome);
    } finally {
      setLogging(null);
    }
  };

  return (
    <div
      className="quick-log-chips"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: compact ? '0.25rem' : '0.35rem',
        alignItems: 'center',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {QUICK_LOG_OUTCOMES.map(({ label, outcome }) => (
        <button
          key={outcome}
          type="button"
          className="btn btn-sm btn-secondary quick-log-chip"
          disabled={disabled || !!logging}
          style={{
            fontSize: compact ? '0.68rem' : '0.72rem',
            padding: compact ? '0.15rem 0.4rem' : '0.2rem 0.5rem',
            lineHeight: 1.2,
            opacity: logging && logging !== outcome ? 0.5 : 1,
          }}
          onClick={() => handleClick(outcome)}
          title={`Log: ${outcome}`}
        >
          {logging === outcome ? '…' : label}
        </button>
      ))}
      {customOutcomes.map(({ label, outcome }) => {
        const out = outcome || label;
        return (
          <button
            key={out}
            type="button"
            className="btn btn-sm btn-secondary quick-log-chip"
            disabled={disabled || !!logging}
            style={{
              fontSize: compact ? '0.68rem' : '0.72rem',
              padding: compact ? '0.15rem 0.4rem' : '0.2rem 0.5rem',
              lineHeight: 1.2,
              opacity: logging && logging !== out ? 0.5 : 1,
            }}
            onClick={() => handleClick(out)}
            title={`Log: ${out}`}
          >
            {logging === out ? '…' : label}
          </button>
        );
      })}
      {onMore && (
        <button
          type="button"
          className="btn btn-sm btn-secondary quick-log-chip"
          disabled={disabled || !!logging}
          style={{ fontSize: compact ? '0.68rem' : '0.72rem', padding: compact ? '0.15rem 0.4rem' : '0.2rem 0.5rem' }}
          onClick={(e) => {
            e.stopPropagation();
            onMore();
          }}
        >
          More…
        </button>
      )}
      <button
        type="button"
        className="btn btn-sm btn-secondary quick-log-chip"
        disabled={disabled || !!logging}
        style={{ fontSize: compact ? '0.68rem' : '0.72rem', padding: compact ? '0.15rem 0.4rem' : '0.2rem 0.5rem', fontWeight: 600 }}
        onClick={(e) => {
          e.stopPropagation();
          setShowAddOutcome(true);
        }}
      >
        + Add
      </button>

      {showAddOutcome && (
        <CustomOutcomeModal 
          onClose={() => setShowAddOutcome(false)}
          onCreated={(newOutcome) => {
            setShowAddOutcome(false);
            handleClick(newOutcome.label);
          }}
        />
      )}
    </div>
  );
}
