const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf8');

const target = `      const teamIds = await getTeamIds(currentUser.id);
      if (!teamIds || teamIds.length === 0 || teamIds.includes(undefined) || teamIds.includes(null)) {
        setLoading(false);
        return;
      }

      const activeScopeIds = (isOwner && hasTeam && dashboardScope === 'team') ? teamIds : [currentUser.id];`;

const replacement = `      const { data: teamMembers } = await supabase.rpc('get_my_team_members');
      const teamIds = teamMembers ? teamMembers.map(m => m.id) : [currentUser.id];
      if (!teamIds || teamIds.length === 0 || teamIds.includes(undefined) || teamIds.includes(null)) {
        setLoading(false);
        return;
      }

      const activeScopeIds = (hasTeam && dashboardScope === 'team') ? teamIds : [currentUser.id];`;

code = code.replace(target, replacement);

// Replace Calendly Sent with Invite Sent
code = code.replace(/Calendly Sent/g, 'Invite Sent');

fs.writeFileSync('src/components/Dashboard.jsx', code);
console.log('Success');
