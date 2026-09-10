import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Pin, Trash2, Folder, PanelLeftOpen, PanelLeftClose, FileText, PenLine, Search } from 'lucide-react';
import DrawingBoard from './DrawingBoard';
import RichTextEditor from './CRM/RichTextEditor';

const NOTE_COLORS = [
  { name: 'white',  hex: '#ffffff' },
  { name: 'yellow', hex: '#fefce8' },
  { name: 'grey',   hex: '#F5F5F5' },
  { name: 'blue',   hex: '#eff6ff' },
  { name: 'green',  hex: '#f0fdf4' },
  { name: 'pink',   hex: '#fdf2f8' }
];

export default function NoteEditor({ currentUser }) {
  const { id } = useParams();
  const navigate = useNavigate();

  // ---------- current note state ----------
  const [note, setNote]               = useState(null);
  const [folders, setFolders]         = useState([]);
  const [loading, setLoading]         = useState(true);

  const [editorTitle,    setEditorTitle]    = useState('');
  const [editorContent,  setEditorContent]  = useState('');
  const [editorColor,    setEditorColor]    = useState('#13132a');
  const [editorPinned,   setEditorPinned]   = useState(false);
  const [editorFolderId, setEditorFolderId] = useState('');

  // For canvas flushing
  const saveRef = useRef(null);

  // ---------- sidebar state ----------
  const [sidebarOpen, setSidebarOpen]     = useState(true);
  const [allNotes, setAllNotes]           = useState([]);
  const [sidebarSearch, setSidebarSearch] = useState('');

  // -------------------------------------------------------
  // Fetch current note + folders + all notes (for sidebar)
  // -------------------------------------------------------
  useEffect(() => {
    let isMounted = true;

    const fetchAll = async () => {
      setLoading(true);
      try {
        const [noteRes, foldersRes, allNotesRes] = await Promise.all([
          supabase.from('notes').select('*').eq('id', id).maybeSingle(),
          supabase.from('folders').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: true }),
          supabase.from('notes').select('id, title, type, pinned, updated_at').eq('user_id', currentUser.id).order('updated_at', { ascending: false })
        ]);

        if (!isMounted) return;

        if (foldersRes.data) setFolders(foldersRes.data);
        if (allNotesRes.data) setAllNotes(allNotesRes.data);

        const data = noteRes.data;
        if (data) {
          setNote(data);
          setEditorTitle(data.title || '');
          setEditorColor(data.color || '#13132a');
          setEditorPinned(data.pinned || false);
          setEditorFolderId(data.thumbnail_url || '');
          if (data.type === 'text') {
            setEditorContent(data.content || '');
          }
        } else {
          setNote(null);
        }
      } catch (err) {
        console.error('Error fetching note details:', err);
        if (isMounted) setNote(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    if (currentUser && id) fetchAll();
    return () => { isMounted = false; };
  }, [id, currentUser]);

  // -------------------------------------------------------
  // Auto-save canvas metadata when title/pin/folder change
  // -------------------------------------------------------
  const metaDebounceRef = useRef(null);
  useEffect(() => {
    if (!note || note.type !== 'canvas') return;

    const hasTitleChanged  = editorTitle    !== note.title;
    const hasPinnedChanged = editorPinned   !== note.pinned;
    const hasFolderChanged = editorFolderId !== (note.thumbnail_url || '');
    if (!hasTitleChanged && !hasPinnedChanged && !hasFolderChanged) return;

    if (metaDebounceRef.current) clearTimeout(metaDebounceRef.current);
    metaDebounceRef.current = setTimeout(() => saveCanvasMetadata(), 1500);

    return () => { if (metaDebounceRef.current) clearTimeout(metaDebounceRef.current); };
  }, [editorTitle, editorPinned, editorFolderId]);

  // -------------------------------------------------------
  // Save helpers
  // -------------------------------------------------------
  const saveCanvasMetadata = async () => {
    if (!note || note.type !== 'canvas') return;
    try {
      const { data, error } = await supabase.from('notes')
        .update({ title: editorTitle, pinned: editorPinned, thumbnail_url: editorFolderId || null, updated_at: new Date().toISOString() })
        .eq('id', note.id).select().single();
      if (error) throw error;
      setNote(data);
    } catch (err) {
      console.error('Error saving canvas metadata:', err);
    }
  };

  const saveCanvasData = async (serializedContent) => {
    if (!note || note.type !== 'canvas') return;
    try {
      const { data, error } = await supabase.from('notes')
        .update({ title: editorTitle, pinned: editorPinned, thumbnail_url: editorFolderId || null, content: serializedContent, updated_at: new Date().toISOString() })
        .eq('id', note.id).select().single();
      if (error) throw error;
      setNote(data);
      return data;
    } catch (err) {
      console.error('Error saving canvas note:', err);
    }
  };

  const deleteNote = async () => {
    if (!confirm('Are you sure you want to delete this note?')) return;
    try {
      const { error } = await supabase.from('notes').delete().eq('id', note.id);
      if (error) throw error;
      navigate('/notes');
    } catch (err) {
      console.error('Error deleting note:', err);
    }
  };

  const togglePin = async () => {
    if (!note) return;
    try {
      const newPinned = !editorPinned;
      setEditorPinned(newPinned);
      const { data, error } = await supabase.from('notes').update({ pinned: newPinned }).eq('id', note.id).select().single();
      if (error) throw error;
      setNote(data);
    } catch (err) {
      console.error('Error toggling pin:', err);
    }
  };

  const handleFolderChange = async (newFolderId) => {
    setEditorFolderId(newFolderId);
    if (!note) return;
    try {
      const { data, error } = await supabase.from('notes')
        .update({ thumbnail_url: newFolderId || null, updated_at: new Date().toISOString() })
        .eq('id', note.id)
        .select()
        .single();
      if (error) throw error;
      setNote(data);
    } catch (err) {
      console.error('Error saving folder assignment:', err);
    }
  };

  // Called by RichTextEditor onChange so sidebar preview stays fresh
  const handleRichTextChange = (jsonStr) => {
    setEditorContent(jsonStr);
  };

  // Switch to another note from sidebar
  const handleSidebarNavigate = async (targetId) => {
    if (targetId === id) return;
    // If canvas, flush first
    if (note?.type === 'canvas' && saveRef.current) {
      await saveRef.current();
    }
    navigate(`/notes/${targetId}`);
  };

  // -------------------------------------------------------
  // Sidebar filtered notes
  // -------------------------------------------------------
  const filteredSidebarNotes = allNotes.filter(n =>
    (n.title || 'Untitled').toLowerCase().includes(sidebarSearch.toLowerCase())
  );

  // -------------------------------------------------------
  // Loading / not found states
  // -------------------------------------------------------
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '1rem' }}>
        <div className="loading-spinner-inner" style={{ border: '3px solid var(--border)', borderTop: '3px solid var(--accent-blue)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' }} />
        <p className="color-muted">Loading note...</p>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="card flex align-center justify-center" style={{ minHeight: '300px', padding: '2rem', textAlign: 'center' }}>
        <div>
          <Search size={40} style={{ color: 'var(--text-muted)', margin: '0 auto' }} />
          <h3 style={{ marginTop: '1.5rem', color: 'var(--text-secondary)' }}>Note Not Found</h3>
          <p className="color-muted" style={{ fontSize: '0.9rem', marginTop: '0.5rem', marginBottom: '1.5rem' }}>
            The note you are looking for does not exist or has been deleted.
          </p>
          <button onClick={() => navigate('/notes')} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <ArrowLeft size={16} /> Back to Notes
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // Render
  // -------------------------------------------------------
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', gap: 0, position: 'relative', background: 'var(--bg-primary)' }}>

      {/* ── LEFT SIDEBAR ── */}
      <div style={{
        width: sidebarOpen ? '220px' : '0px',
        minWidth: sidebarOpen ? '220px' : '0px',
        overflow: 'hidden',
        transition: 'width 0.25s ease, min-width 0.25s ease',
        borderRight: sidebarOpen ? '1px solid var(--border-color)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-secondary)',
        borderRadius: '12px 0 0 12px'
      }}>
        {sidebarOpen && (
          <>
            {/* Sidebar header */}
            <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                All Notes
              </span>
              <input
                type="text"
                value={sidebarSearch}
                onChange={e => setSidebarSearch(e.target.value)}
                placeholder="Search..."
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '0.3rem 0.5rem',
                  fontSize: '0.8rem',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  width: '100%'
                }}
              />
            </div>

            {/* Sidebar note list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.4rem' }}>
              {filteredSidebarNotes.length === 0 ? (
                <div style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                  No notes found
                </div>
              ) : (
                filteredSidebarNotes.map(n => {
                  const isActive = n.id === id;
                  return (
                    <button
                      key={n.id}
                      onClick={() => handleSidebarNavigate(n.id)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '0.5rem 0.6rem',
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        background: isActive ? 'var(--bg-hover)' : 'transparent',
                        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                        fontSize: '0.82rem',
                        fontWeight: isActive ? 700 : 400,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        marginBottom: '1px',
                        transition: 'background 0.15s'
                      }}
                    >
                      {n.type === 'canvas'
                        ? <PenLine size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
                        : <FileText size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
                      }
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {n.title || 'Untitled'}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* ── MAIN EDITOR AREA ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg-primary)' }}>

        {/* Top Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '0.75rem', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '200px' }}>
            {/* Sidebar toggle */}
            <button
              onClick={() => setSidebarOpen(v => !v)}
              className="btn btn-secondary btn-sm"
              title={sidebarOpen ? 'Hide note list' : 'Show note list'}
              style={{ padding: '0.3rem 0.4rem' }}
            >
              {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>

            <button
              onClick={async () => {
                if (note.type === 'canvas' && saveRef.current) await saveRef.current();
                navigate('/notes');
              }}
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <ArrowLeft size={16} /> Back
            </button>

            <input
              type="text"
              value={editorTitle}
              onChange={e => setEditorTitle(e.target.value)}
              onBlur={async () => {
                if (!note) return;
                if (editorTitle === note.title) return;
                try {
                  const { data, error } = await supabase.from('notes')
                    .update({ title: editorTitle, updated_at: new Date().toISOString() })
                    .eq('id', note.id).select().single();
                  if (error) throw error;
                  setNote(data);
                  setAllNotes(prev => prev.map(n => n.id === data.id ? { ...n, title: data.title } : n));
                } catch (err) {
                  console.error('Error saving title:', err);
                }
              }}
              placeholder="Note Title"
              style={{
                fontSize: '1.3rem',
                fontFamily: 'Bricolage Grotesque, Inter',
                fontWeight: 700,
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                outline: 'none',
                maxWidth: '300px',
                width: '100%'
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {/* Folder selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '0.25rem 0.5rem', borderRadius: '8px' }}>
              <Folder size={13} style={{ color: 'var(--text-muted)' }} />
              <select
                value={editorFolderId}
                onChange={e => handleFolderChange(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '0.82rem', cursor: 'pointer', outline: 'none', fontWeight: 500 }}
              >
                <option value="">Uncategorized</option>
                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>

            <button onClick={togglePin} className="btn btn-secondary btn-sm" style={{ color: editorPinned ? 'var(--accent-blue)' : 'var(--text-muted)' }}>
              <Pin size={15} /> {editorPinned ? 'Pinned' : 'Pin'}
            </button>

            {/* Color palette – only for text notes */}
            {note.type === 'text' && (
              <div style={{ display: 'flex', gap: '0.2rem', borderLeft: '1px solid var(--border-color)', paddingLeft: '0.5rem' }}>
                {NOTE_COLORS.map(c => (
                  <button
                    key={c.hex}
                    onClick={() => setEditorColor(c.hex)}
                    style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: c.hex, border: editorColor === c.hex ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)', cursor: 'pointer', padding: 0 }}
                  />
                ))}
              </div>
            )}

            <button onClick={deleteNote} className="btn btn-secondary btn-sm" style={{ color: 'var(--danger-color)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <Trash2 size={15} /> Delete
            </button>
          </div>
        </div>

        {/* Editor workspace */}
        {note.type === 'text' ? (
          <div className="editor-container-override" style={{ flex: 1, background: 'var(--bg-primary)', borderRadius: '0 12px 12px 12px', border: '1px solid var(--border-color)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <RichTextEditor
              content={editorContent}
              onChange={handleRichTextChange}
              placeholder="Start writing your note here..."
              readOnly={false}
              noteId={note.id}
              noteType="global"
              userId={currentUser?.id}
              currentTitle={editorTitle}
            />
          </div>
        ) : (
          <div style={{ flex: 1, borderRadius: '0 12px 12px 12px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            <DrawingBoard
              key={note.id}
              initialContent={note.content}
              onSave={saveCanvasData}
              saveRef={saveRef}
            />
          </div>
        )}
      </div>
    </div>
  );
}
