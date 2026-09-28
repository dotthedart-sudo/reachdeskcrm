const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf8');

code = code.replace(/const teamIds = await getTeamIds.*?dashboardScope === 'team'\) \? teamIds : \[currentUser\.id\];/s, `      const { data: teamMembers } = await supabase.rpc('get_my_team_members');
      const teamIds = teamMembers ? teamMembers.map(m => m.id) : [currentUser.id];
      if (!teamIds || teamIds.length === 0 || teamIds.includes(undefined) || teamIds.includes(null)) {
        setLoading(false);
        return;
      }

      const activeScopeIds = (hasTeam && dashboardScope === 'team') ? teamIds : [currentUser.id];`);

code = code.replace(/Calendly Sent/g, 'Invite Sent');

fs.writeFileSync('src/components/Dashboard.jsx', code);
console.log('Success!');
