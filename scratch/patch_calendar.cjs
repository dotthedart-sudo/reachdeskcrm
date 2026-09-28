const fs = require('fs');
let code = fs.readFileSync('src/components/Calendar.jsx', 'utf8');

// 1. Import isTeamOwner
if (!code.includes("import { hasTeammates, isTeamOwner }")) {
  code = code.replace(
    "import { hasTeammates } from '../lib/teamWorkspace';",
    "import { hasTeammates, isTeamOwner } from '../lib/teamWorkspace';"
  );
}

// 2. Add isOwner to Calendar
if (!code.includes("const isOwner = isTeamOwner(currentUser);")) {
  code = code.replace(
    "const teamId = currentUser.team_id || null;",
    "const teamId = currentUser.team_id || null;\n  const isOwner = isTeamOwner(currentUser);"
  );
}

// 3. Extract teamProfilesMap from useAppContext
if (!code.includes("teamProfilesMap = {}")) {
  code = code.replace(
    "const { showToast, userSnippets, teamIds: contextTeamIds = [] } = useAppContext() || {};",
    "const { showToast, userSnippets, teamProfilesMap = {}, teamIds: contextTeamIds = [] } = useAppContext() || {};"
  );
  // fallback for if teamIds is not destructured
  code = code.replace(
    "const { showToast, userSnippets } = useAppContext() || {};",
    "const { showToast, userSnippets, teamProfilesMap = {} } = useAppContext() || {};"
  );
}

// 4. Default memberFilter to currentUser.id
code = code.replace(
  "const [memberFilter, setMemberFilter] = useState('');",
  "const [memberFilter, setMemberFilter] = useState(currentUser?.id || '');"
);

// 5. Render avatar function
const avatarFunc = `
  const renderMemberAvatar = (userId) => {
    if (!userId || memberFilter) return null; // Only show in 'All team' view (where memberFilter is '')
    const profile = teamProfilesMap[userId];
    if (!profile) return null;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
        {profile.avatar_url ? (
          <img src={profile.avatar_url} style={{ width: '16px', height: '16px', borderRadius: '50%' }} />
        ) : (
          <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 'bold' }}>
            {(profile.full_name || 'U')[0].toUpperCase()}
          </div>
        )}
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{profile.full_name || profile.email}</span>
      </div>
    );
  };
`;

if (!code.includes("renderMemberAvatar(")) {
  code = code.replace(
    "const filteredTimeline = (timelineByDay[selectedDay] || []).filter((ev) => matchesActivityFilter(ev, activityTypeFilter));",
    avatarFunc + "\n  const filteredTimeline = (timelineByDay[selectedDay] || []).filter((ev) => matchesActivityFilter(ev, activityTypeFilter));"
  );
}

// 6. Pass isOwner to MemberActivityFilter
code = code.replace(
  /<MemberActivityFilter\s+members=\{calendarMembers\}\s+value=\{memberFilter\}\s+onChange=\{setMemberFilter\}\s*\/>/g,
  `<MemberActivityFilter
              members={calendarMembers}
              value={memberFilter}
              onChange={setMemberFilter}
              isOwner={isTeamOwner(currentUser)}
              currentUserId={currentUser?.id}
            />`
);

// 7. Inject avatars into ActivityTimelineRow rendering
code = code.replace(
  /<ActivityTimelineRow\s+key=\{ev\.id\}\s+event=\{ev\}\s+showLead\s+compact\s+onOpenLead=\{openLead\}\s*\/>/g,
  `<div>
                        {renderMemberAvatar(ev.user_id)}
                        <ActivityTimelineRow
                          key={ev.id}
                          event={ev}
                          showLead
                          compact
                          onOpenLead={openLead}
                        />
                      </div>`
);

// 8. Inject avatars into selectedOutreach mapping
code = code.replace(
  /selectedOutreach\.map\(\(row\) => \(\s*<button/g,
  `selectedOutreach.map((row) => (
                    <div key={row.lead?.id || \`\${row.lastOutcome}-\${row.attemptCount}\`}>
                      {renderMemberAvatar(row.user_id || row.lead?.user_id)}
                      <button`
);

code = code.replace(
  /\{row\.lastOutcome \? \` · \$\{row\.lastOutcome\}\` : ''\}\s*<\/div>\s*<\/button>\s*\)\)/g,
  `{row.lastOutcome ? \` · \${row.lastOutcome}\` : ''}
                      </div>
                    </button>
                    </div>
                  ))`
);


fs.writeFileSync('src/components/Calendar.jsx', code);
console.log('Calendar.jsx updated.');
