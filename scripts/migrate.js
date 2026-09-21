import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/database.js';

const config = loadConfig();
const database = await openDatabase(config.databasePath);
await database.close();
console.log(`Database migrations applied to ${config.databasePath}`);

