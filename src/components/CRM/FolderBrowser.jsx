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

  return (
    <div className="crm-folder-browser crm-folder-browser--full">
      <div className="crm-folder-browser-header">
        <div>
          <p className="crm-folder-browser-desc" style={{ margin: 0 }}>
            Your lists hold assigned leads. Share a list with teammates from the row menu.
          </p>
        </div>
        <div className="crm-folder-browser-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={onCreateList}>
            <FolderPlus size={14} /> Manual list
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCreateSmartList}>
            <Sparkles size={14} /> Auto list
          </button>
          {canBulkImport && onImportCsv && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onImportCsv}>
              <Upload size={14} /> Import CSV
            </button>
          )}
          {canUseIntegrations && onImportSheets && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onImportSheets}>
              <Database size={14} /> Import from Sheets
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={listFilter === 'mine' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
          onClick={() => setListFilter('mine')}
        >
          Mine
        </button>
        <button
          type="button"
          className={listFilter === 'shared' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
          onClick={() => setListFilter('shared')}
        >
          Shared with me
        </button>
        {showTeamTab && (
          <button
            type="button"
            className={listFilter === 'all' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => setListFilter('all')}
          >
            All team
          </button>
        )}
      </div>

      {!hasLeads && (
        <div className="crm-folder-browser-empty-inline">
          <div className="crm-folder-browser-empty-icon">
            <Users size={24} />
          </div>
          <div>
            <strong>No leads yet</strong>
            <p>Use Import CSV or Import from Sheets above — each import can become its own list.</p>
          </div>
        </div>
      )}

      <QuickViewChips
        systemViews={SYSTEM_VIEWS}
        systemFolderNames={systemFolderNames}
        getLeadCount={getLeadCount}
        totalLeads={totalLeads}
        onSelectFolder={onSelectFolder}
      />

      {unfiledCount > 0 && classified.mine.some((f) => (getLeadCount?.(f.id) ?? 0) === 0) && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 0.75rem' }}>
          Manual lists count leads assigned to that list.
          {' '}
          <button
            type="button"
            className="crm-list-breadcrumb-link"
            style={{ fontSize: 'inherit', padding: 0 }}
            onClick={() => onSelectFolder?.('unfiled')}
          >
            {unfiledCount} unfiled lead{unfiledCount === 1 ? '' : 's'}
          </button>
          {' '}are not in any list yet.
        </p>
      )}

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
        teamProfilesMap={teamProfilesMap}
        currentUserId={currentUserId}
        shareCountForFolder={shareCountForFolder}
        canShareFolder={canShareFolder}
        onAssignFolder={onAssignFolder}
      />
    </div>
  );
}
