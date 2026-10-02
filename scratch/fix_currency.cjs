const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf8');

// Replace {CURRENCY_SYMBOLS[currentUser?.default_currency] || '$'}{totalRevenueCollected >= 10000 ? ...} 
// With new Intl.NumberFormat(..., { notation: 'compact' }).format(totalRevenueCollected)
code = code.replace(/\{CURRENCY_SYMBOLS\[currentUser\?\.default_currency\] \|\| '\$'\}\{totalRevenueCollected >= 10000 \? \(totalRevenueCollected\/1000\)\.toFixed\(1\) \+ 'k' : totalRevenueCollected\}/g, 
  "{new Intl.NumberFormat('en-US', { style: 'currency', currency: currentUser?.default_currency || 'USD', currencyDisplay: 'code', maximumFractionDigits: 0 }).format(totalRevenueCollected)}");

// title={`Target: ${CURRENCY_SYMBOLS[...]}${revenueTarget}`}
code = code.replace(/title=\{\`Target: \$\{CURRENCY_SYMBOLS\[currentUser\?\.default_currency\] \|\| '\$'\}(\$\{revenueTarget\})\`\}/g,
  "title={`Target: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: currentUser?.default_currency || 'USD', currencyDisplay: 'code', maximumFractionDigits: 0 }).format(revenueTarget)}`}");

// title={`${CURRENCY_SYMBOLS[...]}${mTotal} in ${...}`}
code = code.replace(/title=\{\`\$\{CURRENCY_SYMBOLS\[currentUser\?\.default_currency\] \|\| '\$'\}(\$\{mTotal\}) in (\$\{d\.toLocaleString\('default', \{ month: 'short' \}\)\})\`\}/g,
  "title={`${new Intl.NumberFormat('en-US', { style: 'currency', currency: currentUser?.default_currency || 'USD', currencyDisplay: 'code', maximumFractionDigits: 0 }).format(mTotal)} in $2`}");

fs.writeFileSync('src/components/Dashboard.jsx', code);
