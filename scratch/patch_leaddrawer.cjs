const fs = require('fs');
let code = fs.readFileSync('src/components/CRM/LeadDrawer.jsx', 'utf8');

// 1. Add import
if (!code.includes("import { isTeamOwner }")) {
  code = code.replace(/import { fetchLeadCallTimeline } from '\.\.\/\.\.\/lib\/callActivity';/, "import { fetchLeadCallTimeline } from '../../lib/callActivity';\nimport { isTeamOwner } from '../../lib/teamWorkspace';");
}

// 2. Extract teamProfilesMap
code = code.replace(
  /const { showToast, userSnippets } = useAppContext\(\) \|\| \{\};/,
  "const { showToast, userSnippets, teamProfilesMap = {} } = useAppContext() || {};\n  const isOwner = isTeamOwner(currentUser);"
);

// 3. Map notes rendering
const notesTarget = `                    leadNotes.map(n => (
                      <div
                        key={n.id}
                        className={\`lead-note-card \${selectedNoteId === n.id ? 'active' : ''}\`}
                        onClick={() => handleSelectNote(n)}
                      >
                        <FileText size={13} className="lead-drawer__note-icon" />`;

const notesReplacement = `                    leadNotes.map(n => {
                      const isNoteAuthor = n.user_id === currentUser?.id;
                      const canEditNote = isNoteAuthor || isOwner;
                      const authorProfile = teamProfilesMap[n.user_id];
                      const editorProfile = n.updated_by ? teamProfilesMap[n.updated_by] : null;

                      return (
                      <div
                        key={n.id}
                        className={\`lead-note-card \${selectedNoteId === n.id ? 'active' : ''}\`}
                        onClick={() => handleSelectNote(n)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                          {authorProfile?.avatar_url ? (
                            <img src={authorProfile.avatar_url} style={{ width: '16px', height: '16px', borderRadius: '50%' }} title={authorProfile.full_name} />
                          ) : (
                            <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'var(--border-color)', color: 'var(--text-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 'bold' }} title={authorProfile?.full_name}>
                              {(authorProfile?.full_name || 'U')[0].toUpperCase()}
                            </div>
                          )}
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {authorProfile?.full_name || 'Unknown'}
                            {n.updated_by && editorProfile && n.updated_by !== n.user_id && (
                              <span style={{ opacity: 0.7 }}> (edited by {editorProfile.full_name})</span>
                            )}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', width: '100%' }}>
                        <FileText size={13} className="lead-drawer__note-icon" />`;

code = code.replace(notesTarget, notesReplacement);

const deleteBtnTarget = `                        {/* Edit title btn */}
                        <button
                          onClick={e => { e.stopPropagation(); setEditingTitleId(n.id); setEditingTitleValue(n.title || ''); }}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.1rem', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                          title="Rename note"
                        >
                          <Pencil size={11} />
                        </button>

                        {/* Delete btn */}
                        <button
                          onClick={e => { e.stopPropagation(); deleteLeadNote(n.id); }}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger-color)', padding: '0.1rem', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                          title="Delete note"
                        >
                      <Trash2 size={11} />
                        </button>
                      </div>
                    ))`;

const deleteBtnReplacement = `                        {/* Edit title btn */}
                        {canEditNote && (
                          <button
                            onClick={e => { e.stopPropagation(); setEditingTitleId(n.id); setEditingTitleValue(n.title || ''); }}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.1rem', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                            title="Rename note"
                          >
                            <Pencil size={11} />
                          </button>
                        )}

                        {/* Delete btn */}
                        {canEditNote && (
                          <button
                            onClick={e => { e.stopPropagation(); deleteLeadNote(n.id); }}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger-color)', padding: '0.1rem', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                            title="Delete note"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                        </div>
                      </div>
                    )})`;

code = code.replace(deleteBtnTarget, deleteBtnReplacement);

// 4. Update RichTextEditor readOnly property
const rteTarget = `                        readOnly={false}`;
const rteReplacement = `                        readOnly={!(selectedNote && (selectedNote.user_id === currentUser?.id || isOwner))}`;
code = code.replace(rteTarget, rteReplacement);

fs.writeFileSync('src/components/CRM/LeadDrawer.jsx', code);
console.log('LeadDrawer updated.');
