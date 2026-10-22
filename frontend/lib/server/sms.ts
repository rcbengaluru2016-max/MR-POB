const twilioConfig = () => ({
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  fromNumber: process.env.TWILIO_FROM_NUMBER,
});

export function isSmsConfigured() {
  const { accountSid, authToken, fromNumber } = twilioConfig();
  return Boolean(accountSid && authToken && fromNumber);
}

export async function sendCustomerActivationCode(mobile: string, code: string) {
  const { accountSid, authToken, fromNumber } = twilioConfig();
  if (!accountSid || !authToken || !fromNumber) return false;
  const phone = mobile.startsWith("+") ? mobile : `+91${mobile}`;
  const body = new URLSearchParams({
    To: phone,
    From: fromNumber,
    Body: `Your Zenex International account verification code is ${code}. It expires in 5 minutes. Do not share this code.`,
  });
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}
