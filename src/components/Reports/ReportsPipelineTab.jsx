import React from 'react';
import { Mail, Phone } from 'lucide-react';

export default function ReportsPipelineTab({
  totalLeads,
  messageCounts,
  messageConversionRates,
  callCounts,
  callConversionRates,
  callStageIds,
  getMessageStageDisplayLabel,
  getCallStageLabel
}) {
  
  // A helper component to render a stepper pipeline
  const PipelineStepper = ({ title, icon, description, stages, counts, getLabel }) => {
    return (
      <section className="reports-pipeline-section" style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          {icon}
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>{title}</h3>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem', marginTop: 0 }}>
          {description}
        </p>
        
        <div className="reports-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem' }}>
          {stages.map((stage) => {
            const count = counts[stage] ?? 0;
            const isContacts = stage === 'Lead';
            const pctOfTotal = !isContacts && totalLeads > 0 && stage !== 'not_called'
              ? Math.round((count / totalLeads) * 100)
              : null;

            return (
              <div key={stage} className="reports-metric" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{getLabel(stage)}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>{count}</div>
                {pctOfTotal != null && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {pctOfTotal}% of filtered
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  const messageStages = Object.keys(messageCounts);

  return (
    <div className="reports-pipeline-tab" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
      <PipelineStepper 
        title="Messages Pipeline" 
        icon={<Mail size={18} style={{ color: 'var(--primary)' }} />}
        description="Email & LinkedIn stages by message status."
        stages={messageStages}
        counts={messageCounts}
        getLabel={getMessageStageDisplayLabel}
      />
      
      <PipelineStepper 
        title="Calls Pipeline" 
        icon={<Phone size={18} style={{ color: 'var(--primary)' }} />}
        description="Call queue stages by call status."
        stages={callStageIds}
        counts={callCounts}
        getLabel={getCallStageLabel}
      />
    </div>
  );
}
