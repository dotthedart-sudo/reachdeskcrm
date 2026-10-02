const fs = require('fs');

// 1. ReportsOverviewTab.jsx
let overview = fs.readFileSync('src/components/Reports/ReportsOverviewTab.jsx', 'utf8');

if (!overview.includes('fetchCustomStatuses')) {
  overview = overview.replace(
    "import ReportsFunnel from './ReportsFunnel';",
    "import ReportsFunnel from './ReportsFunnel';\nimport { fetchCustomStatuses } from '../../lib/customStatuses';\nimport { useAppContext } from '../../App';"
  );

  const metricState = "const [metric, setMetric] = useState('outreach'); // outreach | calls | messages | invoices";
  const hookInject = `  const [metric, setMetric] = useState('outreach'); // outreach | calls | messages | invoices
  const { teamIds } = useAppContext() || {};
  const [colorsMap, setColorsMap] = useState({});

  React.useEffect(() => {
    let active = true;
    Promise.all([
      fetchCustomStatuses({ userIds: teamIds, channel: 'messaging' }),
      fetchCustomStatuses({ userIds: teamIds, channel: 'calls' })
    ]).then(([msgStatuses, callStatuses]) => {
      if (!active) return;
      const map = {};
      [...msgStatuses, ...callStatuses].forEach(s => {
        if (s.label) map[s.label.toLowerCase()] = s.color;
      });
      setColorsMap(map);
    });
    return () => { active = false; };
  }, [teamIds]);
`;
  overview = overview.replace(metricState, hookInject);

  overview = overview.replace(
    "          countMode={countMode}\n        />",
    "          countMode={countMode}\n          colorsMap={colorsMap}\n        />"
  );
  fs.writeFileSync('src/components/Reports/ReportsOverviewTab.jsx', overview);
}

// 2. ReportsFunnel.jsx
let funnel = fs.readFileSync('src/components/Reports/ReportsFunnel.jsx', 'utf8');

funnel = funnel.replace(
  "  getStageLabel,\n}) {",
  "  getStageLabel,\n  countMode,\n  colorsMap = {},\n}) {"
);

funnel = funnel.replace(
  "                {rate != null && (",
  "                {countMode === 'cumulative' && rate != null && ("
);
funnel = funnel.replace(
  "                  <span className=\"reports-funnel__rate\">{rate}%</span>",
  "                  <span className=\"reports-funnel__rate\">{Math.min(Number(rate), 100)}%</span>"
);

funnel = funnel.replace(
  "                <span className=\"reports-funnel__step-count\">{count}</span>",
  "                <span className=\"reports-funnel__step-count\">\n                  {count}\n                  {countMode === 'current' && totalLeads > 0 && (\n                    <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)' }}>\n                      ({Math.round((count / totalLeads) * 100)}%)\n                    </span>\n                  )}\n                </span>"
);

funnel = funnel.replace(
  "                  className=\"reports-funnel__bar-fill\"\n                  style={{ width: `${widthPct}%` }}",
  "                  className=\"reports-funnel__bar-fill\"\n                  style={{ width: `${widthPct}%`, backgroundColor: colorsMap[labelFor(stage)?.toLowerCase()] || 'var(--text-muted)' }}"
);

fs.writeFileSync('src/components/Reports/ReportsFunnel.jsx', funnel);
console.log('Fixed Reports funnel colors and logic');
