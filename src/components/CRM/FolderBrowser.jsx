import React, { useMemo, useState } from 'react';
import {
  FolderPlus, Sparkles, Users, Upload, Database,
} from 'lucide-react';
import QuickViewChips from './QuickViewChips';
import ListsTableView from './ListsTableView';
import { classifyFolders } from '../../lib/folderShares';
import { isTeamOwner, hasTeammates } from '../../lib/teamWorkspace';
import './FolderBrowser.css';

export const SYSTEM_VIEWS = [
  { id: 'hot', label: 'Hot', iconColor: 'var(--status-hot)' },
  { id: 'warm', label: 'Warm', iconColor: 'var(--status-warm)' },
  { id: 'cold', label: 'Cold', iconColor: 'var(--status-cold)' },
  { id: 'needs-followup', label: 'Needs Follow-Up', iconColor: 'var(--accent-blue)' },
  { id: 'recently-followed-up', label: 'Recently Followed Up', iconColor: 'var(--accent-green)' },
  { id: 'calendly', label: 'Invite Sent', iconColor: 'var(--accent-blue)' },
  { id: 'clients', label: 'Clients', iconColor: 'var(--accent-blue)' },
];

export default function FolderBrowser({
  folders = [],
  userFolders = [],
  systemFolderNames = {},
  getLeadCount,
  totalLeads = 0,
  unfiledCount = 0,
  onSelectFolder,
  onCreateList,
  onCreateSmartList,
  onImportCsv,
  onImportSheets,
  onRenameFolder,
  onDeleteFolder,
  onDeleteSmartFolder,
  onExportFolder,
  onExportFolderSheets,
  onShareFolder,
  canExportSheets = false,
  getFolderSettings,
  onToggleFolderLocalTime,
  canBulkImport = false,
  canUseIntegrations = false,
  hasLeads = true,
  currentUser,
  teamProfilesMap = {},
  folderShares = [],
  shareCountForFolder,
  canShareFolder,
  teamIds = [],
  onAssignFolder,
}) {
  const [listFilter, setListFilter] = useState('mine');
  const isOwner = isTeamOwner(currentUser);
  const showTeamTab = isOwner && hasTeammates(teamIds);
  const currentUserId = currentUser?.id;

  const sharedFolderIds = useMemo(
    () => new Set(folderShares.map((s) => s.folder_id)),
    [folderShares],
  );

  const classified = useMemo(
    () => classifyFolders(folders, {
      currentUserId,
      sharedFolderIds,
      isOwner,
    }),
    [folders, currentUserId, sharedFolderIds, isOwner],
  );

  const filteredUserFolders = useMemo(() => {
    if (listFilter === 'all' && isOwner) return userFolders;
    return userFolders.filter((uf) => uf.user_id === currentUserId);
  }, [userFolders, listFilter, isOwner, currentUserId]);

  const listSections = useMemo(() => {
    if (listFilter === 'mine') {
      return {
        mine: classified.mine,
        sharedWithMe: [],
        team: [],
        auto: filteredUserFolders,
      };
    }
    if (listFilter === 'shared') {
      return {
        mine: [],
        sharedWithMe: classified.sharedWithMe,
        team: [],
        auto: [],
      };
    }
    if (listFilter === 'all' && isOwner) {
      return {
        mine: classified.mine,
        sharedWithMe: classified.sharedWithMe,
        team: classified.team,
        auto: filteredUserFolders,
      };
    }
    return { mine: classified.mine, sharedWithMe: [], team: [], auto: filteredUserFolders };
  }, [listFilter, classified, filteredUserFolders, isOwner]);

  
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [newListMenuOpen, setNewListMenuOpen] = useState(false);

  return (
    <div className="crm-folder-browser crm-folder-browser--full">
      <div className="crm-folder-browser-header">
        <div>
          <h2 className="crm-folder-browser-title">Lists</h2>
          <p className="crm-folder-browser-desc">
            Group leads into lists and share them with your team.
          </p>
        </div>
        <div className="crm-folder-browser-actions">
          <div className="dropdown-container" style={{ position: 'relative' }}>
            <button 
              type="button" 
              className="btn btn-secondary"
              onClick={() => { setImportMenuOpen(!importMenuOpen); setNewListMenuOpen(false); }}
            >
              <Upload size={16} /> Import ▾
            </button>
            {importMenuOpen && (
              <div className="dropdown-menu" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 10, marginTop: '4px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '4px', minWidth: '150px' }}>
                {canBulkImport && onImportCsv && (
                  <button type="button" className="dropdown-item" onClick={() => { onImportCsv(); setImportMenuOpen(false); }} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    CSV
                  </button>
                )}
                {canUseIntegrations && onImportSheets && (
                  <button type="button" className="dropdown-item" onClick={() => { onImportSheets(); setImportMenuOpen(false); }} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    Google Sheets
                  </button>
                )}
              </div>
            )}
          </div>
          
          <div className="dropdown-container" style={{ position: 'relative' }}>
            <button 
              type="button" 
              className="btn btn-primary"
              onClick={() => { setNewListMenuOpen(!newListMenuOpen); setImportMenuOpen(false); }}
            >
              + New list ▾
            </button>
            {newListMenuOpen && (
              <div className="dropdown-menu" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 10, marginTop: '4px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '4px', minWidth: '150px' }}>
                <button type="button" className="dropdown-item" onClick={() => { onCreateList(); setNewListMenuOpen(false); }} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                  Manual
                </button>
                <button type="button" className="dropdown-item" onClick={() => { onCreateSmartList(); setNewListMenuOpen(false); }} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                  Auto
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <QuickViewChips
        systemViews={SYSTEM_VIEWS}
        systemFolderNames={systemFolderNames}
        getLeadCount={getLeadCount}
        totalLeads={totalLeads}
        onSelectFolder={onSelectFolder}
      />

      {unfiledCount > 0 && classified.mine.some((f) => (getLeadCount?.(f.id) ?? 0) === 0) && (
        <div className="crm-unfiled-banner">
          <div className="crm-unfiled-banner-icon">
            <Database size={18} />
          </div>
          <div className="crm-unfiled-banner-text">
            <strong>{unfiledCount} leads aren't in any list yet</strong>
            <span>Sort them into lists so you can call, message and share them.</span>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSelectFolder?.('unfiled')}>
            Review unfiled →
          </button>
        </div>
      )}

      <div className="crm-lists-table-controls">
        <h3 className="crm-lists-table-title">Your lists</h3>
        <div className="crm-lists-table-filters">
          <div className="crm-segmented-control">
            <button
              type="button"
              className={listFilter === 'mine' ? 'active' : ''}
              onClick={() => setListFilter('mine')}
            >
              Mine
            </button>
            <button
              type="button"
              className={listFilter === 'shared' ? 'active' : ''}
              onClick={() => setListFilter('shared')}
            >
              Shared with me
            </button>
            {showTeamTab && (
              <button
                type="button"
                className={listFilter === 'all' ? 'active' : ''}
                onClick={() => setListFilter('all')}
              >
                All team
              </button>
            )}
          </div>
          <div className="crm-lists-search">
            <Sparkles size={14} className="crm-lists-search-icon" />
            <input type="search" placeholder="Filter lists" />
          </div>
        </div>
      </div>

      <ListsTableView
        folders={folders}
        userFolders={userFolders}
        listSections={listSections}
        getLeadCount={getLeadCount}
        onSelectFolder={onSelectFolder}
        onRenameFolder={onRenameFolder}
        onDeleteFolder={onDeleteFolder}
        onDeleteSmartFolder={onDeleteSmartFolder}
        onExportFolder={onExportFolder}
        onExportFolderSheets={onExportFolderSheets}
        onShareFolder={onShareFolder}
        canExportSheets={canExportSheets}
        getFolderSettings={getFolderSettings}
        onToggleFolderLocalTime={onToggleFolderLocalTime}
        currentUser={currentUser}
        teamProfilesMap={teamProfilesMap}
        shareCountForFolder={shareCountForFolder}
        canShareFolder={canShareFolder}
        onAssignFolder={onAssignFolder}
      />
    </div>
  );
}
