const fs = require('fs');
let code = fs.readFileSync('c:/Users/T15/reachdesk/src/components/Dashboard.jsx', 'utf8');

code = code.replace(
  /const activeScopeIds = \(dashboardScope === 'team' && isOwner && hasTeam\) \? teamIds : \[currentUser\.id\];/,
  `const activeScopeIds = (dashboardScope === 'team' && isOwner && hasTeam) ? teamIds : [currentUser.id];\n      console.log('DASHBOARD DEBUG:', { dashboardScope, isOwner, hasTeam, teamIds, currentUser_id: currentUser.id, activeScopeIds });`
);

fs.writeFileSync('c:/Users/T15/reachdesk/src/components/Dashboard.jsx', code);
