import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Share2, 
  Eye, 
  Check, 
  Copy, 
  Printer, 
  Receipt,
  FileText,
  Lock,
  ArrowLeft,
  Edit2,
  Send,
  AlertCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import CurrencySelector from './CurrencySelector';
import { useFirstVisitReveal } from '../hooks/useFirstVisitReveal';
import { getTeamIds } from '../lib/utils';
import { teamMemberDisplayName } from '../lib/teamWorkspace';
import { fetchAllLeadsForScope } from '../lib/leadsQuery';

// Main Dashboard view for managing and creating invoices
export default function InvoiceGenerator({ 
  currentUser, 
  invoices, 
  leads = [],
  onAddInvoice, 
  onDeleteInvoice,
  onUpdateInvoiceStatus,
  onUpdateInvoice,
  currencySymbol = 'PKR',
  bankAccount = '',
  bankIban = '',
  teamProfilesMap = {},
  teamIds = [],
}) {
  const { rootClass, blockClass } = useFirstVisitReveal();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [invoiceTab, setInvoiceTab] = useState('active'); // 'active' | 'drafts'
  const [editingInvoice, setEditingInvoice] = useState(null); // null = create mode, invoice object = edit mode
  const [editError, setEditError] = useState(''); // inline validation error for Publish action
  const [isSaving, setIsSaving] = useState(false);

  // Resolve bank details and currency: profile DB values take priority over localStorage props
  const resolvedBankAccount = currentUser?.bank_account || bankAccount || '';
  const resolvedBankIban = currentUser?.bank_iban || bankIban || '';
  const resolvedCurrency = currentUser?.default_currency || currencySymbol || 'PKR';

  // Invoice Form State
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState(`INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState(resolvedCurrency);
  const [taxPercent, setTaxPercent] = useState(0);
  const [paymentDetails, setPaymentDetails] = useState(() => {
    let details = [];
    if (currentUser?.bank_account || bankAccount) details.push(`Bank Account: ${currentUser?.bank_account || bankAccount}`);
    if (currentUser?.bank_iban || bankIban) details.push(`IBAN: ${currentUser?.bank_iban || bankIban}`);
    return details.join('\n');
  });
  const [notes, setNotes] = useState('Payment due on receipt.');

  const [dbLeads, setDbLeads] = useState([]);
  const [folders, setFolders] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // Update payment instructions default when bank details change
  useEffect(() => {
    if (!paymentDetails && (resolvedBankAccount || resolvedBankIban)) {
      let details = [];
      if (resolvedBankAccount) details.push(`Bank Account: ${resolvedBankAccount}`);
      if (resolvedBankIban) details.push(`IBAN: ${resolvedBankIban}`);
      setPaymentDetails(details.join('\n'));
    }
  }, [resolvedBankAccount, resolvedBankIban]);

  // Fetch leads and folders for client autocomplete (workspace-scoped when on a team)
  useEffect(() => {
    if (!currentUser?.id) return;

    async function fetchLeadsAndFolders() {
      try {
        const scopeIds = teamIds?.length > 1
          ? teamIds
          : await getTeamIds(currentUser.id, { respectLeadIsolation: false });
        const [leadsData, foldersRes] = await Promise.all([
          fetchAllLeadsForScope({
            userIds: scopeIds,
            columns: 'id, first_name, last_name, email, status, folder_id',
          }),
          supabase.from('folders').select('id, name').in('user_id', scopeIds)
        ]);

        setDbLeads(leadsData || []);
        if (foldersRes.data) setFolders(foldersRes.data);
      } catch (err) {
        console.error("Error fetching leads/folders for dropdown:", err);
      }
    }

    fetchLeadsAndFolders();
  }, [currentUser, teamIds]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const clientsFolderIds = folders.filter(f => f.name?.toLowerCase() === 'clients').map(f => f.id);
  
  const isClientLead = (lead) => {
    const isClientStatus = lead.status?.toLowerCase() === 'client';
    const isInClientsFolder = lead.folder_id && clientsFolderIds.includes(lead.folder_id);
    return isClientStatus || isInClientsFolder;
  };

  const sortedLeads = [...dbLeads].sort((a, b) => {
    const aClient = isClientLead(a) ? 1 : 0;
    const bClient = isClientLead(b) ? 1 : 0;
    return bClient - aClient;
  });

  const filteredLeads = sortedLeads.filter(lead => {
    const fullName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim();
    return fullName.toLowerCase().includes(clientName.toLowerCase());
  });

  const handleSelectLead = (lead) => {
    const fullName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim();
    setClientName(fullName);
    if (lead.email) {
      setClientEmail(lead.email);
    }
    setShowDropdown(false);
  };
  
  const [items, setItems] = useState([
    { description: 'Freelance Services', quantity: 1, rate: 500 }
  ]);

  const handleAddItem = () => {
    setItems([...items, { description: '', quantity: 1, rate: 0 }]);
  };

  const handleRemoveItem = (index) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    if (field === 'quantity') {
      newItems[index].quantity = parseInt(value) || 0;
    } else if (field === 'rate') {
      newItems[index].rate = parseFloat(value) || 0;
    } else {
      newItems[index][field] = value;
    }
    setItems(newItems);
  };

  const calculateSubtotal = () => {
    return items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const taxAmount = (subtotal * (parseFloat(taxPercent) || 0)) / 100;
    return subtotal + taxAmount;
  };

  // ── Reset form to blank / create-mode state ────────────────────────────────
  const handleResetForm = () => {
    setEditingInvoice(null);
    setEditError('');
    setClientName('');
    setClientEmail('');
    setInvoiceNumber(`INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
    setIssueDate(new Date().toISOString().split('T')[0]);
    setDueDate('');
    setCurrency(resolvedCurrency);
    setTaxPercent(0);
    setItems([{ description: 'Freelance Services', quantity: 1, rate: 500 }]);
    let details = [];
    if (resolvedBankAccount) details.push(`Bank Account: ${resolvedBankAccount}`);
    if (resolvedBankIban) details.push(`IBAN: ${resolvedBankIban}`);
    setPaymentDetails(details.join('\n'));
    setNotes('Payment due on receipt.');
  };

  // ── Pre-populate form fields from an existing invoice ─────────────────────
  const handleEditClick = (invoice) => {
    setEditingInvoice(invoice);
    setEditError('');
    setClientName(invoice.clientName || '');
    setClientEmail(invoice.clientEmail || '');
    setInvoiceNumber(invoice.invoiceNumber || '');
    setIssueDate(invoice.issueDate || new Date().toISOString().split('T')[0]);
    setDueDate(invoice.dueDate || '');
    setCurrency(invoice.currency || resolvedCurrency);
    // Reverse-calculate taxPercent from stored subtotal/tax
    const sub = invoice.subtotal || 0;
    const tax = invoice.tax || 0;
    setTaxPercent(sub > 0 ? parseFloat(((tax / sub) * 100).toFixed(2)) : 0);
    setItems(invoice.items?.length > 0 ? invoice.items : [{ description: '', quantity: 1, rate: 0 }]);
    setPaymentDetails(invoice.paymentDetails || '');
    setNotes(invoice.notes || '');
    setShowCreateForm(true);
  };

  const handleSubmit = async (e, publishIntent = false) => {
    if (e) e.preventDefault();
    setEditError('');

    if (!clientName) {
      setEditError('Client name is required.');
      return;
    }
    if (!currency) {
      setEditError('Please select a currency.');
      return;
    }
    if (items.some(item => !item.description)) {
      setEditError('All items must have a description.');
      return;
    }

    // Extra validation when publishing a draft
    if (publishIntent) {
      const subtotalCheck = items.reduce((s, i) => s + (i.quantity * i.rate), 0);
      if (subtotalCheck <= 0) {
        setEditError('Cannot publish: invoice total must be greater than 0.');
        return;
      }
      if (!clientEmail) {
        setEditError('Cannot publish: client email is required before sending.');
        return;
      }
    }

    setIsSaving(true);

    const subtotal = calculateSubtotal();
    const taxAmount = (subtotal * (parseFloat(taxPercent) || 0)) / 100;
    const total = subtotal + taxAmount;

    if (editingInvoice) {
      // ── EDIT MODE ──────────────────────────────────────────────────────────
      const newStatus = publishIntent ? 'Sent' : editingInvoice.status;
      const result = await onUpdateInvoice(editingInvoice.id, {
        invoiceNumber,
        clientName,
        clientEmail,
        issueDate,
        dueDate: dueDate || null,
        currency,
        items,
        paymentDetails,
        notes,
        taxPercent,
        status: newStatus
      });

      setIsSaving(false);

      if (result?.error) {
        setEditError('Failed to save: ' + (result.error.message || 'Unknown error'));
        return;
      }

      handleResetForm();
      setShowCreateForm(false);

      if (publishIntent) {
        setInvoiceTab('active');
        alert('Invoice published! Share Link is now available in the Active Invoices tab.');
      }
    } else {
      // ── CREATE MODE ───────────────────────────────────────────────────────
      const newInvoice = {
        clientName,
        clientEmail,
        invoiceNumber,
        issueDate,
        dueDate: dueDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        currency,
        items,
        paymentDetails,
        notes,
        subtotal,
        tax: taxAmount,
        total,
        status: 'Sent',
        userEmail: currentUser.email,
        dateAdded: new Date().toLocaleDateString()
      };

      onAddInvoice(newInvoice);
      handleResetForm();
      setShowCreateForm(false);
      setIsSaving(false);
      alert('Invoice generated and saved successfully!');
    }
  };

  const handleCopyLink = (invoiceId) => {
    const shareUrl = `${window.location.origin}/i/${invoiceId}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedId(invoiceId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const userInvoices = invoices || [];
  const showTeamColumns = Object.keys(teamProfilesMap || {}).length > 1;

  const personLabel = (userId) => {
    if (!userId) return '—';
    if (userId === currentUser?.id) return 'You';
    return teamMemberDisplayName(teamProfilesMap?.[userId]);
  };

  const handleAssigneeChange = async (invoice, assigneeId) => {
    if (!invoice?.id || !assigneeId || !onUpdateInvoice) return;
    await onUpdateInvoice(invoice.id, {
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.clientName,
      clientEmail: invoice.clientEmail,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      currency: invoice.currency,
      items: invoice.items || [],
      status: invoice.status,
      notes: invoice.notes,
      taxPercent: invoice.subtotal ? ((invoice.tax || 0) / invoice.subtotal) * 100 : 0,
      paymentDetails: invoice.paymentDetails,
      assignee_id: assigneeId,
    });
  };
  const activeCount = userInvoices.filter(inv => inv.status?.toLowerCase() !== 'draft').length;
  const draftsCount = userInvoices.filter(inv => inv.status?.toLowerCase() === 'draft').length;
  const displayedInvoices = userInvoices.filter(inv => {
    const isDraft = inv.status?.toLowerCase() === 'draft';
    return invoiceTab === 'drafts' ? isDraft : !isDraft;
  });

  return (
    <div className={`flex-col gap-4 page-stack${rootClass}`}>
      <style>{`
        .dropdown-item-hover:hover {
          background-color: rgba(255, 255, 255, 0.05) !important;
        }
        .light .dropdown-item-hover:hover {
          background-color: rgba(0, 0, 0, 0.05) !important;
        }
      `}</style>
      <div className={`flex justify-between align-center mb-4${blockClass}`}>
        <div>
          <p className="color-muted" style={{ fontSize: '0.9rem', margin: 0 }}>
            Generate professional business invoices and get paid directly by your clients
          </p>
        </div>
        <button 
          className="btn btn-primary"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          <Receipt size={16} />
          {showCreateForm ? 'View All Invoices' : 'Create Invoice'}
        </button>
      </div>

      {showCreateForm ? (
        /* Invoice Creator Form */
        <div className={`card rd-page-form${blockClass}`} style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'left' }}>
          <div className="rd-page-form-header">
            <h3>
              {editingInvoice
                ? (editingInvoice.status?.toLowerCase() === 'draft' ? 'Edit draft' : 'Edit invoice')
                : 'New invoice'}
            </h3>
            <p className="rd-modal-sub">
              {editingInvoice ? 'Update details and line items.' : 'Fill in the client, items, and payment details.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="rd-form">
            <section className="rd-form-section">
              <h4 className="rd-form-section-title">Client</h4>
              <div className="rd-form-row">
              <div className="rd-form-group" style={{ position: 'relative' }} ref={dropdownRef}>
                <label className="form-label">Client name *</label>
                <input 
                  type="text" 
                  required 
                  className="form-input" 
                  placeholder="e.g. Acme Corporation" 
                  value={clientName} 
                  onChange={(e) => {
                    setClientName(e.target.value);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                />
                {showDropdown && filteredLeads.length > 0 && (
                  <div className="rd-autocomplete">
                    {filteredLeads.map(lead => {
                      const fullName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unnamed Lead';
                      const isClient = isClientLead(lead);
                      return (
                        <button
                          type="button"
                          key={lead.id}
                          onClick={() => handleSelectLead(lead)}
                          className="rd-autocomplete-item"
                        >
                          <span>
                            <strong>{fullName}</strong>
                            {lead.email && <span className="rd-autocomplete-meta">{lead.email}</span>}
                          </span>
                          {isClient && <span className="rd-autocomplete-badge">Client</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
                {showDropdown && filteredLeads.length === 0 && clientName && (
                  <div className="rd-autocomplete rd-autocomplete-empty">
                    No matching leads found
                  </div>
                )}
              </div>
              <div className="rd-form-group">
                <label className="form-label">Client email</label>
                <input 
                  type="email" 
                  className="form-input" 
                  placeholder="e.g. billing@acme.com" 
                  value={clientEmail} 
                  onChange={(e) => setClientEmail(e.target.value)} 
                />
              </div>
            </div>
            </section>

            <section className="rd-form-section">
              <h4 className="rd-form-section-title">Details</h4>
              <div className="rd-form-row rd-form-row-3">
              <div className="rd-form-group">
                <label className="form-label">Invoice number *</label>
                <input 
                  type="text" 
                  required 
                  className="form-input" 
                  value={invoiceNumber} 
                  onChange={(e) => setInvoiceNumber(e.target.value)} 
                />
              </div>
              <div className="rd-form-group">
                <label className="form-label">Issue date *</label>
                <input 
                  type="date" 
                  required 
                  className="form-input" 
                  value={issueDate} 
                  onChange={(e) => setIssueDate(e.target.value)} 
                />
              </div>
              <div className="rd-form-group">
                <label className="form-label">Due date</label>
                <input 
                  type="date" 
                  className="form-input" 
                  value={dueDate} 
                  onChange={(e) => setDueDate(e.target.value)} 
                />
              </div>
            </div>

              <div className="rd-form-row" style={{ maxWidth: '320px' }}>
              <div className="rd-form-group">
                <label className="form-label">Currency</label>
                <CurrencySelector
                  value={currency}
                  onChange={setCurrency}
                  placeholder="Select currency..."
                />
              </div>
              <div className="rd-form-group">
                <label className="form-label">Tax %</label>
                <input 
                  type="number" 
                  min="0" 
                  max="100" 
                  step="any"
                  className="form-input" 
                  value={taxPercent} 
                  onChange={(e) => setTaxPercent(Math.max(0, parseFloat(e.target.value) || 0))} 
                />
              </div>
            </div>
            </section>

            {/* Line Items Table */}
            <section className="rd-form-section">
              <div className="rd-section-head">
                <h4 className="rd-form-section-title">Line items</h4>
                <button 
                  type="button" 
                  className="btn btn-secondary btn-sm" 
                  onClick={handleAddItem}
                >
                  <Plus size={14} /> Add item
                </button>
              </div>

              {items.map((item, index) => (
                <div key={index} className="rd-line-item">
                  <div className="rd-form-group rd-line-item-desc">
                    <label className="form-label">Description</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. Website UI design" 
                      className="form-input"
                      value={item.description}
                      onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                    />
                  </div>
                  <div className="rd-form-group">
                    <label className="form-label">Qty</label>
                    <input 
                      type="number" 
                      min="1" 
                      required
                      className="form-input"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                    />
                  </div>
                  <div className="rd-form-group">
                    <label className="form-label">Rate</label>
                    <input 
                      type="number" 
                      min="0" 
                      step="any"
                      required
                      className="form-input"
                      value={item.rate}
                      onChange={(e) => handleItemChange(index, 'rate', e.target.value)}
                    />
                  </div>
                  <div className="rd-line-item-total">
                    {(item.quantity * item.rate).toLocaleString()} {currency}
                  </div>
                  <button 
                    type="button" 
                    className="btn btn-danger btn-sm"
                    onClick={() => handleRemoveItem(index)}
                    disabled={items.length === 1}
                    aria-label="Remove item"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </section>

            {/* Total display */}
            <div className="rd-totals">
              <div className="rd-totals-row">
                <span>Subtotal</span>
                <span>{calculateSubtotal().toLocaleString()} {currency}</span>
              </div>
              {taxPercent > 0 && (
                <div className="rd-totals-row">
                  <span>Tax ({taxPercent}%)</span>
                  <span>{((calculateSubtotal() * taxPercent) / 100).toLocaleString()} {currency}</span>
                </div>
              )}
              <div className="rd-totals-row rd-totals-due">
                <span>Total due</span>
                <span>{calculateTotal().toLocaleString()} {currency}</span>
              </div>
            </div>

            <section className="rd-form-section">
              <h4 className="rd-form-section-title">Payment</h4>
            <div className="rd-form-group">
              <label className="form-label">Payment instructions</label>
              <textarea 
                className="form-textarea"
                placeholder="e.g. Bank name, account, IBAN…"
                value={paymentDetails}
                onChange={(e) => setPaymentDetails(e.target.value)}
              />
            </div>

            <div className="rd-form-group">
              <label className="form-label">Notes / terms</label>
              <input 
                type="text" 
                className="form-input"
                placeholder="Payment due on receipt."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            </section>

            {editError && (
              <div className="auth-error-banner" role="alert">
                <AlertCircle size={14} />
                <span>{editError}</span>
              </div>
            )}

            <div className="rd-page-form-actions">
              <button 
                type="button" 
                onClick={() => { handleResetForm(); setShowCreateForm(false); }} 
                className="btn btn-secondary"
                disabled={isSaving}
              >
                Cancel
              </button>

              {editingInvoice ? (
                editingInvoice.status?.toLowerCase() === 'draft' ? (
                  <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                    <button
                      type="submit"
                      className="btn btn-secondary"
                      disabled={isSaving}
                      onClick={(e) => { handleSubmit(e, false); }}
                    >
                      {isSaving ? 'Saving…' : 'Save draft'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={isSaving}
                      onClick={(e) => { e.preventDefault(); handleSubmit(null, true); }}
                    >
                      <Send size={15} />
                      {isSaving ? 'Publishing…' : 'Publish & send'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving…' : 'Save changes'}
                  </button>
                )
              ) : (
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? 'Saving…' : 'Save & generate link'}
                </button>
              )}
            </div>
          </form>
        </div>
      ) : (
        /* Saved Invoices List */
        <div className={`table-container${blockClass}`}>
          <div className="table-header-bar" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'stretch' }}>
            <div className="flex justify-between align-center" style={{ width: '100%' }}>
              <h3>Saved Invoices</h3>
              <span className="badge badge-starter">{displayedInvoices.length} Invoices</span>
            </div>
            
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '1rem', marginTop: '0.25rem' }}>
              <button
                type="button"
                onClick={() => setInvoiceTab('active')}
                style={{
                  padding: '0.5rem 0.75rem',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: invoiceTab === 'active' ? '2px solid var(--accent-blue)' : '2px solid transparent',
                  color: invoiceTab === 'active' ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontWeight: invoiceTab === 'active' ? 600 : 400,
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                Active Invoices ({activeCount})
              </button>
              <button
                type="button"
                onClick={() => setInvoiceTab('drafts')}
                style={{
                  padding: '0.5rem 0.75rem',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: invoiceTab === 'drafts' ? '2px solid var(--accent-blue)' : '2px solid transparent',
                  color: invoiceTab === 'drafts' ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontWeight: invoiceTab === 'drafts' ? 600 : 400,
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                Drafts ({draftsCount})
              </button>
            </div>
          </div>

          <div className="table-wrapper">
            {displayedInvoices.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                {invoiceTab === 'drafts' 
                  ? 'No drafts found. Drafts are auto-generated when leads are set to Booked or Rescheduled status.'
                  : 'No active invoices found. Click "Create Invoice" to bill your first client!'
                }
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Invoice No.</th>
                    <th>Client</th>
                    {showTeamColumns && <th>Created by</th>}
                    {showTeamColumns && <th>Assigned to</th>}
                    <th>Date</th>
                    <th>Due Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedInvoices.map(invoice => {
                    const isDraft = invoice.status?.toLowerCase() === 'draft';
                    return (
                    <tr key={invoice.id}>
                      <td style={{ fontWeight: 600 }}>{invoice.invoiceNumber}</td>
                      <td>
                        <div className="flex-col" data-ph-mask>
                          <span>{invoice.clientName}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{invoice.clientEmail}</span>
                        </div>
                      </td>
                      {showTeamColumns && (
                        <td style={{ fontSize: '0.85rem' }}>{personLabel(invoice.user_id)}</td>
                      )}
                      {showTeamColumns && (
                        <td>
                          <select
                            className="form-select"
                            style={{ padding: '0.15rem 0.5rem', fontSize: '0.8rem', maxWidth: '140px' }}
                            value={invoice.assignee_id || invoice.user_id || ''}
                            onChange={(e) => handleAssigneeChange(invoice, e.target.value)}
                            aria-label="Assigned to"
                          >
                            {Object.keys(teamProfilesMap).map((uid) => (
                              <option key={uid} value={uid}>
                                {uid === currentUser?.id ? 'You' : teamMemberDisplayName(teamProfilesMap[uid])}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}
                      <td>{invoice.issueDate}</td>
                      <td>{invoice.dueDate}</td>
                      <td style={{ fontWeight: 600 }} data-ph-mask>
                        {invoice.total.toLocaleString()} {invoice.currency}
                      </td>
                      <td>
                        <select 
                          className="form-select"
                          style={{ padding: '0.15rem 0.5rem', fontSize: '0.8rem', width: '100px' }}
                          value={invoice.status}
                          onChange={(e) => onUpdateInvoiceStatus(invoice.id, e.target.value)}
                        >
                          {isDraft && <option value="draft">Draft</option>}
                          <option value="Sent">Sent</option>
                          <option value="Paid">Paid</option>
                          <option value="Overdue">Overdue</option>
                        </select>
                      </td>
                      <td>
                        <div className="flex gap-2">
                          {isDraft ? (
                            // Drafts: Edit button only — no public share link
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleEditClick(invoice)}
                              title="Edit Draft"
                            >
                              <Edit2 size={14} /> Edit
                            </button>
                          ) : (
                            // Active invoices: Share Link + Preview
                            <>
                              <button 
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleCopyLink(invoice.id)}
                                title="Copy Client Share Link"
                              >
                                {copiedId === invoice.id ? <Check size={14} style={{ color: 'var(--success-color)' }} /> : <Share2 size={14} />}
                                {copiedId === invoice.id ? 'Copied' : 'Share Link'}
                              </button>
                              <a 
                                href={`/i/${invoice.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-secondary btn-sm"
                                title="Preview Invoice"
                              >
                                <Eye size={14} />
                              </a>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleEditClick(invoice)}
                                title="Edit Invoice"
                              >
                                <Edit2 size={14} />
                              </button>
                            </>
                          )}
                          <button 
                            className="btn btn-danger btn-sm"
                            onClick={() => onDeleteInvoice(invoice.id)}
                            title="Delete Invoice"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Clean, standalone invoice view for the freelancer's clients
export function PublicInvoiceView({ invoiceId, invoices }) {
  const invoice = invoices.find(inv => inv.id === invoiceId);

  if (!invoice) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h2>Invoice Not Found</h2>
        <p>The requested invoice does not exist or has been deleted.</p>
        <a href="/" style={{ color: '#3b82f6', textDecoration: 'underline', marginTop: '1rem', display: 'inline-block' }}>
          Go back to app home
        </a>
      </div>
    );
  }

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{ background: '#f1f5f9', minHeight: '100vh', padding: '1rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Printable Control header */}
      <div className="no-print" style={{ width: '100%', maxWidth: '800px', padding: '0.5rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', background: '#ffffff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FileText size={18} style={{ color: '#3b82f6' }} />
          <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b' }}>ReachDesk CRM Client Invoice System</span>
        </div>
        <button 
          onClick={handlePrint}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.8rem', background: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
        >
          <Printer size={14} /> Print / Save PDF
        </button>
      </div>

      {/* Invoice Card */}
      <div className="invoice-print-container">
        {/* Header Block */}
        <div className="invoice-header">
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>
              Invoice From:
            </h2>
            <p style={{ marginTop: '0.25rem', fontSize: '1rem', fontWeight: 500, color: '#334155' }}>
              {invoice.userEmail}
            </p>
          </div>
          <div className="invoice-title-block">
            <h1>Invoice</h1>
            <p style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 600 }}>
              Invoice #: {invoice.invoiceNumber}
            </p>
          </div>
        </div>

        {/* Invoice Grid Details */}
        <div className="invoice-details-grid">
          <div className="invoice-bill-to">
            <h3 className="rd-section-label" style={{ marginBottom: 'var(--space-2)' }}>
              Bill to
            </h3>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }} data-ph-mask>
              {invoice.clientName}
            </h4>
            {invoice.clientEmail && (
              <p style={{ fontSize: '0.9rem', color: '#475569', marginTop: '0.25rem' }} data-ph-mask>
                {invoice.clientEmail}
              </p>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '0.9rem', color: '#475569' }}>
              <strong>Date Issued:</strong> {invoice.issueDate}
            </p>
            <p style={{ fontSize: '0.9rem', color: '#475569', marginTop: '0.25rem' }}>
              <strong>Due Date:</strong> {invoice.dueDate}
            </p>
            <p style={{ fontSize: '0.9rem', color: '#475569', marginTop: '0.25rem' }}>
              <strong>Payment Status:</strong> 
              <span style={{ 
                marginLeft: '0.5rem',
                padding: '0.15rem 0.4rem', 
                fontSize: '0.75rem',
                borderRadius: '4px',
                fontWeight: 700,
                backgroundColor: invoice.status?.toLowerCase() === 'paid' ? '#d1fae5' : '#fee2e2',
                color: invoice.status?.toLowerCase() === 'paid' ? '#065f46' : '#991b1b',
                border: `1px solid ${invoice.status?.toLowerCase() === 'paid' ? '#a7f3d0' : '#fecaca'}`
              }}>
                {invoice.status.toUpperCase()}
              </span>
            </p>
          </div>
        </div>

        {/* Services Table */}
        <table className="invoice-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Description</th>
              <th style={{ width: '80px', textAlign: 'center' }}>Qty</th>
              <th style={{ width: '120px', textAlign: 'right' }}>Rate</th>
              <th style={{ width: '120px', textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, index) => (
              <tr key={index}>
                <td style={{ textAlign: 'left', fontWeight: 500 }} data-ph-mask>{item.description}</td>
                <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                <td style={{ textAlign: 'right' }} data-ph-mask>{item.rate.toLocaleString()} {invoice.currency}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }} data-ph-mask>{(item.quantity * item.rate).toLocaleString()} {invoice.currency}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals Block */}
        <div className="invoice-totals">
          <div className="invoice-totals-row">
            <span>Subtotal</span>
            <span data-ph-mask>{(invoice.subtotal || invoice.total || 0).toLocaleString()} {invoice.currency}</span>
          </div>
          <div className="invoice-totals-row" style={{ color: '#64748b' }}>
            <span>Tax ({(((invoice.tax || 0) / (invoice.subtotal || invoice.total || 1)) * 100).toFixed(1).replace('.0', '')}%)</span>
            <span data-ph-mask>{(invoice.tax || 0).toLocaleString()} {invoice.currency}</span>
          </div>
          <div className="invoice-totals-row grand-total">
            <span>Amount Due</span>
            <span data-ph-mask>{invoice.total.toLocaleString()} {invoice.currency}</span>
          </div>
        </div>

        {/* Payment Terms & Instructions */}
        {(invoice.paymentDetails || invoice.notes) && (
          <div className="invoice-terms">
            {invoice.paymentDetails && (
              <div style={{ marginBottom: '1.25rem' }}>
                <h4 className="rd-section-label" style={{ marginBottom: 'var(--space-2)' }}>
                  Payment instructions
                </h4>
                <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, color: '#334155' }} data-ph-mask>
                  {invoice.paymentDetails}
                </p>
              </div>
            )}
            
            {invoice.notes && (
              <div>
                <h4 className="rd-section-label" style={{ marginBottom: 'var(--space-1)' }}>
                  Notes & terms
                </h4>
                <p style={{ color: '#475569' }} data-ph-mask>{invoice.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Style overrides for Printing */}
      <style>{`
        @media print {
          body {
            background: #ffffff !important;
            padding: 0 !important;
            color: #000000 !important;
          }
          .no-print {
            display: none !important;
          }
          .invoice-print-container {
            margin: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
            max-width: 100% !important;
          }
          .invoice-table th {
            background-color: #f1f5f9 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
}
