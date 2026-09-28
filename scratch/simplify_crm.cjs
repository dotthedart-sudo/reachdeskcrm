const fs = require('fs');
let code = fs.readFileSync('src/components/CRM.jsx', 'utf8');

// Replace the complex foldersPromise
const foldersPromiseTarget = `      const foldersPromise = isOwner
        ? supabase.from('folders').select('*').in('user_id', teamIds).order('sort_order', { ascending: true })
        : (async () => {
          const [ownRes, sharedRes] = await Promise.all([
            supabase.from('folders').select('*').eq('user_id', currentUser.id).order('sort_order', { ascending: true }),
            sharedFolderIds.length
              ? supabase.from('folders').select('*').in('id', sharedFolderIds).order('sort_order', { ascending: true })
              : Promise.resolve({ data: [] }),
          ]);
          const byId = new Map();
          [...(ownRes.data || []), ...(sharedRes.data || [])].forEach((f) => byId.set(f.id, f));
          return { data: [...byId.values()] };
        })();`;

const foldersPromiseReplacement = `      // RLS handles visibility, so just select all
      const foldersPromise = supabase.from('folders').select('*').order('sort_order', { ascending: true });`;

code = code.replace(foldersPromiseTarget, foldersPromiseReplacement);

// Replace smartFoldersPromise
const smartFoldersTarget = `      const smartFoldersPromise = isOwner
        ? supabase.from('user_folders').select('*').in('user_id', teamIds).order('created_at', { ascending: true })
        : supabase.from('user_folders').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: true });`;

const smartFoldersReplacement = `      const smartFoldersPromise = supabase.from('user_folders').select('*').order('created_at', { ascending: true });`;

code = code.replace(smartFoldersTarget, smartFoldersReplacement);

// Replace leadsPromise
const leadsPromiseTarget = `      const leadsPromise = fetchAllLeadsForScope({
        userIds: teamIds,
        sharedFolderIds: sharedFolderIds.length ? sharedFolderIds : null,
      });`;

const leadsPromiseReplacement = `      // RLS filters what can be seen. We might just want everything the user has access to.
      // We pass teamIds so the Mine/Team dashboard scoping can work, but in CRM we want to see everything
      // including shared ones which might not have the user_id if we filtered strictly by teamIds for a regular member?
      // Wait, if it's CRM, we want to see ALL leads we have access to. We can just omit the filter and let RLS do it!
      const leadsPromise = fetchAllLeadsForScope({ userIds: null });`;

code = code.replace(leadsPromiseTarget, leadsPromiseReplacement);

// Remove fetchSharesForUser
const sharesTarget = `      const sharesRes = await fetchSharesForUser(currentUser.id);
      const sharedFolderIds = sharesRes.map((s) => s.folder_id).filter(Boolean);`;
code = code.replace(sharesTarget, '');

fs.writeFileSync('src/components/CRM.jsx', code);
console.log('CRM.jsx data loading simplified.');
