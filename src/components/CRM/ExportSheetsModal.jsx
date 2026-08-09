import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { openSheetsPicker } from '../../utils/googlePicker';
import { prepareLeadExportRows } from '../../lib/leadExportFields';
import { X, ArrowRight, ArrowLeft, Check, AlertTriangle, Loader, FileSpreadsheet } from 'lucide-react';
import './ExportSheetsModal.css';

export default function ExportSheetsModal({ onClose, leads, currentUser, includeLocalTime = false }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successUrl, setSuccessUrl] = useState('');

  // Selected spreadsheet & tabs info
  const [spreadsheet, setSpreadsheet] = useState(null);
  const [tabs, setTabs] = useState([]);
  const [selectedTab, setSelectedTab] = useState('');
  const [writeMode, setWriteMode] = useState('overwrite'); // 'overwrite' | 'append'

  const prepareExportData = async () => {
    const defaultCountryCode = currentUser?.default_country_code || '+92';
    const { headers, rows } = await prepareLeadExportRows(leads, {
      includeLocalTime,
      defaultCountryCode,
    });
    return [headers, ...rows];
  };

  const handleCreateNewSheet = async () => {
    setLoading(true);
    setErrorMsg('');
    setStep(3);

    try {
      const exportValues = await prepareExportData();

      const { data, error } = await supabase.functions.invoke('export-leads-to-sheets-new', {
        body: { values: exportValues },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSuccessUrl(data.spreadsheetUrl);
    } catch (err) {
      console.error('[ExportSheetsModal] New sheet export error:', err);
      setErrorMsg(err.message || 'Failed to export leads to a new sheet.');
    } finally {
      setLoading(false);
    }
  };

  const handleChooseExistingSheet = () => {
    setErrorMsg('');
    setLoading(true);

    openSheetsPicker({
      onOpen: () => {
        // Picker is visible; stop the spinner so the modal doesn't look stuck
        setLoading(false);
      },
      onSelect: async (selectedDoc) => {
        setLoading(true);
        setSpreadsheet(selectedDoc);
        try {
          // Fetch tabs
          const { data, error } = await supabase.functions.invoke('get-sheet-tabs', {
            body: { spreadsheetId: selectedDoc.id },
          });

          if (error) throw error;
          if (data?.error) throw new Error(data.error);

          if (data?.tabs && data.tabs.length > 0) {
            setTabs(data.tabs.map(t => t.name));
            setSelectedTab(data.tabs[0].name);
            setStep(2);
          } else {
            throw new Error('No tabs found in the selected spreadsheet.');
          }
        } catch (err) {
          console.error('[ExportSheetsModal] Fetch tabs error:', err);
          setErrorMsg(err.message || 'Failed to read spreadsheet tabs.');
          setSpreadsheet(null);
        } finally {
          setLoading(false);
        }
      },
      onCancel: () => {
        setLoading(false);
      },
      onError: (err) => {
        setErrorMsg(err.message || 'Google Picker failed to load.');
        setLoading(false);
      }
    });
  };

  const handleExportExistingSheet = async () => {
    setLoading(true);
    setErrorMsg('');
    setStep(3);

    try {
      const exportValues = await prepareExportData();

      const { data, error } = await supabase.functions.invoke('export-leads-to-sheets-existing', {
        body: {
          spreadsheetId: spreadsheet.id,
          sheetName: selectedTab,
          values: exportValues,
          mode: writeMode,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSuccessUrl(`https://docs.google.com/spreadsheets/d/${spreadsheet.id}/edit`);
    } catch (err) {
      console.error('[ExportSheetsModal] Existing sheet export error:', err);
      setErrorMsg(err.message || 'Failed to export leads to the existing sheet.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sheets-export-backdrop">
      <div className="sheets-export-card">
        
        {/* Header */}
        <div className="sheets-export-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileSpreadsheet size={20} color="var(--text-primary)" />
            <h3 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 600 }}>Export to Google Sheets</h3>
          </div>
          <button onClick={onClose} disabled={loading} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: loading ? 'not-allowed' : 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="sheets-export-body">
          {errorMsg && step < 3 && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', padding: '0.75rem 1rem', borderRadius: '8px', color: '#ef4444', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
              <AlertTriangle size={16} /> {errorMsg}
            </div>
          )}

          {step === 1 && (
            <div style={{ padding: '0.5rem 0' }}>
              <p style={{ color: 'var(--text-secondary, #9ca3af)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                Select where you want to export your CRM leads. Only active columns (with data) will be exported.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <button 
                  onClick={handleCreateNewSheet} 
                  disabled={loading}
                  className="sheets-export-option-btn"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%' }}>
                    <div className="sheets-export-icon-box">
                      <FileSpreadsheet size={20} />
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Create a new sheet</div>
                      <div style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Creates a new spreadsheet in your Google Drive</div>
                    </div>
                  </div>
                  <ArrowRight size={16} />
                </button>

                <button 
                  onClick={handleChooseExistingSheet} 
                  disabled={loading}
                  className="sheets-export-option-btn"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%' }}>
                    <div className="sheets-export-icon-box">
                      <Loader size={20} className={loading ? "animate-spin" : ""} style={{ display: loading ? 'block' : 'none' }} />
                      <FileSpreadsheet size={20} style={{ display: loading ? 'none' : 'block' }} />
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{loading ? 'Opening Picker...' : 'Choose an existing sheet'}</div>
                      <div style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Select a spreadsheet using Google Picker</div>
                    </div>
                  </div>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <p style={{ color: 'var(--text-secondary, #9ca3af)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                Configure the export settings for: <strong>{spreadsheet?.name}</strong>
              </p>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Select Worksheet Tab:</label>
                <select 
                  className="sheets-export-select" 
                  value={selectedTab} 
                  onChange={e => setSelectedTab(e.target.value)}
                >
                  {tabs.map(tab => <option key={tab} value={tab}>{tab}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.75rem' }}>Export Mode:</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <label className="sheets-export-radio-card">
                    <input type="radio" name="writeMode" checked={writeMode === 'overwrite'} onChange={() => setWriteMode('overwrite')} />
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>Overwrite</div>
                      <div style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Clears the sheet first, replacing all data starting at A1</div>
                    </div>
                  </label>

                  <label className="sheets-export-radio-card">
                    <input type="radio" name="writeMode" checked={writeMode === 'append'} onChange={() => setWriteMode('append')} />
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>Append</div>
                      <div style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Appends lead data below the last row containing data</div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              {loading ? (
                <>
                  <Loader size={48} style={{ color: '#10b981', animation: 'spin 1.2s linear infinite', marginBottom: '1.5rem' }} />
                  <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Exporting your leads...</h3>
                  <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Writing data directly to Google Sheets.</p>
                </>
              ) : errorMsg ? (
                <>
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', marginBottom: '1.5rem' }}>
                    <AlertTriangle size={28} />
                  </div>
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '0.75rem', color: '#ef4444' }}>Export Failed</h3>
                  <p style={{ color: '#9ca3af', fontSize: '0.875rem', maxWidth: '320px', margin: '0 auto 1.5rem auto' }}>
                    {errorMsg}
                  </p>
                </>
              ) : (
                <>
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', marginBottom: '1.5rem' }}>
                    <Check size={28} />
                  </div>
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Leads Exported Successfully!</h3>
                  <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '1.5rem' }}>Your sheet has been updated.</p>
                  
                  <a 
                    href={successUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="sheets-export-link-btn"
                  >
                    Open Google Sheet
                  </a>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 2 && !loading && (
          <div className="sheets-export-footer">
            <button className="sheets-export-btn-secondary" onClick={() => setStep(1)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ArrowLeft size={16} /> Back
            </button>
            <button className="sheets-export-btn-primary" onClick={handleExportExistingSheet} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Export <ArrowRight size={16} />
            </button>
          </div>
        )}

        {step === 3 && errorMsg && !loading && (
          <div className="sheets-export-footer" style={{ justifyContent: 'center' }}>
            <button className="sheets-export-btn-primary" onClick={() => setStep(1)} style={{ minWidth: '120px' }}>
              Try Again
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
