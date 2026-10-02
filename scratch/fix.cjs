const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf8');
code = code.replace(/\\'/g, "'");
fs.writeFileSync('src/components/Dashboard.jsx', code);
console.log('Fixed quotes');
