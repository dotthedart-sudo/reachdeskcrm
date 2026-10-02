const fs = require('fs');

let css = fs.readFileSync('src/index.css', 'utf8');

if (!css.includes('.app-header__title-group')) {
  fs.appendFileSync('src/index.css', `
.app-header__title-group { display: flex; flex-direction: column; justify-content: center; }
.app-header__description { font-size: 0.85rem; color: var(--text-muted); margin: 0; line-height: 1.2; }
`);
}
console.log('Phase 1 core layout updated');
