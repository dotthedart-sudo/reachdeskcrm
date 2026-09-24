import fs from 'fs';
let code = fs.readFileSync('c:/Users/T15/reachdesk/src/components/Dashboard.jsx', 'utf8');

code = code.replace(
  /console\.log\('DASHBOARD DEBUG:'.*?\);/,
  `console.log('DASHBOARD DEBUG:', { dashboardScope, isOwner, hasTeam, teamIds, currentUser_id: currentUser.id, activeScopeIds });\n      fetch('http://localhost:3000/__debug', { method: 'POST', body: JSON.stringify({ dashboardScope, isOwner, hasTeam, teamIds, activeScopeIds, currentUser_id: currentUser.id }) }).catch(() => {});`
);

code = code.replace(
  /setDebugError\(String\(err\).*?\);/,
  `setDebugError(String(err) + " " + JSON.stringify(err));\n      fetch('http://localhost:3000/__debug', { method: 'POST', body: JSON.stringify({ error: String(err), stack: err.stack, reason: err.reason }) }).catch(() => {});`
);

code = code.replace(
  /setMetrics\(computeLeadsOverviewFromStats\(pipelineStats\)\);/,
  `setMetrics(computeLeadsOverviewFromStats(pipelineStats));\n      fetch('http://localhost:3000/__debug', { method: 'POST', body: JSON.stringify({ pipelineStats, metrics: computeLeadsOverviewFromStats(pipelineStats), feedLeadsCount: loadedLeads.length }) }).catch(() => {});`
);

fs.writeFileSync('c:/Users/T15/reachdesk/src/components/Dashboard.jsx', code);
