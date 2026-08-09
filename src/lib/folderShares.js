import { supabase } from './supabase';
import { hasTeamsPageAccess, isTeamOwner } from './teamWorkspace';

/** Shares where the current user is a recipient. */
export async function fetchSharesForUser(userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('folder_shares')
    .select('*')
    .eq('shared_with_user_id', userId);
  if (error) {
    console.warn('[folderShares] fetchSharesForUser:', error.message);
    return [];
  }
  return data || [];
}

/** Shares for a folder (for share modal). */
export async function fetchSharesForFolder(folderId) {
  if (!folderId) return [];
  const { data, error } = await supabase
    .from('folder_shares')
    .select('*')
    .eq('folder_id', folderId);
  if (error) throw error;
  return data || [];
}

/** All shares for a set of folder IDs (owner team list badges). */
export async function fetchSharesForFolders(folderIds = []) {
  if (!folderIds?.length) return [];
  const { data, error } = await supabase
    .from('folder_shares')
    .select('*')
    .in('folder_id', folderIds);
  if (error) {
    console.warn('[folderShares] fetchSharesForFolders:', error.message);
    return [];
  }
  return data || [];
}

/** Replace share list for a folder. */
export async function saveFolderShares(folderId, sharedByUserId, entries = []) {
  if (!folderId || !sharedByUserId) return;
  const { error: delErr } = await supabase.from('folder_shares').delete().eq('folder_id', folderId);
  if (delErr) throw delErr;

  const rows = entries
    .filter((e) => e.userId && e.userId !== sharedByUserId)
    .map((e) => ({
      folder_id: folderId,
      shared_with_user_id: e.userId,
      shared_by_user_id: sharedByUserId,
      permission: e.permission === 'edit' ? 'edit' : 'view',
    }));

  if (rows.length === 0) return;
  const { error } = await supabase.from('folder_shares').insert(rows);
  if (error) throw error;
}

/** Classify folders for list UI filters. */
export function classifyFolders(folders = [], { currentUserId, sharedFolderIds = new Set(), isOwner = false }) {
  const mine = [];
  const sharedWithMe = [];
  const team = [];

  folders.forEach((f) => {
    if (f.user_id === currentUserId) {
      mine.push(f);
    } else if (sharedFolderIds.has(f.id)) {
      sharedWithMe.push(f);
    } else if (isOwner) {
      team.push(f);
    }
  });

  return { mine, sharedWithMe, team };
}

export function shareCountForFolder(folderId, allShares = []) {
  return allShares.filter((s) => s.folder_id === folderId).length;
}

export function canShareFolder(folder, currentUser) {
  if (!folder || !currentUser?.id) return false;
  if (!currentUser.team_id || !hasTeamsPageAccess(currentUser)) return false;
  return folder.user_id === currentUser.id || isTeamOwner(currentUser);
}
