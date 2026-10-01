import React, { useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import RdSelect from '../ui/RdSelect';
import EditableDropdown from './EditableDropdown';
import GroupedTemplateDropdown from './GroupedTemplateDropdown';
import { CALL_ACTION_DEFAULT_OPTIONS } from './crmTableColumns';
import { TEMPLATE_KINDS } from '../../lib/templateKinds';
import { getChannelDefaults } from '../../lib/customChannels';
import DateTimePickerCell from './DateTimePickerCell';
import { getEffectiveUserTimeZone } from '../../lib/dateTime';

export default function CRMBulkActionBar({
  selectedIds = [],
  activeList = [],
  paginatedList = [],
  outreachMode = 'messages',
  onSelectAll,
  onClear,
  onClearCurrentPage,
  onStatusChange,
  onChannelChange,
  onMoveToFolder,
  onExport,
  onDelete,
  onFieldChange,
  folders = [],
  statuses = [],
  templates = [],
  teamProfilesMap = {},
  currentUser,
  canEdit = true
}) {
  const [showBulkStatusMenu, setShowBulkStatusMenu] = useState(false);
  const [showBulkChannelMenu, setShowBulkChannelMenu] = useState(false);
  const [showBulkAssignMenu, setShowBulkAssignMenu] = useState(false);
  const [showCallbackPicker, setShowCallbackPicker] = useState(false);

  if (selectedIds.length === 0) return null;

  const count = selectedIds.length;
  const userTimeZone = getEffectiveUserTimeZone(currentUser);

  return (
    <div className="bulk-action-bar">
      <div className="bulk-action-bar__meta">
        <span>{count} leads selected</span>
        {count === paginatedList.length && activeList.length > paginatedList.length && (
          <button 
            onClick={onSelectAll} 
            className="btn btn-secondary btn-sm bulk-action-bar__link"
          >
            Select all {activeList.length} leads in this view
          </button>
        )}
        {count === activeList.length && activeList.length > paginatedList.length && (
          <button 
            onClick={onClearCurrentPage} 
            className="btn btn-secondary btn-sm bulk-action-bar__link"
          >
            Clear selection (keep current page only)
          </button>
        )}
      </div>
      
      {!canEdit ? (
        <div className="bulk-action-bar__actions">
          <button onClick={onClear} className="btn btn-secondary btn-sm">Clear</button>
        </div>
      ) : (
        <div className="bulk-action-bar__actions">
          {/* Status Dropdown */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowBulkStatusMenu(!showBulkStatusMenu)} className="btn btn-secondary btn-sm">
              Status ▾
            </button>
            {showBulkStatusMenu && (
              <div className="rd-menu rd-menu--anchored" style={{ bottom: '100%', top: 'auto', right: 0, left: 'auto', minWidth: 160, zIndex: 9999 }}>
                <div className="rd-menu__list">
                  {(statuses.length > 0 ? statuses : [{label: 'Cold'}, {label: 'Warm'}, {label: 'Hot'}]).map(s => (
                    <button
                      key={s.label}
                      type="button"
                      className="rd-menu__item"
                      onClick={() => { onStatusChange(s.label); setShowBulkStatusMenu(false); }}
                    >
                      <span className="rd-menu__item-label">{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {outreachMode === 'calls' && (
            <>
              {/* Call Next Step */}
              <div style={{ position: 'relative' }}>
                <EditableDropdown
                  value=""
                  columnDef={{ column_type: 'dropdown', dropdown_options: CALL_ACTION_DEFAULT_OPTIONS }}
                  onChange={(val) => onFieldChange('call_action', val)}
                  onUpdateColumnDef={() => {}}
                  placeholder="Call next step"
                />
              </div>

              {/* Script */}
              <div style={{ position: 'relative' }}>
                <GroupedTemplateDropdown
                  value=""
                  onChange={(val) => onFieldChange('script_used', val)}
                  templates={templates}
                  kind={TEMPLATE_KINDS.CALLS}
                  placeholder="Script"
                />
              </div>
            </>
          )}

          {/* Channel Dropdown */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowBulkChannelMenu(!showBulkChannelMenu)} className="btn btn-secondary btn-sm">
              Channel ▾
            </button>
            {showBulkChannelMenu && (
              <div className="rd-menu rd-menu--anchored" style={{ bottom: '100%', top: 'auto', right: 0, left: 'auto', minWidth: 160, zIndex: 9999 }}>
                <div className="rd-menu__list">
                  {getChannelDefaults('messaging').map(c => (
                    <button
                      key={c.label}
                      type="button"
                      className="rd-menu__item"
                      onClick={() => { onChannelChange(c.label); setShowBulkChannelMenu(false); }}
                    >
                      <span className="rd-menu__item-label">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Assign */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowBulkAssignMenu(!showBulkAssignMenu)} className="btn btn-secondary btn-sm">
              Assign ▾
            </button>
            {showBulkAssignMenu && (
              <div className="rd-menu rd-menu--anchored" style={{ bottom: '100%', top: 'auto', right: 0, left: 'auto', minWidth: 160, zIndex: 9999 }}>
                <div className="rd-menu__list">
                  {Object.entries(teamProfilesMap || {}).map(([id, entry]) => (
                    <button
                      key={id}
                      type="button"
                      className="rd-menu__item"
                      onClick={() => { onFieldChange('assigned_to', id); setShowBulkAssignMenu(false); }}
                    >
                      <span className="rd-menu__item-label">{id === currentUser?.id ? 'You' : (entry.first_name || entry.email)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {outreachMode === 'calls' && (
            <>
              {/* Schedule callback */}
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowCallbackPicker(!showCallbackPicker)} className="btn btn-secondary btn-sm">
                  Schedule callback
                </button>
                {showCallbackPicker && (
                  <div style={{ position: 'absolute', bottom: '100%', right: 0, zIndex: 9999, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem', marginBottom: '0.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    <DateTimePickerCell
                      compact
                      value={null}
                      timeZone={userTimeZone}
                      onChange={(iso) => {
                        onFieldChange('schedule_callback', iso);
                        setShowCallbackPicker(false);
                      }}
                      placeholder="Select date & time"
                    />
                  </div>
                )}
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  if (window.confirm("Are you sure you want to remove these leads from the call queue?")) {
                    onFieldChange('call_action', 'No call needed');
                  }
                }}
              >
                Remove from queue
              </button>
            </>
          )}

          {folders.length > 0 && (
            <RdSelect
              size="sm"
              ariaLabel="Move to list"
              placeholder="Move to list"
              value=""
              options={[
                { value: '__unfiled__', label: '(Unfiled)' },
                ...folders.map((f) => ({ value: f.id, label: f.name })),
              ]}
              onChange={(val) => onMoveToFolder(val === '__unfiled__' ? '' : val)}
            />
          )}

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onExport}
          >
            <Download size={12} /> Export CSV
          </button>
          
          <button onClick={onDelete} className="btn btn-danger btn-sm" style={{ backgroundColor: 'var(--danger-color)', color: 'white' }}>
            <Trash2 size={12} /> Delete
          </button>
          
          <button onClick={onClear} className="btn btn-secondary btn-sm">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
