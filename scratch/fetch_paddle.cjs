const fs = require('fs');

async function main() {
  const url = 'https://efxgwqfdstrhrnnvtynl.supabase.co/functions/v1/temp-fetch-prices';
  const res = await fetch(url);
  const data = await res.json();
  
  if (data.error) {
    console.error('API Error:', data.error);
    return;
  }
  
  // Format tables
  
  const targetCountries = ['PK', 'BD', 'IN', 'PH', 'ID', 'NG', 'KE', 'EG', 'IQ', 'IR', 'GB', 'EU', 'CA', 'AU', 'SY'];
  const nameMap = {
    'pri_01kyjynvsztqyctmvng7jwm3a2': { plan: 'Starter', cycle: 'Monthly' },
    'pri_01kym7e8a59znm8wt54233phs0': { plan: 'Pro', cycle: 'Monthly' },
    'pri_01kymbs35k74ep884frg6cvjze': { plan: 'Teams', cycle: 'Monthly' },
    'pri_01kym6qvynxjby24z4s1303qne': { plan: 'Starter', cycle: 'Quarterly' },
    'pri_01kym7nbacv5z4p9w9e4z3ggh7': { plan: 'Pro', cycle: 'Quarterly' },
    'pri_01kymckgvx8xsg84zkygzfr72d': { plan: 'Teams', cycle: 'Quarterly' },
    'pri_01kym74hqdz60rj3fn5hvtk487': { plan: 'Starter', cycle: 'Yearly' },
    'pri_01kym81ydj3gdb8crd8m9qrdk2': { plan: 'Pro', cycle: 'Yearly' },
    'pri_01kymd8sne7zm5hvz7vdqwcymg': { plan: 'Teams', cycle: 'Yearly' },
  };

  let table1 = '| Plan | Cycle | Base Amount | Overrides (Country: Amount Currency) |\\n|---|---|---|---|\\n';
  let table2 = '| Country | ' + Object.keys(nameMap).map(k => `${nameMap[k].plan} ${nameMap[k].cycle}`).join(' | ') + ' |\\n|---|' + Object.keys(nameMap).map(()=>'---').join('|') + '|\\n';

  const countryCoverage = {};
  targetCountries.forEach(c => countryCoverage[c] = {});

  for (const item of data) {
    if (item.error) {
      console.log('Error fetching', item.priceId, item.error);
      continue;
    }
    const priceData = item.data;
    const { plan, cycle } = nameMap[priceData.id] || { plan: priceData.id, cycle: '' };
    
    const baseAmt = `${(priceData.unit_price.amount / 100).toFixed(2)} ${priceData.unit_price.currency_code}`;
    const overrides = priceData.unit_price_overrides || [];
    
    const overrideStrs = overrides.map(o => {
      o.country_codes.forEach(c => {
        if (!countryCoverage[c]) countryCoverage[c] = {};
        countryCoverage[c][priceData.id] = `${(o.unit_price.amount / 100).toFixed(2)} ${o.unit_price.currency_code}`;
      });
      return `${o.country_codes.join(', ')}: ${(o.unit_price.amount / 100).toFixed(2)} ${o.unit_price.currency_code}`;
    });

    table1 += `| ${plan} | ${cycle} | ${baseAmt} | ${overrideStrs.join('<br>')} |\\n`;
  }

  for (const c of targetCountries) {
    let row = `| ${c} |`;
    for (const pid of Object.keys(nameMap)) {
      const val = countryCoverage[c]?.[pid];
      row += ` ${val ? val : '❌ MISSING'} |`;
    }
    table2 += row + '\\n';
  }

  const out = '### Table 1: Price ID Configurations\\n\\n' + table1 + '\\n\\n### Table 2: Target Country Coverage\\n\\n' + table2;
  
  fs.writeFileSync('C:\\\\Users\\\\T15\\\\.gemini\\\\antigravity-ide\\\\brain\\\\9e81831a-20a0-4f03-bd95-3627a031513d\\\\paddle_prices_api_audit.md', out);
}

main().catch(console.error);
