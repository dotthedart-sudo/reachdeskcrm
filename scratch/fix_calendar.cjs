const fs = require('fs');
let lines = fs.readFileSync('src/components/Calendar.jsx', 'utf8').split('\n');

const start = lines.findIndex(l => l.includes('export default function CalendarPage'));
if (!lines.slice(0, 50).join('\n').includes('import { PageContainer }')) {
  lines.splice(1, 0, "import { PageContainer } from './ui/PageContainer';");
}

let level = 0;
let mainReturn = -1;
let endLine = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('export default function CalendarPage')) {
    level = 1;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim().startsWith('return') && level === 1 && mainReturn === -1) {
        mainReturn = j;
      }
      
      const openBraces = (lines[j].match(/\{/g) || []).length;
      const closeBraces = (lines[j].match(/\}/g) || []).length;
      level += openBraces;
      level -= closeBraces;
      
      if (level === 0) {
        endLine = j;
        break;
      }
    }
    break;
  }
}

if (mainReturn > -1 && endLine > -1) {
  lines[mainReturn] = lines[mainReturn].replace('return (', 'return (\n    <PageContainer variant="wide">');
  
  const closeIdx = endLine - 1;
  if (lines[closeIdx].includes(');')) {
    lines[closeIdx] = lines[closeIdx].replace(');', '    </PageContainer>\n  );');
  }
  
  fs.writeFileSync('src/components/Calendar.jsx', lines.join('\n'));
  console.log('Fixed Calendar.jsx wrapper');
}
