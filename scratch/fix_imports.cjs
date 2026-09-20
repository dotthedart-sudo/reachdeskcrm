const fs = require('fs');

const files = [
  'src/components/Configuration/BillingPanel.jsx',
  'src/components/Configuration/IntegrationsPanel.jsx',
  'src/components/CRM.jsx',
  'src/components/Dashboard.jsx',
  'src/components/NotesList.jsx',
  'src/components/PlanLimitBanner.jsx',
  'src/components/Reports.jsx',
  'src/lib/callActivity.js',
  'src/lib/planMarketing.js',
  'src/App.jsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('getLimit') && !content.includes('getLimit } from')) {
      if (content.includes('import { getTeamIds, PLAN_LIMITS')) {
          content = content.replace('import { getTeamIds, PLAN_LIMITS', 'import { getTeamIds, PLAN_LIMITS, getLimit');
      } else if (content.includes('import { PLAN_LIMITS')) {
          content = content.replace('import { PLAN_LIMITS', 'import { PLAN_LIMITS, getLimit');
      } else if (content.includes('import { getEffectivePlan, getEffectiveBillingCycle } from \'../lib/planConfig\';')) {
          content = content.replace('import { getEffectivePlan, getEffectiveBillingCycle } from \'../lib/planConfig\';', 'import { getEffectivePlan, getEffectiveBillingCycle, getLimit } from \'../lib/planConfig\';');
      }
      fs.writeFileSync(file, content, 'utf8');
      console.log(`Updated ${file}`);
  }
}
