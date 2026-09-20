import React, { useState, useRef, useEffect } from 'react';
import Papa from 'papaparse';
import { UploadCloud, Check, X, AlertTriangle, ArrowRight, ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { autoMatchHeaders } from '../../utils/csvMapping';
import { processImportBatch } from '../../utils/csvImporter';
import './CSVImportModal.css';

interface CSVImportModalProps {
  onClose: () => void;
  onImportComplete: () => void;
}

export default function CSVImportModal({ onClose, onImportComplete }: CSVImportModalProps) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<any[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  
  // Mapping state
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [autoMatchedCount, setAutoMatchedCount] = useState(0);
  
  // Options state
  const [duplicateStrategy, setDuplicateStrategy] = useState<'skip' | 'overwrite'>('skip');
  const [folderId, setFolderId] = useState<string>('');
  const [defaultPriority, setDefaultPriority] = useState<string>('Warm');
  const [folders, setFolders] = useState<any[]>([]);

  // Import state
  const [importStats, setImportStats] = useState({ imported: 0, skipped: 0, errors: 0 });
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Fetch folders for step 4
    async function fetchFolders() {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user?.id) {
        const { data } = await supabase
          .from('folders')
          .select('id, name, color')
          .eq('user_id', userData.user.id)
          .order('name');
        if (data) setFolders(data);
      }
    }
    fetchFolders();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    processFile(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (!droppedFile) return;
    processFile(droppedFile);
  };

  const processFile = (selectedFile: File) => {
    setErrorMsg('');
    if (!selectedFile.name.endsWith('.csv')) {
      setErrorMsg('Only .csv files are supported');
      return;
    }

    Papa.parse(selectedFile, {
      skipEmptyLines: true,
      complete: (results: any) => {
        if (!results.data || results.data.length < 2) {
          setErrorMsg('This file has no data rows');
          return;
        }

        const parsedHeaders = results.data[0] as string[];
        const parsedData = results.data.slice(1) as any[][];
        
        setFile(selectedFile);
        setHeaders(parsedHeaders);
        setCsvData(parsedData);
        
        const newMapping = autoMatchHeaders(parsedHeaders);
        setMapping(newMapping);
        
        const matched = Object.values(newMapping).filter(v => v !== 'skip').length;
        setAutoMatchedCount(matched);
      },
      error: (error: any) => {
        setErrorMsg('Failed to parse CSV: ' + error.message);
      }
    });
  };

  const handleMappingChange = (colIndex: number, value: string) => {
    setMapping(prev => ({ ...prev, [colIndex]: value }));
  };

  const validateMapping = () => {
    const mappedValues = Object.values(mapping);
    return mappedValues.includes('email') || mappedValues.includes('first_name') || mappedValues.includes('full_name');
  };

  const executeImport = async () => {
    setStep(5);
    
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    
    if (!userId) {
      setErrorMsg('User not authenticated');
      return;
    }

    try {
      const { data: profile } = await supabase.from('user_profiles').select('plan, billing_cycle').eq('id', userId).single();
      const { data: planCtx } = await supabase.rpc('get_my_plan_context');
      
      const effectivePlan = planCtx?.plan || profile?.plan || 'free';
      const effectiveCycle = planCtx?.billing_cycle || profile?.billing_cycle;
      
      const { data: planLimits } = await supabase.from('plan_limits').select('max_leads').eq('plan', effectivePlan).single();
      
      if (planLimits && planLimits.max_leads !== null) {
        let actualLimit = planLimits.max_leads;
        if (effectivePlan === 'starter' && effectiveCycle === 'yearly') actualLimit = 2000;
        else if (effectivePlan === 'pro' && effectiveCycle === 'yearly') actualLimit *= 2;

        const { count } = await supabase.from('leads').select('id', { count: 'exact', head: true }).eq('user_id', userId);
        if (count !== null && (count + csvData.length > actualLimit)) {
          setStep(4);
          window.dispatchEvent(new CustomEvent('reachdesk:limit-error', { 
            detail: { msg: `Lead limit reached for your plan (${actualLimit} leads).`, table: 'leads' } 
          }));
          return;
        }
      }
    } catch(e) {
      console.warn('Failed to pre-check limits:', e);
    }

    await processImportBatch({
      data: csvData,
      headers,
      mapping,
      duplicateStrategy,
      folderId: folderId || null,
      defaultPriority,
      userId,
      filename: file?.name || 'import.csv',
      onProgress: (imported, skipped, errors, prog) => {
        setImportStats({ imported, skipped, errors });
        setProgress(prog);
      },
      onComplete: (imported, skipped, errors) => {
        setImportStats({ imported, skipped, errors });
        setProgress(100);
      }
    });
  };

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

  return (
    <div className="csv-modal-backdrop">
      <div className="csv-modal-card">
        
        {/* Header & Close Button */}
        <div className="csv-modal-header">
          <div className="csv-step-indicator">
            <div className="csv-step-line"></div>
            {[1, 2, 3, 4, 5].map(s => {
              let classes = "csv-step-node ";
              if (s === step) classes += "active ";
              if (s < step || (step === 5 && progress === 100)) classes += "completed ";
              
              return (
                <div key={s} className={classes}>
                  {classes.includes('completed') ? <Check size={14} /> : s}
                </div>
              );
            })}
          </div>
          <button 
            onClick={onClose} 
            disabled={step === 5 && progress < 100}
            style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: (step === 5 && progress < 100) ? 'not-allowed' : 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="csv-modal-body">
          {errorMsg && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', padding: '1rem', borderRadius: '8px', color: '#ef4444', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={18} /> {errorMsg}
            </div>
          )}

          {step === 1 && (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <div 
                className="csv-dropzone" 
                onDragOver={e => e.preventDefault()} 
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud size={48} color="var(--text-primary)" style={{ marginBottom: '1rem' }} />
                <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Drop your CSV file here</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>or click to browse — .csv files only</p>
                <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileSelect} style={{ display: 'none' }} />
              </div>
              
              {file && !errorMsg && (
                <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-hover)', padding: '0.5rem 1rem', borderRadius: '999px', border: '1px solid var(--border)', fontSize: '0.875rem' }}>
                    <span style={{ color: 'var(--text-primary)' }}>{file.name}</span>
                    <Check size={16} color="#10b981" />
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <span className="csv-pill">{csvData.length.toLocaleString()} data row{csvData.length === 1 ? '' : 's'} detected</span>
                    <span className="csv-pill">{headers.length.toLocaleString()} column{headers.length === 1 ? '' : 's'} detected</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Here's a preview of your data</h3>
              <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1.5rem' }}>First 5 rows shown — make sure it looks right</p>
              
              <div className="csv-preview-table-container">
                <table className="csv-preview-table">
                  <thead>
                    <tr>
                      {headers.map((h, i) => <th key={i}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.slice(0, 5).map((row, rIdx) => (
                      <tr key={rIdx}>
                        {headers.map((_, cIdx) => <td key={cIdx}>{row[cIdx]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'center' }}>
                <span className="csv-pill">{csvData.length} rows</span>
                <span className="csv-pill">{headers.length} columns</span>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Map your columns to ReachDesk CRM fields</h3>
              <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                We've auto-matched what we could — review and adjust below
              </p>

              {autoMatchedCount > 0 && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.875rem', marginBottom: '1.5rem', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  <Check size={14} />
                  <span>Auto-matched {autoMatchedCount} of {headers.length} columns</span>
                </div>
              )}

              {!validateMapping() && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', padding: '0.75rem', borderRadius: '8px', color: '#ef4444', marginBottom: '1rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AlertTriangle size={16} /> At least one name or email column must be mapped.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {headers.map((header, colIndex) => {
                  const sampleVals = [csvData[0]?.[colIndex], csvData[1]?.[colIndex]].filter(v => v !== undefined && v !== '').slice(0, 2);
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
                        onChange={(e) => handleMappingChange(colIndex, e.target.value)}
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

          {step === 4 && (
            <div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Import settings</h3>
              
              <div style={{ marginBottom: '2rem' }}>
                <p style={{ fontWeight: 600, marginBottom: '0.75rem' }}>If a lead with the same email already exists:</p>
                <label className="csv-radio-card">
                  <input type="radio" name="duplicate" checked={duplicateStrategy === 'skip'} onChange={() => setDuplicateStrategy('skip')} />
                  <div>
                    <div style={{ fontWeight: 500 }}>Skip duplicate</div>
                    <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Keep existing lead as-is</div>
                  </div>
                </label>
                <label className="csv-radio-card">
                  <input type="radio" name="duplicate" checked={duplicateStrategy === 'overwrite'} onChange={() => setDuplicateStrategy('overwrite')} />
                  <div>
                    <div style={{ fontWeight: 500 }}>Overwrite existing</div>
                    <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Update with CSV data</div>
                  </div>
                </label>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <p style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Add imported leads to folder:</p>
                <select className="csv-select" style={{ width: '100%', maxWidth: '300px' }} value={folderId} onChange={e => setFolderId(e.target.value)}>
                  <option value="">No folder</option>
                  {folders.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <p style={{ fontWeight: 600, marginBottom: '0.75rem', maxWidth: '400px' }}>Default priority (if CSV has no priority column or value is unrecognized):</p>
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

          {step === 5 && (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              {progress < 100 ? (
                <>
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Importing leads... {importStats.imported + importStats.skipped + importStats.errors} of {csvData.length}</h3>
                  <div className="csv-progress-track">
                    <div className="csv-progress-fill" style={{ width: `${progress}%` }}></div>
                  </div>
                </>
              ) : (
                <>
                  <Check size={64} color="#10b981" style={{ marginBottom: '1rem', display: 'inline-block' }} />
                  <h3 style={{ fontSize: '1.5rem', marginBottom: '2rem' }}>Import Complete!</h3>
                  
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                    <div className="csv-stat-card">
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981', marginBottom: '0.25rem' }}>{importStats.imported}</div>
                      <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Imported</div>
                    </div>
                    <div className="csv-stat-card">
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b', marginBottom: '0.25rem' }}>{importStats.skipped}</div>
                      <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Skipped</div>
                    </div>
                    <div className="csv-stat-card">
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444', marginBottom: '0.25rem' }}>{importStats.errors}</div>
                      <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Errors</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {step < 5 && (
          <div className="csv-modal-footer">
            {step > 1 ? (
              <button className="csv-btn csv-btn-secondary" onClick={() => setStep(step - 1)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ArrowLeft size={16} /> Back
              </button>
            ) : (
              <div></div>
            )}

            {step === 1 && (
              <button className="csv-btn csv-btn-primary" disabled={!file} onClick={() => setStep(2)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Continue <ArrowRight size={16} />
              </button>
            )}

            {step === 2 && (
              <button className="csv-btn csv-btn-primary" onClick={() => setStep(3)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Looks good, continue <ArrowRight size={16} />
              </button>
            )}

            {step === 3 && (
              <button className="csv-btn csv-btn-primary" disabled={!validateMapping()} onClick={() => setStep(4)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Continue <ArrowRight size={16} />
              </button>
            )}

            {step === 4 && (
              <button className="csv-btn csv-btn-primary" onClick={executeImport} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
                Start Import <ArrowRight size={16} />
              </button>
            )}
          </div>
        )}
        
        {step === 5 && progress === 100 && (
          <div className="csv-modal-footer" style={{ justifyContent: 'center' }}>
            <button className="csv-btn csv-btn-primary" onClick={onImportComplete} style={{ minWidth: '150px' }}>
              Done
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
