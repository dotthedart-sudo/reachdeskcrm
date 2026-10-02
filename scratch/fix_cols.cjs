const fs = require('fs');
let code = fs.readFileSync('src/components/CRM/crmTableColumns.js', 'utf8');

const oldStr = `  { table_view: 'call_queue', column_key: 'call_action', column_label: 'Call next step', column_type: 'dropdown', is_visible: true, is_default: true, sort_order: 5, dropdown_options: CALL_ACTION_DEFAULT_OPTIONS },
  { table_view: 'call_queue', column_key: 'script_used', column_label: 'Script', column_type: 'template', is_visible: true, is_default: true, sort_order: 6, dropdown_options: [] },
  { table_view: 'call_queue', column_key: 'status', column_label: 'Status', column_type: 'status', is_visible: true, is_default: true, sort_order: 7, dropdown_options: [] },`;

const newStr = `  { table_view: 'call_queue', column_key: 'script_used', column_label: 'Script', column_type: 'template', is_visible: true, is_default: true, sort_order: 5, dropdown_options: [] },
  { table_view: 'call_queue', column_key: 'status', column_label: 'Status', column_type: 'status', is_visible: true, is_default: true, sort_order: 6, dropdown_options: [] },
  { table_view: 'call_queue', column_key: 'call_action', column_label: 'Call next step', column_type: 'dropdown', is_visible: true, is_default: true, sort_order: 7, dropdown_options: CALL_ACTION_DEFAULT_OPTIONS },`;

if (code.includes(oldStr)) {
  code = code.replace(oldStr, newStr);
  fs.writeFileSync('src/components/CRM/crmTableColumns.js', code);
  console.log('Fixed crmTableColumns.js');
} else {
  console.log('Could not find oldStr in crmTableColumns.js');
}

let callTable = fs.readFileSync('src/components/CRM/callActivity/CallQueueTable.jsx', 'utf8');
if (callTable.includes('case \\\'status\\\':')) {
  console.log('CallQueueTable.jsx has the switch case correctly');
}

