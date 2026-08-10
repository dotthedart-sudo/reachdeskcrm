import React from 'react';
import {
  Plug, Calendar, CheckCircle, Check, Unlink, Lock, RefreshCw,
} from 'lucide-react';
import { PLAN_LIMITS, getEffectivePlan } from '../../lib/utils';
import { BRAND_NAME } from '../../config/brand';
import { needsSheetsReconnect } from '../../lib/googleSheetsOAuth';
import { needsCalendarReconnect } from '../../lib/googleCalendarOAuth';

export default function IntegrationsPanel({
  currentUser,
  calIntegration,
  calLoading,
  calDisconnecting,
  calSuccessMsg,
  sheetsIntegration,
  sheetsLoading,
  sheetsDisconnecting,
  sheetsSuccessMsg,
  onConnectCalendar,
  onDisconnectCalendar,
  onConnectSheets,
  onDisconnectSheets,
  onUpgrade,
}) {
  const sheetsNeedsReconnect = needsSheetsReconnect(!!sheetsIntegration);
  const calNeedsReconnect = needsCalendarReconnect(!!calIntegration);

  return (
    <div className="card flex-col gap-3" id="integrations">
      <div className="rd-section-head" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: 'var(--space-3)', marginBottom: 'var(--space-1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Plug size={18} style={{ color: 'var(--status-cold)' }} />
          <h3 style={{ fontSize: 'var(--text-md)', margin: 0, fontFamily: 'var(--font-heading)' }}>Integrations</h3>
        </div>
      </div>

      {calSuccessMsg && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', background: 'color-mix(in srgb, var(--success-color) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--success-color) 25%, transparent)', color: 'var(--success-color)', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <CheckCircle size={16} style={{ flexShrink: 0 }} />
          <span>{calSuccessMsg}</span>
        </div>
      )}

      {sheetsSuccessMsg && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', background: 'color-mix(in srgb, var(--success-color) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--success-color) 25%, transparent)', color: 'var(--success-color)', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <CheckCircle size={16} style={{ flexShrink: 0 }} />
          <span>{sheetsSuccessMsg}</span>
        </div>
      )}

      {calNeedsReconnect && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          fontSize: 'var(--text-sm)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}>
          <span>
            Reconnect Google Calendar to continue with updated Google permissions (events access only).
          </span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onConnectCalendar}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}
          >
            <RefreshCw size={14} /> Reconnect Calendar
          </button>
        </div>
      )}

      {sheetsNeedsReconnect && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          fontSize: 'var(--text-sm)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}>
          <span>
            Reconnect Google Sheets to continue importing and exporting. Google now requires updated access permissions.
          </span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onConnectSheets}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}
          >
            <RefreshCw size={14} /> Reconnect Sheets
          </button>
        </div>
      )}

      <div className="rd-integration-row">
        <div className="rd-integration-icon rd-integration-icon--calendar">
          <Calendar size={20} />
        </div>
        <div className="rd-integration-body">
          <strong>Google Calendar</strong>
          <span>
            {calLoading
              ? 'Checking status…'
              : calNeedsReconnect
                ? 'Reconnect required — updated Google permissions'
                : calIntegration
                  ? `Connected · since ${new Date(calIntegration.connected_at).toLocaleDateString()}`
                  : 'Not connected — leads won\'t be auto-marked as Booked'}
          </span>
        </div>
        <div className="rd-integration-actions">
          {!PLAN_LIMITS[getEffectivePlan(currentUser)]?.calendarIntegration ? (
            <button
              type="button"
              onClick={onUpgrade}
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <Lock size={12} /> Available on Pro plan
            </button>
          ) : !calLoading && (
            calIntegration ? (
              <>
                {!calNeedsReconnect && (
                  <span className="rd-integration-status">
                    <Check size={14} /> Connected
                  </span>
                )}
                {calNeedsReconnect && (
                  <button
                    type="button"
                    onClick={onConnectCalendar}
                    className="btn btn-primary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <RefreshCw size={14} /> Reconnect
                  </button>
                )}
                <button
                  type="button"
                  onClick={onDisconnectCalendar}
                  disabled={calDisconnecting}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--danger-color)', borderColor: 'var(--danger-color)' }}
                >
                  <Unlink size={14} />
                  {calDisconnecting ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onConnectCalendar}
                className="btn btn-primary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <Calendar size={14} /> Connect
              </button>
            )
          )}
        </div>
      </div>

      <div className="rd-integration-row">
        <div className="rd-integration-icon rd-integration-icon--sheets">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM10 17H7V14H10V17ZM10 12H7V9H10V12ZM17 17H12V14H17V17ZM17 12H12V9H17V12Z" fill="currentColor" />
          </svg>
        </div>
        <div className="rd-integration-body">
          <strong>Google Sheets</strong>
          <span>
            {sheetsLoading
              ? 'Checking status…'
              : sheetsNeedsReconnect
                ? 'Reconnect required — updated Google permissions'
                : sheetsIntegration
                  ? `Connected · since ${new Date(sheetsIntegration.connected_at).toLocaleDateString()}`
                  : 'Not connected — export and import from Google Sheets'}
          </span>
        </div>
        <div className="rd-integration-actions">
          {!sheetsLoading && (
            sheetsIntegration ? (
              <>
                {!sheetsNeedsReconnect && (
                  <span className="rd-integration-status">
                    <Check size={14} /> Connected
                  </span>
                )}
                {sheetsNeedsReconnect && (
                  <button
                    type="button"
                    onClick={onConnectSheets}
                    className="btn btn-primary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <RefreshCw size={14} /> Reconnect
                  </button>
                )}
                <button
                  type="button"
                  onClick={onDisconnectSheets}
                  disabled={sheetsDisconnecting}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--danger-color)', borderColor: 'var(--danger-color)' }}
                >
                  <Unlink size={14} />
                  {sheetsDisconnecting ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onConnectSheets}
                className="btn btn-primary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                Connect Sheets
              </button>
            )
          )}
        </div>
      </div>

      <p className="rd-integration-footnote">
        {BRAND_NAME} reads and writes calendar events you use for bookings (Google&nbsp;Calendar events scope).
        Sheets access applies only to files you select in Google Picker.
        Disconnect anytime to revoke access.
      </p>
    </div>
  );
}
