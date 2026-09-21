import path from 'node:path';

function boolean(value, fallback = false) {
  if (value === undefined || value === '') return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

function publicUrl(value, name, { optional = false } = {}) {
  if (!value && optional) return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL`);
  }
  if (!['https:', 'http:'].includes(parsed.protocol) && !(optional && parsed.protocol === 'mailto:')) {
    throw new Error(`${name} uses an unsupported URL scheme`);
  }
  return parsed.toString();
}

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const sessionSecret = env.SESSION_SECRET || (production ? '' : 'local-development-only-secret-change-me');
  if (sessionSecret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');

  const appBaseUrl = publicUrl(env.APP_BASE_URL || 'http://localhost:3000', 'APP_BASE_URL');
  if (production && !appBaseUrl.startsWith('https://')) {
    throw new Error('APP_BASE_URL must use https in production');
  }

  const smtpFields = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'];
  const smtpConfigured = smtpFields.every((field) => Boolean(env[field]));
  if (smtpFields.some((field) => Boolean(env[field])) && !smtpConfigured) {
    throw new Error('SMTP_HOST, SMTP_USER, SMTP_PASSWORD and SMTP_FROM must be configured together');
  }
  if (production && boolean(env.DEV_RECOVERY_LOG)) {
    throw new Error('DEV_RECOVERY_LOG is local development only');
  }

  return {
    nodeEnv: env.NODE_ENV || 'development',
    production,
    port: Number.parseInt(env.PORT || '3000', 10),
    databasePath: path.resolve(env.DATABASE_PATH || 'data/legacy.sqlite'),
    appBaseUrl,
    sessionSecret,
    trustProxy: boolean(env.TRUST_PROXY),
    publicRemovalUrl: publicUrl(env.PUBLIC_REMOVAL_URL, 'PUBLIC_REMOVAL_URL', { optional: true }),
    devRecoveryLog: !production && boolean(env.DEV_RECOVERY_LOG),
    smtp: smtpConfigured
      ? {
          host: env.SMTP_HOST,
          port: Number.parseInt(env.SMTP_PORT || '587', 10),
          secure: boolean(env.SMTP_SECURE),
          auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
          from: env.SMTP_FROM,
        }
      : null,
  };
}

