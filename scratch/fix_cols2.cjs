const fs = require('fs');
let code = fs.readFileSync('src/components/CRM/crmTableColumns.js', 'utf8');

const targetStr1 = "{ table_view: 'call_queue', column_key: 'call_action', column_label: 'Call next step', column_type: 'dropdown', is_visible: true, is_default: true, sort_order: 5, dropdown_options: CALL_ACTION_DEFAULT_OPTIONS }";
const targetStr2 = "{ table_view: 'call_queue', column_key: 'script_used', column_label: 'Script', column_type: 'template', is_visible: true, is_default: true, sort_order: 6, dropdown_options: [] }";
const targetStr3 = "{ table_view: 'call_queue', column_key: 'status', column_label: 'Status', column_type: 'status', is_visible: true, is_default: true, sort_order: 7, dropdown_options: [] }";

code = code.replace(targetStr1, "{ table_view: 'call_queue', column_key: 'script_used', column_label: 'Script', column_type: 'template', is_visible: true, is_default: true, sort_order: 5, dropdown_options: [] }");
code = code.replace(targetStr2, "{ table_view: 'call_queue', column_key: 'status', column_label: 'Status', column_type: 'status', is_visible: true, is_default: true, sort_order: 6, dropdown_options: [] }");
code = code.replace(targetStr3, "{ table_view: 'call_queue', column_key: 'call_action', column_label: 'Call next step', column_type: 'dropdown', is_visible: true, is_default: true, sort_order: 7, dropdown_options: CALL_ACTION_DEFAULT_OPTIONS }");

fs.writeFileSync('src/components/CRM/crmTableColumns.js', code);
console.log('Fixed column order');
