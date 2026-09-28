const fs = require('fs');
let code = fs.readFileSync('src/lib/leadsQuery.js', 'utf8');

const target = `export async function fetchAllLeadsForScope({
  userIds,
  sharedFolderIds = null,
  columns = '*',
  orderBy = [
    { column: 'created_at', ascending: false },
    { column: 'id', ascending: true },
  ],
} = {}) {
  if (!userIds?.length) return [];

  return fetchAllPaged(() => {
    let q = supabase.from('leads').select(columns);
    if (sharedFolderIds?.length) {
      q = q.or(
        \`user_id.in.(\${userIds.join(',')}),folder_id.in.(\${sharedFolderIds.join(',')})\`,
      );
    } else {
      q = q.in('user_id', userIds);
    }
    for (const ord of orderBy) {
      q = q.order(ord.column, { ascending: !!ord.ascending });
    }
    return q;
  });
}`;

const replacement = `export async function fetchAllLeadsForScope({
  userIds,
  sharedFolderIds = null,
  columns = '*',
  orderBy = [
    { column: 'created_at', ascending: false },
    { column: 'id', ascending: true },
  ],
} = {}) {
  return fetchAllPaged(() => {
    let q = supabase.from('leads').select(columns);
    if (userIds && userIds.length > 0) {
      q = q.in('user_id', userIds);
    }
    for (const ord of orderBy) {
      q = q.order(ord.column, { ascending: !!ord.ascending });
    }
    return q;
  });
}`;

code = code.replace(target, replacement);

const countTarget = `export async function countLeadsExact({
  userIds,
  sharedFolderIds = null,
  ownerUserId = null,
} = {}) {
  if (!userIds?.length) return 0;

  let q = supabase.from('leads').select('id', { count: 'exact', head: true });

  if (sharedFolderIds?.length) {
    q = q.or(
      \`user_id.in.(\${userIds.join(',')}),folder_id.in.(\${sharedFolderIds.join(',')})\`,
    );
  } else {
    q = q.in('user_id', userIds);
  }`;

const countReplacement = `export async function countLeadsExact({
  userIds,
  sharedFolderIds = null,
  ownerUserId = null,
} = {}) {
  let q = supabase.from('leads').select('id', { count: 'exact', head: true });

  if (userIds && userIds.length > 0) {
    q = q.in('user_id', userIds);
  }`;

code = code.replace(countTarget, countReplacement);

fs.writeFileSync('src/lib/leadsQuery.js', code);
console.log('leadsQuery.js simplified.');
