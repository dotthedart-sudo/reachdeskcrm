const fs = require('fs');

let changedFiles = [];
function readDir(dir) {
  fs.readdirSync(dir).forEach(f => {
    const full = dir + '/' + f;
    if (fs.statSync(full).isDirectory()) {
      readDir(full);
    } else if (full.endsWith('.js') || full.endsWith('.jsx') || full.endsWith('.css')) {
      let code = fs.readFileSync(full, 'utf8');
      let original = code;
      
      // JSX inline styles: backgroundColor: '#1a1a1a' -> backgroundColor: 'var(--bg-card)'
      code = code.replace(/backgroundColor:\s*['"](?:#1a1a1a|#1c1c1c|#111|#111111|#222|#222222)['"]/gi, "backgroundColor: 'var(--bg-card)'");
      code = code.replace(/background:\s*['"](?:#1a1a1a|#1c1c1c|#111|#111111|#222|#222222)['"]/gi, "background: 'var(--bg-card)'");
      
      code = code.replace(/backgroundColor:\s*['"](?:#000|#000000|black)['"]/gi, "backgroundColor: 'var(--bg-primary)'");
      code = code.replace(/background:\s*['"](?:#000|#000000|black)['"]/gi, "background: 'var(--bg-primary)'");
      
      code = code.replace(/backgroundColor:\s*['"]rgba?\(0,\s*0,\s*0,\s*0\.\d+\)['"]/gi, "backgroundColor: 'var(--bg-subtle)'");
      code = code.replace(/background:\s*['"]rgba?\(0,\s*0,\s*0,\s*0\.\d+\)['"]/gi, "background: 'var(--bg-subtle)'");

      // CSS rules: background: #1a1a1a; -> background: var(--bg-card);
      code = code.replace(/background(-color)?:\s*(#1a1a1a|#1c1c1c|#111|#111111|#222|#222222)(;|\s|})/gi, "background$1: var(--bg-card)$3");
      code = code.replace(/background(-color)?:\s*(#000|#000000|black)(;|\s|})/gi, "background$1: var(--bg-primary)$3");
      code = code.replace(/background(-color)?:\s*rgba?\(0,\s*0,\s*0,\s*0\.\d+\)(;|\s|})/gi, "background$1: var(--bg-subtle)$2");

      if (code !== original) {
        fs.writeFileSync(full, code);
        changedFiles.push(full);
      }
    }
  });
}
readDir('src');
console.log('Changed files:', changedFiles.join(', '));
