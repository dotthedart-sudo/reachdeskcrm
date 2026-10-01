const fs = require('fs');

function applyChanges() {
  let code = fs.readFileSync('src/components/CRM.jsx', 'utf8');

  // 1. Import CRMBulkActionBar
  code = code.replace(
    "import CallQueueTable from './CRM/callActivity/CallQueueTable';",
    "import CallQueueTable from './CRM/callActivity/CallQueueTable';\nimport CRMBulkActionBar from './CRM/CRMBulkActionBar';"
  );

  // 2. Add confirm modal state & handler
  const stateInsert = "const [showBulkChannelMenu, setShowBulkChannelMenu] = useState(false);";
  const newState = `const [showBulkChannelMenu, setShowBulkChannelMenu] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [confirmRemoveFromQueue, setConfirmRemoveFromQueue] = useState(false);

  const handleBulkUpdateFields = async (updates, successMsg = 'Updated · Undo') => {
    try {
      await supabase.from('leads').update(updates).in('id', selectedIds).eq('user_id', currentUser.id);
      setLeads(prev => prev.map(l => selectedIds.includes(l.id) ? { ...l, ...updates } : l));
      setSelectedIds([]);
      if (showToast) showToast(successMsg);
    } catch (err) {
      console.error('Error during bulk update:', err);
    }
  };

  const executeBulkDelete = async () => {
    setConfirmBulkDelete(false);
    try {
      await supabase.from('outreach_log').delete().in('lead_id', selectedIds);
      await supabase.from('leads').delete().in('id', selectedIds);
      setLeads(prev => prev.filter(l => !selectedIds.includes(l.id)));
      setSelectedIds([]);
    } catch (err) {
      console.error('Error during bulk delete:', err);
    }
  };`;
  code = code.replace(stateInsert, newState);

  // 3. Clear selection on changes
  code = code.replace(
    "const handleModeChange = (mode) => {",
    "const handleModeChange = (mode) => {\n    setSelectedIds([]);"
  );
  code = code.replace(
    "const handleSelectFolder = (id) => {",
    "const handleSelectFolder = (id) => {\n    setSelectedIds([]);"
  );
  code = code.replace(
    "setSearchQuery(e.target.value)",
    "setSearchQuery(e.target.value); setSelectedIds([])"
  );

  // 4. Update the Cold Calls toolbar to use Pills and remove old tabs
  const coldCallsToolbarSearch = `
        {outreachMode === 'calls' ? (
          callSubView === 'queue' ? (
            <>
            <div className="flex justify-between align-center" style={{ flexWrap: 'wrap', gap: '1rem', marginBottom: '0.5rem' }}>
              <div className="flex gap-2 align-center" style={{ flex: 1, minWidth: '280px' }}>
                <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
`.trim();
  const coldCallsToolbarReplace = `
        {outreachMode === 'calls' ? (
          callSubView === 'queue' ? (
            <>
            <div className="flex justify-between align-center" style={{ flexWrap: 'wrap', gap: '1rem', marginBottom: '0.5rem' }}>
              <div className="flex gap-2 align-center" style={{ flex: 1, minWidth: '280px' }}>
                <div className="flex gap-1" style={{ background: 'var(--bg-secondary)', padding: '0.2rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <button type="button" onClick={() => { handleCallSubViewChange('queue'); setSelectedIds([]); }} className={\`btn btn-sm \${callSubView === 'queue' ? 'btn-primary' : 'btn-secondary'}\`}>Call Queue</button>
                  <button type="button" onClick={() => { handleCallSubViewChange('log'); setSelectedIds([]); }} className={\`btn btn-sm \${callSubView === 'log' ? 'btn-primary' : 'btn-secondary'}\`}>Call Log</button>
                </div>
                <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
`.trim();
  code = code.replace(coldCallsToolbarSearch, coldCallsToolbarReplace);

  // 5. Update CallQueueTable props
  const callQueueTableSearch = `
            <CallQueueTable
              leads={sortedLeads}
              columnDefs={columnDefs}
`.trim();
  const callQueueTableReplace = `
            <CallQueueTable
              leads={paginatedList}
              allLeads={sortedLeads}
              selectedIds={selectedIds}
              onSelectRow={(id, checked) => setSelectedIds(prev => checked ? [...prev, id] : prev.filter(i => i !== id))}
              onSelectAll={(pageLeads) => {
                const allSelected = pageLeads.every(l => selectedIds.includes(l.id));
                if (allSelected) {
                  setSelectedIds(prev => prev.filter(id => !pageLeads.some(l => l.id === id)));
                } else {
                  const newIds = new Set([...selectedIds, ...pageLeads.map(l => l.id)]);
                  setSelectedIds(Array.from(newIds));
                }
              }}
              columnDefs={columnDefs}
`.trim();
  code = code.replace(callQueueTableSearch, callQueueTableReplace);

  // 6. Inline confirmation modals & remove old bulk-action-bar
  const oldBulkBarStart = "{/* Bulk Actions Menu Overlay */}";
  const oldBulkBarEnd = "</div>\n          </div>\n        )}";

  const startIndex = code.indexOf(oldBulkBarStart);
  if (startIndex === -1) {
    console.error("Could not find Bulk Actions Menu Overlay");
    return;
  }
  let endIndex = code.indexOf(oldBulkBarEnd, startIndex);
  if (endIndex === -1) {
    console.error("Could not find end of Bulk Actions Menu Overlay");
    return;
  }
  endIndex += oldBulkBarEnd.length;

  const newBulkActionBar = `
        {/* Bulk Actions Menu Overlay */}
        <CRMBulkActionBar
          selectedIds={selectedIds}
          activeList={activeList}
          paginatedList={paginatedList}
          outreachMode={outreachMode}
          canEdit={!isActiveFolderLocked}
          currentUser={currentUser}
          folders={folders.filter(f => f.user_id === currentUser?.id)}
          statuses={statuses}
          templates={templates}
          effectiveProfilesMap={effectiveProfilesMap}
          onSelectAll={() => setSelectedIds(activeList.map(l => l.id))}
          onClear={() => setSelectedIds([])}
          onClearCurrentPage={() => setSelectedIds(paginatedList.map(l => l.id))}
          onStatusChange={handleBulkStatusChange}
          onChannelChange={handleBulkChannelChange}
          onMoveToFolder={handleBulkMoveToFolder}
          onExport={() => handleExportLeadsSubset(leads.filter(l => selectedIds.includes(l.id)), 'selected')}
          onDelete={() => setConfirmBulkDelete(true)}
          onFieldChange={(field, value) => {
            if (field === 'call_action' && value === 'No call needed') {
              setConfirmRemoveFromQueue(true);
            } else if (field === 'schedule_callback') {
              handleBulkUpdateFields({ call_action: 'Callback scheduled', next_checkpoint_at: value }, 'Callback scheduled');
            } else {
              handleBulkUpdateFields({ [field]: value });
            }
          }}
        />
        
        {confirmBulkDelete && (
          <div className="rd-modal rd-modal--open">
            <div className="rd-modal-content" style={{ maxWidth: 400 }}>
              <h3 style={{ margin: 0, marginBottom: '0.5rem', color: 'var(--danger-color)' }}>Delete leads?</h3>
              <p style={{ margin: 0, marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>
                Are you sure you want to permanently delete {selectedIds.length} leads?
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => setConfirmBulkDelete(false)}>Cancel</button>
                <button type="button" className="btn btn-danger" style={{ backgroundColor: 'var(--danger-color)', color: 'white' }} onClick={executeBulkDelete}>Delete</button>
              </div>
            </div>
          </div>
        )}
        
        {confirmRemoveFromQueue && (
          <div className="rd-modal rd-modal--open">
            <div className="rd-modal-content" style={{ maxWidth: 400 }}>
              <h3 style={{ margin: 0, marginBottom: '0.5rem' }}>Remove from queue?</h3>
              <p style={{ margin: 0, marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>
                Are you sure you want to remove {selectedIds.length} leads from the call queue? They will be marked as "No call needed".
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => setConfirmRemoveFromQueue(false)}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={() => { handleBulkUpdateFields({ call_action: 'No call needed' }, 'Removed from queue'); setConfirmRemoveFromQueue(false); }}>Remove</button>
              </div>
            </div>
          </div>
        )}
  `;

  code = code.substring(0, startIndex) + newBulkActionBar + code.substring(endIndex);

  // Finally, move pagination outside the outreachMode === 'messages' block so it applies to both
  const paginationStart = "{/* Pagination Section */}";
  const paginationEndPattern = "</div>\n        </div>\n        </>\n        ) : (";
  const paginationIndex = code.indexOf(paginationStart);
  if (paginationIndex !== -1) {
    const endP = code.indexOf(paginationEndPattern, paginationIndex);
    if (endP !== -1) {
      const paginationBlock = code.substring(paginationIndex, endP + "</div>\n        </div>".length);
      code = code.substring(0, paginationIndex) + code.substring(endP + "</div>\n        </div>".length);
      // Place it right before the last closing tags of the CRM table wrapper
      const listWrapperEnd = "</div>\n    </div>\n  );";
      const insertPos = code.lastIndexOf(listWrapperEnd);
      if (insertPos !== -1) {
        code = code.substring(0, insertPos) + "\n" + paginationBlock + "\n" + code.substring(insertPos);
      }
    }
  }

  fs.writeFileSync('src/components/CRM.jsx', code);
  console.log('CRM rewrite complete');
}

applyChanges();
