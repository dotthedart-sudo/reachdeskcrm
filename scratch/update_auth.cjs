const fs = require('fs');

let content = fs.readFileSync('src/components/Auth.jsx', 'utf8');

// Add usePasswordForLogin state
if (!content.includes('usePasswordForLogin')) {
    content = content.replace(
        "const [pendingInvite, setPendingInvite] = useState(false);",
        "const [pendingInvite, setPendingInvite] = useState(false);\n  const [usePasswordForLogin, setUsePasswordForLogin] = useState(false);"
    );
}

// In handleEmailContinue, check for password usage.
// Replace LOCAL_PASSWORD_AUTH inside handleEmailContinue with `(isSignup ? LOCAL_PASSWORD_AUTH : usePasswordForLogin)`
const regex1 = /if \(LOCAL_PASSWORD_AUTH\) \{/g;
content = content.replace(regex1, 'if (isSignup ? LOCAL_PASSWORD_AUTH : usePasswordForLogin) {');

const regex2 = /LOCAL_PASSWORD_AUTH/g;
// Replace only inside the JSX for the form fields
// It's safer to just replace all LOCAL_PASSWORD_AUTH inside the return statement with `(isSignup ? LOCAL_PASSWORD_AUTH : usePasswordForLogin)`
// Let's do it carefully.
content = content.replace(
    /\{LOCAL_PASSWORD_AUTH && \(/g,
    '{(isSignup ? LOCAL_PASSWORD_AUTH : usePasswordForLogin) && ('
);

content = content.replace(
    /\? \(LOCAL_PASSWORD_AUTH/g,
    '? ((isSignup ? LOCAL_PASSWORD_AUTH : usePasswordForLogin)'
);

content = content.replace(
    /: \(LOCAL_PASSWORD_AUTH/g,
    ': ((isSignup ? LOCAL_PASSWORD_AUTH : usePasswordForLogin)'
);

// Add the "Use a password instead" button
const toggleBtnHtml = `
            {!isSignup && !usePasswordForLogin && (
              <button
                type="button"
                className="auth-text-btn"
                style={{ marginTop: '0.5rem', alignSelf: 'flex-start' }}
                onClick={() => setUsePasswordForLogin(true)}
                disabled={loading}
              >
                Use a password instead
              </button>
            )}
`;

// Insert the toggle button right after the email input label.
if (!content.includes('Use a password instead')) {
    content = content.replace(
        /<\/label>\s*\{\(isSignup \? LOCAL_PASSWORD_AUTH : usePasswordForLogin\) && \(/g,
        `</label>\n${toggleBtnHtml}\n            {(isSignup ? LOCAL_PASSWORD_AUTH : usePasswordForLogin) && (`
    );
}

// Change "Email me a code instead" to reset usePasswordForLogin
content = content.replace(
    /onClick=\{handleSendOtpInstead\}/g,
    `onClick={() => {
                  if (!isSignup) {
                    setUsePasswordForLogin(false);
                    setPassword('');
                  } else {
                    handleSendOtpInstead();
                  }
                }}`
);

// Update error message
content = content.replace(
    /'Wrong email or password. If this account was created with OTP only, sign up a new local test user or set a password in Supabase Auth.'/g,
    "'Invalid password, or no password set for this account. Use the code we emailed you instead.'"
);

fs.writeFileSync('src/components/Auth.jsx', content, 'utf8');
console.log('Updated Auth.jsx');
