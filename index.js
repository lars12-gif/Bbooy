
import makeWASocket, {
  Browsers,
  DisconnectReason,
  initAuthCreds,
  BufferJSON
} from '@whiskeysockets/baileys';

import pino from 'pino';
import fs from 'node:fs/promises';

// ==========================================
// SETTINGS
// ==========================================

const OWNER_NUMBER = String(
  process.env.OWNER_NUMBER || '9647703270534'
).replace(/\D/g, '');

const LOG_LEVEL = process.env.LOG_LEVEL || 'warn';
const AUTH_FILE = './auth_state.json';

const logger = pino({ level: LOG_LEVEL });

if (!/^\d{7,16}$/.test(OWNER_NUMBER)) {
  throw new Error('OWNER_NUMBER must include country code and digits only.');
}

// ==========================================
// TEMPORARY DATA
// ==========================================

let savedContact = null;
let savedMessage = null;

let waitingForContact = false;
let waitingForMessage = false;

let waitingChat = null;

const processingGroups = new Set();
const seenMessages = new Map();

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// SINGLE FILE AUTHENTICATION
// ==========================================

async function createAuthState() {
  let data = {};

  try {
    const raw = await fs.readFile(AUTH_FILE, 'utf8');
    data = JSON.parse(raw, BufferJSON.reviver);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const creds = data.creds || initAuthCreds();
  const keysMap = new Map(Object.entries(data.keys || {}));

  let saveQueue = Promise.resolve();

  function saveState() {
    const snapshot = {
      creds,
      keys: Object.fromEntries(keysMap)
    };

    const write = async () => {
      const raw = JSON.stringify(snapshot, BufferJSON.replacer, 2);
      const tempFile = `${AUTH_FILE}.tmp`;

      await fs.writeFile(tempFile, raw);
      await fs.rename(tempFile, AUTH_FILE);
    };

    saveQueue = saveQueue.then(write, write);
    return saveQueue;
  }

  const keys = {
    async get(type, ids) {
      const result = {};

      for (const id of ids) {
        const value = keysMap.get(`${type}:${id}`);

        if (value !== undefined) {
          result[id] = value;
        }
      }

      return result;
    },

    async set(data) {
      for (const [type, entries] of Object.entries(data || {})) {
        for (const [id, value] of Object.entries(entries || {})) {
          const key = `${type}:${id}`;

          if (value === null || value === undefined) {
            keysMap.delete(key);
          } else {
            keysMap.set(key, value);
          }
        }
      }

      await saveState();
    }
  };

  return {
    state: { creds, keys },

    async saveCreds(update) {
      Object.assign(creds, update);
      await saveState();
    }
  };
}

// ==========================================
// CONTACT HELPERS
// ==========================================

function getContactPhone(vcard) {
  const match = vcard?.match(/TEL[^:]*:(.*)/i);

  return match?.[1]?.trim().replace(/\D/g, '') || null;
}

function getContactName(contact) {
  const match = contact?.vcard?.match(/FN[^:]*:(.*)/i);

  return (
    match?.[1]?.trim() ||
    contact?.displayName ||
    'جهة اتصال'
  );
}

function getContactMessage(message) {
  if (message.contactMessage) {
    return message.contactMessage;
  }

  if (message.contactsArrayMessage?.contacts?.length) {
    const contact = message.contactsArrayMessage.contacts[0];

    return {
      vcard: contact.vcard,
      displayName: contact.displayName
    };
  }

  return null;
}

function extractText(message) {
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    ''
  );
}

// ==========================================
// MESSAGE DUPLICATE PROTECTION
// ==========================================

function rememberMessageOnce(message) {
  const id = message.key?.id;

  if (!id) return true;

  const now = Date.now();

  for (const [key, time] of seenMessages) {
    if (now - time > 5 * 60 * 1000) {
      seenMessages.delete(key);
    } else {
      break;
    }
  }

  const jid = message.key.remoteJid;
  const messageKey = `${jid}:${id}`;

  if (seenMessages.has(messageKey)) return false;

  seenMessages.set(messageKey, now);

  if (seenMessages.size > 10000) {
    const oldest = seenMessages.keys().next().value;
    if (oldest) seenMessages.delete(oldest);
  }

  return true;
}

// ==========================================
// CONNECTION MANAGEMENT
// ==========================================

let currentSocket = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let startupInProgress = false;
let shuttingDown = false;
let socketGeneration = 0;

let authManager = null;

function getStatusCode(error) {
  return (
    error?.output?.statusCode ??
    error?.statusCode ??
    null
  );
}

function scheduleReconnect(reason, customDelay) {
  if (shuttingDown || reconnectTimer) return;

  const baseDelay = Math.min(
    60000,
    2000 * (2 ** Math.min(reconnectAttempt, 5))
  );

  const delay = customDelay ?? baseDelay;

  reconnectAttempt++;

  console.log(
    `[BOT] Reconnecting in ${delay}ms (${reason})`
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startBot();
  }, delay);
}

// ==========================================
// PAIRING CODE
// ==========================================

async function requestPairingCode(sock, generation) {
  if (authManager.state.creds.registered) return;

  await sleep(1500);

  if (
    shuttingDown ||
    generation !== socketGeneration ||
    currentSocket !== sock ||
    authManager.state.creds.registered
  ) return;

  try {
    const code = await sock.requestPairingCode(OWNER_NUMBER);

    console.log('\n================================');
    console.log('WHATSAPP PAIRING CODE:', code);
    console.log('================================\n');

  } catch (error) {
    logger.error(
      { name: error?.name },
      'Pairing code request failed'
    );
  }
}

// ==========================================
// GROUP EXECUTION
// ==========================================

async function executeGroup(sock, jid) {
  if (processingGroups.has(jid)) return;

  processingGroups.add(jid);

  try {
    if (!savedContact || !savedMessage) {
      await sock.sendMessage(jid, {
        text: '❌ لم يتم تحديد جهة الاتصال ورسالة الشرح بعد.'
      });
      return;
    }

    const contact = { ...savedContact };
    const explanation = savedMessage;

    await sock.sendMessage(jid, {
      text: 'نداء البطابيط'
    });

    // Send explanation
    await sock.sendMessage(jid, {
      text: explanation
    });

    await sleep(700);

    // Send contact card
    await sock.sendMessage(jid, {
      contacts: {
        displayName: contact.name,
        contacts: [{
          displayName: contact.name,
          vcard: contact.vcard
        }]
      }
    });

    if (!contact.phone) {
      await sock.sendMessage(
        `${OWNER_NUMBER}@s.whatsapp.net`,
        {
          text:
            '❌ تعذر استخراج رقم الهاتف من بطاقة جهة الاتصال.'
        }
      );
      return;
    }

    const participant = `${contact.phone}@s.whatsapp.net`;

    let success = false;
    let alreadyMember = false;
    let lastError = 'سبب غير معروف';

    // Five attempts
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        console.log(
          `[BOT] Add attempt ${attempt}/5`
        );

        const result = await sock.groupParticipantsUpdate(
          jid,
          [participant],
          'add'
        );

        const item = result?.[0];
        const status = String(item?.status ?? '');

        if (status === '200' || status === '201') {
          success = true;
          break;
        }

        if (status === '409') {
          alreadyMember = true;
          break;
        }

        lastError =
          item?.message ||
          item?.content?.toString?.() ||
          `WhatsApp status: ${status || 'unknown'}`;

        // Permanent or permission-related errors
        if (
          ['401', '403', '406', '411'].includes(status)
        ) {
          break;
        }

      } catch (error) {
        lastError = error?.message || String(error);

        // A closed socket is not an invitation to keep
        // issuing requests on a dead connection.
        if (!currentSocket || sock !== currentSocket) {
          break;
        }
      }

      if (attempt < 5) {
        await sleep(2500);
      }
    }

    if (success) {
      await sock.sendMessage(jid, {
        text: '✅ تمت إضافة جهة الاتصال بنجاح.'
      });

    } else if (alreadyMember) {
      await sock.sendMessage(jid, {
        text: 'ℹ️ جهة الاتصال موجودة بالفعل في المجموعة.'
      });

    } else {
      await sock.sendMessage(
        `${OWNER_NUMBER}@s.whatsapp.net`,
        {
          text:
            '❌ فشلت إضافة جهة الاتصال.\n\n' +
            `الاسم: ${contact.name}\n` +
            `الرقم: ${contact.phone}\n` +
            `القروب: ${jid}\n` +
            `آخر خطأ: ${lastError}`
        }
      );
    }

  } catch (error) {
    logger.error(
      { name: error?.name || 'Error' },
      'Group operation failed'
    );

    // Report unexpected errors without crashing the bot.
    try {
      await sock.sendMessage(
        `${OWNER_NUMBER}@s.whatsapp.net`,
        {
          text: '⚠️ حدث خطأ أثناء تنفيذ العملية. البوت سيواصل العمل.'
        }
      );
    } catch {}
  } finally {
    processingGroups.delete(jid);
  }
}

// ==========================================
// MESSAGE HANDLER
// ==========================================

async function handleMessage(sock, msg) {
  if (!msg?.message || msg.key?.fromMe !== true) return;
  if (!rememberMessageOnce(msg)) return;

  const jid = msg.key.remoteJid;

  if (!jid || jid === 'status@broadcast') return;

  const isGroup = jid.endsWith('@g.us');

  const ownJid = sock.user?.id;

  if (!ownJid) return;

  const ownNumber = ownJid.split(':')[0].split('@')[0];

  if (ownNumber !== OWNER_NUMBER) return;

  const content = msg.message;
  const text = extractText(content).trim();

  // Private or group owner controls
  if (text === '!تحديد_جهة') {
    waitingForContact = true;
    waitingForMessage = false;
    waitingChat = jid;

    await sock.sendMessage(jid, {
      text: '📱 تم تفعيل تحديد جهة الاتصال.\nأرسل بطاقة جهة الاتصال الآن.'
    });

    return;
  }

  if (text === '!تحديد_رسالة') {
    waitingForMessage = true;
    waitingForContact = false;
    waitingChat = jid;

    await sock.sendMessage(jid, {
      text: '📝 تم تفعيل تحديد رسالة الشرح.\nأرسل الرسالة الآن.'
    });

    return;
  }

  // Capture contact
  const contactMessage = getContactMessage(content);

  if (waitingForContact && contactMessage?.vcard) {
    savedContact = {
      vcard: contactMessage.vcard,
      name: getContactName(contactMessage),
      phone: getContactPhone(contactMessage.vcard)
    };

    waitingForContact = false;

    const replyJid = waitingChat || jid;
    waitingChat = null;

    await sock.sendMessage(replyJid, {
      text:
        `✅ تم حفظ جهة الاتصال مؤقتاً.\n` +
        `الاسم: ${savedContact.name}\n` +
        `الرقم: ${savedContact.phone || 'لم يتم التعرف عليه'}`
    });

    return;
  }

  // Capture explanation
  if (waitingForMessage && text) {
    savedMessage = text;

    waitingForMessage = false;

    const replyJid = waitingChat || jid;
    waitingChat = null;

    await sock.sendMessage(replyJid, {
      text: '✅ تم حفظ رسالة الشرح مؤقتاً بنجاح.'
    });

    return;
  }

  // Group execution only
  if (!isGroup || text !== '؟بطبط') return;

  await executeGroup(sock, jid);
}

// ==========================================
// START BOT
// ==========================================

async function startBot() {
  if (shuttingDown || startupInProgress || currentSocket) return;

  startupInProgress = true;

  try {
    if (!authManager) {
      authManager = await createAuthState();
    }

    const generation = ++socketGeneration;

    const sock = makeWASocket({
      auth: authManager.state,
      logger,
      browser: Browsers.ubuntu('Chrome'),
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      generateHighQualityLinkPreview: false,
      keepAliveIntervalMs: 20000,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 30000
    });

    currentSocket = sock;

    sock.ev.on('creds.update', async update => {
      try {
        await authManager.saveCreds(update);
      } catch (error) {
        logger.error(
          { name: error?.name },
          'Authentication save failed'
        );
      }
    });

    sock.ev.on('messages.upsert', event => {
      if (event?.type !== 'notify') return;

      for (const msg of event.messages || []) {
        // Handle independently so a slow group operation
        // does not block incoming control commands.
        void handleMessage(sock, msg).catch(error => {
          logger.error(
            { name: error?.name || 'Error' },
            'Message handler failed'
          );
        });
      }
    });

    sock.ev.on('connection.update', async update => {
      if (
        generation !== socketGeneration ||
        sock !== currentSocket
      ) return;

      const { connection, lastDisconnect } = update;

      if (connection === 'open') {
        reconnectAttempt = 0;
        console.log('[BOT] WhatsApp connected successfully.');
        return;
      }

      if (connection !== 'close') return;

      const status = getStatusCode(lastDisconnect?.error);

      console.log('[BOT] Connection closed. Status:', status);

      if (currentSocket === sock) {
        currentSocket = null;
      }

      // A revoked device session needs manual relinking.
      if (status === DisconnectReason.loggedOut) {
        console.log(
          '[BOT] Session logged out or device removed.'
        );

        console.log(
          '[BOT] Session file was preserved. Re-linking may be required.'
        );

        return;
      }

      // WhatsApp server restart
      if (status === DisconnectReason.restartRequired) {
        scheduleReconnect('restart-required', 1200);
        return;
      }

      // All other temporary connection failures
      scheduleReconnect(`connection-${status || 'unknown'}`);
    });

    // Pairing code
    if (!authManager.state.creds.registered) {
      void requestPairingCode(sock, generation);
    }

  } catch (error) {
    logger.error(
      { name: error?.name || 'Error' },
      'Startup failed'
    );

    scheduleReconnect('startup-failed');

  } finally {
    startupInProgress = false;
  }
}

// ==========================================
// SHUTDOWN
// ==========================================

async function shutdown(signal) {
  if (shuttingDown) return;

  shuttingDown = true;

  console.log(`[BOT] Shutting down: ${signal}`);

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const sock = currentSocket;
  currentSocket = null;

  try {
    sock?.end?.(new Error('Process shutdown'));
  } catch {}

  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

process.on('unhandledRejection', error => {
  logger.error(
    { name: error?.name || 'Error' },
    'Unhandled rejection'
  );
});

process.on('uncaughtException', error => {
  logger.fatal(
    { name: error?.name || 'Error' },
    'Uncaught exception'
  );

  // Do not pretend the process is healthy after an
  // uncaught exception. Let the hosting supervisor restart it.
  process.exit(1);
});

// ==========================================
// RUN
// ==========================================

console.log('[BOT] Starting contact assistant...');

await startBot();
