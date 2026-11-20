
import makeWASocket, {
  Browsers,
  DisconnectReason,
  initAuthCreds,
  jidNormalizedUser
} from '@whiskeysockets/baileys';

import pino from 'pino';

const OWNER_NUMBER = String(
  process.env.OWNER_NUMBER || '15879975734'
).replace(/\D/g, '');

const LOG_LEVEL = process.env.LOG_LEVEL || 'warn';
const logger = pino({ level: LOG_LEVEL });

if (!/^\d{7,16}$/.test(OWNER_NUMBER)) {
  throw new Error('OWNER_NUMBER must include country code and digits only.');
}

// بيانات مؤقتة في الذاكرة
let savedContact = null;
let savedMessage = null;

let waitingForContact = false;
let waitingForMessage = false;

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function getPhoneFromContact(contact) {
  const phone =
    contact?.vcard?.match(/TEL[^:]*:([+\d\s().-]+)/i)?.[1] ||
    contact?.vcard?.match(/TEL[^:]*:(.*)/i)?.[1];

  return phone ? phone.replace(/\D/g, '') : null;
}

function getContactName(contact) {
  const match = contact?.vcard?.match(/FN[^:]*:(.*)/i);
  return match?.[1]?.trim() || 'جهة اتصال';
}

async function startBot() {
  // استبدل هذا الجزء بآلية المصادقة الموجودة في مشروعك
  // إذا كان لديك نظام حفظ جلسة جاهز، احتفظ به كما هو.

  const { state, saveCreds } =
    await (await import('@whiskeysockets/baileys'))
      .useMultiFileAuthState('./auth_info');

  const sock = makeWASocket({
    auth: state,
    logger,
    browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: true
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;

      if (code !== DisconnectReason.loggedOut) {
        startBot();
      }
    }

    if (connection === 'open') {
      console.log('Bot connected successfully.');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      try {
        if (!msg.message || msg.key.fromMe === false && msg.key.participant) {
          // تجاهل الرسائل المقتبسة أو غير الصادرة من المالك عند الحاجة
        }

        const jid = msg.key.remoteJid;
        const isGroup = jid?.endsWith('@g.us');

        const sender = isGroup
          ? msg.key.participant
          : jid;

        const senderNumber = (sender || '')
          .split('@')[0]
          .replace(/\D/g, '');

        if (senderNumber !== OWNER_NUMBER) continue;

        const content = msg.message;
        const text =
          content.conversation ||
          content.extendedTextMessage?.text ||
          '';

        // لا نستقبل أوامر التحكم إلا من محادثة المالك مع نفسه
        const isPrivate = !isGroup;

        if (isPrivate) {
          if (text === '!تحديد_جهة') {
            waitingForContact = true;
            waitingForMessage = false;
            continue;
          }

          if (text === '!تحديد_رسالة') {
            waitingForMessage = true;
            waitingForContact = false;
            continue;
          }

          if (waitingForContact && content.contactMessage) {
            savedContact = {
              message: content.contactMessage,
              name: content.contactMessage.displayName || 'جهة اتصال',
              phone: getPhoneFromContact(content.contactMessage)
            };

            waitingForContact = false;
            continue;
          }

          if (waitingForMessage && text.trim()) {
            savedMessage = text.trim();
            waitingForMessage = false;
            continue;
          }

          continue;
        }

        // تنفيذ الأمر داخل المجموعة
        if (text.trim() !== '!نتح') continue;

        if (!savedContact || !savedMessage) {
          await sock.sendMessage(jid, {
            text: 'تعذر التنفيذ: حدد جهة الاتصال ورسالة الشرح أولاً.'
          });
          continue;
        }

        const contact = savedContact;
        const explanation = savedMessage;

        await sock.sendMessage(jid, {
          text: explanation
        });

        // إرسال بطاقة جهة الاتصال
        await sock.sendMessage(jid, {
          contacts: {
            displayName: contact.name,
            contacts: [{
              displayName: contact.name,
              vcard: contact.message.vcard
            }]
          }
        });

        const phone = contact.phone;

        if (!phone) {
          await sock.sendMessage(
            `${OWNER_NUMBER}@s.whatsapp.net`,
            { text: 'فشل الإضافة: لم أتمكن من استخراج رقم الهاتف من البطاقة.' }
          );
          continue;
        }

        const participant = `${phone}@s.whatsapp.net`;

        let success = false;
        let lastError = 'لم يتم تحديد السبب';

        // خمس محاولات للإضافة
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            const result = await sock.groupParticipantsUpdate(
              jid,
              [participant],
              'add'
            );

            const status = result?.[0]?.status;

            if (status === '200' || status === 200) {
              success = true;
              break;
            }

            lastError = `نتيجة المحاولة ${attempt}: ${status || 'غير معروفة'}`;

          } catch (error) {
            lastError = error?.message || String(error);
          }

          if (attempt < 5) {
            await sleep(3000);
          }
        }

        if (!success) {
          await sock.sendMessage(
            `${OWNER_NUMBER}@s.whatsapp.net`,
            {
              text:
                `فشلت إضافة جهة الاتصال بعد 5 محاولات.\n` +
                `الاسم: ${contact.name}\n` +
                `القروب: ${jid}\n` +
                `آخر خطأ: ${lastError}`
            }
          );
        }

      } catch (error) {
        logger.error(error, 'Message handling error');
      }
    }
  });
}

startBot().catch(error => {
  logger.error(error);
});
