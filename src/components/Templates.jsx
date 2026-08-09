import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAppContext } from '../App';
import { teamMemberEmail } from '../lib/teamWorkspace';
import { 
  Plus, 
  Copy, 
  Edit3, 
  Trash2, 
  X, 
  Sparkles, 
  Check, 
  Eye,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Lock,
  AlertCircle
} from 'lucide-react';
import { generateAIDraft } from '../utils/aiDraft';
import { PLAN_LIMITS, getEffectivePlan } from '../lib/utils';
import { NEXT_PLAN, PLAN_LIMITS as LIMITS_NEW } from '../lib/leadLimits';
import { ShinyButton } from '@/registry/magicui/shiny-button';
import {
  TEMPLATE_KINDS,
  templateKind,
  sectionsForKind,
  myLibrarySectionName,
  filterTemplatesByKind,
  formatSectionLabel,
} from '../lib/templateKinds';

export default function Templates({ 
  currentUser, 
  templates, 
  onAddTemplate, 
  onDeleteTemplate, 
  onUpdateTemplate,
  teamProfilesMap = {},
  isTeamView = false,
  outreachUnlocked = false,
}) {
  const navigate = useNavigate();
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showTemplateLimitBlockModal, setShowTemplateLimitBlockModal] = useState(false);
  const [expandedSections, setExpandedSections] = useState({ 'MY TEMPLATES': true });
  const [libraryTab, setLibraryTab] = useState('messages');
  const [selectedTag, setSelectedTag] = useState('All');
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  
  const { userSnippets, handleAddSnippet } = useAppContext();
  const [columnDefs, setColumnDefs] = useState([]);
  const [showSnippetDropdown, setShowSnippetDropdown] = useState(false);
  const [isAddingSnippet, setIsAddingSnippet] = useState(false);
  const [newSnippetKey, setNewSnippetKey] = useState('');
  const [newSnippetValue, setNewSnippetValue] = useState('');
  const [snippetError, setSnippetError] = useState('');
  const snippetDropdownRef = useRef(null);

  // AI draft states
  const [templateAiLoading, setTemplateAiLoading] = useState(false);
  const [templateAiError, setTemplateAiError] = useState('');
  const [templateAiInstructions, setTemplateAiInstructions] = useState('');

  useEffect(() => {
    if (!currentUser?.id) return;
    const fetchColumns = async () => {
      try {
        const { data, error } = await supabase
          .from('column_definitions')
          .select('*')
          .eq('user_id', currentUser.id)
          .order('sort_order', { ascending: true });
        if (!error && data) {
          setColumnDefs(data);
        }
      } catch (err) {
        console.error('Error fetching columns for templates:', err);
      }
    };
    fetchColumns();
  }, [currentUser?.id]);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (snippetDropdownRef.current && !snippetDropdownRef.current.contains(e.target)) {
        setShowSnippetDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Form state
  const [formState, setFormState] = useState({
    title: '',
    subject: '',
    body: '',
    platform: 'INITIAL TEMPLATES',
    tagsInput: ''
  });

  const [copiedTemplateId, setCopiedTemplateId] = useState(null);
  const [copiedBody, setCopiedBody] = useState(false);

  // Null guard - profile not yet loaded
  if (!currentUser) {
    return <div className="loading-container" style={{ fontFamily: 'var(--font-body)' }}>Loading profile...</div>;
  }

  const activeKind = libraryTab === 'scripts' ? TEMPLATE_KINDS.CALLS : TEMPLATE_KINDS.MESSAGING;
  const activeSections = sectionsForKind(activeKind);
  const mySectionName = myLibrarySectionName(activeKind);
  const isScriptsTab = libraryTab === 'scripts';
  const addItemLabel = isScriptsTab ? 'Script' : 'Template';
  const defaultSection = activeSections[0];

  const allowedTemplates = filterTemplatesByKind(
    templates.filter((t) => t.is_starter || t.user_id === currentUser.id),
    activeKind,
  );

  const planKey = getEffectivePlan(currentUser);
  const templateLimit = (LIMITS_NEW[planKey] || LIMITS_NEW.trial).templates ?? Infinity;
  const userTemplates = templates.filter((t) => t.user_id === currentUser.id && !t.is_starter);
  const isTemplateLimitReached = templateLimit !== Infinity && userTemplates.length >= templateLimit;

  const switchLibraryTab = (tab) => {
    if (tab === 'scripts' && !outreachUnlocked) {
      navigate('/upgrade');
      return;
    }
    setLibraryTab(tab);
    setExpandedSections({
      [myLibrarySectionName(tab === 'scripts' ? TEMPLATE_KINDS.CALLS : TEMPLATE_KINDS.MESSAGING)]: true,
    });
  };

  // Collapsible toggle handler
  const toggleSection = (sectionName) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionName]: !prev[sectionName]
    }));
  };

  const handleOpenAdd = (sectionName) => {
    if (isTemplateLimitReached) {
      const planName = currentUser.plan ? currentUser.plan.charAt(0).toUpperCase() + currentUser.plan.slice(1) : 'Trial';
      let nextPlan = '';
      let nextLimit = '';
      if (planKey === 'trial') { nextPlan = 'Starter'; nextLimit = '10 templates'; }
      else if (planKey === 'starter') { nextPlan = 'Pro'; nextLimit = '50 templates'; }
      else if (planKey === 'pro') { nextPlan = 'Teams'; nextLimit = 'unlimited templates'; }
      
      setToastMessage(`You've reached your ${planName} plan limit of ${templateLimit} templates.${nextPlan ? ` Upgrade to ${nextPlan} for ${nextLimit}.` : ''}`);
      setShowToast(true);
      return;
    }
    const defaultPlatform = activeSections.includes(sectionName) ? sectionName : defaultSection;
    setFormState({ title: '', subject: '', body: '', platform: defaultPlatform, tagsInput: '' });
    setEditingTemplate(null);
    setTemplateAiError('');
    setTemplateAiInstructions('');
    setTemplateAiLoading(false);
    setShowEditor(true);
  };

  const handleOpenEdit = (template) => {
    setEditingTemplate(template);
    setFormState({
      title: template.title || '',
      subject: template.subject || '',
      body: template.body || '',
      platform: template.platform || defaultSection,
      tagsInput: (template.tags || []).join(', ')
    });
    setTemplateAiError('');
    setTemplateAiInstructions('');
    setTemplateAiLoading(false);
    setShowEditor(true);
  };

  const handleFieldBlur = (field, value) => {
    if (!editingTemplate || editingTemplate.is_starter) return;
    
    let updatePayload = {
      [field]: value
    };

    if (field === 'tagsInput') {
      const tagsArray = value.split(',').map(t => t.trim()).filter(Boolean);
      updatePayload = {
        tagsInput: value,
        tags: tagsArray
      };
    }

    setFormState(prev => ({
      ...prev,
      ...updatePayload
    }));

    onUpdateTemplate(editingTemplate.id, {
      ...formState,
      ...updatePayload
    });
  };

  const handleGenerateTemplateAI = async () => {
    if (templateAiLoading) return;
    setTemplateAiLoading(true);
    setTemplateAiError('');

    try {
      const draft = await generateAIDraft({
        platform: formState.platform,
        extraInstructions: templateAiInstructions,
      });
      setFormState(prev => ({ ...prev, body: draft }));
      handleFieldBlur('body', draft);
    } catch (err) {
      console.error('[Template Editor AI] Error:', err);
      setTemplateAiError("Couldn't generate, try again");
    } finally {
      setTemplateAiLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formState.title || !formState.body) {
      alert("Title and Body are required.");
      return;
    }

    const tags = formState.tagsInput
      ? formState.tagsInput.split(',').map(t => t.trim()).filter(Boolean)
      : [];

    if (editingTemplate) {
      if (!editingTemplate.is_starter) {
        onUpdateTemplate(editingTemplate.id, {
          ...formState,
          tags
        });
      }
    } else {
      if (isTemplateLimitReached) {
        const planName = currentUser.plan ? currentUser.plan.charAt(0).toUpperCase() + currentUser.plan.slice(1) : 'Trial';
        let nextPlan = '';
        let nextLimit = '';
        if (planKey === 'trial') { nextPlan = 'Starter'; nextLimit = '10 templates'; }
        else if (planKey === 'starter') { nextPlan = 'Pro'; nextLimit = '50 templates'; }
        else if (planKey === 'pro') { nextPlan = 'Teams'; nextLimit = 'unlimited templates'; }
        
        setToastMessage(`You've reached your ${planName} plan limit of ${templateLimit} templates.${nextPlan ? ` Upgrade to ${nextPlan} for ${nextLimit}.` : ''}`);
        setShowToast(true);
        return;
      }
      try {
        await onAddTemplate({
          ...formState,
          tags,
          kind: activeKind,
          is_starter: false
        });
      } catch (err) {
        if (err?.message?.includes('Template limit reached')) {
          setShowTemplateLimitBlockModal(true);
          return;
        } else {
          console.error(err);
          alert(err.message || 'Failed to add template.');
        }
      }
    }
    setShowEditor(false);
  };

  const handleDuplicate = async (template) => {
    if (isTemplateLimitReached) {
      const planName = currentUser.plan ? currentUser.plan.charAt(0).toUpperCase() + currentUser.plan.slice(1) : 'Trial';
      let nextPlan = '';
      let nextLimit = '';
      if (planKey === 'trial') { nextPlan = 'Starter'; nextLimit = '10 templates'; }
      else if (planKey === 'starter') { nextPlan = 'Pro'; nextLimit = '50 templates'; }
      else if (planKey === 'pro') { nextPlan = 'Teams'; nextLimit = 'unlimited templates'; }
      
      setToastMessage(`You've reached your ${planName} plan limit of ${templateLimit} templates.${nextPlan ? ` Upgrade to ${nextPlan} for ${nextLimit}.` : ''}`);
      setShowToast(true);
      return;
    }
    try {
      const newTemplate = await onAddTemplate({
        title: `${template.title} (Copy)`,
        subject: template.subject || '',
        body: template.body || '',
        platform: template.platform || defaultSection,
        tags: template.tags || [],
        kind: templateKind(template),
        is_starter: false
      });
      
      alert(`${addItemLabel} duplicated! You can now find it in ${mySectionName}.`);
      if (newTemplate) {
        handleOpenEdit(newTemplate);
      }
    } catch (err) {
      if (err?.message?.includes('Template limit reached')) {
        setShowTemplateLimitBlockModal(true);
      } else {
        console.error(err);
        alert(err.message || 'Failed to duplicate template.');
      }
    }
  };

  const handleCopyBodyOnly = (bodyText, templateId) => {
    navigator.clipboard.writeText(bodyText || '');
    setCopiedTemplateId(templateId);
    setTimeout(() => setCopiedTemplateId(null), 2000);
  };

  const handleCopyBodyModal = () => {
    navigator.clipboard.writeText(formState.body || '');
    setCopiedBody(true);
    setTimeout(() => setCopiedBody(false), 2000);
  };

  const insertTagAtCursor = (tag) => {
    if (editingTemplate?.is_starter) return;
    
    const formattedTag = (tag.startsWith('[') && tag.endsWith(']')) ? tag : `[${tag}]`;
    
    const textarea = document.querySelector('.template-editor-container textarea');
    let newBody = formState.body || '';
    
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      newBody = newBody.substring(0, start) + formattedTag + newBody.substring(end);
      const newCursorPos = start + formattedTag.length;
      
      setFormState(prev => ({
        ...prev,
        body: newBody
      }));
      
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    } else {
      newBody = newBody ? `${newBody} ${formattedTag}` : formattedTag;
      setFormState(prev => ({
        ...prev,
        body: newBody
      }));
    }

    if (editingTemplate) {
      onUpdateTemplate(editingTemplate.id, {
        ...formState,
        body: newBody
      });
    }
  };

  const handleSaveQuickSnippet = async () => {
    const keyToSave = newSnippetKey.trim().toLowerCase();
    if (!keyToSave) {
      setSnippetError('Key is required');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(keyToSave)) {
      setSnippetError('Key must be alphanumeric / underscores');
      return;
    }

    const defaultGroupAKeys = ['name', 'first_name', 'last_name', 'email', 'company', 'niche', 'phone', 'status', 'priority', 'action_to_take', 'last_contacted_at', 'project'];
    const customGroupAKeys = (columnDefs || []).filter(c => !c.is_default && c.column_key).map(c => c.column_key.toLowerCase());
    const isDuplicate = defaultGroupAKeys.includes(keyToSave) || 
                        customGroupAKeys.includes(keyToSave) ||
                        (userSnippets || []).some(s => s.snippet_key.toLowerCase() === keyToSave);
    
    if (isDuplicate) {
      setSnippetError('Snippet/column key already exists');
      return;
    }

    try {
      await handleAddSnippet({
        snippet_key: keyToSave,
        snippet_value: newSnippetValue
      });
      insertTagAtCursor(`[${keyToSave}]`);
      setIsAddingSnippet(false);
      setShowSnippetDropdown(false);
      setNewSnippetKey('');
      setNewSnippetValue('');
      setSnippetError('');
    } catch (err) {
      setSnippetError(err.message || 'Failed to save');
    }
  };

  const renderHighlightedContent = (text) => {
    if (!text) return <span style={{ color: '#8B949E' }}>Start typing template body...</span>;
    // Capture any bracketed content like [Name], [niche], etc.
    const parts = text.split(/(\[[^\]]+\])/g);
    return parts.map((part, index) => {
      if (part.startsWith('[') && part.endsWith(']')) {
        return (
          <span 
            key={index} 
            className="smart-tag" 
            style={{ 
              backgroundColor: 'rgba(91, 143, 185, 0.15)', 
              border: '1px solid rgba(91, 143, 185, 0.4)', 
              color: '#5B8FB9',
              padding: '0.1rem 0.3rem',
              borderRadius: '2px',
              fontWeight: 600,
              fontSize: '0.85em'
            }}
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

  // Group templates by section
  const groupedTemplates = {};
  activeSections.forEach(sec => {
    groupedTemplates[sec] = [];
  });
  const otherTemplates = [];
  const myTemplates = [];

  allowedTemplates.forEach(t => {
    if (!t.is_starter) {
      myTemplates.push(t);
    } else if (activeSections.includes(t.platform)) {
      groupedTemplates[t.platform].push(t);
    } else {
      otherTemplates.push(t);
    }
  });

  const allUniqueTags = Array.from(
    new Set(
      myTemplates.flatMap(t => t.tags || [])
    )
  ).sort();

  const renderSection = (sectionName, list) => {
    const isExpanded = !!expandedSections[sectionName];
    return (
      <div 
        key={sectionName} 
        style={{ 
          marginBottom: '1rem', 
          backgroundColor: 'var(--bg-page)', 
          border: '1px solid var(--border)', 
          borderRadius: '3px' 
        }}
      >
        {/* Collapsible Header */}
        <div 
          onClick={() => toggleSection(sectionName)}
          style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            padding: '1rem', 
            cursor: 'pointer',
            userSelect: 'none',
            borderBottom: isExpanded ? '1px solid var(--border)' : 'none'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
            {isExpanded ? <ChevronDown size={18} style={{ color: 'var(--accent-blue)' }} /> : <ChevronRight size={18} style={{ color: 'var(--text-muted)' }} />}
            <span className="rd-section-label">
              {formatSectionLabel(sectionName)}
            </span>
            <span 
              style={{ 
                backgroundColor: 'rgba(91, 143, 185, 0.1)', 
                color: 'var(--accent-blue)', 
                fontSize: '0.75rem', 
                padding: '2px 8px', 
                borderRadius: '10px', 
                marginLeft: '0.5rem',
                fontWeight: 600
              }}
            >
              {list.length}
            </span>
          </div>

          <button 
            onClick={(e) => { 
              e.stopPropagation(); 
              handleOpenAdd(sectionName); 
            }}
            className="btn btn-secondary btn-sm"
            style={{ 
              borderColor: 'var(--border)', 
              borderRadius: '3px',
              padding: '4px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.75rem'
            }}
          >
            <Plus size={12} /> Add {addItemLabel}
          </button>
        </div>

        {/* Collapsible Content */}
        {isExpanded && (
          <div style={{ padding: '1rem', backgroundColor: 'var(--bg-page)' }}>
            {list.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                No {addItemLabel.toLowerCase()}s in this section. Click "Add {addItemLabel}" to create one.
              </div>
            ) : (
              <div 
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
                  gap: '1rem' 
                }}
              >
                {list.map(template => {
                  const addedByEmail = teamMemberEmail(teamProfilesMap[template.user_id]);
                  return (
                    <div 
                      key={template.id}
                      className="card flex-col gap-3"
                      style={{ 
                        backgroundColor: 'var(--bg-card)', 
                        border: '1px solid var(--border)', 
                        borderRadius: '3px',
                        padding: '1.25rem',
                        textAlign: 'left'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <h4 
                          style={{ 
                            fontSize: '1rem', 
                            fontWeight: 600, 
                            color: 'var(--text-primary)',
                            margin: 0,
                            fontFamily: 'var(--font-body)'
                          }}
                        >
                          {template.title}
                        </h4>
                        <span 
                          style={{ 
                            fontSize: '0.7rem', 
                            padding: '2px 6px', 
                            borderRadius: '3px',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            backgroundColor: template.is_starter ? 'rgba(91, 143, 185, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: template.is_starter ? '#5B8FB9' : '#10b981',
                            border: `1px solid ${template.is_starter ? 'rgba(91,143,185,0.3)' : 'rgba(16,185,129,0.3)'}`,
                            flexShrink: 0
                          }}
                        >
                          {template.is_starter ? 'Starter' : 'Custom'}
                        </span>
                      </div>

                      {template.subject && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          <strong>Subject:</strong> {template.subject}
                        </div>
                      )}

                      <div 
                        style={{ 
                          fontSize: '0.85rem', 
                          maxHeight: '120px', 
                          overflowY: 'auto', 
                          backgroundColor: 'var(--bg-page)',
                          padding: '0.75rem',
                          borderRadius: '3px',
                          border: '1px solid var(--border)',
                          whiteSpace: 'pre-wrap',
                          lineHeight: 1.5,
                          color: 'var(--text-secondary)'
                        }}
                      >
                        {renderHighlightedContent(template.body)}
                      </div>

                      {isTeamView && addedByEmail && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                          Added by: {addedByEmail}
                        </div>
                      )}

                      <div className="flex gap-2" style={{ marginTop: 'auto', paddingTop: '0.75rem' }}>
                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleCopyBodyOnly(template.body, template.id)}
                          style={{ 
                            borderRadius: '3px', 
                            flex: 1, 
                            justifyContent: 'center', 
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Copy size={12} />
                          {copiedTemplateId === template.id ? 'Copied!' : 'Copy'}
                        </button>
                        
                        {template.is_starter ? (
                          <button 
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleDuplicate(template)}
                            style={{ borderRadius: '3px', fontSize: '0.8rem', padding: '0 8px' }}
                            title="Duplicate to custom templates"
                          >
                            Duplicate
                          </button>
                        ) : (
                          <>
                            <button 
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleOpenEdit(template)}
                              style={{ 
                                borderRadius: '3px', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '4px',
                                fontSize: '0.8rem' 
                              }}
                            >
                              <Edit3 size={12} /> Edit
                            </button>
                            <button 
                              className="btn btn-danger btn-sm"
                              onClick={() => {
                                if (confirm('Are you sure you want to delete this template?')) {
                                  onDeleteTemplate(template.id);
                                }
                              }}
                              style={{ borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px' }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderMyTemplatesSection = () => {
    const sectionName = mySectionName;
    const isExpanded = !!expandedSections[sectionName];
    const filteredMyTemplates = selectedTag === 'All'
      ? myTemplates
      : myTemplates.filter(t => (t.tags || []).includes(selectedTag));

    return (
      <div 
        key={sectionName} 
        style={{ 
          marginBottom: '1rem', 
          backgroundColor: 'var(--bg-page)', 
          border: '1px solid var(--border)', 
          borderRadius: '3px' 
        }}
      >
        {/* Collapsible Header */}
        <div 
          onClick={() => toggleSection(sectionName)}
          style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            padding: '1rem', 
            cursor: 'pointer',
            userSelect: 'none',
            borderBottom: isExpanded ? '1px solid var(--border)' : 'none'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
            {isExpanded ? <ChevronDown size={18} style={{ color: 'var(--accent-blue)' }} /> : <ChevronRight size={18} style={{ color: 'var(--text-muted)' }} />}
            <span className="rd-section-label">
              {formatSectionLabel(sectionName)}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
              {myTemplates.length}
            </span>
          </div>
        </div>

        {/* Collapsible Content */}
        {isExpanded && (
          <div style={{ padding: '1rem', backgroundColor: 'var(--bg-page)' }}>
            {/* Tag Filter Row */}
            {allUniqueTags.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1.25rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Filter by Tag:</span>
                <button
                  onClick={() => setSelectedTag('All')}
                  style={{
                    fontSize: '0.75rem',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    border: '1px solid ' + (selectedTag === 'All' ? '#5B8FB9' : 'var(--border)'),
                    backgroundColor: selectedTag === 'All' ? 'rgba(91, 143, 185, 0.15)' : 'transparent',
                    color: selectedTag === 'All' ? '#5B8FB9' : 'var(--text-secondary)',
                    fontWeight: selectedTag === 'All' ? 600 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  All
                </button>
                {allUniqueTags.map(tag => {
                  const isActive = selectedTag === tag;
                  return (
                    <button
                      key={tag}
                      onClick={() => setSelectedTag(tag)}
                      style={{
                        fontSize: '0.75rem',
                        padding: '4px 10px',
                        borderRadius: '20px',
                        border: '1px solid ' + (isActive ? '#5B8FB9' : 'var(--border)'),
                        backgroundColor: isActive ? 'rgba(91, 143, 185, 0.15)' : 'transparent',
                        color: isActive ? '#5B8FB9' : 'var(--text-secondary)',
                        fontWeight: isActive ? 600 : 500,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            )}

            {filteredMyTemplates.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                {myTemplates.length === 0 
                  ? 'No custom templates yet. Click "Create Template" to add one!'
                  : 'No custom templates matching the selected tag.'}
              </div>
            ) : (
              <div 
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
                  gap: '1rem' 
                }}
              >
                {filteredMyTemplates.map(template => {
                  const addedByEmail = teamMemberEmail(teamProfilesMap[template.user_id]);
                  return (
                    <div 
                      key={template.id}
                      className="card flex-col gap-3"
                      style={{ 
                        backgroundColor: 'var(--bg-card)', 
                        border: '1px solid var(--border)', 
                        borderRadius: '3px',
                        padding: '1.25rem',
                        textAlign: 'left'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <div className="flex-col gap-1 w-full" style={{ overflow: 'hidden' }}>
                          <h4 
                            style={{ 
                              fontSize: '1rem', 
                              fontWeight: 600, 
                              color: 'var(--text-primary)',
                              margin: 0,
                              fontFamily: 'var(--font-body)'
                            }}
                          >
                            {template.title}
                          </h4>
                          {/* Tags chips row */}
                          {template.tags && template.tags.length > 0 && (
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                              {template.tags.map(tag => (
                                <span 
                                  key={tag}
                                  style={{ 
                                    fontSize: '0.65rem', 
                                    padding: '2px 5px', 
                                    borderRadius: '3px',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    backgroundColor: 'rgba(139, 148, 158, 0.15)',
                                    color: '#8b949e',
                                    border: '1px solid rgba(139, 148, 158, 0.2)'
                                  }}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <span 
                          style={{ 
                            fontSize: '0.7rem', 
                            padding: '2px 6px', 
                            borderRadius: '3px',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            color: '#10b981',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            flexShrink: 0
                          }}
                        >
                          Custom
                        </span>
                      </div>

                      {template.subject && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          <strong>Subject:</strong> {template.subject}
                        </div>
                      )}

                      <div 
                        style={{ 
                          fontSize: '0.85rem', 
                          color: 'var(--text-secondary)',
                          lineHeight: '1.5',
                          backgroundColor: 'var(--bg-page)',
                          padding: '0.75rem',
                          borderRadius: '3px',
                          border: '1px solid var(--border)',
                          flexGrow: 1,
                          overflowY: 'auto',
                          maxHeight: '120px',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word'
                        }}
                      >
                        {renderHighlightedContent(template.body)}
                      </div>

                      {/* Info footer (e.g. Creator/Shared) */}
                      {addedByEmail && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>By: {addedByEmail}</span>
                        </div>
                      )}

                      {/* Card Actions */}
                      <div className="flex gap-2" style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: 'auto' }}>
                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleCopyBodyOnly(template.body, template.id)}
                          style={{ borderRadius: '3px', fontSize: '0.8rem', flexGrow: 1, justifyContent: 'center' }}
                        >
                          {copiedTemplateId === template.id ? 'Copied!' : 'Copy Body'}
                        </button>
                        
                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleOpenEdit(template)}
                          style={{ 
                            borderRadius: '3px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '4px',
                            fontSize: '0.8rem' 
                          }}
                        >
                          <Edit3 size={12} /> Edit
                        </button>
                        <button 
                          className="btn btn-danger btn-sm"
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this template?')) {
                              onDeleteTemplate(template.id);
                            }
                          }}
                          style={{ borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-col gap-4 w-full page-stack" style={{ textAlign: 'left' }}>
      {/* Header section */}
      <div className="flex justify-between align-center" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 'var(--space-4)' }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl, 1.5rem)', fontWeight: 700, color: 'var(--text-primary)' }}>
            Template Library
          </h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>
            {isScriptsTab
              ? 'Save call scripts for openers, voicemails, objections, and more'
              : 'Build highly personal outreach messages using automated smart tags'}
          </p>
        </div>
        <div>
          <button 
            className="btn btn-primary" 
            onClick={() => handleOpenAdd(defaultSection)}
            disabled={isTemplateLimitReached || (isScriptsTab && !outreachUnlocked)}
            style={{ borderRadius: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} />
            Create {addItemLabel}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <button
          type="button"
          className={libraryTab === 'messages' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
          onClick={() => switchLibraryTab('messages')}
        >
          Messages
        </button>
        <button
          type="button"
          className={libraryTab === 'scripts' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
          onClick={() => switchLibraryTab('scripts')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
        >
          Scripts
          {!outreachUnlocked && <Lock size={12} />}
        </button>
      </div>

      {isScriptsTab && !outreachUnlocked ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            minHeight: '280px',
            padding: '2rem',
            border: '1px solid var(--border)',
            borderRadius: '3px',
            background: 'var(--bg-page)',
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}
        >
          <Lock size={36} />
          <div>
            <h3 style={{ margin: '0 0 0.5rem', fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>
              Call scripts are a Cold Calls feature
            </h3>
            <p style={{ margin: 0, maxWidth: '420px', fontSize: '0.9rem' }}>
              Upgrade to Trial, Pro, or Teams to build a script library for your call queue.
            </p>
          </div>
          <ShinyButton onClick={() => navigate('/upgrade')} className="btn-sm">
            Upgrade
          </ShinyButton>
        </div>
      ) : (
      <>
      {/* Accordion list of sections */}
      <div className="flex-col">
        {renderMyTemplatesSection()}
        {activeSections.map(sec => renderSection(sec, groupedTemplates[sec]))}
        
        {/* Render fallback uncategorized templates if they exist */}
        {otherTemplates.length > 0 && renderSection('OTHER TEMPLATES', otherTemplates)}
      </div>
      </>
      )}

      {/* Editor Modal */}
      {showEditor && (
        <div className="modal-backdrop">
          <div className="modal-content rd-modal rd-modal-wide">
            <div className="rd-modal-header">
              <div>
                <h3>
                  {editingTemplate
                    ? (editingTemplate.is_starter ? `View starter ${addItemLabel.toLowerCase()}` : `Edit ${addItemLabel.toLowerCase()}`)
                    : `Create ${addItemLabel.toLowerCase()}`}
                </h3>
                <p className="rd-modal-sub">
                  {isScriptsTab ? 'Save scripts you’ll reuse on call queue leads.' : 'Save outreach you’ll reuse across leads.'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary btn-sm"
                  onClick={handleCopyBodyModal}
                >
                  <Copy size={12} />
                  {copiedBody ? 'Copied!' : 'Copy body'}
                </button>
                <button type="button" onClick={() => setShowEditor(false)} className="rd-modal-close" aria-label="Close">
                  <X size={18} />
                </button>
              </div>
            </div>
            
            {editingTemplate?.is_starter && (
              <div className="rd-modal-body" style={{ paddingBottom: 0 }}>
                <div className="auth-success-banner" style={{ color: 'var(--accent-blue)', borderColor: 'color-mix(in srgb, var(--accent-blue) 35%, transparent)', background: 'color-mix(in srgb, var(--accent-blue) 12%, transparent)' }}>
                  This is a starter template — duplicate it to make your own editable copy.
                </div>
              </div>
            )}

            <form onSubmit={handleSave} className="rd-modal-form">
              <div className="rd-modal-body rd-form">
              <div className="rd-form-group">
                <label className="form-label">Template title *</label>
                <input 
                  type="text" 
                  required 
                  disabled={editingTemplate?.is_starter}
                  className="form-input"
                  placeholder="e.g. Cold Pitch: Straight Up"
                  value={formState.title}
                  onChange={(e) => setFormState({...formState, title: e.target.value})}
                  onBlur={(e) => handleFieldBlur('title', e.target.value)}
                />
              </div>

              <div className="rd-form-group">
                <label className="form-label">Section *</label>
                <select
                  required
                  disabled={editingTemplate?.is_starter}
                  className="form-select"
                  value={formState.platform}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormState({ ...formState, platform: val });
                    handleFieldBlur('platform', val);
                  }}
                >
                  {activeSections.map(sec => (
                    <option key={sec} value={sec}>{sec}</option>
                  ))}
                  {!activeSections.includes(formState.platform) && (
                    <option value={formState.platform}>{formState.platform}</option>
                  )}
                </select>
              </div>

              <div className="rd-form-group">
                <label className="form-label">Tags (comma-separated)</label>
                <input 
                  type="text" 
                  disabled={editingTemplate?.is_starter}
                  className="form-input"
                  placeholder="e.g. cold outreach, warm lead, follow-up"
                  value={formState.tagsInput || ''}
                  onChange={(e) => setFormState({...formState, tagsInput: e.target.value})}
                  onBlur={(e) => handleFieldBlur('tagsInput', e.target.value)}
                />
              </div>

              <div className="rd-form-group">
                <label className="form-label">Email subject (optional)</label>
                <input 
                  type="text" 
                  disabled={editingTemplate?.is_starter}
                  className="form-input"
                  placeholder="e.g. Quick question re: outreach"
                  value={formState.subject}
                  onChange={(e) => setFormState({...formState, subject: e.target.value})}
                  onBlur={(e) => handleFieldBlur('subject', e.target.value)}
                />
              </div>

              {/* Tag Injector Helpers */}
              {!editingTemplate?.is_starter && (() => {
                const defaultGroupA = [
                  { key: 'name', label: 'Name ([name])' },
                  { key: 'first_name', label: 'First Name ([first_name])' },
                  { key: 'last_name', label: 'Last Name ([last_name])' },
                  { key: 'email', label: 'Email ([email])' },
                  { key: 'company', label: 'Company ([company])' },
                  { key: 'niche', label: 'Niche ([niche])' },
                  { key: 'phone', label: 'Phone ([phone])' },
                  { key: 'status', label: 'Status ([status])' },
                  { key: 'priority', label: 'Priority ([priority])' },
                  { key: 'action_to_take', label: 'Action to Take ([action_to_take])' }
                ];

                const customGroupA = [];
                const seenKeys = new Set();
                (columnDefs || []).forEach(col => {
                  if (!col.is_default && col.column_key) {
                    const key = col.column_key.toLowerCase();
                    if (!seenKeys.has(key)) {
                      seenKeys.add(key);
                      customGroupA.push({
                        key: col.column_key,
                        label: `${col.column_label || col.column_key} ([${col.column_key}])`
                      });
                    }
                  }
                });

                const groupALeadData = [...defaultGroupA, ...customGroupA];
                const groupBMySnippets = (userSnippets || []).map(snip => ({
                  key: snip.snippet_key,
                  label: `${snip.snippet_key} ([${snip.snippet_key}])`,
                  value: snip.snippet_value
                }));

                return (
                  <div className="flex gap-2 align-center" style={{ position: 'relative' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Insert Snippet:</span>
                    <div ref={snippetDropdownRef} style={{ position: 'relative' }}>
                      <button 
                        type="button" 
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowSnippetDropdown(!showSnippetDropdown)}
                        style={{ borderColor: 'var(--border)', borderRadius: '3px', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                      >
                        <Sparkles size={12} style={{ color: 'var(--accent-blue)' }} />
                        <span>Insert Snippet</span>
                        <ChevronDown size={12} />
                      </button>

                      {showSnippetDropdown && (
                        <div className="snippet-dropdown-menu" style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          zIndex: 1000,
                          width: '320px',
                          backgroundColor: 'var(--bg-card)',
                          border: '1px solid var(--border-strong)',
                          borderRadius: '6px',
                          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                          padding: '0.5rem 0',
                          display: 'flex',
                          flexDirection: 'column',
                          marginTop: '4px'
                        }}>
                          <div style={{ overflowY: 'auto', maxHeight: '280px', padding: '0 0.5rem' }}>
                            {/* Group A — Lead Data */}
                            <div style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', marginBottom: '0.25rem' }}>
                              Lead Data (Group A)
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem', marginBottom: '0.75rem' }}>
                              {groupALeadData.map(item => (
                                <button
                                  key={item.key}
                                  type="button"
                                  onClick={() => {
                                    insertTagAtCursor(`[${item.key}]`);
                                    setShowSnippetDropdown(false);
                                  }}
                                  style={{
                                    padding: '4px 6px',
                                    textAlign: 'left',
                                    background: 'transparent',
                                    border: 'none',
                                    borderRadius: '3px',
                                    color: 'var(--text-secondary)',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    transition: 'background 0.1s'
                                  }}
                                  onMouseEnter={e => e.target.style.backgroundColor = 'var(--bg-card-hover)'}
                                  onMouseLeave={e => e.target.style.backgroundColor = 'transparent'}
                                  title={item.label}
                                >
                                  {item.key}
                                </button>
                              ))}
                            </div>

                            {/* Group B — My Snippets */}
                            <div style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', marginBottom: '0.25rem' }}>
                              My Snippets (Group B)
                            </div>
                            {groupBMySnippets.length === 0 ? (
                              <div style={{ padding: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                No custom snippets yet.
                              </div>
                            ) : (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem', marginBottom: '0.75rem' }}>
                                {groupBMySnippets.map(item => (
                                  <button
                                    key={item.key}
                                    type="button"
                                    onClick={() => {
                                      insertTagAtCursor(`[${item.key}]`);
                                      setShowSnippetDropdown(false);
                                    }}
                                    style={{
                                      padding: '4px 6px',
                                      textAlign: 'left',
                                      background: 'transparent',
                                      border: 'none',
                                      borderRadius: '3px',
                                      color: 'var(--text-secondary)',
                                      fontSize: '0.75rem',
                                      cursor: 'pointer',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      transition: 'background 0.1s'
                                    }}
                                    onMouseEnter={e => e.target.style.backgroundColor = 'var(--bg-card-hover)'}
                                    onMouseLeave={e => e.target.style.backgroundColor = 'transparent'}
                                    title={`${item.key}: ${item.value}`}
                                  >
                                    {item.key}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Inline Quick Add mini-form */}
                          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.5rem', margin: '0.5rem 0.5rem 0 0.5rem' }}>
                            {!isAddingSnippet ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setIsAddingSnippet(true);
                                  setNewSnippetKey('');
                                  setNewSnippetValue('');
                                  setSnippetError('');
                                }}
                                className="btn btn-secondary btn-sm"
                                style={{ width: '100%', justifyContent: 'center', fontSize: '0.75rem', borderRadius: '3px', padding: '4px' }}
                              >
                                + New Snippet
                              </button>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', padding: '0.25rem' }}>
                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                  <input
                                    type="text"
                                    placeholder="Key"
                                    value={newSnippetKey}
                                    onChange={e => setNewSnippetKey(e.target.value)}
                                    style={{ flex: 1, padding: '4px 6px', background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--text-primary)', fontSize: '0.75rem' }}
                                  />
                                  <input
                                    type="text"
                                    placeholder="Value"
                                    value={newSnippetValue}
                                    onChange={e => setNewSnippetValue(e.target.value)}
                                    style={{ flex: 1, padding: '4px 6px', background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--text-primary)', fontSize: '0.75rem' }}
                                  />
                                </div>
                                {snippetError && (
                                  <div style={{ color: 'var(--danger-color)', fontSize: '0.65rem' }}>{snippetError}</div>
                                )}
                                <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                                  <button
                                    type="button"
                                    onClick={() => setIsAddingSnippet(false)}
                                    className="btn btn-secondary btn-sm"
                                    style={{ padding: '2px 6px', fontSize: '0.7rem', height: '22px', minHeight: 'auto' }}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleSaveQuickSnippet}
                                    className="btn btn-primary btn-sm"
                                    style={{ padding: '2px 6px', fontSize: '0.7rem', height: '22px', minHeight: 'auto' }}
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Grid: Editor Left, Live Preview Right */}
              <div className="template-editor-container" style={{ marginTop: '0.5rem' }}>
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <label className="form-label" style={{ color: 'var(--text-secondary)', margin: 0 }}>Body Template *</label>
                    {!editingTemplate?.is_starter && (
                      ['trial', 'starter', 'pro', 'teams'].includes((currentUser?.plan || 'trial').toLowerCase()) ? (
                        <button
                          type="button"
                          onClick={handleGenerateTemplateAI}
                          disabled={templateAiLoading}
                          className="btn btn-secondary btn-sm"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '3px' }}
                        >
                          <Sparkles size={12} style={{ color: 'var(--accent-blue)' }} />
                          {templateAiLoading ? 'Generating...' : 'Generate with AI'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          title="Available on Pro plan"
                          className="btn btn-secondary btn-sm"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '3px', opacity: 0.7, cursor: 'not-allowed' }}
                        >
                          <Lock size={12} /> Available on Pro
                        </button>
                      )
                    )}
                  </div>
                  {!editingTemplate?.is_starter && (
                    <div style={{ marginBottom: '0.4rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder='AI prompt instructions (optional, e.g. "for cold outreach to SaaS founder")'
                        value={templateAiInstructions}
                        onChange={(e) => setTemplateAiInstructions(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !templateAiLoading) handleGenerateTemplateAI(); }}
                        disabled={templateAiLoading}
                        style={{ flex: 1, fontSize: '0.78rem', height: '30px', background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0 8px' }}
                      />
                    </div>
                  )}
                  {templateAiError && (
                    <div style={{ color: 'var(--danger-color)', fontSize: '0.75rem', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <AlertCircle size={12} /> {templateAiError}
                    </div>
                  )}
                  <textarea 
                    className="form-textarea"
                    required
                    disabled={editingTemplate?.is_starter}
                    style={{ minHeight: '220px', lineHeight: 1.5, backgroundColor: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--text-primary)' }}
                    placeholder="Hi [Name], came across your work..."
                    value={formState.body}
                    onChange={(e) => setFormState({...formState, body: e.target.value})}
                    onBlur={(e) => handleFieldBlur('body', e.target.value)}
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label flex align-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                    <Eye size={14} /> Live Highlight Preview
                  </label>
                  <div className="editor-preview-pane" style={{ minHeight: '220px', backgroundColor: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--text-secondary)' }}>
                    {formState.subject && (
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem', marginBottom: '0.5rem' }}>
                        Subject: {formState.subject}
                      </div>
                    )}
                    {renderHighlightedContent(formState.body)}
                  </div>
                </div>
              </div>
              </div>

              <div className="rd-modal-footer">
                <button type="button" onClick={() => setShowEditor(false)} className="btn btn-secondary">
                  {editingTemplate?.is_starter ? 'Close' : 'Cancel'}
                </button>
                {editingTemplate?.is_starter ? (
                  <button 
                    type="button" 
                    className="btn btn-primary"
                    onClick={() => { handleDuplicate(editingTemplate); setShowEditor(false); }}
                  >
                    <Copy size={16} />
                    Duplicate template
                  </button>
                ) : (
                  <button type="submit" className="btn btn-primary">
                    <Check size={16} />
                    Save template
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
      
      {showToast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-strong)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          borderRadius: '8px',
          padding: '1rem',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          maxWidth: '350px',
          animation: 'slideIn 0.2s ease',
          fontFamily: 'sans-serif'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4', textAlign: 'left' }}>
              {toastMessage}
            </span>
            <button onClick={() => setShowToast(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
              <X size={16} />
            </button>
          </div>
          <ShinyButton
            onClick={() => { setShowToast(false); navigate('/upgrade'); }}
            className="btn-sm"
            style={{ alignSelf: 'flex-start' }}
          >
            Upgrade Now
          </ShinyButton>
        </div>
      )}

      {showTemplateLimitBlockModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
          onClick={() => setShowTemplateLimitBlockModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0D1117',
              border: '1px solid #21262D',
              borderRadius: 3,
              padding: 32,
              maxWidth: 420,
              width: '90%',
              fontFamily: 'var(--font-body)',
              textAlign: 'center',
            }}
          >
            <div style={{ color: '#E05252', fontSize: 15, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Template limit reached
            </div>
            <p style={{ color: '#E6EDF3', fontSize: 14.5, lineHeight: 1.6, marginBottom: 24 }}>
              You've hit your plan's limit of {templateLimit} templates. You won't be able to add more until you
              do a quick cleanup or upgrade to <strong>{NEXT_PLAN[planKey] ?? 'a higher plan'}</strong>.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={() => {
                  setShowTemplateLimitBlockModal(false);
                  navigate('/templates');
                }}
                style={{
                  background: 'transparent',
                  color: '#E6EDF3',
                  border: '1px solid #21262D',
                  borderRadius: 3,
                  padding: '10px 18px',
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Quick cleanup
              </button>
              <ShinyButton
                onClick={() => {
                  setShowTemplateLimitBlockModal(false);
                  navigate('/upgrade');
                }}
                style={{ padding: '10px 18px', fontSize: 13.5, fontWeight: 600 }}
              >
                Upgrade to {NEXT_PLAN[planKey] ?? 'a higher plan'}
              </ShinyButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
