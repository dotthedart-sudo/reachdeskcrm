import React, { useState, useRef, useEffect } from 'react';
import { ExternalLink, Plus, X } from 'lucide-react';
import CopyableCell from './CopyableCell';
import EditableDropdown from './EditableDropdown';
import DateTimePickerCell from './DateTimePickerCell';
import { supabase } from '../../lib/supabase';
import { logLeadTimelineEvent } from '../../lib/leadTimeline';

export default function CustomFieldCell({ lead, col, onChange, currentUser, templates, suggestionRules, setColumnDefs, onRefresh }) {
  const isCustom = !col.is_default;
  // Fallback for non-custom fields (though this component is meant for custom_fields)
  const cellValue = isCustom ? lead.custom_fields?.[col.column_key] : lead[col.column_key];
  const [localVal, setLocalVal] = useState(cellValue);
  const [editing, setEditing] = useState(false);
  const [tempVal, setTempVal] = useState(cellValue || '');
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [newLink, setNewLink] = useState('');
  
  const linkPopoverRef = useRef(null);
  
  useEffect(() => {
    setLocalVal(cellValue);
    setTempVal(cellValue || '');
  }, [cellValue]);

  // Format link array for backwards compat
  const linkArray = Array.isArray(localVal) 
    ? localVal 
    : (typeof localVal === 'string' && localVal ? [localVal] : []);

  useEffect(() => {
    if (!showLinkPopover) return undefined;
    const handleClickOutside = (e) => {
      if (linkPopoverRef.current && !linkPopoverRef.current.contains(e.target)) {
        setShowLinkPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showLinkPopover]);

  const handleSave = async (val) => {
    if (val === localVal) return;
    setLocalVal(val);

    if (isCustom) {
      const mergedCustomFields = { ...(lead.custom_fields || {}) };
      mergedCustomFields[col.column_key] = val;
      onChange?.(mergedCustomFields); // Optimistic immediate parent notification

      try {
        const { data: latestLead } = await supabase
          .from('leads')
          .select('custom_fields')
          .eq('id', lead.id)
          .single();
          
        const dbCustomFields = { ...(latestLead?.custom_fields || {}), [col.column_key]: val };

        const { error: updateErr } = await supabase
          .from('leads')
          .update({ custom_fields: dbCustomFields })
          .eq('id', lead.id);

        if (!updateErr) {
          logLeadTimelineEvent({
            leadId: lead.id,
            userId: currentUser?.id,
            teamId: currentUser?.team_id || null,
            eventType: 'field_updated',
            summary: `Updated ${col.column_label || col.column_key}`,
            detail: { field: col.column_key, from: cellValue || 'None', to: val }
          });
        }
      } catch (err) {
        console.error('Error saving custom field:', err);
      }
    } else {
      onChange?.(val);
      try {
        await supabase.from('leads').update({ [col.column_key]: val }).eq('id', lead.id);
      } catch (err) {
        console.error('Error saving field:', err);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      setEditing(false);
      handleSave(tempVal);
    } else if (e.key === 'Escape') {
      setEditing(false);
      setTempVal(cellValue || '');
    }
  };

  const handleBlur = () => {
    setEditing(false);
    handleSave(tempVal);
  };

  const handleAddLink = (e) => {
    e.preventDefault();
    if (!newLink.trim()) return;
    let url = newLink.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    const newArray = [...linkArray, url];
    handleSave(newArray);
    setNewLink('');
    setShowLinkPopover(false);
  };

  const handleRemoveLink = (e, indexToRemove) => {
    e.stopPropagation();
    const newArray = linkArray.filter((_, idx) => idx !== indexToRemove);
    handleSave(newArray.length > 0 ? newArray : null);
  };

  const extractDomain = (url) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url.slice(0, 22);
    }
  };

  if (col.column_type === 'dropdown') {
    return (
      <EditableDropdown
        value={localVal}
        columnDef={col}
        onChange={(val) => handleSave(val)}
        onUpdateColumnDef={(id, newOpts) => {
          if (setColumnDefs) {
            setColumnDefs(prev => prev.map(c => c.id === id ? { ...c, dropdown_options: newOpts } : c));
          }
        }}
      />
    );
  }

  if (col.column_type === 'date') {
    return (
      <DateTimePickerCell
        compact
        value={localVal || null}
        timeZone={currentUser?.timezone || 'UTC'}
        onChange={(iso) => handleSave(iso)}
        placeholder="—"
      />
    );
  }

  if (col.column_type === 'link') {
    return (
      <div 
        style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', position: 'relative', minHeight: '24px', alignItems: 'center' }} 
        onClick={(e) => {
          e.stopPropagation();
          setShowLinkPopover(true);
        }}
      >
        {linkArray.length === 0 && <span style={{ color: 'var(--text-muted)' }}>—</span>}
        
        {linkArray.map((url, idx) => (
          <a
            key={idx}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="custom-link-chip"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 6px',
              background: 'var(--bg-hover)',
              borderRadius: '4px',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              border: '1px solid var(--border)'
            }}
          >
            <ExternalLink size={10} />
            {extractDomain(url)}
            <button
              type="button"
              onClick={(e) => handleRemoveLink(e, idx)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                marginLeft: '2px'
              }}
            >
              <X size={10} />
            </button>
          </a>
        ))}

        {showLinkPopover && (
          <div 
            ref={linkPopoverRef}
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 50,
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              marginTop: '4px',
              display: 'flex',
              gap: '6px',
              width: '200px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={handleAddLink} style={{ display: 'flex', gap: '4px', width: '100%' }}>
              <input
                autoFocus
                type="text"
                placeholder="example.com"
                value={newLink}
                onChange={(e) => setNewLink(e.target.value)}
                style={{ flex: 1, padding: '4px 8px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-base)', color: 'var(--text-primary)' }}
              />
              <button
                type="submit"
                className="btn btn-primary"
                style={{ padding: '4px 8px', minHeight: 'auto', display: 'flex', alignItems: 'center' }}
              >
                <Plus size={14} />
              </button>
            </form>
          </div>
        )}
      </div>
    );
  }

  // text or number
  if (editing) {
    return (
      <input
        autoFocus
        type={col.column_type === 'number' ? 'number' : 'text'}
        value={tempVal}
        onChange={(e) => setTempVal(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          padding: '2px 4px',
          fontSize: '0.85rem',
          border: '1px solid var(--border-focus)',
          borderRadius: '3px',
          background: 'var(--bg-base)',
          color: 'var(--text-primary)'
        }}
      />
    );
  }

  return (
    <div 
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      style={{ minHeight: '24px', display: 'flex', alignItems: 'center', cursor: 'text' }}
    >
      <CopyableCell value={localVal || ''} onCopied={() => {}} variant="inline">
        {localVal || <span style={{ color: 'var(--text-muted)' }}>—</span>}
      </CopyableCell>
    </div>
  );
}
