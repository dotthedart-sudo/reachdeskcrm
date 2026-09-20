import React from 'react';
import { CreditCard, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AuthLogo from './AuthLogo';

/**
 * Shown when a team member (or admin test account) must not use personal billing / upgrade checkout.
 */
export default function MemberBillingNotice({
  profile,
  variant = 'member',
  ownerLabel,
  onLeaveWorkspace,
  leaveLoading = false,
}) {
  const navigate = useNavigate();
  const [fetchedOwner, setFetchedOwner] = React.useState(null);

  React.useEffect(() => {
    if (variant === 'member' && profile && !ownerLabel) {
      import('../lib/teamWorkspace').then(({ getTeamOwnerProfileForMember }) => {
        getTeamOwnerProfileForMember(profile).then((ownerProfile) => {
          if (ownerProfile) {
            setFetchedOwner(ownerProfile.email || ownerProfile.full_name);
          }
        });
      });
    }
  }, [profile, variant, ownerLabel]);

  const displayOwner = ownerLabel || fetchedOwner;

  if (variant === 'admin') {
    return (
      <div className="rd-upgrade-page rd-upgrade-page--standalone">
        <div className="rd-upgrade-inner" style={{ maxWidth: '520px', textAlign: 'center' }}>
          <div className="rd-upgrade-brand">
            <AuthLogo />
          </div>
          <header className="rd-upgrade-header">
            <div className="rd-upgrade-icon" aria-hidden>
              <CreditCard size={22} />
            </div>
            <h1 className="rd-upgrade-title">Admin account</h1>
            <p className="rd-upgrade-sub">
              This account has complimentary access for testing and support. Paddle checkout is disabled so you are not charged accidentally.
            </p>
          </header>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/dashboard')}>
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rd-upgrade-page rd-upgrade-page--standalone">
      <div className="rd-upgrade-inner" style={{ maxWidth: '520px' }}>
        <div className="rd-upgrade-brand">
          <AuthLogo />
        </div>
        <header className="rd-upgrade-header">
          <div className="rd-upgrade-icon" aria-hidden>
            <Users size={22} />
          </div>
          <h1 className="rd-upgrade-title">Workspace billing</h1>
          <p className="rd-upgrade-sub" style={{ fontSize: '1.1rem', fontWeight: 500 }}>
            Your plan is managed by your team owner{displayOwner ? ` (${displayOwner})` : ''}.
          </p>
        </header>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/dashboard')}>
            Back to dashboard
          </button>
          {onLeaveWorkspace && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onLeaveWorkspace}
              disabled={leaveLoading}
            >
              {leaveLoading ? 'Leaving…' : 'Leave workspace'}
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/settings?tab=team')}>
            Team settings
          </button>
        </div>
      </div>
    </div>
  );
}
