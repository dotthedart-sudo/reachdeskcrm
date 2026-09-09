const fs = require('fs');

let code = fs.readFileSync('c:/Users/T15/reachdesk/src/components/CRM/GroupedChannelDropdown.jsx', 'utf8');

// Replace imports
code = code.replace(
  /import \{ DEFAULT_CALL_STATUSES as CALL_STATUS_DEFAULTS \} from '\.\.\/\.\.\/lib\/callOutcomeRules';/,
  ''
);
code = code.replace(
  /import \{ rewriteAutomationRulesOnStatusRename \} from '\.\.\/\.\.\/lib\/customStatuses';/,
  ''
);
code = code.replace(
  /export const DEFAULT_STATUSES = \[[\s\S]*?\];/,
  ''
);
code = code.replace(
  /export const DEFAULT_CALL_STATUSES = CALL_STATUS_DEFAULTS;/,
  ''
);

code = code.replace(
  /import \{ softBadgeStyle, softDotStyle \} from '\.\.\/\.\.\/lib\/softBadgeStyle';/,
  "import { softBadgeStyle, softDotStyle } from '../../lib/softBadgeStyle';\nimport { getChannelDefaults, channelFallbackLabel } from '../../lib/customChannels';"
);

// Replace default/fallback functions
code = code.replace(/function channelDefaults\(channel\) \{[\s\S]*?\}/, '');
code = code.replace(/function channelFallbackLabel\(channel\) \{[\s\S]*?\}/, '');
code = code.replace(/function channelLeadField\(channel\) \{[\s\S]*?\}/, '');

code = code.replace(/GroupedStatusDropdown/g, 'GroupedChannelDropdown');
code = code.replace(/custom_statuses/g, 'custom_channels');
code = code.replace(/channelDefaults/g, 'getChannelDefaults');
code = code.replace(/Search status\.\.\./g, 'Search channel...');
code = code.replace(/Edit Statuses/g, 'Edit Channels');
code = code.replace(/Manage Statuses/g, 'Manage Channels');
code = code.replace(/No matching statuses/g, 'No matching channels');
code = code.replace(/reset all statuses/g, 'reset all channels');
code = code.replace(/reset statuses/g, 'reset channels');
code = code.replace(/Status label already exists/g, 'Channel label already exists');

// Handle leadField replacement and references to leadField
code = code.replace(/const leadField = channelLeadField\(channel\);/g, "const leadField = 'outreach_channel';");

// Handle status rename triggers logic
code = code.replace(/await rewriteAutomationRulesOnStatusRename\([\s\S]*?\);/, '');
code = code.replace(/window\.dispatchEvent\([\s\S]*?\);/, '');

// Fix update leads logic
code = code.replace(
  /if \(channel === 'calls'\) \{\s*await supabase\s*\.from\('leads'\)\s*\.update\(\{ call_status: newL \}\)\s*\.eq\('user_id', userId\)\s*\.eq\('call_status', oldLabel\);\s*\} else \{\s*await supabase\s*\.from\('leads'\)\s*\.update\(\{ status: newL \}\)\s*\.eq\('user_id', userId\)\s*\.eq\('status', oldLabel\);\s*\}/,
  "await supabase.from('leads').update({ outreach_channel: newL }).eq('user_id', userId).eq('outreach_channel', oldLabel);"
);

// Fix delete leads query
code = code.replace(
  /if \(channel === 'calls'\) \{\s*query\.eq\('call_status', labelToDelete\);\s*\} else \{\s*query\.eq\('status', labelToDelete\);\s*\}/,
  "query.eq('outreach_channel', labelToDelete);"
);

// Fix delete leads update
code = code.replace(
  /const updatePayload = channel === 'calls' \? \{ call_status: resetValue \} : \{ status: resetValue \};/,
  "const updatePayload = { outreach_channel: resetValue };"
);

// Fix type column usage instead of channel for custom_channels table
code = code.replace(/\.eq\('channel', channel\)/g, ".eq('type', channel)");
code = code.replace(/channel,\s*label:/g, "type: channel,\n              name: d.label,\n              label: undefined, // ensure we don't accidentally insert label");

// Replace label references for database inserts/updates
code = code.replace(/label: d\.label/g, "name: d.label");
code = code.replace(/label: newLabel\.trim\(\)/g, "name: newLabel.trim()");
code = code.replace(/update\(\{ label: newL, color: editingColor \}\)/g, "update({ name: newL, color: editingColor })");

// The table uses `name` but the UI uses `label`. So when fetching, we must map `name` to `label`.
code = code.replace(
  /return dedupeStatuses\(data\);/,
  "return dedupeStatuses(data.map(d => ({ ...d, label: d.name })));"
);

code = code.replace(
  /const uniqueData = \[\];[\s\S]*?data\.forEach\(d => \{/,
  "const uniqueData = [];\n          data.forEach(item => { const d = { ...item, label: item.name };"
);

fs.writeFileSync('c:/Users/T15/reachdesk/src/components/CRM/GroupedChannelDropdown.jsx', code);
