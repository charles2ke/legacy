import nodemailer from 'nodemailer';

export function createRecoveryMailer(config, logger = console) {
  const transport = config.smtp ? nodemailer.createTransport(config.smtp) : null;

  return {
    configured: Boolean(transport || config.devRecoveryLog),
    async sendPasswordReset(email, token) {
      const resetUrl = new URL('/reset.html', config.appBaseUrl);
      resetUrl.searchParams.set('token', token);
      if (transport) {
        await transport.sendMail({
          from: config.smtp.from,
          to: email,
          subject: 'Reset your Legacy password',
          text: `Use this single-use link within 30 minutes to reset your password:\n\n${resetUrl}\n\nIf you did not request this, ignore this message.`,
        });
        return;
      }
      if (config.devRecoveryLog) {
        logger.info(`[local recovery only] ${email}: ${resetUrl}`);
        return;
      }
      throw new Error('Password recovery delivery is not configured');
    },
  };
}

