import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getTeamIds } from '../lib/utils';
import { 
  Plus, Search, Pin, Trash2, Paintbrush,
  Folder, FolderPlus, Lock, ArrowUpDown, X, PenLine,
  FileText, Gem, Info
} from 'lucide-react';

const FOLDER_COLORS = [
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#3b82f6', // Blue
  '#10b981', // Green
  '#f59e0b', // Yellow
  '#ef4444', // Red
  '#06b6d4'  // Cyan
];

export default function NotesList({ currentUser }) {
  const navigate = useNavigate();
  
  // State
  const [notes, setNotes] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Selected folder: 'all', 'pinned', or a folder ID
  const [selectedFolderId, setSelectedFolderId] = useState('all');
  
  // Folder Creation state
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0]);
  
  // Sorting state
  const [sortBy, setSortBy] = useState('updated_desc');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  
  // RLS / Plan check
  const isPremiumUser = ['pro', 'teams', 'trial'].includes(currentUser?.plan?.toLowerCase());

  // Load Notes and Folders
  const fetchData = async () => {
    setLoading(true);
    try {
      const scopeIds = await getTeamIds(currentUser.id, { respectLeadIsolation: false });

      // Fetch Notes (workspace-scoped on Teams)
      const { data: notesData, error: notesError } = await supabase.from('notes')
        .select('*')
        .in('user_id', scopeIds);

      if (notesError) throw notesError;
      setNotes(notesData || []);

      // Fetch Folders used by notes (same table as CRM lists; scoped to workspace)
      const { data: foldersData, error: foldersError } = await supabase.from('folders')
        .select('*')
        .in('user_id', scopeIds)
        .order('created_at', { ascending: true });

      if (foldersError) throw foldersError;
      setFolders(foldersData || []);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchData();
    }
  }, [currentUser]);

  const createNote = async (type) => {
    try {
      const newNote = {
        user_id: currentUser.id,
        title: type === 'text' ? 'New Text Note' : 'New Drawing Board',
        content: '',
        type,
        pinned: false,
        color: '#ffffff',
        thumbnail_url: selectedFolderId !== 'all' && selectedFolderId !== 'pinned' ? selectedFolderId : null
      };

      const { data, error } = await supabase.from('notes')
        .insert(newNote)
        .select()
        .single();

      if (error) throw error;
      navigate(`/notes/${data.id}`);
    } catch (err) {
      console.error('Error creating note:', err);
    }
  };

  const deleteNote = async (noteId) => {
    if (!confirm('Are you sure you want to delete this note?')) return;
    try {
      const { error } = await supabase.from('notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (err) {
      console.error('Error deleting note:', err);
    }
  };

  const togglePin = async (note) => {
    try {
      const { data, error } = await supabase.from('notes')
        .update({ pinned: !note.pinned })
        .eq('id', note.id)
        .select()
        .single();

      if (error) throw error;
      setNotes(prev => prev.map(n => n.id === note.id ? data : n));
    } catch (err) {
      console.error('Error toggling pin:', err);
    }
  };

  // Folders API
  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      const { data, error } = await supabase.from('folders')
        .insert({
          user_id: currentUser.id,
          name: newFolderName.trim(),
          color: newFolderColor
        })
        .select()
        .single();

      if (error) throw error;
      setFolders(prev => [...prev, data]);
      setNewFolderName('');
      setShowFolderModal(false);
      setSelectedFolderId(data.id); // Auto-navigate to new folder
    } catch (err) {
      console.error('Error creating folder:', err);
    }
  };

  const handleDeleteFolder = async (folderId, e) => {
    e.stopPropagation(); // Prevent folder selection
    if (!confirm('Are you sure you want to delete this folder? Notes in this folder will NOT be deleted.')) return;
    try {
      // 1. Delete folder
      const { error } = await supabase.from('folders')
        .delete()
        .eq('id', folderId);

      if (error) throw error;

      // 2. Set notes in folder to uncategorized (thumbnail_url = null)
      const { error: notesUpdateError } = await supabase.from('notes')
        .update({ thumbnail_url: null })
        .eq('thumbnail_url', folderId);

      if (notesUpdateError) throw notesUpdateError;

      // 3. Update local state
      setFolders(prev => prev.filter(f => f.id !== folderId));
      setNotes(prev => prev.map(n => n.thumbnail_url === folderId ? { ...n, thumbnail_url: null } : n));
      
      if (selectedFolderId === folderId) {
        setSelectedFolderId('all');
      }
    } catch (err) {
      console.error('Error deleting folder:', err);
    }
  };

  // Sorting handler with premium restriction
  const handleSortChange = (e) => {
    if (!isPremiumUser) {
      setShowUpgradeModal(true);
      return;
    }
    setSortBy(e.target.value);
  };

  // Filter notes by query & folder
  const filteredNotes = notes.filter(n => {
    // Search query filter
    const titleMatch = (n.title || '').toLowerCase().includes(searchQuery.toLowerCase());
    const contentMatch = (n.content || '').toLowerCase().includes(searchQuery.toLowerCase());
    const queryMatch = titleMatch || contentMatch;

    if (!queryMatch) return false;

    // Folder filter
    if (selectedFolderId === 'all') return true;
    if (selectedFolderId === 'pinned') return n.pinned;
    return n.thumbnail_url === selectedFolderId;
  });

  // Sort notes
  const sortedNotes = [...filteredNotes].sort((a, b) => {
    if (sortBy === 'updated_desc') {
      return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
    }
    if (sortBy === 'updated_asc') {
      return new Date(a.updated_at || a.created_at) - new Date(b.updated_at || b.created_at);
    }
    if (sortBy === 'title_asc') {
      return (a.title || '').localeCompare(b.title || '');
    }
    if (sortBy === 'title_desc') {
      return (b.title || '').localeCompare(a.title || '');
    }
    return 0;
  });

  const pinnedNotes = sortedNotes.filter(n => n.pinned);
  const otherNotes = sortedNotes.filter(n => !n.pinned);

  return (
    <div className="notes-container page-stack" style={{ display: 'flex', gap: 'var(--space-5)', textAlign: 'left', flexWrap: 'wrap' }}>
      
      {/* ── Left Column: Folders Sidebar ── */}
      <div 
        className="folders-sidebar" 
        style={{ 
          width: '260px', 
          background: 'var(--bg-secondary)', 
          borderRadius: '12px', 
          border: '1px solid var(--border-color)', 
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', margin: 0 }}>
            <Folder size={18} style={{ color: 'var(--primary-purple)' }} /> Folders
          </h4>
          <button 
            onClick={() => setShowFolderModal(true)} 
            className="btn btn-secondary btn-sm"
            style={{ padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <FolderPlus size={14} /> New
          </button>
        </div>

        {/* Folder items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', overflowY: 'auto', maxHeight: '350px' }}>
          <button
            onClick={() => setSelectedFolderId('all')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.6rem 0.75rem',
              borderRadius: '8px',
              border: 'none',
              background: selectedFolderId === 'all' ? 'var(--primary-purple)' : 'transparent',
              color: selectedFolderId === 'all' ? '#ffffff' : 'var(--text-primary)',
              cursor: 'pointer',
              fontWeight: selectedFolderId === 'all' ? 600 : 500,
              textAlign: 'left',
              transition: 'background 0.2s'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Folder size={14} /> All Notes
            </span>
            <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>
              {notes.length}
            </span>
          </button>

          <button
            onClick={() => setSelectedFolderId('pinned')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.6rem 0.75rem',
              borderRadius: '8px',
              border: 'none',
              background: selectedFolderId === 'pinned' ? 'var(--primary-purple)' : 'transparent',
              color: selectedFolderId === 'pinned' ? '#ffffff' : 'var(--text-primary)',
              cursor: 'pointer',
              fontWeight: selectedFolderId === 'pinned' ? 600 : 500,
              textAlign: 'left',
              transition: 'background 0.2s'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Pin size={14} /> Pinned Notes
            </span>
            <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>
              {notes.filter(n => n.pinned).length}
            </span>
          </button>

          {/* Custom Folders */}
          {folders.length > 0 && (
            <div style={{ margin: '0.5rem 0', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
              <span className="rd-section-label" style={{ paddingLeft: 'var(--space-3)' }}>My folders</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.25rem' }}>
                {folders.map(f => (
                  <div
                    key={f.id}
                    onClick={() => setSelectedFolderId(f.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.6rem 0.75rem',
                      borderRadius: '8px',
                      background: selectedFolderId === f.id ? 'var(--primary-purple)' : 'transparent',
                      color: selectedFolderId === f.id ? '#ffffff' : 'var(--text-primary)',
                      cursor: 'pointer',
                      fontWeight: selectedFolderId === f.id ? 600 : 500,
                      transition: 'background 0.2s'
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: f.color, flexShrink: 0 }}></span>
                      {f.name}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                        {notes.filter(n => n.thumbnail_url === f.id).length}
                      </span>
                      <button 
                        onClick={(e) => handleDeleteFolder(f.id, e)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: selectedFolderId === f.id ? '#ffffff' : 'var(--danger-color)',
                          cursor: 'pointer',
                          padding: '0.1rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          opacity: 0.7
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right Column: Notes List & Workspace ── */}
      <div className="notes-main-workspace" style={{ flex: 1, minWidth: '320px' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            {selectedFolderId !== 'all' && selectedFolderId !== 'pinned' && (
              <div style={{ fontSize: '0.9rem', fontWeight: 500, background: 'var(--bg-tertiary)', padding: '0.2rem 0.6rem', borderRadius: '20px', border: '1px solid var(--border-color)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.35rem' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: folders.find(f => f.id === selectedFolderId)?.color }}></span>
                {folders.find(f => f.id === selectedFolderId)?.name}
              </div>
            )}
            <p className="color-muted" style={{ fontSize: '0.9rem', margin: 0 }}>
              Store templates, outreach scripts, canvas layouts, and drawings.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => createNote('text')} className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <Plus size={16} /> Text Note
            </button>
            <button onClick={() => createNote('canvas')} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <Paintbrush size={16} /> Drawing Board
            </button>
          </div>
        </div>

        {/* Toolbar: Search & Sort */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          
          {/* Search bar */}
          <div style={{ position: 'relative', width: '100%', maxWidth: '350px' }}>
            <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="form-input w-full"
              style={{ paddingLeft: '2.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
            />
          </div>

          {/* Sort selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <ArrowUpDown size={14} /> Sort By:
            </span>
            <div style={{ position: 'relative' }}>
              <select
                value={isPremiumUser ? sortBy : 'updated_desc'}
                onChange={handleSortChange}
                className="form-input"
                style={{ 
                  paddingRight: '2rem', 
                  background: 'var(--bg-secondary)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '8px', 
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                <option value="updated_desc">Latest Updated</option>
                <option value="updated_asc">Oldest Updated</option>
                <option value="title_asc">Title (A-Z)</option>
                <option value="title_desc">Title (Z-A)</option>
              </select>
              {!isPremiumUser && (
                <span style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary-magenta)', pointerEvents: 'none' }}>
                  <Lock size={12} />
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Loading / Empty / Grid States */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '200px', gap: '1rem' }}>
            <div 
              className="loading-spinner-inner" 
              style={{ 
                border: '3px solid rgba(139, 92, 246, 0.1)', 
                borderTop: '3px solid var(--primary-purple)', 
                borderRadius: '50%', 
                width: '40px', 
                height: '40px', 
                animation: 'spin 1s linear infinite' 
              }}
            ></div>
            <p className="color-muted">Loading notes...</p>
          </div>
        ) : notes.length === 0 ? (
          <div className="card flex align-center justify-center" style={{ minHeight: '300px', padding: '3rem 2rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '12px', background: 'rgba(91,143,185,0.12)', border: '1px solid rgba(91,143,185,0.2)', margin: '0 auto' }}>
              <FileText size={30} style={{ color: 'var(--accent-blue, #5B8FB9)' }} />
            </div>
            <div>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                No Notes or Drawings Yet
              </h3>
              <p className="color-muted" style={{ fontSize: '0.9rem', marginTop: '0.25rem', maxWidth: '380px', lineHeight: '1.5', margin: '0 auto' }}>
                Create a text note or visual drawing board to keep track of templates, outreach scripts, and client planning notes.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button onClick={() => createNote('text')} className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                <Plus size={14} /> Create Text Note
              </button>
              <button onClick={() => createNote('canvas')} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                <Paintbrush size={14} /> Drawing Board
              </button>
            </div>
            <div style={{ 
              marginTop: '1rem', 
              padding: '0.75rem 1.25rem', 
              backgroundColor: 'var(--bg-tertiary)', 
              borderRadius: '8px', 
              border: '1px solid var(--border-color)',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              maxWidth: '380px',
              textAlign: 'left'
            }}>
              <span style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}><Info size={13} style={{ color: 'var(--accent-blue)', flexShrink: 0, marginTop: '1px' }} /><span><strong>Pro-tip:</strong> Inside text notes, type <code>/</code> (slash) to quickly insert formatted headings, todo checklists, bullet lists, or toggles!</span></span>
            </div>
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="card flex align-center justify-center" style={{ minHeight: '200px', padding: '2rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <div style={{ textAlign: 'center' }}>
              <FileText size={32} style={{ color: 'var(--text-muted)', margin: '0 auto' }} />
              <h4 style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>No Notes Found</h4>
              <p className="color-muted" style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>
                Create a text note or drawing board to get started.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-col gap-4">
            {pinnedNotes.length > 0 && (
              <div>
                <h4 className="rd-section-label flex align-center gap-1" style={{ marginBottom: 'var(--space-3)' }}>
                  <Pin size={12} /> Pinned Notes
                </h4>
                <div className="grid-3">
                  {pinnedNotes.map(note => (
                    <NoteCard 
                      key={note.id} 
                      note={note} 
                      folder={folders.find(f => f.id === note.thumbnail_url)}
                      onSelect={(n) => navigate(`/notes/${n.id}`)} 
                      onDelete={deleteNote} 
                      onPin={togglePin} 
                    />
                  ))}
                </div>
              </div>
            )}

            {otherNotes.length > 0 && (
              <div>
                {pinnedNotes.length > 0 && (
                  <h4 className="rd-section-label" style={{ marginTop: 'var(--space-5)', marginBottom: 'var(--space-3)' }}>
                    Other notes
                  </h4>
                )}
                <div className="grid-3">
                  {otherNotes.map(note => (
                    <NoteCard 
                      key={note.id} 
                      note={note} 
                      folder={folders.find(f => f.id === note.thumbnail_url)}
                      onSelect={(n) => navigate(`/notes/${n.id}`)} 
                      onDelete={deleteNote} 
                      onPin={togglePin} 
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Folder Creation Modal ── */}
      {showFolderModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem', width: '90%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Create New Folder</h3>
              <button onClick={() => setShowFolderModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleCreateFolder} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Folder Name</label>
                <input
                  type="text"
                  placeholder="e.g. Invoices, Outreach scripts"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  className="form-input w-full"
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Folder Tag Color</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {FOLDER_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewFolderColor(c)}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        backgroundColor: c,
                        border: newFolderColor === c ? '2.5px solid var(--text-primary)' : '1px solid rgba(0,0,0,0.1)',
                        cursor: 'pointer',
                        padding: 0,
                        boxShadow: newFolderColor === c ? '0 0 8px rgba(0,0,0,0.3)' : 'none'
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowFolderModal(false)} className="btn btn-secondary btn-sm">Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm">Create Folder</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Premium Sorting Upgrade Modal ── */}
      {showUpgradeModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '2rem', width: '90%', maxWidth: '420px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <Gem size={40} style={{ color: 'var(--primary-magenta)' }} />
            <h3 style={{ margin: 0, color: 'var(--primary-magenta)' }}>Unlock Premium Sorting</h3>
            <p className="color-muted" style={{ fontSize: '0.95rem', margin: 0, lineHeight: 1.5 }}>
              Sorting notes alphabetically and by oldest updated status is a <strong>Pro and Teams</strong> plan feature. Keep your work fully organized and optimized.
            </p>
            <div style={{ background: 'rgba(91,143,185,0.05)', border: '1px dashed var(--border-strong)', borderRadius: '8px', padding: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Current Tier: {(currentUser?.plan || 'Starter').toUpperCase()}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '0.5rem' }}>
              <button onClick={() => setShowUpgradeModal(false)} className="btn btn-secondary btn-sm">Close</button>
              <button 
                onClick={() => { setShowUpgradeModal(false); navigate('/settings'); }} 
                className="btn btn-primary btn-sm"
              >
                Upgrade Plan
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function extractTextFromTiptap(json) {
  try {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    const texts = [];
    function walk(node) {
      if (node.type === 'text') texts.push(node.text);
      if (node.content) node.content.forEach(walk);
    }
    walk(parsed);
    return texts.join(' ').slice(0, 120) + '...';
  } catch {
    return 'No preview available';
  }
}

function parseDrawingPreview(content) {
  try {
    if (!content) return { elementCount: 0, colors: [], hasContent: false, types: [] };
    const parsed = JSON.parse(content);
    const elements = (parsed.elements || []).filter(el => !el.isDeleted);
    const colorSet = new Set();
    elements.forEach(el => {
      if (el.strokeColor && el.strokeColor !== 'transparent' && el.strokeColor !== '#000000') {
        colorSet.add(el.strokeColor);
      }
      if (el.backgroundColor && el.backgroundColor !== 'transparent') {
        colorSet.add(el.backgroundColor);
      }
    });
    if (elements.length > 0 && colorSet.size === 0) colorSet.add('#475569');
    return {
      elementCount: elements.length,
      colors: [...colorSet].slice(0, 5),
      hasContent: elements.length > 0,
      types: [...new Set(elements.map(el => el.type))].slice(0, 3),
    };
  } catch {
    return { elementCount: 0, colors: [], hasContent: false, types: [] };
  }
}

function DrawingPreview({ content }) {
  const { elementCount, colors, hasContent, types } = parseDrawingPreview(content);

  const typeLabels = {
    rectangle: '▭',
    ellipse: '○',
    line: '╱',
    arrow: '→',
    text: 'T',
    freedraw: '✎',
    image: '▩',
    diamond: '◇',
  };

  return (
    <div style={{
      width: '100%',
      height: '100px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '8px',
      marginTop: '0.5rem',
      gap: '0.5rem',
      backgroundImage:
        'linear-gradient(rgba(139,92,246,0.05) 1px, transparent 1px),' +
        'linear-gradient(90deg, rgba(139,92,246,0.05) 1px, transparent 1px)',
      backgroundSize: '16px 16px',
      backgroundColor: '#f8fafc',
      border: '1px solid #e2e8f0',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {hasContent && (
        <span style={{
          position: 'absolute',
          top: '6px',
          right: '8px',
          fontSize: '10px',
          fontWeight: 700,
          color: '#8b5cf6',
          background: 'rgba(139,92,246,0.1)',
          border: '1px solid rgba(139,92,246,0.2)',
          borderRadius: '20px',
          padding: '1px 7px',
        }}>
          {elementCount} {elementCount === 1 ? 'shape' : 'shapes'}
        </span>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <PenLine size={22} color="#8b5cf6" style={{ opacity: 0.85, flexShrink: 0 }} />
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>
          {hasContent ? 'Drawing' : 'Empty Canvas'}
        </span>
      </div>

      {hasContent && types && types.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {types.map(type => (
            <span key={type} style={{
              fontSize: '10px',
              padding: '1px 6px',
              borderRadius: '4px',
              background: 'rgba(100,116,139,0.08)',
              color: '#64748b',
              fontWeight: 600,
              border: '1px solid rgba(100,116,139,0.15)',
            }}>
              {typeLabels[type] || type} {type}
            </span>
          ))}
        </div>
      )}

      {colors.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', position: 'absolute', bottom: '7px', left: '10px' }}>
          {colors.map((c, i) => (
            <span key={i} style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: c,
              border: '1.5px solid rgba(255,255,255,0.8)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
              display: 'inline-block',
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteCard({ note, onSelect, onDelete, onPin, folder }) {
  let textSnippet = 'Empty Note';
  if (note.type === 'text') {
    textSnippet = note.content ? extractTextFromTiptap(note.content) : 'Empty Note';
  }

  return (
    <div 
      className="card flex-col gap-3" 
      onClick={() => onSelect(note)}
      style={{
        backgroundColor: note.type === 'text' ? note.color || '#ffffff' : '#ffffff',
        border: '1px solid var(--border-color)',
        cursor: 'pointer',
        justifyContent: 'space-between',
        transition: 'transform 0.2s, box-shadow 0.2s',
        position: 'relative',
        minHeight: '180px',
        color: '#1e293b'
      }}
    >
      <div>
        <div className="flex justify-between align-start">
          <h4 style={{ fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.25rem', margin: 0 }}>
          {note.type === 'text' ? <FileText size={14} /> : <Paintbrush size={14} />} {note.title}
          </h4>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <button 
              onClick={(e) => { e.stopPropagation(); onPin(note); }}
              className="btn btn-icon" 
              style={{ padding: '0.2rem', color: note.pinned ? 'var(--primary-purple)' : '#64748b' }}
            >
              <Pin size={14} />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}
              className="btn btn-icon" 
              style={{ padding: '0.2rem', color: 'var(--danger-color)' }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {folder && (
          <span 
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '0.25rem', 
              fontSize: '0.75rem', 
              fontWeight: 600, 
              color: '#1e293b', 
              background: `${folder.color}15`, 
              border: `1px solid ${folder.color}30`, 
              padding: '0.1rem 0.5rem', 
              borderRadius: '12px',
              marginTop: '0.25rem'
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: folder.color }}></span>
            {folder.name}
          </span>
        )}

        {note.type === 'canvas' ? (
          <DrawingPreview content={note.content} />
        ) : (
          <p 
            style={{ 
              fontSize: '0.88rem', 
              color: '#475569', 
              lineHeight: 1.5, 
              marginTop: '0.5rem',
              display: '-webkit-box',
              WebkitLineClamp: 4,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              textAlign: 'left'
            }}
          >
            {textSnippet}
          </p>
        )}
      </div>

      <div style={{ fontSize: '0.75rem', color: '#64748b', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
        <span>{note.type === 'text' ? 'Text Note' : 'Drawing Canvas'}</span>
        <span>{new Date(note.updated_at || note.created_at).toLocaleDateString()}</span>
      </div>
    </div>
  );
}
