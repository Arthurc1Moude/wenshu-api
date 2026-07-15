let smsProvider = null;

export async function initSms() {
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

  if (twilioSid && twilioToken && twilioPhone) {
    smsProvider = { type: 'twilio', sid: twilioSid, token: twilioToken, phone: twilioPhone };
    console.log('📱 SMS provider: Twilio configured');
    return;
  }

  const aliyunKey = process.env.ALIYUN_ACCESS_KEY_ID;
  const aliyunSecret = process.env.ALIYUN_ACCESS_KEY_SECRET;
  const aliyunSign = process.env.ALIYUN_SMS_SIGN_NAME;
  if (aliyunKey && aliyunSecret && aliyunSign) {
    smsProvider = { type: 'aliyun', key: aliyunKey, secret: aliyunSecret, sign: aliyunSign };
    console.log('📱 SMS provider: Aliyun configured');
    return;
  }

  console.log('⚠️  No SMS provider configured - verification codes will be logged to console (dev mode)');
  smsProvider = { type: 'console' };
}

export async function sendSmsCode(phone, code) {
  if (!smsProvider) await initSms();

  const message = `【文书APP】您的验证码是${code}，5分钟内有效，请勿泄露。`;

  if (smsProvider.type === 'console') {
    console.log(`\n📱 [DEV SMS] To: ${phone}, Code: ${code}\n`);
    return { success: true, provider: 'console' };
  }

  if (smsProvider.type === 'twilio') {
    try {
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${smsProvider.sid}/Messages.json`;
      const auth = Buffer.from(`${smsProvider.sid}:${smsProvider.token}`).toString('base64');
      const body = new URLSearchParams({
        To: phone.startsWith('+') ? phone : `+86${phone}`,
        From: smsProvider.phone,
        Body: message,
      });
      const res = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });
      if (res.ok) return { success: true, provider: 'twilio' };
      const errText = await res.text();
      console.error('Twilio send failed:', errText);
      return { success: false, error: '短信发送失败' };
    } catch (e) {
      console.error('Twilio error:', e.message);
      return { success: false, error: '短信服务异常' };
    }
  }

  if (smsProvider.type === 'aliyun') {
    console.log('Aliyun SMS not fully implemented yet, using console mode');
    console.log(`\n📱 [DEV SMS] To: ${phone}, Code: ${code}\n`);
    return { success: true, provider: 'console' };
  }

  return { success: false, error: '未配置短信服务' };
}

export function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
