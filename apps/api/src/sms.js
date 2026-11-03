// Sends the one-time code for the table check-in. Choose the provider with SMS_PROVIDER:
//   console (default): prints the code in the API terminal. For development only; refused in production.
//   msg91: MSG91's OTP API. Needs MSG91_AUTH_KEY and MSG91_TEMPLATE_ID (the DLT-approved OTP template).
// Phone numbers arrive as +91XXXXXXXXXX.
const production = () => process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);

export const smsIsLive = () => (process.env.SMS_PROVIDER || 'console') !== 'console';

export async function sendOtp(phone, code) {
  const provider = process.env.SMS_PROVIDER || 'console';
  if (provider === 'msg91') {
    const { MSG91_AUTH_KEY: key, MSG91_TEMPLATE_ID: template } = process.env;
    if (!key || !template) throw new Error('MSG91 is not configured');
    const url = `https://control.msg91.com/api/v5/otp?${new URLSearchParams({ template_id: template, mobile: phone.replace('+', ''), authkey: key, otp: code })}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10000) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.type === 'error') throw new Error(`SMS failed: ${json.message || res.status}`);
    return;
  }
  if (provider === 'console') {
    if (production()) throw new Error('SMS is not configured (set SMS_PROVIDER)');
    console.log(`[sms] OTP for ${phone}: ${code}`);
    return;
  }
  throw new Error(`Unknown SMS_PROVIDER "${provider}"`);
}
