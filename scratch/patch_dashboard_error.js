const fs = require('fs');
let code = fs.readFileSync('c:/Users/T15/reachdesk/src/components/Dashboard.jsx', 'utf8');

code = code.replace(
  /const \[loading, setLoading\] = useState\(true\);/,
  `const [loading, setLoading] = useState(true);\n  const [debugError, setDebugError] = useState(null);`
);

code = code.replace(
  /console\.error\('\[Dashboard\] error loading data:', err\);/,
  `console.error('[Dashboard] error loading data:', err);\n      setDebugError(err.toString() + " " + err.message + " " + JSON.stringify(err));`
);

code = code.replace(
  /\{!loading && leadsList\.length === 0 && metrics\.total === 0 && \(/,
  `{debugError && (<div style={{color: 'red', padding: 20, background: 'white'}}>DEBUG ERROR: {debugError}</div>)}\n      {!loading && leadsList.length === 0 && metrics.total === 0 && (`
);

fs.writeFileSync('c:/Users/T15/reachdesk/src/components/Dashboard.jsx', code);
