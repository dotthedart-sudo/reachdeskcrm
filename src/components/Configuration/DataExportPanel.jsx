import React, { useState } from 'react';
import { Download, FileText, Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function DataExportPanel({
  exporting,
  onExportLeads,
  onExportNotes,
}) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteData = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setIsDeleting(true);
    try {
      const { data, error } = await supabase.rpc('delete_all_my_data');
      if (error) throw error;
      alert(`Successfully deleted ${data.leads} leads, ${data.notes} notes, ${data.templates} templates, and ${data.folders} lists.`);
      setShowDeleteModal(false);
      window.location.reload(); // Refresh to clear UI state
    } catch (err) {
      console.error('Delete data error:', err);
      alert('Failed to delete data: ' + err.message);
    } finally {
      setIsDeleting(false);
      setDeleteConfirmText('');
    }
  };

  return (
    <>
      <div className="card flex-col gap-3">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
          <Download size={18} style={{ color: 'var(--primary-purple)' }} />
          <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Data Export (Backup)</h3>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, margin: 0 }}>
          Download a proactive backup of your freelance data at any time. Leads are exported as a CSV spreadsheet, and notes are exported as a structured plain text document.
        </p>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onExportLeads}
            disabled={exporting === 'leads'}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Download size={14} />
            {exporting === 'leads' ? 'Exporting...' : 'Export Leads (CSV)'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onExportNotes}
            disabled={exporting === 'notes'}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <FileText size={14} />
            {exporting === 'notes' ? 'Exporting...' : 'Export Notes (TXT)'}
          </button>
        </div>

        <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <Trash2 size={18} style={{ color: 'var(--danger-color)' }} />
            <h3 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--danger-color)' }}>Delete All My Data</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, margin: 0, marginBottom: '1rem' }}>
            Permanently delete all your leads, notes, templates, and lists. Your account and subscription will remain active. This action cannot be undone.
          </p>
          <button
            type="button"
            className="btn"
            style={{ backgroundColor: 'var(--danger-color)', color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={() => setShowDeleteModal(true)}
          >
            <Trash2 size={14} />
            Delete All My Data...
          </button>
        </div>
      </div>

      {showDeleteModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ backgroundColor: 'var(--bg-card)', padding: '2rem', borderRadius: '4px', maxWidth: '450px', width: '100%', border: '1px solid var(--danger-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ padding: '0.75rem', backgroundColor: 'rgba(224, 82, 82, 0.1)', borderRadius: '50%', color: 'var(--danger-color)' }}>
                <AlertTriangle size={24} />
              </div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--danger-color)' }}>Delete All Data?</h2>
            </div>
            
            <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: '1.5rem' }}>
              This will permanently delete all your leads, notes, templates, and lists. You cannot undo this action.
            </p>

            <div style={{ backgroundColor: 'var(--bg-element)', padding: '1rem', borderRadius: '4px', marginBottom: '1.5rem', border: '1px dashed var(--border-color)' }}>
              <p style={{ fontSize: '0.85rem', fontWeight: 'bold', margin: '0 0 0.5rem 0' }}>Before you delete, do you want to export your data?</p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={onExportLeads} style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>
                  Export Leads
                </button>
                <button type="button" className="btn btn-secondary" onClick={onExportNotes} style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>
                  Export Notes
                </button>
              </div>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              To confirm, type <strong>DELETE</strong> below:
            </p>
            <input
              type="text"
              className="input"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              style={{ width: '100%', marginBottom: '1.5rem' }}
            />

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowDeleteModal(false)} disabled={isDeleting}>
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                style={{ backgroundColor: 'var(--danger-color)', color: 'white', opacity: deleteConfirmText !== 'DELETE' || isDeleting ? 0.5 : 1 }}
                onClick={handleDeleteData}
                disabled={deleteConfirmText !== 'DELETE' || isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
