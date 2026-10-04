import React from 'react';

/** Cumulative pipeline funnel — conversion % labels sit on connectors between stages. */
export default function ReportsFunnel({
  stages,
  counts,
  conversionRates,
  totalLeads,
  getStageLabel,
  countMode,
  colorsMap = {},
}) {
  if (!stages?.length || totalLeads === 0) return null;

  const labelFor = (stage) => (getStageLabel ? getStageLabel(stage) : stage);
  const anchorCount = counts[stages[0]] ?? totalLeads ?? 1;
  const maxCount = Math.max(anchorCount, 1);

  return (
    <div className="reports-funnel" role="img" aria-label="Pipeline conversion funnel">
      {stages.map((stage, idx) => {
        const count = counts[stage] ?? 0;
        const widthPct = Math.max(4, Math.round((count / maxCount) * 100));
        const prevStage = idx > 0 ? stages[idx - 1] : null;
        const ratePct = Math.min(100, Math.round((count / maxCount) * 100));
        const color = colorsMap?.[stage?.toLowerCase()] || 'var(--text-muted)';

        return (
          <React.Fragment key={stage}>
            {idx > 0 && (
              <div className="reports-funnel__connector" aria-hidden="true">
                <span className="reports-funnel__connector-line" />
                {countMode === 'cumulative' && ratePct > 0 && (
                  <span className="reports-funnel__rate">{ratePct}%</span>
                )}
                <span className="reports-funnel__connector-line" />
              </div>
            )}
            <div className="reports-funnel__step">
              <div className="reports-funnel__step-meta">
                <span className="reports-funnel__step-label">{labelFor(stage)}</span>
                <span className="reports-funnel__step-count">
                  {count}
                  {countMode === 'current' && totalLeads > 0 && (
                    <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)' }}>
                      ({Math.round((count / totalLeads) * 100)}%)
                    </span>
                  )}
                </span>
              </div>
              <div className="reports-funnel__bar-track">
                <div
                  className="reports-funnel__bar-fill"
                  style={{ width: `${widthPct}%`, backgroundColor: color }}
                />
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
