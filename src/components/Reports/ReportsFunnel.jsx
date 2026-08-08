import React from 'react';

/** Cumulative pipeline funnel — conversion % labels sit on connectors between stages. */
export default function ReportsFunnel({ stages, cumulativeCounts, conversionRates, totalLeads }) {
  if (!stages?.length || totalLeads === 0) return null;

  const anchorCount = cumulativeCounts[stages[0]] ?? totalLeads ?? 1;
  const maxCount = Math.max(anchorCount, 1);

  return (
    <div className="reports-funnel" role="img" aria-label="Pipeline conversion funnel">
      {stages.map((stage, idx) => {
        const count = cumulativeCounts[stage] ?? 0;
        const widthPct = Math.max(4, Math.round((count / maxCount) * 100));
        const prevStage = idx > 0 ? stages[idx - 1] : null;
        const rate = prevStage ? conversionRates[stage] : null;

        return (
          <React.Fragment key={stage}>
            {idx > 0 && (
              <div className="reports-funnel__connector" aria-hidden="true">
                <span className="reports-funnel__connector-line" />
                {rate != null && (
                  <span className="reports-funnel__rate">{rate}%</span>
                )}
                <span className="reports-funnel__connector-line" />
              </div>
            )}
            <div className="reports-funnel__step">
              <div className="reports-funnel__step-meta">
                <span className="reports-funnel__step-label">{stage}</span>
                <span className="reports-funnel__step-count">{count}</span>
              </div>
              <div className="reports-funnel__bar-track">
                <div
                  className="reports-funnel__bar-fill"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
