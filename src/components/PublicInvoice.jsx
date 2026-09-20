import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import LoadingSpinner from './LoadingSpinner';
import { PublicInvoiceView } from './InvoiceGenerator';

export default function PublicInvoice() {
  const { token } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function getInvoice() {
      try {
        const { data, error } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', token)
          .maybeSingle();

        if (error) throw error;
        if (data) {
          const mapped = {
            id: data.id,
            user_id: data.user_id,
            invoiceNumber: data.invoice_number,
            clientName: data.client_name,
            clientEmail: data.client_email,
            issueDate: data.issue_date,
            dueDate: data.due_date,
            currency: data.currency,
            items: data.items || [],
            status: data.status,
            notes: data.notes,
            subtotal: data.subtotal || 0,
            tax: data.tax || 0,
            total: data.total || 0,
            paymentDetails: data.payment_instructions,
            payment_link: data.payment_link,
            userEmail: ''
          };
          setInvoice(mapped);
        } else {
          setInvoice(null);
        }
      } catch (err) {
        console.error('Error fetching public invoice:', err);
      } finally {
        setLoading(false);
      }
    }
    getInvoice();
  }, [token]);

  if (loading) return <LoadingSpinner />;

  if (!invoice) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h2>Invoice Not Found</h2>
        <p>The requested invoice does not exist or has been deleted.</p>
        <Link to="/" style={{ color: '#3b82f6', textDecoration: 'underline', marginTop: '1rem', display: 'inline-block' }}>
          Go back to app home
        </Link>
      </div>
    );
  }

  return <PublicInvoiceView invoiceId={token} invoices={[invoice]} />;
}
