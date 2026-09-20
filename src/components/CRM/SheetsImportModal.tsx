import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { openSheetsPicker } from '../../utils/googlePicker';
import { autoMatchHeaders } from '../../utils/csvMapping';
import { X, ArrowRight, ArrowLeft, Check, AlertTriangle, Loader, FileSpreadsheet } from 'lucide-react';
import './CSVImportModal.css';

interface SheetsImportModalProps {
  onClose: () => void;
  onImportComplete: (folderId?: string) => void;
  currentUserId: string;
}

type ListDestination = 'auto' | 'existing' | 'none';

export default function SheetsImportModal({ onClose, onImportComplete, currentUserId }: SheetsImportModalProps) {
  const [step, setStep] = useState(0); // 0=picker, 1=tab select, 2=preview, 3=map, 4=settings, 5=running
  const [pickerLoading, setPickerLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Spreadsheet selection
  const [spreadsheet, setSpreadsheet] = useState<{ id: string; name: string } | null>(null);
  const [tabs, setTabs] = useState<string[]>([]);
  const [selectedTab, setSelectedTab] = useState('');

  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<any[][]>([]);
  const [previewTotalRows, setPreviewTotalRows] = useState<number | null>(null);
  const [previewColumnCount, setPreviewColumnCount] = useState<number | null>(null);
  const [tabStatsLoading, setTabStatsLoading] = useState(false);
  const [statsLoadedForTab, setStatsLoadedForTab] = useState<string | null>(null);

  // Mapping
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [autoMatchedCount, setAutoMatchedCount] = useState(0);

  // Settings
  const [duplicateStrategy, setDuplicateStrategy] = useState<'skip' | 'overwrite'>('skip');
  const [listDestination, setListDestination] = useState<ListDestination>('auto');
  const [folderId, setFolderId] = useState('');
  const [defaultPriority, setDefaultPriority] = useState('Warm');
  const [folders, setFolders] = useState<any[]>([]);
  const [createdFolderId, setCreatedFolderId] = useState<string | null>(null);

  // Import results
  const [importStats, setImportStats] = useState({
    imported: 0,
    skipped: 0,
    addedToList: 0,
    skippedDuplicates: 0,
    skippedLimit: 0,
    errors: 0,
    totalRows: 0,
    limitReached: false,
    planLimit: null as number | null,
  });

  const availableFields = [
    { label: '── Contact Fields ──', value: '', disabled: true },
    { label: 'First Name', value: 'first_name' },
    { label: 'Last Name', value: 'last_name' },
    { label: 'Full Name', value: 'full_name' },
    { label: 'Email', value: 'email' },
    { label: 'Phone', value: 'phone' },
    { label: 'Company / Brand', value: 'company' },
    { label: 'Instagram URL', value: 'instagram_url' },
    { label: 'LinkedIn URL', value: 'linkedin_url' },
    { label: 'Twitter / X URL', value: 'twitter_url' },
    { label: 'Website', value: 'website' },
    { label: '── Pipeline Fields ──', value: '', disabled: true },
    { label: 'Priority', value: 'priority' },
    { label: 'Status', value: 'status' },
    { label: 'Action to Take', value: 'action_to_take' },
    { label: 'Niche / Industry', value: 'niche' },
    { label: 'Notes', value: 'notes' },
    { label: 'Platform', value: 'platform' },
    { label: '── Other ──', value: '', disabled: true },
    { label: '→ Save as Custom Field', value: 'custom' },
    { label: '✕ Skip this column', value: 'skip' }
  ];

  useEffect(() => {
    async function fetchFolders() {
      if (!currentUserId) return;
      const { data } = await supabase
        .from('folders')
        .select('id, name, color')
        .eq('user_id', currentUserId)
        .order('name');
      if (data) setFolders(data);
    }
    fetchFolders();
  }, [currentUserId]);

  const autoListName = spreadsheet && selectedTab
    ? `${spreadsheet.name} / ${selectedTab}`.slice(0, 120)
    : '';

  const handleOpenPicker = () => {
    setErrorMsg('');
    setPickerLoading(true);

    openSheetsPicker({
      onOpen: () => {
        setPickerLoading(false);
      },
      onSelect: async (doc) => {
        setSpreadsheet(doc);
        setPickerLoading(true);
        try {
          const { data, error } = await supabase.functions.invoke('get-sheet-tabs', {
            body: { spreadsheetId: doc.id },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);

          if (data?.tabs && data.tabs.length > 0) {
            const tabNames = data.tabs.map((t: any) => t.name);
            setTabs(tabNames);
            setSelectedTab(tabNames[0]);
            setStep(1);
          } else {
            throw new Error('No tabs found in the selected spreadsheet.');
          }
        } catch (err: any) {
          setErrorMsg(err.message || 'Failed to read spreadsheet tabs.');
          setSpreadsheet(null);
        } finally {
          setPickerLoading(false);
        }
      },
      onCancel: () => {
        setPickerLoading(false);
      },
      onError: (err: Error) => {
        setErrorMsg(err.message || 'Google Picker failed to open.');
        setPickerLoading(false);
      }
    });
  };

  const applyPreviewData = (data: {
    headers?: string[];
    rows?: any[][];
    totalRows?: number;
    columnCount?: number;
  }) => {
    const fetchedHeaders: string[] = data.headers || [];
    const fetchedRows: any[][] = data.rows || [];

    if (fetchedHeaders.length === 0) {
      throw new Error('No header row found in this tab.');
    }

    setHeaders(fetchedHeaders);
    setPreviewRows(fetchedRows);
    setPreviewTotalRows(typeof data.totalRows === 'number' ? data.totalRows : fetchedRows.length);
    setPreviewColumnCount(
      typeof data.columnCount === 'number'
        ? data.columnCount
        : fetchedHeaders.filter((h) => String(h ?? '').trim() !== '').length
    );

    const newMapping = autoMatchHeaders(fetchedHeaders);
    setMapping(newMapping);
    const matched = Object.values(newMapping).filter(v => v !== 'skip').length;
    setAutoMatchedCount(matched);
    setStatsLoadedForTab(selectedTab);
  };

  const fetchTabStats = async (tabName: string) => {
    if (!spreadsheet || !tabName) return;
    setTabStatsLoading(true);
    setErrorMsg('');

    try {
      const { data, error } = await supabase.functions.invoke('get-sheet-preview', {
        body: { spreadsheetId: spreadsheet.id, sheetName: tabName },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      applyPreviewData(data);
    } catch (err: any) {
      setPreviewTotalRows(null);
      setPreviewColumnCount(null);
      setStatsLoadedForTab(null);
      setErrorMsg(err.message || 'Failed to read tab dimensions from the sheet.');
      throw err;
    } finally {
      setTabStatsLoading(false);
    }
  };

  useEffect(() => {
    if (step !== 1 || !spreadsheet || !selectedTab) return;
    if (statsLoadedForTab === selectedTab && previewTotalRows != null) return;
    fetchTabStats(selectedTab);
  }, [step, spreadsheet?.id, selectedTab]);

  const handleFetchPreview = async () => {
    if (!spreadsheet || !selectedTab) return;

    if (statsLoadedForTab === selectedTab && headers.length > 0) {
      setStep(2);
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      await fetchTabStats(selectedTab);
      setStep(2);
    } catch {
      // fetchTabStats sets errorMsg
    } finally {
      setLoading(false);
    }
  };

  const renderDetectedStats = () => {
    if (tabStatsLoading) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#9ca3af', fontSize: '0.875rem' }}>
          <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Scanning tab…
        </div>
      );
    }

    if (previewTotalRows == null || previewColumnCount == null) return null;

    return (
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
        <span className="csv-pill">{previewTotalRows.toLocaleString()} data row{previewTotalRows === 1 ? '' : 's'} detected</span>
        <span className="csv-pill">{previewColumnCount.toLocaleString()} column{previewColumnCount === 1 ? '' : 's'} detected</span>
      </div>
    );
  };

  const validateMapping = () => {
    const mappedValues = Object.values(mapping);
    return mappedValues.includes('email')
      || mappedValues.includes('first_name')
      || mappedValues.includes('full_name')
      || mappedValues.includes('phone');
  };

  const handleExecuteImport = async () => {
    if (!spreadsheet || !selectedTab) return;
    setStep(5);
    setLoading(true);
    setErrorMsg('');

    try {
      const { data: profile } = await supabase.from('user_profiles').select('plan, billing_cycle').eq('id', currentUserId).single();
      const { data: planCtx } = await supabase.rpc('get_my_plan_context');
      
      const effectivePlan = planCtx?.plan || profile?.plan || 'free';
      const effectiveCycle = planCtx?.billing_cycle || profile?.billing_cycle;
      
      const { data: planLimits } = await supabase.from('plan_limits').select('max_leads').eq('plan', effectivePlan).single();
      
      if (planLimits && planLimits.max_leads !== null) {
        let actualLimit = planLimits.max_leads;
        if (effectivePlan === 'starter' && effectiveCycle === 'yearly') actualLimit = 2000;
        else if (effectivePlan === 'pro' && effectiveCycle === 'yearly') actualLimit *= 2;

        const { count } = await supabase.from('leads').select('id', { count: 'exact', head: true }).eq('user_id', currentUserId);
        const incomingCount = previewTotalRows || 0;
        if (count !== null && (count + incomingCount > actualLimit)) {
          setStep(4);
          setLoading(false);
          window.dispatchEvent(new CustomEvent('reachdesk:limit-error', { 
            detail: { msg: `Lead limit reached for your plan (${actualLimit} leads).`, table: 'leads' } 
          }));
          return;
        }
      }
    } catch(e) {
      console.warn('Failed to pre-check limits:', e);
    }

    try {
      let targetFolderId: string | null = null;

      if (listDestination === 'auto') {
        const listName = autoListName || `Sheet / ${selectedTab}`.slice(0, 120);
        const { data: newFolder, error: folderError } = await supabase
          .from('folders')
          .insert({
            user_id: currentUserId,
            name: listName,
            color: '#A3A3A3',
            sort_order: 0,
          })
          .select('id')
          .single();
        if (folderError) throw folderError;
        targetFolderId = newFolder.id;
        setCreatedFolderId(newFolder.id);
      } else if (listDestination === 'existing' && folderId) {
        targetFolderId = folderId;
        setCreatedFolderId(folderId);
      } else {
        setCreatedFolderId(null);
      }

      const { data, error } = await supabase.functions.invoke('import-leads-from-sheets', {
        body: {
          spreadsheetId: spreadsheet.id,
          sheetName: selectedTab,
          mapping,
          duplicateStrategy,
          folderId: targetFolderId,
          defaultPriority,
          filename: `${spreadsheet.name} / ${selectedTab}`,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setImportStats({
        imported: data.imported || 0,
        skipped: data.skipped || 0,
        addedToList: data.addedToList || 0,
        skippedDuplicates: data.skippedDuplicates || 0,
        skippedLimit: data.skippedLimit || 0,
        errors: data.errors || 0,
        totalRows: data.totalRows || 0,
        limitReached: !!data.limitReached,
        planLimit: data.planLimit ?? null,
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Import failed. Please try again.');
      setStep(4);
    } finally {
      setLoading(false);
    }
  };

  const displayStep = step + 1; // 1-indexed for the indicator
  const totalSteps = 5;

  return (
    <div className="csv-modal-backdrop">
      <div className="csv-modal-card">

        {/* Header */}
        <div className="csv-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div className="csv-step-indicator">
              <div className="csv-step-line"></div>
              {[1, 2, 3, 4, 5].map(s => {
                let classes = "csv-step-node ";
                if (s === displayStep) classes += "active ";
                if (s < displayStep || (step === 4 && !loading && !errorMsg)) classes += "completed ";
                return (
                  <div key={s} className={classes}>
                    {classes.includes('completed') ? <Check size={14} /> : s}
                  </div>
                );
              })}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={step === 4 && loading}
            style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: (step === 4 && loading) ? 'not-allowed' : 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="csv-modal-body">
          {errorMsg && step < 5 && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', padding: '0.75rem', borderRadius: '8px', color: '#ef4444', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
              <AlertTriangle size={16} /> {errorMsg}
            </div>
          )}

          {/* Step 0: Open Picker */}
          {step === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ width: '72px', height: '72px', borderRadius: '16px', background: 'var(--bg-hover)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem auto' }}>
                  <FileSpreadsheet size={36} color="var(--text-primary)" />
                </div>
                <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Import from Google Sheets</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Select a Google Spreadsheet using Google Picker</p>
              </div>
              <button
                onClick={handleOpenPicker}
                disabled={pickerLoading}
                className="csv-btn csv-btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
              >
                {pickerLoading ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <FileSpreadsheet size={16} />}
                {pickerLoading ? 'Opening Picker...' : 'Choose a Spreadsheet'}
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              </button>
            </div>
          )}

          {/* Step 1: Select Tab */}
          {step === 1 && spreadsheet && (
            <div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Select a tab to import</h3>
              <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                From: <strong>{spreadsheet.name}</strong>
              </p>

              {tabs.length > 1 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Worksheet Tab:</label>
                  <select
                    className="csv-select"
                    style={{ width: '100%', maxWidth: '320px' }}
                    value={selectedTab}
                    onChange={e => {
                      setSelectedTab(e.target.value);
                      setStatsLoadedForTab(null);
                      setPreviewTotalRows(null);
                      setPreviewColumnCount(null);
                    }}
                  >
                    {tabs.map(tab => <option key={tab} value={tab}>{tab}</option>)}
                  </select>
                </div>
              )}

              {tabs.length === 1 && (
                <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  Found 1 tab: <strong>{selectedTab}</strong> — will use this tab.
                </div>
              )}

              {renderDetectedStats()}

              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#9ca3af', fontSize: '0.875rem', marginTop: '1rem' }}>
                  <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading preview…
                </div>
              )}
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 2 && (
            <div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Preview of your sheet data</h3>
              <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                {previewTotalRows != null && previewColumnCount != null
                  ? `Detected ${previewTotalRows.toLocaleString()} data row${previewTotalRows === 1 ? '' : 's'} and ${previewColumnCount} column${previewColumnCount === 1 ? '' : 's'} — preview shows the first ${Math.min(previewRows.length, 5)} rows only.`
                  : 'Preview shows the first rows only — the full sheet tab is imported.'}
              </p>

              <div className="csv-preview-table-container">
                <table className="csv-preview-table">
                  <thead>
                    <tr>
                      {headers.map((h, i) => <th key={i}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.slice(0, 5).map((row, rIdx) => (
                      <tr key={rIdx}>
                        {headers.map((_, cIdx) => <td key={cIdx}>{row[cIdx]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'center' }}>
                <span className="csv-pill">{previewRows.length <= 10 ? previewRows.length : '10+'} preview rows</span>
                <span className="csv-pill">{headers.length} columns</span>
              </div>
            </div>
          )}

          {/* Step 3: Column Mapping */}
          {step === 3 && (
            <div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Map columns to ReachDesk CRM fields</h3>
              <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                We've auto-matched what we could — review and adjust below
              </p>

              {autoMatchedCount > 0 && (
                <div style={{ display: 'inline-block', background: 'var(--bg-hover)', color: 'var(--text-primary)', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.875rem', marginBottom: '1.5rem', border: '1px solid var(--border)' }}>
                  ✓ Auto-matched {autoMatchedCount} of {headers.length} columns
                </div>
              )}

              {!validateMapping() && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', padding: '0.75rem', borderRadius: '8px', color: '#ef4444', marginBottom: '1rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AlertTriangle size={16} /> At least one name or email column must be mapped.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {headers.map((header, colIndex) => {
                  const sampleVals = [previewRows[0]?.[colIndex], previewRows[1]?.[colIndex]].filter(v => v !== undefined && v !== '').slice(0, 2);
                  const isUnmapped = mapping[colIndex] === 'skip';

                  return (
                    <div key={colIndex} className="csv-mapping-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '30%' }}>
                        {isUnmapped && <AlertTriangle size={14} color="#f59e0b" />}
                        <strong style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{header}</strong>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', width: '40%', overflow: 'hidden' }}>
                        {sampleVals.map((val, i) => (
                          <span key={i} className="csv-pill" style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{val}</span>
                        ))}
                      </div>

                      <select
                        className="csv-select"
                        value={mapping[colIndex]}
                        onChange={(e) => setMapping(prev => ({ ...prev, [colIndex]: e.target.value }))}
                        style={{ width: '30%' }}
                      >
                        {availableFields.map((f, i) => (
                          <option key={i} value={f.value} disabled={f.disabled}>{f.label}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 4: Settings */}
          {step === 4 && (
            <div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Import settings</h3>

              <div style={{ marginBottom: '2rem' }}>
                <p style={{ fontWeight: 600, marginBottom: '0.75rem' }}>If a lead with the same email already exists:</p>
                <label className="csv-radio-card">
                  <input type="radio" name="duplicate" checked={duplicateStrategy === 'skip'} onChange={() => setDuplicateStrategy('skip')} />
                  <div>
                    <div style={{ fontWeight: 500 }}>Skip duplicate (recommended)</div>
                    <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
                      Keep existing lead data. If importing to a list, duplicates are still added to that list.
                    </div>
                  </div>
                </label>
                <label className="csv-radio-card">
                  <input type="radio" name="duplicate" checked={duplicateStrategy === 'overwrite'} onChange={() => setDuplicateStrategy('overwrite')} />
                  <div>
                    <div style={{ fontWeight: 500 }}>Overwrite existing</div>
                    <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Update with sheet data</div>
                  </div>
                </label>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <p style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Save imported leads to:</p>
                <label className="csv-radio-card">
                  <input type="radio" name="listDest" checked={listDestination === 'auto'} onChange={() => setListDestination('auto')} />
                  <div>
                    <div style={{ fontWeight: 500 }}>Create new list from sheet (recommended)</div>
                    <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
                      {autoListName ? `"${autoListName}"` : 'Named after spreadsheet and tab'}
                    </div>
                  </div>
                </label>
                <label className="csv-radio-card">
                  <input type="radio" name="listDest" checked={listDestination === 'existing'} onChange={() => setListDestination('existing')} />
                  <div>
                    <div style={{ fontWeight: 500 }}>Add to an existing list</div>
                    <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Pick from your saved lists</div>
                  </div>
                </label>
                {listDestination === 'existing' && (
                  <select className="csv-select" style={{ width: '100%', maxWidth: '300px', marginTop: '0.75rem' }} value={folderId} onChange={e => setFolderId(e.target.value)}>
                    <option value="">Select a list…</option>
                    {folders.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                )}
                <label className="csv-radio-card">
                  <input type="radio" name="listDest" checked={listDestination === 'none'} onChange={() => setListDestination('none')} />
                  <div>
                    <div style={{ fontWeight: 500 }}>No list — import to unfiled leads</div>
                    <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Leads won&apos;t belong to a named list</div>
                  </div>
                </label>
              </div>

              <div>
                <p style={{ fontWeight: 600, marginBottom: '0.75rem', maxWidth: '400px' }}>Default priority (if sheet has no priority column or value is unrecognized):</p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {['Hot', 'Warm', 'Cold'].map(p => (
                    <button
                      key={p}
                      onClick={() => setDefaultPriority(p)}
                      className={`csv-btn ${defaultPriority === p ? 'csv-btn-primary' : 'csv-btn-secondary'}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Running / Done */}
          {step === 5 && (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              {loading ? (
                <>
                  <Loader size={48} style={{ color: 'var(--text-primary)', animation: 'spin 1.2s linear infinite', marginBottom: '1.5rem', display: 'inline-block' }} />
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Importing leads…</h3>
                  <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Fetching and processing sheet data.</p>
                </>
              ) : (
                <>
                  <Check size={64} color="var(--text-primary)" style={{ marginBottom: '1rem', display: 'inline-block' }} />
                  <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Import Complete!</h3>
                  {importStats.totalRows > 0 && (
                    <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                      Processed {importStats.totalRows} row{importStats.totalRows === 1 ? '' : 's'} from your sheet.
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <div className="csv-stat-card">
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>{importStats.imported}</div>
                      <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>New leads</div>
                    </div>
                    {importStats.addedToList > 0 && (
                      <div className="csv-stat-card">
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-blue)', marginBottom: '0.25rem' }}>{importStats.addedToList}</div>
                        <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Added to list</div>
                      </div>
                    )}
                    <div className="csv-stat-card">
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b', marginBottom: '0.25rem' }}>{importStats.skipped}</div>
                      <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Skipped</div>
                    </div>
                    <div className="csv-stat-card">
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444', marginBottom: '0.25rem' }}>{importStats.errors}</div>
                      <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Invalid rows</div>
                    </div>
                  </div>
                  {(importStats.skippedDuplicates > 0 || importStats.skippedLimit > 0 || importStats.errors > 0 || importStats.addedToList > 0) && (
                    <div style={{ marginTop: '1.5rem', textAlign: 'left', maxWidth: 420, margin: '1.5rem auto 0', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {importStats.addedToList > 0 && (
                        <p style={{ margin: '0 0 0.5rem' }}>
                          <strong>{importStats.addedToList}</strong> already in CRM — assigned to your list (data unchanged).
                        </p>
                      )}
                      {importStats.skippedDuplicates > 0 && (
                        <p style={{ margin: '0 0 0.5rem' }}>
                          <strong>{importStats.skippedDuplicates}</strong> skipped — same email already in CRM. Choose &quot;Create new list&quot; or pick a list so existing leads are included, or use Overwrite to refresh their data.
                        </p>
                      )}
                      {importStats.skippedLimit > 0 && (
                        <p style={{ margin: '0 0 0.5rem' }}>
                          <strong>{importStats.skippedLimit}</strong> skipped — plan lead limit reached{importStats.planLimit ? ` (${importStats.planLimit} max)` : ''}.
                        </p>
                      )}
                      {importStats.errors > 0 && (
                        <p style={{ margin: 0 }}>
                          <strong>{importStats.errors}</strong> invalid — row missing name, email, and phone. Check column mapping.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        {step === 1 && (
          <div className="csv-modal-footer">
            <button className="csv-btn csv-btn-secondary" onClick={() => { setStep(0); setSpreadsheet(null); setTabs([]); }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ArrowLeft size={16} /> Back
            </button>
            <button
              className="csv-btn csv-btn-primary"
              onClick={handleFetchPreview}
              disabled={!selectedTab || loading || tabStatsLoading || previewTotalRows == null}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {loading ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : null}
              Preview Data <ArrowRight size={16} />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="csv-modal-footer">
            <button className="csv-btn csv-btn-secondary" onClick={() => setStep(1)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ArrowLeft size={16} /> Back
            </button>
            <button className="csv-btn csv-btn-primary" onClick={() => setStep(3)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Looks good <ArrowRight size={16} />
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="csv-modal-footer">
            <button className="csv-btn csv-btn-secondary" onClick={() => setStep(2)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ArrowLeft size={16} /> Back
            </button>
            <button className="csv-btn csv-btn-primary" disabled={!validateMapping()} onClick={() => setStep(4)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Continue <ArrowRight size={16} />
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="csv-modal-footer">
            <button className="csv-btn csv-btn-secondary" onClick={() => setStep(3)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ArrowLeft size={16} /> Back
            </button>
            <button
              className="csv-btn csv-btn-primary"
              onClick={handleExecuteImport}
              disabled={listDestination === 'existing' && !folderId}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}
            >
              Start Import <ArrowRight size={16} />
            </button>
          </div>
        )}

        {step === 5 && !loading && (
          <div className="csv-modal-footer" style={{ justifyContent: 'center', gap: '0.75rem' }}>
            {createdFolderId && (
              <button
                className="csv-btn csv-btn-primary"
                onClick={() => onImportComplete(createdFolderId)}
                style={{ minWidth: '150px' }}
              >
                Open list
              </button>
            )}
            <button
              className={`csv-btn ${createdFolderId ? 'csv-btn-secondary' : 'csv-btn-primary'}`}
              onClick={() => onImportComplete(createdFolderId || undefined)}
              style={{ minWidth: '150px' }}
            >
              {createdFolderId ? 'Back to lists' : 'Done'}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
