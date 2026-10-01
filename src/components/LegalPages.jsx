import { SiYoutube, SiInstagram } from '@icons-pack/react-simple-icons';
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';


const SiLinkedin = ({ size = 24, color = 'currentColor', ...props }) => (
  <svg role="img" viewBox="0 0 24 24" width={size} height={size} fill={color} {...props}>
    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.779-1.75-1.75s.784-1.75 1.75-1.75 1.75.779 1.75 1.75-.784 1.75-1.75 1.75zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
  </svg>
);
function LegalContainer({ title, lastUpdated, children }) {
  return (
    <div className="landing-container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      {/* Navigation Bar */}
      <nav className="landing-nav" style={{ justifyContent: 'space-between' }}>
        <Link to="/homepage" className="landing-nav-logo" style={{ cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <span className="landing-logo-text" style={{ fontSize: '11px' }}>ReachDesk CRM</span>
        </Link>
        <Link to="/homepage" className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '0.7rem' }}>
          <ArrowLeft size={12} /> Back to Home
        </Link>
      </nav>

      {/* Main Content Area */}
      <div style={{ flex: 1, padding: '3rem 1.5rem', display: 'flex', justifyContent: 'center' }}>
        <div style={{ maxWidth: '800px', width: '100%', textAlign: 'left', lineHeight: '1.7' }}>
          <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem', color: 'var(--text-primary)', fontFamily: 'var(--font-headers)' }}>{title}</h1>
          <p className="color-muted" style={{ fontSize: '0.9rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>Last updated: {lastUpdated}</p>
          <div style={{ color: 'var(--text-secondary)', fontSize: '1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {children}
          </div>
        </div>
      </div>

      {/* Simple Footer */}
      <footer className="landing-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem', marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <a href="https://www.youtube.com/@ReachDeskcrm" target="_blank" rel="noopener noreferrer" title="YouTube" style={{ color: 'var(--text-secondary)', transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}><SiYoutube size={20} /></a>
          <a href="https://www.instagram.com/reachdeskcrm/" target="_blank" rel="noopener noreferrer" title="Instagram" style={{ color: 'var(--text-secondary)', transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}><SiInstagram size={20} /></a>
          <a href="https://www.linkedin.com/company/reachdeskcrm/" target="_blank" rel="noopener noreferrer" title="LinkedIn" style={{ color: 'var(--text-secondary)', transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}><SiLinkedin size={20} /></a>
        </div>
        <p style={{ color: 'var(--text-secondary)' }}>© 2026 ReachDesk CRM. All rights reserved.</p>
      </footer>
    </div>
  );
}

export function TermsOfService() {
  return (
    <LegalContainer title="Terms of Service" lastUpdated="July 2026">
      <p>
        These Terms of Service ("Terms") govern your access to and use of ReachDesk CRM, a customer relationship management (CRM) tool for freelancers and agency owners, accessible at reachdeskcrm.com and related domains (the "Service"). The Service is operated under esemdot, Pakistan. By creating an account or using the Service, you agree to be bound by these Terms.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>1. The Service</h3>
      <p>
        ReachDesk CRM provides tools to help freelancers and agency owners organize leads, contacts, notes, and follow-up information. ReachDesk CRM is a record-keeping and organization tool only — it does not send messages, emails, or communications to your leads or contacts on your behalf.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>2. Accounts</h3>
      <p>
        You must provide accurate information when creating an account and are responsible for maintaining the confidentiality of your login credentials. You are responsible for all activity that occurs under your account. Notify us immediately of any unauthorized use of your account.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>3. Subscription Plans and Free Trial</h3>
      <p>
        ReachDesk CRM is offered with a free trial and paid plans. All new accounts receive a 7-day free trial with no credit card required. The trial includes up to 50 leads and 5 templates. At the end of the trial period, continued access to the Service requires an active paid subscription.
      </p>
      <p>
        Paid subscription tiers (USD reference prices; local currency amounts may be shown at checkout via Paddle):
      </p>
      <ul style={{ paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <li><strong>Starter</strong> — from $5.00/month (750 leads monthly / 2,000 yearly, 10 templates, Calls, 1 user)</li>
        <li><strong>Pro</strong> — from $15.00/month (5,000 leads, 50 templates, 1 user)</li>
        <li><strong>Teams</strong> — from $29.00/month (unlimited leads, unlimited templates, up to 5 team seats)</li>
      </ul>
      <p>
        Subscriptions are available on monthly, quarterly (approximately 15% off vs. monthly), or yearly (approximately 30% off vs. monthly) billing cycles. Yearly Starter includes 2,000 leads (vs. 750 on monthly). Yearly Pro includes double the monthly lead capacity. Exact prices, limits, and features for each plan are displayed within the Service and at checkout and may be updated from time to time. Continued use of the Service after a price change constitutes acceptance of the new pricing for your next billing cycle.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>4. Payment and Auto-Renewal</h3>
      <p>
        Payments are processed securely via our payment processor, Paddle.com. By subscribing to a paid plan, you agree to allow Paddle.com to charge your payment method. Subscriptions renew automatically at the end of each billing cycle (monthly, quarterly, or yearly) unless cancelled prior to the renewal date.
      </p>
      <p>
        You are responsible for ensuring that your payment details are kept up to date to prevent any disruption of service.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>5. Account Suspension on Trial or Subscription Expiry</h3>
      <p>
        If your free trial ends or your subscription lapses without renewal, your access to the Service may be locked until payment is made via Paddle. We will make reasonable efforts to notify you in advance of any such lock, including in-app and email notifications.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>6. Acceptable Use</h3>
      <p>You agree not to:</p>
      <ul style={{ paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <li>Use the Service for any unlawful purpose or in violation of any applicable law</li>
        <li>Attempt to gain unauthorized access to any part of the Service or its underlying systems</li>
        <li>Upload malicious code, attempt to disrupt the Service, or interfere with other users' access</li>
        <li>Use the Service to store or process data you do not have the legal right to hold</li>
        <li>Resell, sublicense, or provide access to the Service to third parties without our written consent</li>
      </ul>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>7. Your Data</h3>
      <p>
        You retain ownership of all data, leads, contacts, and notes you input into the Service ("Your Data"). You are solely responsible for the accuracy, legality, and appropriateness of Your Data, including ensuring you have the right to store any personal data of third parties (such as your clients' leads) within the Service.
      </p>
      <p>
        Our handling of Your Data is further described in our Privacy Policy.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>8. Intellectual Property</h3>
      <p>
        The Service, including its design, code, branding, and underlying technology, is owned by esemdot / ReachDesk CRM and is protected by applicable intellectual property laws. These Terms do not grant you any rights to our trademarks, logos, or branding.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>9. Service Availability</h3>
      <p>
        We aim to keep the Service available and reliable but do not guarantee uninterrupted access. The Service may be temporarily unavailable due to maintenance, updates, or circumstances beyond our control. We are not liable for any loss arising from such downtime.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>10. Termination</h3>
      <p>
        You may stop using the Service and request account deletion at any time by contacting us. We reserve the right to suspend or terminate accounts that violate these Terms, engage in fraudulent payment activity, or pose a security risk to the Service or other users.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>11. Limitation of Liability</h3>
      <p>
        To the maximum extent permitted by law, ReachDesk CRM and esemdot shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of, or inability to use, the Service, including loss of data, business, or profits. The Service is provided "as is" without warranties of any kind, express or implied.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>12. Changes to These Terms</h3>
      <p>
        We may update these Terms from time to time. Material changes will be communicated through the Service or via email. Continued use of the Service after changes take effect constitutes acceptance of the revised Terms.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>13. Governing Law</h3>
      <p>
        These Terms are governed by the laws of the Islamic Republic of Pakistan, without regard to conflict of law principles. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts of Pakistan.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>14. Contact</h3>
      <p>
        For questions about these Terms, contact us at <a href="mailto:support@reachdeskcrm.com" style={{ color: 'var(--primary-purple)', textDecoration: 'none' }}>support@reachdeskcrm.com</a>.
      </p>
    </LegalContainer>
  );
}

export function PrivacyPolicy() {
  return (
    <LegalContainer title="Privacy Policy" lastUpdated="July 2026">
      <p>
        This Privacy Policy explains how ReachDesk CRM ("we", "us"), operated under esemdot, Pakistan, collects, uses, and protects information when you use the ReachDesk CRM Service at reachdeskcrm.com and related domains.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>1. Information We Collect</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <p><strong>Account information:</strong> When you sign up, we collect your name, email address, business name, and password (stored securely, never in plain text).</p>
        <p><strong>Payment information:</strong> All payments are processed securely by our payment processor, Paddle.com. We do not collect or store your payment details (such as credit card or bank account info) on our servers; these remain with Paddle.</p>
        <p><strong>Your CRM data:</strong> We store the leads, contacts, notes, and related information you choose to input into the Service. This data belongs to you and is used solely to provide the Service to you.</p>
        <p><strong>Usage data:</strong> We may collect technical information such as your IP address, browser type, device information, and how you interact with the Service, to help us maintain and improve it.</p>
      </div>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>2. How We Use Your Information</h3>
      <ul style={{ paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <li>To create and manage your account</li>
        <li>To provide, maintain, and improve the Service</li>
        <li>To process and verify your subscription payments through Paddle</li>
        <li>To send you important notifications, such as upgrade confirmations, password resets, and service updates</li>
        <li>To respond to your support requests</li>
        <li>To detect, prevent, and address technical issues, fraud, or abuse of the Service</li>
      </ul>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>3. How We Share Your Information</h3>
      <p>
        We do not sell your personal information. We may share information with the following third parties solely to operate the Service:
      </p>
      <ul style={{ paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <li><strong>Supabase</strong> — our database and authentication infrastructure provider, which stores your account and CRM data</li>
        <li><strong>Paddle</strong> — our payments processor, which manages purchases, billing, and subscriptions</li>
        <li><strong>Resend</strong> — our email delivery provider, used to send password resets, notifications, and account-related emails</li>
        <li><strong>Vercel</strong> — our hosting provider, which serves the Service to your browser</li>
      </ul>
      <p>
        These providers process data on our behalf and are bound by their own data protection obligations. We do not share Your Data (leads, contacts, notes) with any other third party, advertiser, or data broker.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>4. Google User Data</h3>
      <p>
        ReachDesk CRM integrates with Google Calendar and Google Sheets to provide features that help you manage your leads and follow-ups.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <p><strong>What we access:</strong></p>
        <ul style={{ paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <li><strong>Google Calendar:</strong> We access your calendar events to automatically detect when a lead has booked a meeting with you, and to create events you add from within ReachDesk CRM.</li>
          <li><strong>Google Sheets:</strong> We access spreadsheets you explicitly select to export your lead data to, or import lead data from.</li>
        </ul>
        <p><strong>How we use it:</strong></p>
        <ul style={{ paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <li>Calendar event data is used to match meeting attendees against your existing leads and update their status, and to create events you explicitly add in ReachDesk CRM.</li>
          <li>Sheets data is used solely for the export/import actions you initiate — we do not access any other files in your Google Drive.</li>
        </ul>
        <p><strong>How we store it:</strong></p>
        <ul style={{ paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <li>We store OAuth access tokens and refresh tokens securely, encrypted, to maintain your connection to Google services.</li>
          <li>We do not store the content of your calendar events or spreadsheet data beyond what's needed to complete the action you requested.</li>
        </ul>
        <p><strong>Sharing:</strong></p>
        <ul style={{ paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <li>We do not share, sell, or transfer your Google user data to any third party.</li>
          <li>We do not use Google user data for advertising purposes.</li>
        </ul>
        <p><strong>Revoking access:</strong></p>
        <ul style={{ paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <li>You can disconnect Google Calendar or Google Sheets at any time from <Link to="/settings?tab=integrations">Configuration → Integrations</Link>. This revokes our access to your Google account immediately.</li>
          <li>You can also revoke access directly at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-purple)', textDecoration: 'none' }}>myaccount.google.com/permissions</a>.</li>
        </ul>
        <p>
          ReachDesk CRM's use and transfer of information received from Google APIs adheres to the{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-purple)', textDecoration: 'none' }}>
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </div>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>5. Data Retention</h3>
      <p>
        We retain your account and CRM data for as long as your account remains active. If you delete your account, we will delete or anonymize your data within a reasonable period, except where retention is required for legal, accounting, or fraud-prevention purposes.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>6. Data Security</h3>
      <p>
        We take reasonable technical and organizational measures to protect your data, including encrypted storage, access controls, and row-level security on our database. However, no method of transmission or storage is 100% secure, and we cannot guarantee absolute security.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>7. Your Rights</h3>
      <p>
        You may access, update, or request deletion of your personal information at any time by contacting us at <a href="mailto:support@reachdeskcrm.com" style={{ color: 'var(--primary-purple)', textDecoration: 'none' }}>support@reachdeskcrm.com</a>. You may also export or delete your CRM data directly within the Service where such functionality is available.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>8. Cookies and Tracking</h3>
      <p>
        We may use cookies or similar technologies to keep you logged in and to understand basic usage patterns of the Service. We do not use cookies for third-party advertising.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>9. Children's Privacy</h3>
      <p>
        The Service is not directed at individuals under the age of 18, and we do not knowingly collect personal information from minors.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>10. Changes to This Policy</h3>
      <p>
        We may update this Privacy Policy from time to time. Material changes will be communicated through the Service or via email. Continued use of the Service after changes take effect constitutes acceptance of the revised Policy.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>11. Governing Law</h3>
      <p>
        This Privacy Policy is governed by the laws of the Islamic Republic of Pakistan.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>12. Contact</h3>
      <p>
        For questions about this Privacy Policy or to exercise your data rights, contact us at <a href="mailto:support@reachdeskcrm.com" style={{ color: 'var(--primary-purple)', textDecoration: 'none' }}>support@reachdeskcrm.com</a>.
      </p>
    </LegalContainer>
  );
}

export function RefundPolicy() {
  return (
    <LegalContainer title="Refund Policy" lastUpdated="July 2026">
      <p>
        This Refund Policy applies to all subscription purchases made through ReachDesk CRM, operated under esemdot, Pakistan.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>1. Free Trial</h3>
      <p>
        Every new account receives a 7-day free trial with full access to the Service. We encourage you to use this period to evaluate whether ReachDesk CRM meets your needs before making a payment. No credit card is required to begin the trial.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>2. Payment Process</h3>
      <p>
        All ReachDesk CRM payments are processed securely via Paddle.com. Subscriptions renew automatically at the end of each billing cycle (monthly, quarterly, or yearly) unless cancelled prior to the renewal date.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>3. Refund Eligibility</h3>
      <p>
        Because a free trial is provided to evaluate the Service before any payment is made, refunds are subject to specific conditions based on the plan and billing cycle you select:
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <p><strong>Monthly subscriptions (Starter, Pro, or Teams):</strong> Non-refundable. You may cancel at any time to prevent future automatic renewals, but no refunds will be issued for the current billing period.</p>
        <p><strong>Quarterly and Yearly subscriptions:</strong> If you cancel and request a refund within 7 days of your purchase, you may be eligible for a refund only if your usage has been minimal — specifically, fewer than 50 leads added and fewer than 3 templates created in your workspace. After this 7-day window, these subscriptions are non-refundable.</p>
      </div>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>4. Non-Refundable Situations</h3>
      <p>Refunds will not be issued in the following cases:</p>
      <ul style={{ paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <li>Any request made after 7 days of purchase for quarterly or yearly plans</li>
        <li>Any refund request on a monthly subscription plan</li>
        <li>Plans where usage exceeds the limits (50 or more leads added, or 3 or more templates created) during the 7-day refund window</li>
        <li>Change of mind where the Service was accessible and functioning as described</li>
        <li>Failure to use the Service during an active subscription period</li>
        <li>Account suspension due to violation of our Terms of Service</li>
      </ul>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>5. How to Request a Refund</h3>
      <p>
        To request a refund on an eligible quarterly or yearly purchase, email <a href="mailto:support@reachdeskcrm.com" style={{ color: 'var(--primary-purple)', textDecoration: 'none' }}>support@reachdeskcrm.com</a> within 7 days of your purchase, including your account email, the payment details, and the reason for your request. We will review your usage and respond within 5 business days.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>6. Refund Method</h3>
      <p>
        Approved refunds will be processed and returned via Paddle.com to the original payment method, within 7–10 business days of approval.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>7. Cancellations</h3>
      <p>
        You may cancel your subscription at any time. Cancellation stops future automatic renewals. For monthly plans, this prevents the next charge. For quarterly and yearly plans, cancellation stops the next renewal but does not refund the current period unless it meets the eligibility criteria in Section 3 and is requested within the 7-day window.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>8. Changes to This Policy</h3>
      <p>
        We may update this Refund Policy from time to time. Material changes will be communicated through the Service or via email.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>9. Governing Law</h3>
      <p>
        This Refund Policy is governed by the laws of the Islamic Republic of Pakistan.
      </p>

      <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem', fontFamily: 'var(--font-headers)' }}>10. Contact</h3>
      <p>
        For refund requests or questions about this policy, contact us at <a href="mailto:support@reachdeskcrm.com" style={{ color: 'var(--primary-purple)', textDecoration: 'none' }}>support@reachdeskcrm.com</a>.
      </p>
    </LegalContainer>
  );
}
