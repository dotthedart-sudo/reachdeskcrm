import React, { useState } from 'react';
import ReportsOverviewTab from './ReportsOverviewTab';
import ReportsPipelineTab from './ReportsPipelineTab';
import ReportsBreakdownTab from './ReportsBreakdownTab';
import { Activity, GitMerge, PieChart } from 'lucide-react';

export default function ReportsTabs({ 
  totalLeads, 
  messageCounts, 
  messageConversionRates, 
  callCounts, 
  callConversionRates,
  callStageIds,
  getMessageStageDisplayLabel,
  getCallStageLabel,
  trendData,
  breakdownData,
  growthStats,
  countMode,
  setCountMode
}) {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="reports-tabs-container" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="reports-tabs-nav" style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
        <button
          type="button"
          className={`reports-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
          style={{
            padding: '0.75rem 1.25rem',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'overview' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'overview' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'overview' ? 500 : 400,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s'
          }}
        >
          <Activity size={16} /> Overview
        </button>
        <button
          type="button"
          className={`reports-tab-btn ${activeTab === 'pipeline' ? 'active' : ''}`}
          onClick={() => setActiveTab('pipeline')}
          style={{
            padding: '0.75rem 1.25rem',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'pipeline' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'pipeline' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'pipeline' ? 500 : 400,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s'
          }}
        >
          <GitMerge size={16} /> Pipeline
        </button>
        <button
          type="button"
          className={`reports-tab-btn ${activeTab === 'breakdown' ? 'active' : ''}`}
          onClick={() => setActiveTab('breakdown')}
          style={{
            padding: '0.75rem 1.25rem',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'breakdown' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'breakdown' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'breakdown' ? 500 : 400,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s'
          }}
        >
          <PieChart size={16} /> Breakdown
        </button>
      </div>

      <div className="reports-tab-content" style={{ padding: '1rem 0' }}>
        {activeTab === 'overview' && (
          <ReportsOverviewTab 
            totalLeads={totalLeads}
            messageCounts={messageCounts}
            messageConversionRates={messageConversionRates}
            getMessageStageDisplayLabel={getMessageStageDisplayLabel}
            trendData={trendData}
            countMode={countMode}
            setCountMode={setCountMode}
          />
        )}
        {activeTab === 'pipeline' && (
          <ReportsPipelineTab 
            totalLeads={totalLeads}
            messageCounts={messageCounts}
            messageConversionRates={messageConversionRates}
            callCounts={callCounts}
            callConversionRates={callConversionRates}
            callStageIds={callStageIds}
            getMessageStageDisplayLabel={getMessageStageDisplayLabel}
            getCallStageLabel={getCallStageLabel}
          />
        )}
        {activeTab === 'breakdown' && (
          <ReportsBreakdownTab 
            breakdownData={breakdownData}
            growthStats={growthStats}
          />
        )}
      </div>
    </div>
  );
}
