const fs = require('fs');
let css = fs.readFileSync('c:/Users/T15/reachdesk/src/index.css', 'utf8');

css = css.replace(
  /\.app-container\s*\{\s*display:\s*flex;\s*height:\s*100vh;\s*height:\s*100dvh;\s*width:\s*100%;\s*overflow:\s*hidden;\s*\}/,
  `.app-wrapper {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  width: 100%;
}

.app-container {
  display: flex;
  flex: 1;
  width: 100%;
  overflow: hidden;
}`
);

fs.writeFileSync('c:/Users/T15/reachdesk/src/index.css', css);
console.log('Patched');
