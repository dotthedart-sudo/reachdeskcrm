import React, { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Document } from '@tiptap/extension-document';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
import { Heading } from '@tiptap/extension-heading';
import { Blockquote } from '@tiptap/extension-blockquote';
import { HorizontalRule } from '@tiptap/extension-horizontal-rule';
import { BulletList, OrderedList, ListItem, ListKeymap } from '@tiptap/extension-list';
import { Underline } from '@tiptap/extension-underline';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Link } from '@tiptap/extension-link';
import { TextAlign } from '@tiptap/extension-text-align';
import { FontFamily } from '@tiptap/extension-font-family';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import { Placeholder } from '@tiptap/extension-placeholder';
import { CharacterCount } from '@tiptap/extension-character-count';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { SlashCommand, getSuggestionOptions } from './SlashCommand';
import { ToggleBlock } from './ToggleBlock';
import { DatabaseBlock } from './DatabaseBlock';

import { 
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, 
  AlignLeft, AlignCenter, AlignRight, List, ListOrdered, 
  Table as TableIcon, Link as LinkIcon, Minus, Undo2, Redo2, 
  Clock, X, Check, Save, History, AlertTriangle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// Premium Color Swatches (8 colors)
const TEXT_COLORS = [
  '#ffffff', // White
  '#94a3b8', // Gray
  '#ef4444', // Red
  '#f59e0b', // Amber/Yellow
  '#10b981', // Emerald/Green
  '#3b82f6', // Blue
  '#8b5cf6', // Violet/Purple
  '#ec4899'  // Pink
];

const HIGHLIGHT_COLORS = [
  '#fef08a', // Light Yellow
  '#bbf7d0', // Light Green
  '#bfdbfe', // Light Blue
  '#fbcfe8', // Light Pink
  '#ddd6fe', // Light Purple
  '#ffedd5', // Light Orange
  '#c084fc', // Bright Purple
  '#22d3ee'  // Light Cyan
];

export default function RichTextEditor({
  content,
  onChange,
  placeholder = 'Write something...',
  readOnly = false,
  noteId,
  noteType = 'global', // 'global' | 'lead'
  userId,
  currentTitle = 'Untitled'
}) {
  const [saveStatus, setSaveStatus] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showBubbleMenu, setShowBubbleMenu] = useState(false);
  const [bubbleMenuCoords, setBubbleMenuCoords] = useState({ top: 0, left: 0 });
  const [versions, setVersions] = useState([]);
  const [previewVersion, setPreviewVersion] = useState(null);
  const [versionsLoading, setVersionsLoading] = useState(false);

  // Detect whether app is in light mode
  const [isLightMode, setIsLightMode] = useState(() =>
    document.documentElement.classList.contains('light')
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsLightMode(document.documentElement.classList.contains('light'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Theme-aware defaults
  const defaultDarkBg = '#1A1A1A';
  const defaultLightBg = '#ffffff';

  const [editorBg, setEditorBg] = useState(() => {
    const stored = localStorage.getItem('reachdesk_note_bg');
    if (stored) return stored;
    return document.documentElement.classList.contains('light') ? defaultLightBg : defaultDarkBg;
  });

  // When theme toggles, reset editor bg to appropriate default
  useEffect(() => {
    setEditorBg(isLightMode ? defaultLightBg : defaultDarkBg);
    localStorage.removeItem('reachdesk_note_bg');
  }, [isLightMode]);

  const handleBgChange = (color) => {
    setEditorBg(color);
    localStorage.setItem('reachdesk_note_bg', color);
  };

  // Determine if the current bg is "light" so we can pick contrasting text
  const isBgLight = ['#f8f9fa', '#ffffff', '#f5f3ff', '#fefce8', '#eff6ff', '#f0fdf4', '#fdf2f8'].includes(editorBg);
  const editorTextColor = isBgLight ? '#1e1b4b' : '#e2e8f0';
  const toolbarBg = isLightMode ? '#F5F5F5' : '#222222';
  const footerBg = isLightMode ? '#F0F0F0' : '#181818';
  const footerTextColor = isLightMode ? '#525252' : '#6b7280';

  const autoSaveTimeoutRef = useRef(null);

  // Parse initial content safely
  const getParsedContent = (rawContent) => {
    if (!rawContent) return '';
    try {
      if (rawContent.startsWith('{') || rawContent.startsWith('[')) {
        return JSON.parse(rawContent);
      }
      return rawContent; // fallback plain HTML/text
    } catch (e) {
      return rawContent;
    }
  };

  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Heading,
      BulletList,
      OrderedList,
      ListItem,
      TaskList,
      TaskItem.configure({ nested: false }),
      Blockquote,
      HorizontalRule,
      ListKeymap,
      StarterKit.configure({
        document: false,
        paragraph: false,
        text: false,
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        horizontalRule: false,
        link: false,
        underline: false,
      }),
      Underline,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Highlight,
      Placeholder.configure({
        placeholder: 'Start writing or press "/" for commands...',
      }),
      Link.configure({
        openOnClick: false,
      }),
      CharacterCount,
      Color,
      FontFamily,
      TextStyle,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      SlashCommand.configure({
        suggestion: getSuggestionOptions(),
      }),
      ToggleBlock,
      DatabaseBlock
    ],
    content: getParsedContent(content),
    editable: !readOnly,
    editorProps: {
      handlePaste: (view, event, slice) => {
        view.editor.isPasting = true;
        setTimeout(() => {
          view.editor.isPasting = false;
        }, 50);
        return false;
      },
      handleDrop: (view, event, slice, moved) => {
        view.editor.isPasting = true;
        setTimeout(() => {
          view.editor.isPasting = false;
        }, 50);
        return false;
      },
      handleDOMEvents: {
        click: (view, event) => {
          const target = event.target;
          if (target && target.tagName === 'INPUT' && target.type === 'checkbox') {
            const taskItem = target.closest('[data-type="taskItem"]');
            if (taskItem) {
              const pos = view.posAtDOM(target);
              if (pos !== undefined) {
                const $pos = view.state.doc.resolve(pos);
                let nodePos = pos;
                let node = view.state.doc.nodeAt(pos);
                if (!node || node.type.name !== 'taskItem') {
                  for (let depth = $pos.depth; depth >= 0; depth--) {
                    const ancestor = $pos.node(depth);
                    if (ancestor && ancestor.type.name === 'taskItem') {
                      node = ancestor;
                      nodePos = $pos.before(depth);
                      break;
                    }
                  }
                }
                
                if (node && node.type.name === 'taskItem') {
                  view.dispatch(
                    view.state.tr.setNodeMarkup(nodePos, null, {
                      ...node.attrs,
                      checked: !node.attrs.checked,
                    })
                  );
                  return true;
                }
              }
            }
          }
          return false;
        }
      }
    },
    onUpdate: ({ editor }) => {
      const jsonStr = JSON.stringify(editor.getJSON());
      if (onChange) {
        onChange(jsonStr);
      }

      // Handle Debounced Auto-Save & Version Snapshot
      if (noteId && userId && !readOnly) {
        setSaveStatus('Saving...');
        if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = setTimeout(() => {
          performAutoSave(jsonStr);
        }, 1000);
      }
    }
  });

  // Watch for external content changes (e.g., switching notes or restoring a version)
  useEffect(() => {
    if (editor && content) {
      const currentJsonStr = JSON.stringify(editor.getJSON());
      if (currentJsonStr !== content) {
        editor.commands.setContent(getParsedContent(content));
      }
    }
  }, [content, editor]);

  // Position selection floating toolbar
  useEffect(() => {
    if (!editor) return;

    const updateBubbleMenu = () => {
      const { selection } = editor.state;
      if (selection.empty || readOnly) {
        setShowBubbleMenu(false);
        return;
      }

      const domSelection = window.getSelection();
      if (!domSelection || domSelection.rangeCount === 0) {
        setShowBubbleMenu(false);
        return;
      }

      const range = domSelection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      setBubbleMenuCoords({
        top: rect.top - 8,
        left: rect.left + rect.width / 2
      });
      setShowBubbleMenu(true);
    };

    const hideBubbleMenu = () => {
      setShowBubbleMenu(false);
    };

    editor.on('selectionUpdate', updateBubbleMenu);
    editor.on('focus', updateBubbleMenu);
    editor.on('blur', hideBubbleMenu);

    // Reposition on window resize or scroll
    window.addEventListener('resize', updateBubbleMenu);
    window.addEventListener('scroll', updateBubbleMenu, true);

    return () => {
      editor.off('selectionUpdate', updateBubbleMenu);
      editor.off('focus', updateBubbleMenu);
      editor.off('blur', hideBubbleMenu);
      window.removeEventListener('resize', updateBubbleMenu);
      window.removeEventListener('scroll', updateBubbleMenu, true);
    };
  }, [editor, readOnly]);

  // Clean up auto-save timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    };
  }, []);

  const performAutoSave = async (jsonStr) => {
    try {
      const targetTable = noteType === 'global' ? 'notes' : 'lead_notes';
      const versionTable = noteType === 'global' ? 'note_versions' : 'lead_note_versions';
      const noteIdField = noteType === 'global' ? 'note_id' : 'lead_note_id';

      // 1. Update main note row content
      const { error: mainError } = await supabase
        .from(targetTable)
        .update({
          content: jsonStr,
          updated_at: new Date().toISOString()
        })
        .eq('id', noteId);

      if (mainError) throw mainError;

      // 2. Insert into versions (silent background operation)
      // Fetch latest version_number
      const { data: latestVer } = await supabase
        .from(versionTable)
        .select('version_number')
        .eq(noteIdField, noteId)
        .order('version_number', { ascending: false })
        .limit(1);

      const nextVerNum = (latestVer && latestVer.length > 0) ? latestVer[0].version_number + 1 : 1;

      const { error: verError } = await supabase
        .from(versionTable)
        .insert({
          [noteIdField]: noteId,
          user_id: userId,
          content: jsonStr,
          title: `Version ${nextVerNum}`,
          version_number: nextVerNum
        });

      if (verError) {
        console.error('Silent version insert error:', verError);
      } else {
        // 3. Keep only latest 20 versions: delete older ones
        const { data: allVers } = await supabase
          .from(versionTable)
          .select('id')
          .eq(noteIdField, noteId)
          .order('version_number', { ascending: false });

        if (allVers && allVers.length > 20) {
          const keepIds = allVers.slice(0, 20).map(v => v.id);
          await supabase
            .from(versionTable)
            .delete()
            .eq(noteIdField, noteId)
            .not('id', 'in', `(${keepIds.join(',')})`);
        }
      }

      setSaveStatus('Saved');
      setTimeout(() => setSaveStatus(''), 2000);
      
      // Refresh version list if history panel is open
      if (showHistory) {
        fetchVersions();
      }
    } catch (err) {
      console.error('Error during auto-save:', err);
      setSaveStatus('Save Error');
    }
  };

  const fetchVersions = async () => {
    if (!noteId) return;
    setVersionsLoading(true);
    try {
      const versionTable = noteType === 'global' ? 'note_versions' : 'lead_note_versions';
      const noteIdField = noteType === 'global' ? 'note_id' : 'lead_note_id';

      const { data, error } = await supabase
        .from(versionTable)
        .select('*')
        .eq(noteIdField, noteId)
        .order('version_number', { ascending: false });

      if (error) throw error;
      setVersions(data || []);
    } catch (err) {
      console.error('Error fetching version history:', err);
    } finally {
      setVersionsLoading(false);
    }
  };

  const toggleHistoryPanel = () => {
    const nextVal = !showHistory;
    setShowHistory(nextVal);
    if (nextVal) {
      setPreviewVersion(null);
      fetchVersions();
    }
  };

  const handleRestoreVersion = (version) => {
    if (!editor) return;
    editor.commands.setContent(getParsedContent(version.content));
    setShowHistory(false);
    setPreviewVersion(null);
    if (onChange) {
      onChange(version.content);
    }
  };

  const previewEditor = useEditor({
    extensions: [
      StarterKit.configure({
        link: false,
        underline: false,
      }),
      Underline,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      FontFamily,
      Color,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      ToggleBlock,
      DatabaseBlock
    ],
    content: '',
    editable: false
  });

  // Watch previewVersion and update previewEditor
  useEffect(() => {
    if (previewEditor && previewVersion) {
      previewEditor.commands.setContent(getParsedContent(previewVersion.content));
    }
  }, [previewVersion, previewEditor]);

  if (!editor) return null;

  return (
    <div 
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: editorBg,
        flex: 1,
        height: '100%',
        minHeight: 0
      }}
    >
      <style>{`
        .ProseMirror {
          min-height: 500px;
          background-color: ${editorBg} !important;
          color: ${editorTextColor} !important;
          padding: 20px 24px;
          outline: none;
          font-family: var(--font-body);
        }
        /* Ensure TipTap's inner .tiptap wrapper also inherits bg */
        .tiptap {
          background-color: ${editorBg} !important;
          min-height: 500px;
        }
        .ProseMirror p { margin-bottom: 0.5rem; }
        .ProseMirror h1 { font-size: 1.8rem; margin-bottom: 0.75rem; }
        .ProseMirror h2 { font-size: 1.5rem; margin-bottom: 0.6rem; }
        .ProseMirror h3 { font-size: 1.25rem; margin-bottom: 0.5rem; }
        .ProseMirror ul { padding-left: 1.5rem; list-style-type: disc; margin-bottom: 0.5rem; }
        .ProseMirror ol { padding-left: 1.5rem; list-style-type: decimal; margin-bottom: 0.5rem; }
        .ProseMirror table {
          border-collapse: collapse;
          width: 100%;
          margin: 8px 0;
        }
        .ProseMirror table td,
        .ProseMirror table th {
          border: 1px solid ${isLightMode ? 'rgba(109, 40, 217, 0.25)' : 'rgba(139, 92, 246, 0.35)'} !important;
          padding: 8px 12px !important;
          min-width: 80px;
          color: ${editorTextColor} !important;
          background: transparent !important;
          box-sizing: border-box;
          position: relative;
          vertical-align: top;
        }
        .ProseMirror table th {
          background: ${isLightMode ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.06)'} !important;
          font-weight: 600;
          color: ${isLightMode ? '#333338' : '#A3A3A3'} !important;
        }
        .ProseMirror table tr:hover td {
          background: ${isLightMode ? 'rgba(0, 0, 0, 0.02)' : 'rgba(255, 255, 255, 0.03)'} !important;
        }
        .ProseMirror .selectedCell:after {
          background: ${isLightMode ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.10)'} !important;
        }
        .toolbar-btn {
          width: 32px;
          height: 32px;
          background: transparent;
          border: none;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .toolbar-btn:hover {
          background-color: var(--bg-hover);
          color: var(--text-primary);
        }
        .toolbar-btn.is-active {
          background-color: var(--accent-blue);
          color: var(--accent-on);
        }
        .toolbar-select {
          background: ${toolbarBg};
          border: 1px solid var(--border-color);
          color: var(--text-primary);
          padding: 0.2rem 0.5rem;
          border-radius: 6px;
          font-size: 0.8rem;
          outline: none;
          cursor: pointer;
        }
        .bg-picker-circle {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          cursor: pointer;
          border: 2px solid transparent;
          transition: transform 0.15s ease;
          padding: 0;
        }
        .bg-picker-circle:hover {
          transform: scale(1.15);
        }
        .bg-picker-circle.is-active {
          border-color: ${isLightMode ? '#333338' : '#FFFFFF'};
        }
        ul[data-type="taskList"] {
          list-style: none;
          padding: 0;
        }
        ul[data-type="taskList"] li {
          display: flex;
          align-items: flex-start;
        }
        ul[data-type="taskList"] li > label {
          flex: 0 0 auto;
          margin-right: 0.5rem;
          user-select: none;
        }
        ul[data-type="taskList"] li > div {
          flex: 1 1 auto;
        }
        .toggle-block.is-closed .toggle-content > :not(:first-child) {
          display: none !important;
        }
        .toggle-block.is-closed .toggle-content > :first-child {
          margin-bottom: 0 !important;
        }
      `}</style>

      {/* Editor Main Header & Saved Status */}
      {saveStatus && (
        <div style={{ position: 'absolute', top: '8px', right: '16px', zIndex: 10, display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: saveStatus === 'Saving...' ? 'var(--warning-color)' : 'var(--success-color)' }} />
          {saveStatus}
        </div>
      )}

      {/* TOOLBAR */}
      {!readOnly && (
        <div 
          style={{ 
            background: toolbarBg, 
            borderBottom: '1px solid var(--border-color)', 
            padding: '8px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}
        >
          {/* Row 1 — Text style */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Background Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '4px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 'bold' }}>BG</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                {(isLightMode
                  ? ['#ffffff', '#f5f3ff', '#fefce8', '#eff6ff', '#1a1a2e']
                  : ['#13132a', '#1a1a2e', '#0f2027', '#1a1a1a', '#f8f9fa']
                ).map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => handleBgChange(color)}
                    className={`bg-picker-circle ${editorBg === color ? 'is-active' : ''}`}
                    style={{ backgroundColor: color }}
                    title={`Background: ${color}`}
                  />
                ))}
              </div>
            </div>

            {/* Font Family Dropdown */}
            <select
              value={editor.getAttributes('textStyle').fontFamily || 'Inter'}
              onChange={e => editor.chain().focus().setFontFamily(e.target.value).run()}
              className="toolbar-select"
              style={{ width: '110px' }}
            >
              <option value="Inter">Inter</option>
              <option value="Georgia">Georgia</option>
              <option value="Courier New">Courier</option>
              <option value="Arial">Arial</option>
            </select>

            {/* Font Size Dropdown */}
            <select
              value={
                editor.isActive('heading', { level: 1 }) ? 'huge' :
                editor.isActive('heading', { level: 2 }) ? 'large' :
                editor.isActive('heading', { level: 5 }) ? 'small' : 'normal'
              }
              onChange={e => {
                const val = e.target.value;
                if (val === 'small') {
                  editor.chain().focus().setParagraph().toggleHeading({ level: 5 }).run();
                } else if (val === 'normal') {
                  editor.chain().focus().setParagraph().run();
                } else if (val === 'large') {
                  editor.chain().focus().toggleHeading({ level: 2 }).run();
                } else if (val === 'huge') {
                  editor.chain().focus().toggleHeading({ level: 1 }).run();
                }
              }}
              className="toolbar-select"
              style={{ width: '90px' }}
            >
              <option value="small">Small</option>
              <option value="normal">Normal</option>
              <option value="large">Large</option>
              <option value="huge">Huge</option>
            </select>

            <span style={{ width: '1px', height: '18px', backgroundColor: 'var(--border-color)', margin: '0 4px' }} />

            {/* Undo / Redo */}
            <button
              type="button"
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              className="toolbar-btn"
              title="Undo"
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              className="toolbar-btn"
              title="Redo"
            >
              <Redo2 size={16} />
            </button>

            <span style={{ width: '1px', height: '18px', backgroundColor: 'var(--border-color)', margin: '0 4px' }} />

            {/* Format Buttons */}
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={`toolbar-btn ${editor.isActive('bold') ? 'is-active' : ''}`}
              title="Bold"
            >
              <Bold size={16} />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={`toolbar-btn ${editor.isActive('italic') ? 'is-active' : ''}`}
              title="Italic"
            >
              <Italic size={16} />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              className={`toolbar-btn ${editor.isActive('underline') ? 'is-active' : ''}`}
              title="Underline"
            >
              <UnderlineIcon size={16} />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleStrike().run()}
              className={`toolbar-btn ${editor.isActive('strike') ? 'is-active' : ''}`}
              title="Strike"
            >
              <Strikethrough size={16} />
            </button>

            <span style={{ width: '1px', height: '18px', backgroundColor: 'var(--border-color)', margin: '0 4px' }} />

            {/* Text Color Picker */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              {TEXT_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => editor.chain().focus().setColor(c).run()}
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    backgroundColor: c,
                    border: editor.getAttributes('textStyle').color === c ? '2px solid white' : '1px solid rgba(0,0,0,0.3)',
                    cursor: 'pointer',
                    padding: 0
                  }}
                  title={`Text Color: ${c}`}
                />
              ))}
            </div>

            <span style={{ width: '1px', height: '18px', backgroundColor: 'var(--border-color)', margin: '0 4px' }} />

            {/* Highlight Picker */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              {HIGHLIGHT_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => editor.chain().focus().toggleHighlight({ color: c }).run()}
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '2px',
                    backgroundColor: c,
                    border: editor.isActive('highlight', { color: c }) ? '2px solid white' : '1px solid rgba(0,0,0,0.3)',
                    cursor: 'pointer',
                    padding: 0
                  }}
                  title={`Highlight: ${c}`}
                />
              ))}
              <button
                type="button"
                onClick={() => editor.chain().focus().unsetHighlight().run()}
                className="toolbar-btn"
                style={{ width: '18px', height: '18px', fontSize: '0.7rem' }}
                title="Clear Highlight"
              >
                ✕
              </button>
            </div>

            {/* Version History Button on Far Right */}
            {noteId && (
              <button
                type="button"
                onClick={toggleHistoryPanel}
                className={`toolbar-btn ${showHistory ? 'is-active' : ''}`}
                style={{ marginLeft: 'auto' }}
                title="Version History"
              >
                <Clock size={16} />
              </button>
            )}
          </div>

          {/* Row 2 — Structure */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              className={`toolbar-btn ${editor.isActive('heading', { level: 1 }) ? 'is-active' : ''}`}
              title="Heading 1"
              style={{ fontWeight: 'bold' }}
            >
              H1
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              className={`toolbar-btn ${editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}`}
              title="Heading 2"
              style={{ fontWeight: 'bold' }}
            >
              H2
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              className={`toolbar-btn ${editor.isActive('heading', { level: 3 }) ? 'is-active' : ''}`}
              title="Heading 3"
              style={{ fontWeight: 'bold' }}
            >
              H3
            </button>

            <span style={{ width: '1px', height: '18px', backgroundColor: 'var(--border-color)', margin: '0 4px' }} />

            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              className={`toolbar-btn ${editor.isActive('bulletList') ? 'is-active' : ''}`}
              title="Bullet List"
            >
              <List size={16} />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              className={`toolbar-btn ${editor.isActive('orderedList') ? 'is-active' : ''}`}
              title="Numbered List"
            >
              <ListOrdered size={16} />
            </button>

            <span style={{ width: '1px', height: '18px', backgroundColor: 'var(--border-color)', margin: '0 4px' }} />

            {/* Alignments */}
            <button
              type="button"
              onClick={() => editor.chain().focus().setTextAlign('left').run()}
              className={`toolbar-btn ${editor.isActive({ textAlign: 'left' }) ? 'is-active' : ''}`}
              title="Align Left"
            >
              <AlignLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().setTextAlign('center').run()}
              className={`toolbar-btn ${editor.isActive({ textAlign: 'center' }) ? 'is-active' : ''}`}
              title="Align Center"
            >
              <AlignCenter size={16} />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().setTextAlign('right').run()}
              className={`toolbar-btn ${editor.isActive({ textAlign: 'right' }) ? 'is-active' : ''}`}
              title="Align Right"
            >
              <AlignRight size={16} />
            </button>

            <span style={{ width: '1px', height: '18px', backgroundColor: 'var(--border-color)', margin: '0 4px' }} />

            {/* Tables, links, horizontal rule */}
            <button
              type="button"
              onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
              className="toolbar-btn"
              title="Insert 3x3 Table"
            >
              <TableIcon size={16} />
            </button>

            <button
              type="button"
              onClick={() => {
                const url = prompt('Enter link URL:');
                if (url) {
                  editor.chain().focus().setLink({ href: url }).run();
                } else if (url === '') {
                  editor.chain().focus().unsetLink().run();
                }
              }}
              className={`toolbar-btn ${editor.isActive('link') ? 'is-active' : ''}`}
              title="Insert Link"
            >
              <LinkIcon size={16} />
            </button>

            <button
              type="button"
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
              className="toolbar-btn"
              title="Horizontal Rule"
            >
              <Minus size={16} />
            </button>
          </div>
        </div>
      )}

      {/* EDITOR WORKSPACE */}
      <div style={{ position: 'relative', display: 'flex', backgroundColor: editorBg, flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <div style={{ flex: 1, backgroundColor: editorBg, display: 'flex', flexDirection: 'column', overflowY: 'auto', minHeight: 0 }}>
          <EditorContent editor={editor} style={{ flex: 1, backgroundColor: editorBg }} />
          
          {showBubbleMenu && (
            <div 
              style={{
                position: 'fixed',
                top: `${bubbleMenuCoords.top}px`,
                left: `${bubbleMenuCoords.left}px`,
                transform: 'translate(-50%, -100%)',
                display: 'flex',
                background: toolbarBg,
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                padding: '4px',
                gap: '2px',
                zIndex: 9999,
                pointerEvents: 'auto'
              }}
            >
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBold().run()}
                className={`toolbar-btn ${editor.isActive('bold') ? 'is-active' : ''}`}
                style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Bold"
              >
                <Bold size={14} />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className={`toolbar-btn ${editor.isActive('italic') ? 'is-active' : ''}`}
                style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Italic"
              >
                <Italic size={14} />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                className={`toolbar-btn ${editor.isActive('underline') ? 'is-active' : ''}`}
                style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Underline"
              >
                <UnderlineIcon size={14} />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleStrike().run()}
                className={`toolbar-btn ${editor.isActive('strike') ? 'is-active' : ''}`}
                style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Strikethrough"
              >
                <Strikethrough size={14} />
              </button>
            </div>
          )}
        </div>

        {/* VERSION HISTORY SIDE OVER PANEL */}
        {showHistory && (
          <div 
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '260px',
              height: '100%',
              backgroundColor: 'var(--bg-secondary)',
              borderLeft: '1px solid var(--border-color)',
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-4px 0 15px rgba(0,0,0,0.3)',
              textAlign: 'left'
            }}
          >
            <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>Version History</strong>
              <button 
                type="button" 
                onClick={() => { setShowHistory(false); setPreviewVersion(null); }} 
                className="theme-toggle"
                style={{ padding: '0.1rem' }}
              >
                <X size={14} />
              </button>
            </div>

            {/* List of Versions */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {versionsLoading ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Loading versions...</div>
              ) : versions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>No saved snapshots yet.</div>
              ) : (
                versions.map((ver, idx) => {
                  const isCurrent = idx === 0;
                  const isSelected = previewVersion?.id === ver.id;
                  
                  return (
                    <div
                      key={ver.id}
                      onClick={() => setPreviewVersion(ver)}
                      style={{
                        padding: '0.5rem',
                        borderRadius: '6px',
                        border: isSelected ? '1px solid var(--primary-purple)' : '1px solid var(--border-color)',
                        background: isSelected ? 'rgba(139, 92, 246, 0.1)' : 'var(--bg-tertiary)',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div className="flex justify-between align-center">
                        <strong style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                          {ver.title || `Version ${ver.version_number}`}
                        </strong>
                        {isCurrent && (
                          <span style={{ fontSize: '0.65rem', background: 'var(--success-color)', color: 'white', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
                            Current
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.2rem' }}>
                        {new Date(ver.saved_at || ver.created_at).toLocaleString()}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Preview controls */}
            {previewVersion && (
              <div style={{ padding: '0.75rem', borderTop: '1px solid var(--border-color)', background: 'var(--bg-tertiary)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>
                  Viewing snapshot: <strong>{previewVersion.title}</strong>
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => handleRestoreVersion(previewVersion)}
                    className="btn btn-primary btn-sm"
                    style={{ flex: 1, padding: '0.3rem 0.5rem', fontSize: '0.75rem', justifyContent: 'center' }}
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewVersion(null)}
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1, padding: '0.3rem 0.5rem', fontSize: '0.75rem', justifyContent: 'center' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Read-Only preview overlay if previewing a snapshot */}
        {previewVersion && (
          <div 
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              backgroundColor: 'rgba(19, 19, 42, 0.95)',
              color: 'var(--text-secondary)',
              zIndex: 40,
              padding: '16px',
              overflowY: 'auto',
              border: '2.5px dashed var(--primary-purple)',
              borderRadius: '0 0 8px 8px'
            }}
          >
            <div style={{ marginBottom: '1rem', color: 'var(--primary-magenta)', fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignContent: 'center', alignItems: 'center', gap: '0.4rem' }}>
              <AlertTriangle size={15} style={{ flexShrink: 0 }} />
              <span>Previewing Snapshot ({previewVersion.title}). Current editor is read-only.</span>
            </div>
            
            {/* Render preview text */}
            <div style={{ background: 'transparent' }}>
              <EditorContent editor={previewEditor} />
            </div>
          </div>
        )}
      </div>

      {/* Editor Footer Character Count */}
      <div 
        style={{ 
          background: footerBg, 
          borderTop: '1px solid rgba(139, 92, 246, 0.15)', 
          padding: '4px 12px', 
          display: 'flex', 
          justifyContent: 'space-between', 
          fontSize: '0.75rem', 
          color: footerTextColor 
        }}
      >
        <span>
          {editor.storage.characterCount.words()} words
        </span>
        <span>
          {editor.storage.characterCount.characters()} characters
        </span>
      </div>
    </div>
  );
}
