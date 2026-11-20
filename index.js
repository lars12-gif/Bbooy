
import makeWASocket, {
  Browsers,
  DisconnectReason,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';

import pino from 'pino';

// إعدادات المالك
const OWNER_NUMBER = String(
  process.env.OWNER_NUMBER || '15879975734'
).replace(/\D/g, '');

const LOG_LEVEL = process.env.LOG_LEVEL || 'warn';

const logger = pino({ level: LOG_LEVEL });

if (!/^\d{7,16}$/.test(OWNER_NUMBER)) {
  throw new Error('OWNER_NUMBER must include country code and digits only.');
}

// التخزين المؤقت
let savedContact = null;
let savedMessage = null;

let waitingForContact = false;
let waitingForMessage = false;

let processingGroups = new Set();

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function getContactPhone(vcard) {
  const match = vcard?.match(/TEL[^:]*:(.*)/i);
  return match?.[1]?.replace(/\D/g, '') || null;
}

function getContactName(contact) {
  const match = contact?.vcard?.match(/FN[^:]*:(.*)/i);
  return match?.[1]?.trim() ||
    contact?.displayName ||
    'جهة اتصال';
}

async function startBot() {
  const { state, saveCreds } =
    await useMultiFileAuthState('./auth_info');

  const sock = makeWASocket({
    auth: state,
    logger,
    browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  // كود الاقتران
  if (!state.creds.registered) {
    await sleep(2000);

    const code = await sock.requestPairingCode(OWNER_NUMBER);

    console.log('\n==============================');
    console.log('PAIRING CODE:', code);
    console.log('==============================\n');
  }

  sock.ev.on('connection.update', async ({
    connection,
    lastDisconnect
  }) => {
    if (connection === 'open') {
      console.log('Bot connected successfully!');
    }

    if (connection === 'close') {
      const status =
        lastDisconnect?.error?.output?.statusCode;

      if (status !== DisconnectReason.loggedOut) {
        console.log('Connection closed. Reconnecting...');
        startBot();
      } else {
        console.log('Logged out. Delete auth_info and pair again.');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        if (!msg.message || msg.key.fromMe !== true) continue;

        const jid = msg.key.remoteJid;

        if (!jid) continue;

        const isGroup = jid.endsWith('@g.us');

        // نتأكد أن الرسالة من حساب البوت نفسه
        const ownJid = sock.user?.id;

        if (!ownJid) continue;

        const ownNumber = ownJid.split(':')[0].split('@')[0];

        if (ownNumber !== OWNER_NUMBER) continue;

        const content = msg.message;

        const text =
          content.conversation ||
          content.extendedTextMessage?.text ||
          '';

        
// أوامر تحديد البيانات من الخاص أو أي قروب
if (text.trim() === '!تحديد_جهة') {
  waitingForContact = true;
  waitingForMessage = false;
  continue;
}

if (text.trim() === '!تحديد_رسالة') {
  waitingForMessage = true;
  waitingForContact = false;
  continue;
}

// استقبال بطاقة جهة الاتصال
if (waitingForContact && content.contactMessage) {
  const contact = content.contactMessage;

  savedContact = {
    vcard: contact.vcard,
    name: getContactName(contact),
    phone: getContactPhone(contact.vcard)
  };

  waitingForContact = false;
  continue;
}

// استقبال رسالة الشرح
if (waitingForMessage && text.trim()) {
  savedMessage = text.trim();
  waitingForMessage = false;
  continue;
}


        // تنفيذ الأمر داخل القروب
        if (text.trim() !== '!نتح') continue;

        if (processingGroups.has(jid)) continue;

        processingGroups.add(jid);

        try {
          if (!savedContact || !savedMessage) {
            await sock.sendMessage(jid, {
              text: 'لم يتم تحديد جهة الاتصال ورسالة الشرح بعد.'
            });
            continue;
          }

          const contact = { ...savedContact };
          const explanation = savedMessage;

          // إرسال رسالة الشرح
          await sock.sendMessage(jid, {
            text: explanation
          });

          await sleep(1000);

          // إرسال بطاقة جهة الاتصال
          await sock.sendMessage(jid, {
            contacts: {
              displayName: contact.name,
              contacts: [{
                displayName: contact.name,
                vcard: contact.vcard
              }]
            }
          });

          // التحقق من رقم الهاتف
          if (!contact.phone) {
            await sock.sendMessage(
              `${OWNER_NUMBER}@s.whatsapp.net`,
              {
                text:
                  'تعذر إضافة جهة الاتصال.\n' +
                  'لم أتمكن من استخراج رقم الهاتف من البطاقة.'
              }
            );
            continue;
          }

          const participant =
            `${contact.phone}@s.whatsapp.net`;

          let success = false;
          let lastError = 'سبب غير معروف';

          // خمس محاولات
          for (let attempt = 1; attempt <= 5; attempt++) {
            try {
              console.log(
                `Add attempt ${attempt}/5: ${contact.name}`
              );

              const result =
                await sock.groupParticipantsUpdate(
                  jid,
                  [participant],
                  'add'
                );

              const item = result?.[0];

              const status = String(item?.status || '');

              if (status === '200') {
                success = true;
                break;
              }

              lastError =
                item?.content?.toString() ||
                `WhatsApp status: ${status || 'unknown'}`;

              // إذا كان الشخص عضواً بالفعل نوقف المحاولات
              if (
                status === '409' ||
                status === '403'
              ) {
                break;
              }

            } catch (error) {
              lastError =
                error?.message || String(error);
            }

            if (attempt < 5) {
              await sleep(3000);
            }
          }

          // إشعار المالك عند الفشل
          if (!success) {
            await sock.sendMessage(
              `${OWNER_NUMBER}@s.whatsapp.net`,
              {
                text:
                  '❌ فشلت إضافة جهة الاتصال بعد المحاولات.\n\n' +
                  `الاسم: ${contact.name}\n` +
                  `الرقم: ${contact.phone}\n` +
                  `القروب: ${jid}\n` +
                  `السبب الأخير: ${lastError}`
              }
            );
          }

        } finally {
          processingGroups.delete(jid);
        }

      } catch (error) {
        logger.error(error, 'Message processing error');
      }
    }
  });
}

startBot().catch(error => {
  logger.error(error, 'Bot startup error');
});
