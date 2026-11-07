// Tests are local-only: secrets are synthetic and network is blocked unless an
// individual test installs its own in-memory fetch mock. Do not load .env files.
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (id, ...args) {
  if (id === 'server-only') return {};
  return originalLoad.call(this, id, ...args);
};
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-not-a-real-service-key';
process.env.SESSION_SECRET = 'test-only-not-a-real-session-secret';
process.env.TELEGRAM_BOT_TOKEN = 'test-only-not-a-real-bot';
process.env.TELEGRAM_ENTRY_CHAT_IDS = 'test-chat';
process.env.CRON_SECRET = 'test-only-cron-secret-0000000000000000';
process.env.GMAIL_RELAY_SECRET = 'test-only-relay-secret-000000000000000';
process.env.GMAIL_RELAY_URL = 'https://script.google.com/macros/s/test-deployment/exec';
delete process.env.ENTRY_EMAIL_ENABLED;
global.fetch = async () => { throw new Error('Network is forbidden in tests'); };
