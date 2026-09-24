const fs = require('fs');
let code = fs.readFileSync('c:/Users/T15/reachdesk/src/index.css', 'utf8');
code = code.replace(
  /\.card-title \{[\s\S]*?\}/,
  `.card-title {
  font-family: var(--font-body);
  font-size: 0.8125rem;
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  color: var(--text-muted);
  margin-bottom: var(--space-2);
}`
);
fs.writeFileSync('c:/Users/T15/reachdesk/src/index.css', code);
console.log('Reverted card-title');
