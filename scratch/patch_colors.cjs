const fs = require('fs');

let css = fs.readFileSync('c:/Users/T15/reachdesk/src/index.css', 'utf8');

// Revert :root.light base colors to neutral gray/white
const oldRoot = `
  --bg-page:         #FFFFFF;
  --bg-sidebar:      #FFFFFF;
  --bg-card:         #F3F4F6;
  --bg-surface:      #FFFFFF;
  --bg-card-hover:   #E5E7EB;
  --bg-hover:        #E5E7EB;
  --bg-selected:     rgba(10, 10, 10, 0.08);
  --border:          #E5E5E5;
  --border-subtle:   #EBEBEB;
  --border-strong:   #D4D4D4;
  --text-primary:    #0A0A0A;
  --text-secondary:  #525252;
  --text-muted:      #737373;
  --accent-blue:     #333338;
  --accent-blue-hover: #44444A;
  --accent-green:    #404040;
  --accent-on:       #FFFFFF;`;

const newRootRegex = /--bg-page:\s*#eef2f8;[\s\S]*?--accent-on:\s*#FFFFFF;/;
css = css.replace(newRootRegex, oldRoot.trim());

// Remove .rd-dashboard-page
const dashboardRegex = /\/\* ── Scoped Dashboard Theme ── \*\/[\s\S]*?\.main-content:has\(\.rd-dashboard-page\)\s*\{\s*background-color:\s*var\(--bg-page\);\s*\}/;
css = css.replace(dashboardRegex, '');

fs.writeFileSync('c:/Users/T15/reachdesk/src/index.css', css);
console.log('Colors reverted!');
