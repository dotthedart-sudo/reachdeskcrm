const fs = require('fs');
let code = fs.readFileSync('src/components/DrawingBoard.jsx', 'utf8');

code = code.replace(/height:\s*'calc\(100vh - 120px\)',\s*minHeight:\s*'500px',/, "height: '100%',\n      minHeight: 0,\n      flex: 1,\n      display: 'flex',\n      flexDirection: 'column',");

code = code.replace(/return \(\s*\n\s*\n\s*<div style=\{\{/g, "return (\n    <div style={{");

fs.writeFileSync('src/components/DrawingBoard.jsx', code);
console.log('Fixed DrawingBoard.jsx');
