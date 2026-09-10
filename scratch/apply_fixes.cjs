const fs = require('fs');

// 1. GroupedChannelDropdown.jsx
let dropdown = fs.readFileSync('src/components/CRM/GroupedChannelDropdown.jsx', 'utf8');
dropdown = dropdown.replace(
  /\.insert\(seedMissing\)/,
  ".upsert(seedMissing, { onConflict: 'user_id,type,name', ignoreDuplicates: true })"
);
dropdown = dropdown.replace(
  /\.insert\(seedData\)/,
  ".upsert(seedData, { onConflict: 'user_id,type,name', ignoreDuplicates: true })"
);
fs.writeFileSync('src/components/CRM/GroupedChannelDropdown.jsx', dropdown, 'utf8');

// 2. CRM.jsx
let crm = fs.readFileSync('src/components/CRM.jsx', 'utf8');

crm = crm.replace(
  'const [callStatuses, setCallStatuses] = useState([]);',
  'const [callStatuses, setCallStatuses] = useState([]);\n  const [customChannels, setCustomChannels] = useState([]);'
);

crm = crm.replace(
  '      setFolders(fData);\n      setSmartFolders(ufData);',
  '      setFolders(fData);\n      setSmartFolders(ufData);\n\n      const { data: chData } = await supabase.from(\'custom_channels\').select(\'*\').in(\'user_id\', teamIds).order(\'sort_order\', { ascending: true });\n      if (chData) setCustomChannels(chData);'
);

const newRuleBuilder = `{rule.field === 'Status' ? (
                        <select
                          value={rule.value}
                          onChange={e => {
                            const newRules = [...smartFolderForm.rules];
                            newRules[idx].value = e.target.value;
                            setSmartFolderForm({...smartFolderForm, rules: newRules});
                          }}
                          className="form-select"
                          style={{ flex: 1.5, minWidth: '150px' }}
                          required
                        >
                          <option value="">-- Select Status --</option>
                          {statuses.length > 0 ? (
                            statuses.map(s => (
                              <option key={s.id || s.label} value={s.label}>{s.label}</option>
                            ))
                          ) : (
                            DEFAULT_STATUSES.map(s => (
                              <option key={s.label} value={s.label}>{s.label}</option>
                            ))
                          )}
                        </select>
                      ) : rule.field === 'Channel' ? (
                        <select
                          value={rule.value}
                          onChange={e => {
                            const newRules = [...smartFolderForm.rules];
                            newRules[idx].value = e.target.value;
                            setSmartFolderForm({...smartFolderForm, rules: newRules});
                          }}
                          className="form-select"
                          style={{ flex: 1.5, minWidth: '150px' }}
                          required
                        >
                          <option value="">-- Select Channel --</option>
                          {(() => {
                            const uniqueNames = new Set();
                            const options = [];
                            const addOption = (name) => {
                              if (!uniqueNames.has(name.toLowerCase())) {
                                uniqueNames.add(name.toLowerCase());
                                options.push(<option key={name} value={name}>{name}</option>);
                              }
                            };
                            getChannelDefaults('messaging').forEach(c => addOption(c.label));
                            getChannelDefaults('calls').forEach(c => addOption(c.label));
                            customChannels.forEach(c => addOption(c.name));
                            return options;
                          })()}
                        </select>
                      ) : rule.field === 'Priority' ? (`;

crm = crm.replace(
  /{rule\.field === 'Status' \? \([\s\S]*?\) : rule\.field === 'Priority' \? \(/,
  newRuleBuilder
);

crm = crm.replace(
  'const tdProps = { key: col.id, style: cellWidth(col.column_key) };',
  'const { key: tdKey, ...tdProps } = { key: col.id, style: cellWidth(col.column_key) };'
);
crm = crm.replace(/<td \{\.\.\.tdProps\}/g, '<td key={tdKey} {...tdProps}');

fs.writeFileSync('src/components/CRM.jsx', crm, 'utf8');
