import React, { useState } from 'react';
import { 
  DollarSign, 
  Plus, 
  Trash2, 
  TrendingUp, 
  Calendar,
  Globe
} from 'lucide-react';
import CurrencySelector, { CURRENCY_MAP } from './CurrencySelector';

export default function RevenueTracker({ 
  currentUser, 
  revenueLogs, 
  onAddRevenueLog, 
  onDeleteRevenueLog,
  currencySymbol = 'PKR'
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [amount, setAmount] = useState('');
  const defaultCurrency = currentUser?.default_currency || currencySymbol || 'PKR';
  const [currency, setCurrency] = useState(defaultCurrency);
  const [source, setSource] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [service, setService] = useState('');
  const [notes, setNotes] = useState('');

  // Filter logs for active user
  if (!currentUser) {
    return <div className="loading-container">Loading profile...</div>;
  }

  const userLogs = revenueLogs;
  const showAttribution = userLogs.some((log) => log.userEmail && log.userEmail !== currentUser.email);

  // Group and calculate totals by currency
  const currencyTotals = userLogs.reduce((acc, log) => {
    acc[log.currency] = (acc[log.currency] || 0) + log.amount;
    return acc;
  }, {});

  const handleLogSubmit = (e) => {
    e.preventDefault();
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      alert("Please enter a valid amount");
      return;
    }
    if (!source.trim()) {
      alert("Client Name / Source is required");
      return;
    }
    if (!currency) {
      alert("Please select a currency");
      return;
    }

    onAddRevenueLog({
      amount: parseFloat(amount),
      currency,
      source: source.trim(),
      date,
      service: service.trim() || null,
      description: notes.trim() || null,
      userEmail: currentUser.email,
      dateAdded: new Date().toLocaleDateString()
    });

    // Reset Form
    setAmount('');
    setSource('');
    setDate(new Date().toISOString().split('T')[0]);
    setService('');
    setNotes('');
    setShowAddForm(false);
    
    alert("Earnings logged successfully!");
  };

  return (
    <div className="flex-col gap-4 page-stack">
      <div className="flex justify-between align-center mb-4">
        <div>
          <h2>Revenue Tracker</h2>
          <p className="color-muted" style={{ fontSize: '0.9rem' }}>
            Log and monitor your freelance earnings across multiple currencies
          </p>
        </div>
        <button 
          className="btn btn-primary"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <Plus size={16} />
          {showAddForm ? 'View Summary' : 'Log Earnings'}
        </button>
      </div>

      {/* Stats Grid - Displays breakdown per currency */}
      {!showAddForm && (
        <div className="grid-3">
          {Object.keys(currencyTotals).length === 0 ? (
            <div className="card flex-col gap-2" style={{ textAlign: 'left', gridColumn: '1/-1' }}>
              <span className="card-title">Earnings Breakdown</span>
              <div style={{ padding: '1.5rem 0', color: 'var(--text-muted)' }}>
                No earnings logged yet. Click "Log Earnings" to record your first transaction.
              </div>
            </div>
          ) : (
            Object.keys(currencyTotals).map(curr => (
              <div className="card" key={curr} style={{ textAlign: 'left' }}>
                <span className="card-title">Total {curr} Earnings</span>
                <div className="card-value" style={{ color: curr === 'USD' ? 'var(--primary-magenta)' : 'var(--primary-purple)' }} data-ph-mask>
                  {CURRENCY_MAP[curr] || curr} 
                  {currencyTotals[curr].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="card-subtext">
                  Logged in {curr} currency
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {showAddForm ? (
        /* Log Revenue Form */
        <div className="card rd-page-form rd-page-form--narrow">
          <div className="rd-page-form-header">
            <h3>Log earnings</h3>
            <p className="rd-modal-sub">Record a payment so revenue stays accurate.</p>
          </div>

          <form onSubmit={handleLogSubmit} className="rd-form">
            <div className="rd-form-group">
              <label className="form-label" htmlFor="earn-source">Client / source *</label>
              <input
                id="earn-source"
                type="text"
                required
                className="form-input"
                placeholder="e.g. Acme Corp, Upwork project"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>

            <div className="rd-form-row">
              <div className="rd-form-group">
                <label className="form-label" htmlFor="earn-amount">Amount *</label>
                <input
                  id="earn-amount"
                  type="number"
                  step="any"
                  required
                  className="form-input"
                  placeholder="e.g. 1500"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="rd-form-group">
                <label className="form-label">Currency *</label>
                <CurrencySelector
                  value={currency}
                  onChange={setCurrency}
                  placeholder="Select currency…"
                />
              </div>
            </div>

            <div className="rd-form-row">
              <div className="rd-form-group">
                <label className="form-label" htmlFor="earn-date">Payment date</label>
                <input
                  id="earn-date"
                  type="date"
                  className="form-input"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="rd-form-group">
                <label className="form-label" htmlFor="earn-service">Service / type</label>
                <input
                  id="earn-service"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Web design"
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                />
              </div>
            </div>

            <div className="rd-form-group">
              <label className="form-label" htmlFor="earn-notes">Notes</label>
              <textarea
                id="earn-notes"
                className="form-textarea"
                placeholder="Optional details…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            <div className="rd-page-form-actions">
              <button type="button" onClick={() => setShowAddForm(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                <TrendingUp size={16} />
                Log earnings
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Logs Table */
        <div className="table-container">
          <div className="table-header-bar">
            <h3>Earnings Log</h3>
            <span className="badge badge-pro">{userLogs.length} Transaction(s)</span>
          </div>

          <div className="table-wrapper">
            {userLogs.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No earnings logged yet. Click "Log Earnings" to record your first payout!
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Client / Source</th>
                    <th>Service</th>
                    <th>Amount</th>
                    <th>Currency</th>
                    <th>Notes</th>
                    <th>Logged</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {userLogs.map(log => (
                    <tr key={log.id}>
                      <td style={{ fontWeight: 600 }}>{log.date}</td>
                      <td data-ph-mask>
                        {log.source}
                        {showAttribution && log.userEmail && log.userEmail !== currentUser.email && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {log.userEmail.split('@')[0]}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }} data-ph-mask>{log.service || '—'}</td>
                      <td style={{ fontWeight: 700, color: 'var(--success-color)' }} data-ph-mask>
                        {(log.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td>
                        <span className="badge badge-starter">{log.currency}</span>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-ph-mask>
                        {log.description || '—'}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{log.dateAdded}</td>
                      <td>
                        <button 
                          className="btn btn-danger btn-sm"
                          onClick={() => onDeleteRevenueLog(log.id)}
                          title="Delete Entry"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
