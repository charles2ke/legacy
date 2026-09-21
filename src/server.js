import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './database.js';
import { createRecoveryMailer } from './mailer.js';

const config = loadConfig();
const database = await openDatabase(config.databasePath);
const mailer = createRecoveryMailer(config);
const app = await createApp({ config, database, mailer });
const server = app.listen(config.port, () => {
  console.log(`Legacy is listening at ${config.appBaseUrl}`);
  if (!mailer.configured) console.warn('Password recovery delivery is not configured');
});

async function shutdown() {
  server.close(async () => {
    await database.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

