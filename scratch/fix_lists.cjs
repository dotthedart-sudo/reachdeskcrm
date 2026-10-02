const fs = require('fs');
let code = fs.readFileSync('src/components/CRM/ListsTableView.jsx', 'utf8');

const helper = `
const formatRule = (rule) => {
  if (!rule) return 'Updates automatically';
  try {
    const r = typeof rule === 'string' ? JSON.parse(rule) : rule;
    if (r.field && r.value) {
      return \`\${r.field} \${r.operator || '='} \${r.value}\`;
    }
    if (r.conditions && r.conditions.length) {
      return r.conditions.map(c => \`\${c.field} \${c.operator || '='} \${c.value}\`).join(' AND ');
    }
    return 'Updates automatically';
  } catch(e) {
    return 'Updates automatically';
  }
};
`;

code = code.replace('export default function ListsTableView({', helper + '\nexport default function ListsTableView({');
code = code.replace('countHint={uf.rule_summary || "[Rule summary] - updates automatically"}', 'countHint={uf.rule_summary || formatRule(uf.rule)}');

fs.writeFileSync('src/components/CRM/ListsTableView.jsx', code);
console.log('Fixed ListsTableView.jsx');
