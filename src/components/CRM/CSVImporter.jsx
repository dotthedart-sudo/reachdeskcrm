import React, { useState, useEffect } from 'react';
import { X, Upload, ArrowRight, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fetchAllLeadsForScope } from '../../lib/leadsQuery';

function parseCSV(text) {
  const lines = [];
  let row = [""];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i+1];
    
    if (c === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push('');
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') {
        i++;
      }
      lines.push(row);
      row = [''];
    } else {
      row[row.length - 1] += c;
    }
  }
  if (row.length > 1 || row[0] !== '') {
    lines.push(row);
  }
  return lines;
}

export default function CSVImporter({
  isOpen,
  onClose,
  onImportComplete,
  columnDefs,
  currentUser,
  folderId,
  folders = [],
}) {
  const [step, setStep] = useState(1); // 1: Upload, 2: Map, 3: Strategy, 4: Progress, 5: Summary
  const [file, setFile] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [duplicateStrategy, setDuplicateStrategy] = useState('skip'); // 'skip' | 'overwrite'
  const [destinationFolderId, setDestinationFolderId] = useState(folderId || '');
  
  // Progress & Stats
  const [totalRows, setTotalRows] = useState(0);
  const [progress, setProgress] = useState(0);
  const [importStats, setImportStats] = useState({ imported: 0, skipped: 0, errors: 0 });

  // Map of available ReachDesk CRM fields
  const getAvailableFields = () => {
    const fields = [
      { key: 'first_name', label: 'First Name *' },
      { key: 'last_name', label: 'Last Name *' },
      { key: 'email', label: 'Email Address *' },
      { key: 'phone', label: 'Phone' },
      { key: 'company', label: 'Company' },
      { key: 'instagram_url', label: 'Instagram URL' },
      { key: 'platform', label: 'Platform (Social media)' },
      { key: 'priority', label: 'Priority' },
      { key: 'status', label: 'Pipeline Status' },
      { key: 'action_to_take', label: 'Action to Take' }
    ];

    // Include custom fields
    columnDefs.forEach(col => {
      if (!col.is_default) {
        fields.push({
          key: `custom_fields.${col.column_key}`,
          label: `${col.column_label} (Custom)`
        });
      }
    });

    fields.push({ key: 'skip', label: 'Skip Field' });
    return fields;
  };

  useEffect(() => {
    if (!isOpen) return;
    setDestinationFolderId(folderId || '');
  }, [isOpen, folderId]);

  const resolvedFolderId = destinationFolderId || folderId || null;
  const needsFolderPick = !folderId && folders.length > 0;

  const handleFileUpload = (e) => {
    const uploadedFile = e.target.files[0];
    if (!uploadedFile) return;
    setFile(uploadedFile);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const parsed = parseCSV(text).filter(row => row.some(cell => cell.trim()));
      
      if (parsed.length < 2) {
        alert('CSV must contain a header row and at least one data row.');
        return;
      }

      setCsvData(parsed);
      const csvHeaders = parsed[0].map(h => h.trim());
      setHeaders(csvHeaders);

      // Auto-suggest mapping
      const fields = getAvailableFields();
      const initialMapping = {};
      csvHeaders.forEach((header, index) => {
        const cleanedHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '');
        const matchedField = fields.find(f => {
          const cleanedField = f.key.replace('custom_fields.', '').replace(/[^a-z0-9]/g, '');
          return cleanedField === cleanedHeader || cleanedHeader.includes(cleanedField) || cleanedField.includes(cleanedHeader);
        });
        
        if (matchedField && matchedField.key !== 'skip') {
          initialMapping[index] = matchedField.key;
        } else {
          initialMapping[index] = 'skip';
        }
      });
      
      setMapping(initialMapping);
      setStep(2);
    };
    reader.readAsText(uploadedFile);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const uploadEvent = { target: { files: [files[0]] } };
      handleFileUpload(uploadEvent);
    }
  };

  const executeImport = async () => {
    if (needsFolderPick && !destinationFolderId) {
      alert('Choose a list to assign imported leads to, or import from inside a list.');
      return;
    }
    setStep(4);
    setProgress(0);
    const dataRows = csvData.slice(1);
    setTotalRows(dataRows.length);

    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    const fields = getAvailableFields();
    
    // Fetch all existing emails to do clientside skip or overwrite logic
    let existingLeadsMap = {};
    try {
      const leadsData = await fetchAllLeadsForScope({
        userIds: [currentUser.id],
        columns: 'id, email',
      });

      leadsData?.forEach(l => {
        if (l.email) existingLeadsMap[l.email.toLowerCase().trim()] = l.id;
      });
    } catch (err) {
      console.error('Error fetching existing leads for de-duplication:', err);
    }

    const batchSize = 10;
    for (let i = 0; i < dataRows.length; i += batchSize) {
      const batch = dataRows.slice(i, i + batchSize);
      const insertData = [];
      const updateData = [];

      for (const row of batch) {
        const leadObj = {
          user_id: currentUser.id,
          folder_id: resolvedFolderId,
          custom_fields: {},
          status: 'Lead',
          priority: 'medium'
        };

        headers.forEach((_, colIdx) => {
          const fieldKey = mapping[colIdx];
          const rawValue = row[colIdx]?.trim() || '';

          if (!fieldKey || fieldKey === 'skip') return;

          if (fieldKey.startsWith('custom_fields.')) {
            const customKey = fieldKey.replace('custom_fields.', '');
            const colDef = columnDefs.find(c => c.column_key === customKey);
            if (colDef && colDef.column_type === 'link') {
              leadObj.custom_fields[customKey] = rawValue ? rawValue.split(',').map(s=>s.trim()).filter(Boolean) : [];
            } else {
              leadObj.custom_fields[customKey] = rawValue;
            }
          } else {
            leadObj[fieldKey] = rawValue;
          }
        });

        // Validation: Must have at least a first name and email
        if (!leadObj.first_name || !leadObj.email) {
          errorCount++;
          continue;
        }

        const emailLower = leadObj.email.toLowerCase().trim();
        const existingLeadId = existingLeadsMap[emailLower];

        if (existingLeadId) {
          if (duplicateStrategy === 'skip') {
            skippedCount++;
          } else {
            // Overwrite
            leadObj.id = existingLeadId;
            updateData.push(leadObj);
          }
        } else {
          insertData.push(leadObj);
        }
      }

      // Execute supabase updates and inserts
      try {
        if (insertData.length > 0) {
          const { error } = await supabase.from('leads').insert(insertData);
          if (error) {
            console.error('Batch insert error:', error.message);
            errorCount += insertData.length;
          } else {
            importedCount += insertData.length;
          }
        }
        if (updateData.length > 0) {
          for (const upd of updateData) {
            const { error } = await supabase.from('leads').update(upd).eq('id', upd.id);
            if (error) {
              console.error('Lead update error:', error.message);
              errorCount++;
            } else {
              importedCount++;
            }
          }
        }
      } catch (err) {
        console.error('Error during batch execution:', err);
        errorCount += batch.length;
      }

      // Update progress
      const currentProgress = Math.min(100, Math.round(((i + batch.length) / dataRows.length) * 100));
      setProgress(currentProgress);
      setImportStats({ imported: importedCount, skipped: skippedCount, errors: errorCount });
    }

    // Log the import to csv_imports table
    try {
      await supabase.from('csv_imports').insert({
        user_id: currentUser.id,
        filename: file?.name || 'imported_leads.csv',
        total_rows: dataRows.length,
        imported: importedCount,
        skipped: skippedCount,
        errors: errorCount,
        field_mapping: mapping,
        duplicate_strategy: duplicateStrategy,
        status: 'completed'
      });
    } catch (err) {
      console.error('Failed to log import to csv_imports:', err);
    }

    // ── Auto-create column_definitions for new custom columns ──────────
    try {
      // Collect all unique custom keys used in this import
      const customKeysUsed = [...new Set(
        Object.values(mapping)
          .filter(v => v && v.startsWith('custom_fields.'))
          .map(v => v.replace('custom_fields.', ''))
      )];

      if (customKeysUsed.length > 0) {
        // Find which ones don't already have column_definitions
        const { data: existingCols } = await supabase
          .from('column_definitions')
          .select('column_key, table_view')
          .eq('user_id', currentUser.id)
          .in('column_key', customKeysUsed);

        const existingSet = new Set((existingCols || []).map(c => `${c.column_key}:${c.table_view}`));

        // Get current max sort_order
        const { data: allCols } = await supabase
          .from('column_definitions')
          .select('sort_order')
          .eq('user_id', currentUser.id);
        const maxSort = Math.max(...(allCols || []).map(c => c.sort_order || 0), 0);

        const toInsert = [];
        customKeysUsed.forEach((key, i) => {
          // Find the CSV column index mapped to this key
          const colIdxStr = Object.entries(mapping).find(([, v]) => v === `custom_fields.${key}`)?.[0];
          const colIdx = colIdxStr !== undefined ? parseInt(colIdxStr) : -1;

          // Sample up to 5 values to detect type
          const samples = colIdx >= 0
            ? csvData.slice(1, 6).map(row => row[colIdx]?.trim()).filter(Boolean)
            : [];

          let colType = 'text';
          if (samples.length > 0) {
            const allDates = samples.every(s =>
              /^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{2}\/\d{2}\/\d{4}$/.test(s)
            );
            const allLinks = samples.every(s =>
              s.startsWith('http://') || s.startsWith('https://')
            );
            if (allDates) colType = 'date';
            else if (allLinks) colType = 'link';
          }

          // Original header name for label
          const originalLabel = colIdx >= 0 ? (headers[colIdx] || key) : key;
          const sortBase = maxSort + 1 + i * 2;

          for (const tview of ['contact_details', 'pipeline']) {
            if (!existingSet.has(`${key}:${tview}`)) {
              toInsert.push({
                user_id: currentUser.id,
                table_view: tview,
                column_key: key,
                column_label: originalLabel,
                column_type: colType,
                is_visible: true,
                is_default: false,
                sort_order: sortBase,
                dropdown_options: []
              });
            }
          }
        });

        if (toInsert.length > 0) {
          await supabase.from('column_definitions').insert(toInsert);
        }
      }
    } catch (colErr) {
      console.warn('Could not auto-create column definitions:', colErr.message);
    }

    setStep(5);
    if (onImportComplete) {
      onImportComplete();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ maxWidth: '640px', width: '95%', padding: '2rem' }}>
        <div className="modal-header">
          <h3>CSV Field Mapping Import</h3>
          <button type="button" onClick={onClose} className="theme-toggle"><X size={18} /></button>
        </div>

        {/* Step 1: Upload File */}
        {step === 1 && (
          <div className="flex-col gap-4">
            <div 
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              style={{
                border: '2px dashed var(--border-color)',
                borderRadius: '12px',
                padding: '3rem 2rem',
                textAlign: 'center',
                backgroundColor: 'var(--bg-secondary)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1rem',
                transition: 'var(--transition-smooth)'
              }}
              onClick={() => document.getElementById('csv-file-picker').click()}
            >
              <Upload size={48} style={{ color: 'var(--accent-blue)' }} />
              <div>
                <p style={{ fontWeight: 600, fontSize: '1.05rem' }}>Drag &amp; drop your CSV file here</p>
                <p className="color-muted" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>or click to browse from your computer</p>
              </div>
              <input
                id="csv-file-picker"
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Note: CSV file must contain a header row. Ensure fields like <strong>First Name</strong> and <strong>Email</strong> are present in your columns.
            </div>
          </div>
        )}

        {/* Step 2: Mapping UI */}
        {step === 2 && (
          <div className="flex-col gap-3">
            <div style={{ maxHeight: '320px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem' }}>CSV Header</th>
                    <th style={{ padding: '0.5rem' }}>Preview Values</th>
                    <th style={{ padding: '0.5rem' }}>Maps to ReachDesk CRM Field</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((header, colIdx) => {
                    const sample1 = csvData[1]?.[colIdx] || '';
                    const sample2 = csvData[2]?.[colIdx] || '';
                    const samples = [sample1, sample2].filter(Boolean).join(', ');
                    
                    return (
                      <tr key={colIdx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.5rem', fontWeight: 600 }}>{header}</td>
                        <td style={{ padding: '0.5rem', color: 'var(--text-muted)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {samples || '—'}
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <select
                            value={mapping[colIdx] || 'skip'}
                            onChange={e => setMapping({ ...mapping, [colIdx]: e.target.value })}
                            className="form-select btn-sm"
                            style={{ width: '180px' }}
                          >
                            {getAvailableFields().map(f => (
                              <option key={f.key} value={f.key}>{f.label}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between align-center mt-3">
              <button type="button" onClick={() => setStep(1)} className="btn btn-secondary btn-sm">
                Back
              </button>
              <button type="button" onClick={() => setStep(3)} className="btn btn-primary btn-sm">
                Next: Options <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Duplicate Strategy Options */}
        {step === 3 && (
          <div className="flex-col gap-4">
            <h4 style={{ fontSize: '1rem', fontWeight: 600 }}>Configure Import Settings</h4>
            
            <div 
              style={{ 
                padding: '1.25rem', 
                background: 'var(--bg-secondary)', 
                border: '1px solid var(--border-color)', 
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                textAlign: 'left'
              }}
            >
              <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>How should we handle leads with duplicate emails?</p>
              
              <label className="flex align-center gap-2" style={{ cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="strategy"
                  checked={duplicateStrategy === 'skip'}
                  onChange={() => setDuplicateStrategy('skip')}
                  style={{ width: '16px', height: '16px' }}
                />
                <div>
                  <strong style={{ fontSize: '0.85rem' }}>Skip duplicates (Recommended)</strong>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>Keeps your existing contact detail entries untouched.</p>
                </div>
              </label>

              <label className="flex align-center gap-2" style={{ cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="strategy"
                  checked={duplicateStrategy === 'overwrite'}
                  onChange={() => setDuplicateStrategy('overwrite')}
                  style={{ width: '16px', height: '16px' }}
                />
                <div>
                  <strong style={{ fontSize: '0.85rem' }}>Overwrite duplicates</strong>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>Updates existing leads with the data from the imported CSV.</p>
                </div>
              </label>
            </div>

            {needsFolderPick && (
              <div className="form-group">
                <label className="form-label">Assign to list *</label>
                <select
                  className="form-select"
                  value={destinationFolderId}
                  onChange={(e) => setDestinationFolderId(e.target.value)}
                  required
                >
                  <option value="">Select a list…</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                  Imported leads are assigned to this list. Open a list first to skip this step.
                </p>
              </div>
            )}

            <div className="flex justify-between mt-3">
              <button type="button" onClick={() => setStep(2)} className="btn btn-secondary">
                Back
              </button>
              <button type="button" onClick={executeImport} className="btn btn-primary">
                Start Import
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Progress Bar */}
        {step === 4 && (
          <div className="flex-col gap-4 align-center" style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <RefreshCw size={36} className="loading-spinner-inner" style={{ color: 'var(--accent-blue)', animation: 'spin 1s linear infinite' }} />
            <div>
              <h4 style={{ fontWeight: 600 }}>Importing leads...</h4>
              <p className="color-muted" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>Please wait, processing row data.</p>
            </div>
            
            <div style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '999px', height: '12px', overflow: 'hidden' }}>
              <div 
                style={{ 
                  background: 'var(--accent-blue)', 
                  width: `${progress}%`, 
                  height: '100%', 
                  borderRadius: '999px',
                  transition: 'width 0.2s ease-out' 
                }} 
              />
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{progress}% ({importStats.imported + importStats.skipped + importStats.errors} / {totalRows})</span>
          </div>
        )}

        {/* Step 5: Summary */}
        {step === 5 && (
          <div className="flex-col gap-4">
            <div className="align-center flex-col gap-2" style={{ textAlign: 'center', padding: '1rem 0' }}>
              <CheckCircle size={48} style={{ color: 'var(--success-color)' }} />
              <h3 style={{ fontSize: '1.3rem', fontWeight: 700 }}>Import Completed!</h3>
              <p className="color-muted" style={{ fontSize: '0.9rem' }}>CSV records have been processed and logged.</p>
            </div>

            <div 
              style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr 1fr', 
                gap: '1rem', 
                background: 'var(--bg-secondary)', 
                border: '1px solid var(--border-color)', 
                borderRadius: '8px',
                padding: '1rem',
                textAlign: 'center'
              }}
            >
              <div>
                <span style={{ display: 'block', fontSize: '1.5rem', fontWeight: 700, color: 'var(--success-color)' }}>
                  {importStats.imported}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Leads Added/Updated</span>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '1.5rem', fontWeight: 700, color: 'var(--warning-color)' }}>
                  {importStats.skipped}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Duplicates Skipped</span>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '1.5rem', fontWeight: 700, color: 'var(--danger-color)' }}>
                  {importStats.errors}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Errors / Invalid Rows</span>
              </div>
            </div>

            <div className="flex justify-end mt-3">
              <button type="button" onClick={onClose} className="btn btn-primary">
                Done &amp; Close
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
