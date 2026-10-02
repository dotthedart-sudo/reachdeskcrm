const fs = require('fs');

// 1. Fix Dashboard.jsx
let dCode = fs.readFileSync('src/components/Dashboard.jsx', 'utf8');

// Thousand separators for KPIs
dCode = dCode.replace(/>\{metrics\.newLeads\}</g, ">{(metrics.newLeads || 0).toLocaleString()}<");
dCode = dCode.replace(/>\{metrics\.followUpsDone\}</g, ">{(metrics.followUpsDone || 0).toLocaleString()}<");
dCode = dCode.replace(/>\{metrics\.replied\}</g, ">{(metrics.replied || 0).toLocaleString()}<");
dCode = dCode.replace(/>\{metrics\.positive\}</g, ">{(metrics.positive || 0).toLocaleString()}<");
dCode = dCode.replace(/>\{metrics\.pipelineReach\}</g, ">{(metrics.pipelineReach || 0).toLocaleString()}<");

// Currency format
// Currently something like: {CURRENCY_SYMBOLS[currentUser?.default_currency] || '$'}{amount}
// Change to: new Intl.NumberFormat('en-US', { style: 'currency', currency: currentUser?.default_currency || 'USD', currencyDisplay: 'code' }).format(amount)

// Fix currency in KPI Revenue:
dCode = dCode.replace(/\{CURRENCY_SYMBOLS\[currentUser\?\.default_currency\] \|\| '\$'\}\{Math\.round\(([^}]+)\)\}/g, 
  "{new Intl.NumberFormat('en-US', { style: 'currency', currency: currentUser?.default_currency || 'USD', currencyDisplay: 'code', maximumFractionDigits: 0 }).format($1)}");

// Fix literal &middot; in JS strings
dCode = dCode.replace(/&middot;/g, "·");

// Readable names: 'lead.first_name + " " + lead.last_name' might be used, let's look for it
dCode = dCode.replace(/<span className="dashboard-donext-name">\{lead\.first_name\} \{lead\.last_name\}<\/span>/g, 
  '<span className="dashboard-donext-name">{`${lead.first_name || ""} ${lead.last_name || ""}`.trim() || lead.email}</span>');

fs.writeFileSync('src/components/Dashboard.jsx', dCode);

// 2. Fix index.css for KPI grid 1100px and Do next row theme background
let cssCode = fs.readFileSync('src/index.css', 'utf8');

cssCode = cssCode.replace(/\.dashboard-donext-row\s*\{[^}]*background:\s*var\(--bg\);/g, (match) => {
  return match.replace('var(--bg)', 'var(--bg-subtle)');
});

if (!cssCode.includes('@media (min-width: 1100px) {\\n  .dashboard-kpi-grid')) {
  cssCode = cssCode.replace(/\.dashboard-kpi-grid\s*\{[^}]+\}/, (match) => {
    return match + '\n@media (min-width: 1100px) {\n  .dashboard-kpi-grid {\n    grid-template-columns: repeat(5, 1fr);\n  }\n}';
  });
}

fs.writeFileSync('src/index.css', cssCode);
console.log('Fixed Dashboard.jsx and index.css');
