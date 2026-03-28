import type { Env } from '../types';
import { ALERT_CONFIG } from '../config';

export async function sendEmail(
  env: Env,
  subject: string,
  body: string,
): Promise<void> {
  if (!env.RESEND_API_KEY || !env.EMAIL_TO) {
    console.log('[Email skipped] Missing config');
    console.log(`Subject: ${subject}`);
    console.log(`Body: ${body}`);
    return;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from: `${ALERT_CONFIG.fromName} <${ALERT_CONFIG.fromEmail}>`,
        to:   env.EMAIL_TO,
        subject,
        text: body,
      }),
    });

    if (!response.ok) {
      console.error('Failed to send email:', await response.text());
    } else {
      const result = await response.json();
      console.log('Email sent successfully:', result.id);
    }
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

export async function sendUpdateNotification(
  env: Env,
  sourceName: string,
  previousValue: string | undefined,
  currentValue: string,
  url?: string,
): Promise<void> {
  const subject = `[Watcher] ${sourceName} 更新`;
  const body = [
    '发现新版本/变化',
    '',
    previousValue ? `上一版本: ${previousValue}` : '首次检查',
    `最新版本: ${currentValue}`,
    '',
    url ? `查看详情: ${url}` : '',
  ].join('\n');

  await sendEmail(env, subject, body);
}

export async function sendFailureNotification(
  env: Env,
  sourceName: string,
  error: string,
): Promise<void> {
  const subject = `[Watcher] ${sourceName} 检查失败`;
  const body = [
    '检查数据源时发生错误:',
    '',
    error,
    '',
    '请检查配置或数据源状态。',
  ].join('\n');

  await sendEmail(env, subject, body);
}
