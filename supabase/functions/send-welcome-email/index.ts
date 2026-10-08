import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

// Sender must use the domain verified in Resend: mail.app.reachdeskcrm.com
const FROM_EMAIL = 'ReachDesk CRM <noreply@mail.app.reachdeskcrm.com>'
const REPLY_TO = 'support@reachdeskcrm.com'
const APP_URL = Deno.env.get('APP_URL') || 'https://app.reachdeskcrm.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const wrap = (bodyHtml: string) => `<!DOCTYPE html>
<html>
<head><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"></head>
<body style="margin:0;padding:0;background-color:#F3F4F6;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F3F4F6;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border:1px solid #E5E7EB;border-radius:3px;max-width:600px;width:100%;">
<tr><td style="padding:30px;">
  <div style="text-align:center;margin-bottom:20px;">
    <span style="font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:2px;font-size:24px;color:#0D1117;font-weight:bold;">ReachDesk</span>
  </div>
  ${bodyHtml}
  <p style="color:#6B7280;font-size:12px;border-top:1px solid #E5E7EB;padding-top:15px;margin-top:30px;">This is an automated notification from ReachDesk CRM.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

const heading = (text: string, color = '#5B8FB9') =>
  `<h2 style="color:${color};border-bottom:1px solid #E5E7EB;padding-bottom:10px;margin-top:0;font-family:Arial,sans-serif;">${text}</h2>`

const para = (text: string) => `<p style="color:#1F2937;font-size:14px;line-height:1.6;font-family:Arial,sans-serif;">${text}</p>`

const list = (items: string[]) =>
  `<ul style="color:#374151;line-height:1.8;font-size:14px;font-family:Arial,sans-serif;padding-left:20px;">${items.map(i => `<li>${i}</li>`).join('')}</ul>`

const button = (href: string, label: string) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;"><tr><td align="center" style="background-color:#5B8FB9;border-radius:3px;">
    <a href="${href}" style="display:inline-block;padding:12px 24px;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#FFFFFF;text-decoration:none;">${label}</a>
  </td></tr></table>
`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user_id } = await req.json()
    if (!user_id) throw new Error('user_id is required')

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set')
    }

    const { data: row, error: fetchError } = await supabaseAdmin
      .from('user_profiles')
      .select('id, email, full_name, welcome_email_sent')
      .eq('id', user_id)
      .single()

    if (fetchError || !row) throw new Error(`Could not find user_profiles row for ${user_id}`)
    if (row.welcome_email_sent) {
      return new Response(JSON.stringify({ success: true, skipped: 'already sent' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
      })
    }
    if (!row.email) throw new Error('No email on file for this user')

    const name = row.full_name ? row.full_name.split(' ')[0] : 'there'

    const html = wrap(`
      ${heading('Welcome to ReachDesk')}
      ${para(`Hi ${name},`)}
      ${para('Welcome to ReachDesk! Three things worth knowing before you dive in:')}
      ${list([
        '<strong>Follow-up reminders</strong> — never lose track of who you need to message back',
        '<strong>Templates</strong> — a library ready to use so you\'re not writing from scratch',
        '<strong>Notes</strong> — context on every lead, attached where you need it'
      ])}
      ${para('Your trial includes up to 65 leads and 2 self-made templates.')}
      ${para('The fastest way to see it click: add your first few leads.')}
      ${button(`${APP_URL}/get-started`, 'Get Started')}
      ${para('Any questions, just reply.')}
    `)

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        reply_to: REPLY_TO,
        to: [row.email],
        subject: 'Welcome to ReachDesk — here’s how to get started',
        html
      })
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error(`[WelcomeEmail] Resend failed for ${row.email}: ${errText}`)
      throw new Error('Resend send failed')
    }

    await supabaseAdmin.from('user_profiles').update({ welcome_email_sent: true }).eq('id', row.id)

    console.log(`[WelcomeEmail] Sent to ${row.email}`)
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    })
  } catch (error) {
    console.error('[WelcomeEmail] Error:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400
    })
  }
})
