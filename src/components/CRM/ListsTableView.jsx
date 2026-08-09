import React from 'react';
import {
  FileSpreadsheet, Sparkles, ChevronRight,
} from 'lucide-react';
import ListRowMenu from './ListRowMenu';
import { teamMemberDisplayName } from '../../lib/teamWorkspace';

function SectionHeader({ title }) {
  return (
    <div className="crm-lists-table-section" role="row">
      <div className="crm-lists-table-section-label" role="columnheader">{title}</div>
    </div>
  );
}

function formatListDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return null;
  }
}

function creatorLabel(userId, teamProfilesMap, currentUserId) {
  if (!userId) return '—';
  if (userId === currentUserId) return 'You';
  return teamMemberDisplayName(teamProfilesMap?.[userId]);
}

function teamMemberOptions(teamProfilesMap = {}) {
  return Object.entries(teamProfilesMap).map(([id, entry]) => ({
    id,
    label: teamMemberDisplayName(entry),
  }));
}

function AssigneeCell({
  assigneeId,
  teamProfilesMap,
  currentUserId,
  canEdit,
  onChange,
  showAssignee,
}) {
  if (!showAssignee) return null;
  const value = assigneeId || '';
  if (!canEdit) {
    return (
      <div className="crm-lists-table-assignee" role="cell" onClick={(e) => e.stopPropagation()}>
        {creatorLabel(value, teamProfilesMap, currentUserId)}
      </div>
    );
  }
  const options = teamMemberOptions(teamProfilesMap);
  return (
    <div className="crm-lists-table-assignee" role="cell" onClick={(e) => e.stopPropagation()}>
      <select
        className="crm-lists-assignee-select"
        value={value}
        aria-label="Assigned to"
        onChange={(e) => onChange?.(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.id === currentUserId ? 'You' : opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ListRow({
  icon: Icon,
  iconColor,
  name,
  typeLabel,
  typeVariant,
  count,
  countHint,
  createdAt,
  createdBy,
  assigneeId,
  teamProfilesMap,
  currentUserId,
  showAssignee,
  canEditAssignee,
  onAssign,
  shareBadge,
  onClick,
  onRename,
  onDelete,
  onExport,
  onExportSheets,
  onShare,
  canShare = false,
  canExport = true,
  canExportSheets = false,
  showLocalTime = false,
  onToggleLocalTime,
}) {
  const dateLine = formatListDate(createdAt);

  return (
    <div
      className="crm-lists-table-row"
      onClick={onClick}
      role="row"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <div className="crm-lists-table-name" role="cell">
        <div className="crm-lists-table-name-inner">
          <span className="crm-lists-table-icon" style={{ color: iconColor || 'var(--accent-blue)' }}>
            <Icon size={18} />
          </span>
          <span className="crm-lists-table-name-col">
            <span className="crm-lists-table-name-text">{name}</span>
            <span className="crm-lists-table-name-sub">
              {shareBadge || (dateLine || null)}
            </span>
          </span>
        </div>
      </div>
      <div className="crm-lists-table-type" role="cell">
        <span className={`crm-lists-table-type-pill crm-lists-table-type-pill--${typeVariant}`}>
          {typeLabel}
        </span>
      </div>
      <div className="crm-lists-table-count" role="cell">
        <div className="crm-lists-table-count-inner">
          <span className="crm-lists-table-count-num">{count}</span>
          {countHint && (
            <span className="crm-lists-table-count-hint">{countHint}</span>
          )}
        </div>
      </div>
      <div className="crm-lists-table-created-by" role="cell">{createdBy}</div>
      <AssigneeCell
        assigneeId={assigneeId}
        teamProfilesMap={teamProfilesMap}
        currentUserId={currentUserId}
        canEdit={canEditAssignee}
        onChange={onAssign}
        showAssignee={showAssignee}
      />
      <div className="crm-lists-table-actions" role="cell">
        <div className="crm-lists-table-actions-inner">
          <ListRowMenu
            onOpen={onClick}
            onRename={onRename}
            onDelete={onDelete}
            onExport={onExport}
            onExportSheets={onExportSheets}
            onShare={onShare}
            canShare={canShare}
            canExport={canExport}
            canExportSheets={canExportSheets}
            showLocalTime={showLocalTime}
            onToggleLocalTime={onToggleLocalTime}
          />
          <ChevronRight size={16} className="crm-lists-table-chevron" aria-hidden />
        </div>
      </div>
    </div>
  );
}

function renderFolderRows({
  list,
  getLeadCount,
  teamProfilesMap,
  currentUserId,
  shareCountForFolder,
  onSelectFolder,
  onRenameFolder,
  onDeleteFolder,
  onExportFolder,
  onExportFolderSheets,
  onShareFolder,
  canExportSheets,
  getFolderSettings,
  onToggleFolderLocalTime,
  canShareFolder,
  showAssignee,
  onAssignFolder,
}) {
  return list.map((f) => {
    const shares = shareCountForFolder?.(f.id) || 0;
    const isOwn = f.user_id === currentUserId;
    const shareBadge = isOwn && shares > 0
      ? `Shared · ${shares} member${shares === 1 ? '' : 's'}`
      : (!isOwn ? 'Shared with you' : null);
    const canEditAssignee = showAssignee && (isOwn || !!onAssignFolder);

    return (
      <ListRow
        key={f.id}
        icon={FileSpreadsheet}
        iconColor={f.color}
        name={f.name}
        typeLabel="Manual"
        typeVariant="manual"
        count={getLeadCount?.(f.id) ?? 0}
        countHint={(getLeadCount?.(f.id) ?? 0) === 0 ? 'No leads assigned yet' : null}
        createdAt={f.created_at}
        createdBy={creatorLabel(f.user_id, teamProfilesMap, currentUserId)}
        assigneeId={f.assignee_id || f.user_id}
        teamProfilesMap={teamProfilesMap}
        currentUserId={currentUserId}
        showAssignee={showAssignee}
        canEditAssignee={canEditAssignee}
        onAssign={(assigneeId) => onAssignFolder?.(f.id, assigneeId, 'folders')}
        shareBadge={shareBadge}
        onClick={() => onSelectFolder(f.id)}
        onRename={isOwn ? () => onRenameFolder?.(f.id, f.name) : undefined}
        onDelete={isOwn ? () => onDeleteFolder?.(f.id) : undefined}
        onExport={() => onExportFolder?.(f.id)}
        onExportSheets={() => onExportFolderSheets?.(f.id)}
        onShare={canShareFolder?.(f) ? () => onShareFolder?.(f) : undefined}
        canShare={!!canShareFolder?.(f)}
        canExport
        canExportSheets={canExportSheets}
        showLocalTime={!!getFolderSettings?.(f.id)?.showLocalTime}
        onToggleLocalTime={(val) => onToggleFolderLocalTime?.(f.id, val)}
      />
    );
  });
}

export default function ListsTableView({
  folders = [],
  userFolders = [],
  listSections = null,
  getLeadCount,
  onSelectFolder,
  onRenameFolder,
  onDeleteFolder,
  onDeleteSmartFolder,
  onExportFolder,
  onExportFolderSheets,
  onShareFolder,
  canExportSheets = false,
  getFolderSettings,
  onToggleFolderLocalTime,
  teamProfilesMap = {},
  currentUserId,
  shareCountForFolder,
  canShareFolder,
  onAssignFolder,
}) {
  const sections = listSections || {
    mine: folders.filter((f) => f.user_id === currentUserId),
    sharedWithMe: folders.filter((f) => f.user_id !== currentUserId),
    team: [],
    auto: userFolders,
  };

  const showAssignee = Object.keys(teamProfilesMap || {}).length > 1;

  const hasLists = (sections.mine?.length || 0)
    + (sections.sharedWithMe?.length || 0)
    + (sections.team?.length || 0)
    + (sections.auto?.length || 0) > 0;

  if (!hasLists) {
    return (
      <div className="crm-lists-table-empty">
        <p>No lists in this view. Create a list or switch filters.</p>
      </div>
    );
  }

  const rowProps = {
    getLeadCount,
    teamProfilesMap,
    currentUserId,
    shareCountForFolder,
    onSelectFolder,
    onRenameFolder,
    onDeleteFolder,
    onExportFolder,
    onExportFolderSheets,
    onShareFolder,
    canExportSheets,
    getFolderSettings,
    onToggleFolderLocalTime,
    canShareFolder,
    showAssignee,
    onAssignFolder,
  };

  return (
    <div
      className={`crm-lists-table-wrap${showAssignee ? ' crm-lists-table-wrap--with-assignee' : ''}`}
      role="table"
      aria-label="Lists"
    >
      <div className="crm-lists-table-head" role="row">
        <div className="crm-lists-table-col-name" role="columnheader">Name</div>
        <div className="crm-lists-table-col-type" role="columnheader">Type</div>
        <div className="crm-lists-table-col-count" role="columnheader">Leads</div>
        <div className="crm-lists-table-col-by" role="columnheader">Created by</div>
        {showAssignee && (
          <div className="crm-lists-table-col-assignee" role="columnheader">Assigned to</div>
        )}
        <div className="crm-lists-table-col-actions" role="columnheader" aria-label="Actions" />
      </div>
      {sections.mine?.length > 0 && (
        <>
          <SectionHeader title="My lists" />
          {renderFolderRows({ list: sections.mine, ...rowProps })}
        </>
      )}
      {sections.sharedWithMe?.length > 0 && (
        <>
          <SectionHeader title="Shared with me" />
          {renderFolderRows({ list: sections.sharedWithMe, ...rowProps })}
        </>
      )}
      {sections.team?.length > 0 && (
        <>
          <SectionHeader title="Team lists" />
          {renderFolderRows({ list: sections.team, ...rowProps })}
        </>
      )}
      {sections.auto?.length > 0 && (
        <>
          <SectionHeader title="Auto lists" />
          {sections.auto.map((uf) => (
            <ListRow
              key={uf.id}
              icon={Sparkles}
              iconColor="var(--accent-blue)"
              name={uf.name}
              typeLabel="Auto"
              typeVariant="auto"
              count={getLeadCount?.(uf.id) ?? 0}
              createdAt={uf.created_at}
              createdBy={creatorLabel(uf.user_id, teamProfilesMap, currentUserId)}
              assigneeId={uf.assignee_id || uf.user_id}
              teamProfilesMap={teamProfilesMap}
              currentUserId={currentUserId}
              showAssignee={showAssignee}
              canEditAssignee={showAssignee && (uf.user_id === currentUserId || !!onAssignFolder)}
              onAssign={(assigneeId) => onAssignFolder?.(uf.id, assigneeId, 'user_folders')}
              onClick={() => onSelectFolder(uf.id)}
              onRename={uf.user_id === currentUserId ? () => onRenameFolder?.(uf.id, uf.name) : undefined}
              onDelete={uf.user_id === currentUserId ? () => onDeleteSmartFolder?.(uf.id) : undefined}
              canExport={false}
            />
          ))}
        </>
      )}
    </div>
  );
}
