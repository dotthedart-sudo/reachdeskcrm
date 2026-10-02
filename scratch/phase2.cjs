const fs = require('fs');

function wrapComponent(filePath, variant) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('<PageContainer')) return;
  
  if (!content.includes("import { PageContainer }")) {
    content = content.replace(/(import React[^;]+;)/, "$1\nimport { PageContainer } from './ui/PageContainer';");
  }

  // Find the last `return (` which is typically the main render
  const lastReturnIdx = content.lastIndexOf('return (');
  if (lastReturnIdx !== -1) {
    const before = content.slice(0, lastReturnIdx);
    const after = content.slice(lastReturnIdx + 8);
    
    // We need to wrap it inside `<PageContainer variant="...">`
    // And append `</PageContainer>` right before the final `);` 
    // This could be tricky. It's safer to just wrap it:
    // return ( <PageContainer variant={variant}> { ... } </PageContainer> )
    
    content = before + 'return (\n    <PageContainer variant="' + variant + '">\n      ' + after.trim();
    
    // Find the last `);`
    const lastClosingIdx = content.lastIndexOf(');');
    if (lastClosingIdx !== -1) {
      const beforeClose = content.slice(0, lastClosingIdx);
      const afterClose = content.slice(lastClosingIdx);
      content = beforeClose + '\n    </PageContainer>' + afterClose;
    }
    
    fs.writeFileSync(filePath, content);
    console.log('Wrapped ' + filePath);
  }
}

wrapComponent('src/components/Calendar.jsx', 'wide');
wrapComponent('src/components/NotesList.jsx', 'full');
wrapComponent('src/components/DrawingBoard.jsx', 'full');
