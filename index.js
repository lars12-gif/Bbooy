
import makeWASocket, {
  Browsers,
  DisconnectReason,
  initAuthCreds
} from '@whiskeysockets/baileys';
import pino from 'pino';

// Change OWNER_NUMBER only if the WhatsApp account linked to this bot changes.
// You may also set OWNER_NUMBER in your hosting environment variables.
const OWNER_NUMBER = String(process.env.OWNER_NUMBER || '15879975734').replace(/\D/g, '');
const LOG_LEVEL = process.env.LOG_LEVEL || 'warn';
const logger = pino({ level: LOG_LEVEL });

if (!/^\d{7,16}$/.test(OWNER_NUMBER)) {
  throw new Error('OWNER_NUMBER must include country code and digits only.');
}

// The full flag dictionary is bundled into this one file; no data files are needed.
const FLAGS = Object.freeze({"🇦🇼":"أروبا","🇦🇫":"أفغانستان","🇦🇴":"أنغولا","🇦🇮":"أنغويلا","🇦🇽":"جزر آلاند","🇦🇱":"ألبانيا","🇦🇩":"أندورا","🇦🇪":"الإمارات العربية المتحدة","🇦🇷":"الأرجنتين","🇦🇲":"أرمينيا","🇦🇸":"ساموا الأمريكية","🇦🇶":"أنتاركتيكا","🇹🇫":"الأقاليم الجنوبية الفرنسية","🇦🇬":"أنتيغوا وبربودا","🇦🇺":"أستراليا","🇦🇹":"النمسا","🇦🇿":"أذربيجان","🇧🇮":"بوروندي","🇧🇪":"بلجيكا","🇧🇯":"بنين","🇧🇶":"هولندا الكاريبية","🇧🇫":"بوركينا فاسو","🇧🇩":"بنغلاديش","🇧🇬":"بلغاريا","🇧🇭":"البحرين","🇧🇸":"جزر البهاما","🇧🇦":"البوسنة والهرسك","🇧🇱":"سان بارتليمي","🇧🇾":"بيلاروس","🇧🇿":"بليز","🇧🇲":"برمودا","🇧🇴":"بوليفيا","🇧🇷":"البرازيل","🇧🇧":"بربادوس","🇧🇳":"بروناي","🇧🇹":"بوتان","🇧🇻":"جزيرة بوفيه","🇧🇼":"بوتسوانا","🇨🇫":"جمهورية أفريقيا الوسطى","🇨🇦":"كندا","🇨🇨":"جزر كوكوس (كيلينغ)","🇨🇭":"سويسرا","🇨🇱":"تشيلي","🇨🇳":"الصين","🇨🇮":"ساحل العاج","🇨🇲":"الكاميرون","🇨🇩":"الكونغو - كينشاسا","🇨🇬":"الكونغو - برازافيل","🇨🇰":"جزر كوك","🇨🇴":"كولومبيا","🇰🇲":"جزر القمر","🇨🇻":"الرأس الأخضر","🇨🇷":"كوستاريكا","🇨🇺":"كوبا","🇨🇼":"كوراساو","🇨🇽":"جزيرة كريسماس","🇰🇾":"جزر كايمان","🇨🇾":"قبرص","🇨🇿":"التشيك","🇩🇪":"ألمانيا","🇩🇯":"جيبوتي","🇩🇲":"دومينيكا","🇩🇰":"الدانمرك","🇩🇴":"جمهورية الدومينيكان","🇩🇿":"الجزائر","🇪🇨":"الإكوادور","🇪🇬":"مصر","🇪🇷":"إريتريا","🇪🇭":"الصحراء الغربية","🇪🇸":"إسبانيا","🇪🇪":"إستونيا","🇪🇹":"إثيوبيا","🇫🇮":"فنلندا","🇫🇯":"فيجي","🇫🇰":"جزر فوكلاند","🇫🇷":"فرنسا","🇫🇴":"جزر فارو","🇫🇲":"ميكرونيزيا","🇬🇦":"الغابون","🇬🇧":"المملكة المتحدة","🇬🇪":"جورجيا","🇬🇬":"غيرنزي","🇬🇭":"غانا","🇬🇮":"جبل طارق","🇬🇳":"غينيا","🇬🇵":"غوادلوب","🇬🇲":"غامبيا","🇬🇼":"غينيا بيساو","🇬🇶":"غينيا الاستوائية","🇬🇷":"اليونان","🇬🇩":"غرينادا","🇬🇱":"غرينلاند","🇬🇹":"غواتيمالا","🇬🇫":"غويانا الفرنسية","🇬🇺":"غوام","🇬🇾":"غيانا","🇭🇰":"هونغ كونغ الصينية (منطقة إدارية خاصة)","🇭🇲":"جزيرة هيرد وجزر ماكدونالد","🇭🇳":"هندوراس","🇭🇷":"كرواتيا","🇭🇹":"هايتي","🇭🇺":"هنغاريا","🇮🇩":"إندونيسيا","🇮🇲":"جزيرة مان","🇮🇳":"الهند","🇮🇴":"الإقليم البريطاني في المحيط الهندي","🇮🇪":"أيرلندا","🇮🇷":"إيران","🇮🇶":"العراق","🇮🇸":"آيسلندا","🇮🇱":"إسرائيل","🇮🇹":"إيطاليا","🇯🇲":"جامايكا","🇯🇪":"جيرسي","🇯🇴":"الأردن","🇯🇵":"اليابان","🇰🇿":"كازاخستان","🇰🇪":"كينيا","🇰🇬":"قيرغيزستان","🇰🇭":"كمبوديا","🇰🇮":"كيريباتي","🇰🇳":"سانت كيتس ونيفيس","🇰🇷":"كوريا الجنوبية","🇰🇼":"الكويت","🇱🇦":"لاوس","🇱🇧":"لبنان","🇱🇷":"ليبيريا","🇱🇾":"ليبيا","🇱🇨":"سانت لوسيا","🇱🇮":"ليختنشتاين","🇱🇰":"سريلانكا","🇱🇸":"ليسوتو","🇱🇹":"ليتوانيا","🇱🇺":"لوكسمبورغ","🇱🇻":"لاتفيا","🇲🇴":"منطقة ماكاو الإدارية الخاصة","🇲🇫":"سان مارتن","🇲🇦":"المغرب","🇲🇨":"موناكو","🇲🇩":"مولدوفا","🇲🇬":"مدغشقر","🇲🇻":"جزر المالديف","🇲🇽":"المكسيك","🇲🇭":"جزر مارشال","🇲🇰":"مقدونيا الشمالية","🇲🇱":"مالي","🇲🇹":"مالطا","🇲🇲":"ميانمار (بورما)","🇲🇪":"الجبل الأسود","🇲🇳":"منغوليا","🇲🇵":"جزر ماريانا الشمالية","🇲🇿":"موزمبيق","🇲🇷":"موريتانيا","🇲🇸":"مونتسرات","🇲🇶":"جزر المارتينيك","🇲🇺":"موريشيوس","🇲🇼":"ملاوي","🇲🇾":"ماليزيا","🇾🇹":"مايوت","🇳🇦":"ناميبيا","🇳🇨":"كاليدونيا الجديدة","🇳🇪":"النيجر","🇳🇫":"جزيرة نورفولك","🇳🇬":"نيجيريا","🇳🇮":"نيكاراغوا","🇳🇺":"نيوي","🇳🇱":"هولندا","🇳🇴":"النرويج","🇳🇵":"نيبال","🇳🇷":"ناورو","🇳🇿":"نيوزيلندا","🇴🇲":"عُمان","🇵🇰":"باكستان","🇵🇦":"بنما","🇵🇳":"جزر بيتكيرن","🇵🇪":"بيرو","🇵🇭":"الفلبين","🇵🇼":"بالاو","🇵🇬":"بابوا غينيا الجديدة","🇵🇱":"بولندا","🇵🇷":"بورتوريكو","🇰🇵":"كوريا الشمالية","🇵🇹":"البرتغال","🇵🇾":"باراغواي","🇵🇸":"الأراضي الفلسطينية","🇵🇫":"بولينيزيا الفرنسية","🇶🇦":"قطر","🇷🇪":"روينيون","🇷🇴":"رومانيا","🇷🇺":"روسيا","🇷🇼":"رواندا","🇸🇦":"المملكة العربية السعودية","🇸🇩":"السودان","🇸🇳":"السنغال","🇸🇬":"سنغافورة","🇬🇸":"جورجيا الجنوبية وجزر ساندويتش الجنوبية","🇸🇭":"سانت هيلينا","🇸🇯":"سفالبارد وجان ماين","🇸🇧":"جزر سليمان","🇸🇱":"سيراليون","🇸🇻":"السلفادور","🇸🇲":"سان مارينو","🇸🇴":"الصومال","🇵🇲":"سان بيير ومكويلون","🇷🇸":"صربيا","🇸🇸":"جنوب السودان","🇸🇹":"ساو تومي وبرينسيبي","🇸🇷":"سورينام","🇸🇰":"سلوفاكيا","🇸🇮":"سلوفينيا","🇸🇪":"السويد","🇸🇿":"إسواتيني","🇸🇽":"سانت مارتن","🇸🇨":"سيشل","🇸🇾":"سوريا","🇹🇨":"جزر توركس وكايكوس","🇹🇩":"تشاد","🇹🇬":"توغو","🇹🇭":"تايلاند","🇹🇯":"طاجيكستان","🇹🇰":"توكيلاو","🇹🇲":"تركمانستان","🇹🇱":"تيمور - ليشتي","🇹🇴":"تونغا","🇹🇹":"ترينيداد وتوباغو","🇹🇳":"تونس","🇹🇷":"تركيا","🇹🇻":"توفالو","🇹🇼":"تايوان","🇹🇿":"تنزانيا","🇺🇬":"أوغندا","🇺🇦":"أوكرانيا","🇺🇲":"جزر الولايات المتحدة النائية","🇺🇾":"أورغواي","🇺🇸":"الولايات المتحدة","🇺🇿":"أوزبكستان","🇻🇦":"الفاتيكان","🇻🇨":"سانت فنسنت وجزر غرينادين","🇻🇪":"فنزويلا","🇻🇬":"جزر فيرجن البريطانية","🇻🇮":"جزر فيرجن الأمريكية","🇻🇳":"فيتنام","🇻🇺":"فانواتو","🇼🇫":"جزر والس وفوتونا","🇼🇸":"ساموا","🇾🇪":"اليمن","🇿🇦":"جنوب أفريقيا","🇿🇲":"زامبيا","🇿🇼":"زيمبابوي","🇽🇰":"كوسوفو"});

// Emoji rounds are answered automatically in every enabled group.
const FRUITS = Object.freeze({
  '🍎':'تفاحة','🍏':'تفاحة خضراء','🍐':'كمثرى','🍊':'برتقالة','🍋':'ليمونة',
  '🍌':'موزة','🍉':'بطيخ','🍇':'عنب','🍓':'فراولة','🫐':'توت أزرق',
  '🍈':'شمام','🍒':'كرز','🍑':'خوخ','🥭':'مانجو','🍍':'أناناس',
  '🥥':'جوز الهند','🥝':'كيوي','🍅':'طماطم','🥑':'أفوكادو'
});

const VEGETABLES = Object.freeze({
  '🥒':'خيار','🥦':'بروكلي','🥬':'خس','🥗':'سلطة خضراء',
  '🥕':'جزر','🌽':'ذرة','🥔':'بطاطا','🍠':'بطاطا حلوة',
  '🍆':'باذنجان','🧄':'ثوم','🧅':'بصل','🫚':'زنجبيل',
  '🫛':'بازلاء','🫑':'فلفل حلو','🌶️':'فلفل حار','🌶':'فلفل حار',
  '🥜':'فول سوداني','🌰':'كستناء','🍄':'فطر','🍄‍🟫':'فطر بني',
  '🫒':'زيتون','🥥':'جوز الهند','🍅':'طماطم',
  '🍥':'كعكة سمك','🫕':'فوندو'
});

const ANIMALS = Object.freeze({
  '🐶':'كلب','🐕':'كلب','🐩':'كلب','🐺':'ذئب','🦊':'ثعلب','🐱':'قط','🐈':'قطة',
  '🦁':'أسد','🐯':'نمر','🐅':'ببر','🐆':'فهد','🐴':'حصان','🦄':'حصان وحيد القرن',
  '🐮':'بقرة','🐄':'بقرة','🐷':'خنزير','🐖':'خنزير','🐸':'ضفدع','🐵':'قرد',
  '🐒':'قرد','🐔':'دجاجة','🐓':'ديك','🐣':'كتكوت','🐤':'كتكوت','🐧':'بطريق',
  '🦆':'بطة','🦅':'نسر','🦉':'بومة','🦇':'خفاش','🐻':'دب','🐼':'باندا',
  '🐨':'كوالا','🐯':'نمر','🐰':'أرنب','🐹':'هامستر','🐭':'فأر','🐍':'أفعى',
  '🐢':'سلحفاة','🐊':'تمساح','🦖':'ديناصور','🦕':'ديناصور','🐬':'دلفين',
  '🐳':'حوت','🐋':'حوت','🦈':'قرش','🐙':'أخطبوط','🦀':'سلطعون','🦐':'روبيان',
  '🦋':'فراشة','🐝':'نحلة','🐞':'دعسوقة','🐜':'نملة','🕷':'عنكبوت','🐪':'جمل',
  '🐫':'جمل','🦒':'زرافة','🐘':'فيل','🦏':'وحيد القرن','🦛':'فرس النهر',
  '🦓':'حمار وحشي','🦍':'غوريلا','🦧':'إنسان الغاب','🐑':'خروف','🐐':'ماعز',
  '🐏':'كبش','🦌':'غزال','🐎':'حصان','🦃':'ديك رومي','🦜':'ببغاء','🦚':'طاووس'
});

const MODES = new Set(['writing', 'breaking', 'reverse', 'flags', 'fruits', 'animals']);
const MODE_LABELS = Object.freeze({ writing: 'الكتابة', breaking: 'التفكيك', reverse: 'العكس', flags: 'الأعلام', fruits: 'الفواكه والخضراوات', animals: 'الحيوانات' });
const OWNER_COMMANDS = new Map([
  ['💜طك', { type: 'enable' }],
  ['🍃شلع', { type: 'disable' }],
  ['*كتابة', { type: 'mode', mode: 'writing' }],
  ['*تفكيك', { type: 'mode', mode: 'breaking' }],
  ['*عكس', { type: 'mode', mode: 'reverse' }],
  ['*أعلام', { type: 'mode', mode: 'flags' }],
  ['*فاكهة', { type: 'mode', mode: 'fruits' }],
  ['*حيوانات', { type: 'mode', mode: 'animals' }]
]);

// Only live group settings are kept in RAM. Nothing is written to disk.
const groupSettings = new Map();
const seenMessages = new Map();
const SEEN_TTL_MS = 5 * 60 * 1000;
const SEEN_LIMIT = 12000;

// Keep the WhatsApp authentication credentials and Signal keys in RAM only.
// This avoids auth-file storms/EMFILE. Restarting Node means pairing again.
function createMemoryAuthState() {
  const signalKeys = new Map();
  const keys = {
    async get(type, ids) {
      const result = {};
      for (const id of ids) {
        const value = signalKeys.get(`${type}:${id}`);
        if (value !== undefined) result[id] = value;
      }
      return result;
    },
    async set(data) {
      for (const [type, entries] of Object.entries(data || {})) {
        for (const [id, value] of Object.entries(entries || {})) {
          const key = `${type}:${id}`;
          if (value === null || value === undefined) signalKeys.delete(key);
          else signalKeys.set(key, value);
        }
      }
    }
  };
  return { creds: initAuthCreds(), keys };
}

let authState = createMemoryAuthState();
let currentSocket = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let socketGeneration = 0;
let startupInProgress = false;
let shuttingDown = false;
let pairingRequestedGeneration = -1;
let messageQueue = Promise.resolve();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const getStatusCode = error => error?.output?.statusCode ?? error?.statusCode ?? null;

function reconnectDelay() {
  const base = Math.min(60000, 1500 * (2 ** Math.min(reconnectAttempt, 6)));
  reconnectAttempt += 1;
  return base + Math.floor(Math.random() * Math.min(900, base * 0.15));
}

function scheduleReconnect(reason, delayMs) {
  if (shuttingDown || reconnectTimer) return;
  const delay = Number.isFinite(delayMs) ? delayMs : reconnectDelay();
  logger.warn({ reason, retryInMs: delay }, 'WhatsApp reconnect scheduled');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void startSocket();
  }, delay);
  // Do not unref this timer: after a 515 close it may be the only live handle.
}

function normalizePhoneJid(jid) {
  if (typeof jid !== 'string' || !jid.endsWith('@s.whatsapp.net')) return null;
  const digits = jid.slice(0, -'@s.whatsapp.net'.length).split(':', 1)[0].replace(/\D/g, '');
  return /^\d{7,16}$/.test(digits) ? digits : null;
}

function isOwnerMessage(message) {
  // The socket is paired using OWNER_NUMBER, so an outgoing group message
  // (fromMe=true) is authored by that linked WhatsApp account. This also
  // handles LID-mode messages where participant may not contain a phone JID.
  if (message?.key?.fromMe === true) return true;

  const key = message?.key || {};
  const candidates = [key.participantAlt, key.participant, message?.participantAlt, message?.participant];
  return candidates.some(jid => normalizePhoneJid(jid) === OWNER_NUMBER);
}

function extractText(message) {
  if (!message || typeof message !== 'object') return null;
  let content = message;
  for (let i = 0; i < 8; i += 1) {
    const wrapped = content.ephemeralMessage?.message
      ?? content.viewOnceMessage?.message
      ?? content.viewOnceMessageV2?.message
      ?? content.viewOnceMessageV2Extension?.message
      ?? content.documentWithCaptionMessage?.message
      ?? content.deviceSentMessage?.message
      ?? content.editedMessage?.message;
    if (!wrapped) break;
    content = wrapped;
  }

  const candidates = [
    content.conversation,
    content.extendedTextMessage?.text,
    content.imageMessage?.caption,
    content.videoMessage?.caption,
    content.documentMessage?.caption,
    content.buttonsResponseMessage?.selectedDisplayText,
    content.buttonsResponseMessage?.selectedButtonId,
    content.listResponseMessage?.title,
    content.listResponseMessage?.singleSelectReply?.selectedRowId,
    content.templateButtonReplyMessage?.selectedDisplayText,
    content.templateButtonReplyMessage?.selectedId
  ];
  return candidates.find(value => typeof value === 'string') ?? null;
}

function graphemes(text) {
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), part => part.segment);
  }
  return Array.from(text);
}

function parseContestText(rawText) {
  if (typeof rawText !== 'string' || rawText.length < 3) return null;
  if (rawText[0] !== '*' || rawText.at(-1) !== '*') return null;
  const inner = rawText.slice(1, -1);
  return inner.length > 0 ? inner : null;
}

function transformText(mode, rawText) {
  const inner = parseContestText(rawText);
  if (inner === null) return null;

  // Ignore long text in writing, breaking and reverse modes.
  // Only up to 3 words are accepted.
  if (['writing', 'breaking', 'reverse'].includes(mode)) {
    const wordCount = inner.trim().split(/\s+/u).filter(Boolean).length;
    if (wordCount > 3) return null;
  }

  switch (mode) {
    case 'writing': return inner;
    case 'breaking': {
      const letters = graphemes(inner);
      const separators = [' ', '  ', '. ', '.  ', ' . ', '  . '];
      return letters.map((letter, index) => index === 0 ? letter : separators[Math.floor(Math.random() * separators.length)] + letter).join('');
    }
    case 'reverse': return graphemes(inner).reverse().join('');
    case 'flags': return FLAGS[inner] ?? null;
    default: return null;
  }
}

function normalizeEmoji(value) {
  return String(value || '').trim().replace(/\uFE0F/g, '');
}

function getQuickAnswer(rawText, mode) {
  const value = normalizeEmoji(rawText);
  if (!value) return null;
  if (mode === 'flags') return FLAGS[value] ?? null;
  if (mode === 'fruits') return FRUITS[value] ?? VEGETABLES[value] ?? null;
  if (mode === 'animals') return ANIMALS[value] ?? null;
  return null;
}

// Faster response timing: short answers are almost immediate.
// Longer questions and answers take a little more time.
function responseDelay(inputText, outputText) {
  const inputLength = graphemes(String(inputText || '')).length;
  const outputLength = graphemes(String(outputText || '')).length;
  const totalLength = inputLength + outputLength;

  return Math.min(1200, 150 + totalLength * 20);
}

function getGroupState(jid) {
  return groupSettings.get(jid) || { enabled: false, mode: null };
}

function rememberMessageOnce(message) {
  const jid = message?.key?.remoteJid;
  const id = message?.key?.id;
  if (!jid || !id) return true;
  const now = Date.now();
  for (const [key, timestamp] of seenMessages) {
    if (now - timestamp > SEEN_TTL_MS) seenMessages.delete(key);
    else break;
  }
  const messageKey = `${jid}:${id}`;
  if (seenMessages.has(messageKey)) return false;
  seenMessages.set(messageKey, now);
  if (seenMessages.size > SEEN_LIMIT) {
    const oldest = seenMessages.keys().next().value;
    if (oldest) seenMessages.delete(oldest);
  }
  return true;
}

async function handleIncomingMessage(sock, message) {
  if (!message?.message || !rememberMessageOnce(message)) return;
  const jid = message.key?.remoteJid;
  if (typeof jid !== 'string' || !jid.endsWith('@g.us')) return;

  const rawText = extractText(message.message);
  const commandText = typeof rawText === 'string' ? rawText.trim() : '';
  const command = OWNER_COMMANDS.get(commandText);

  // Owner commands are intentionally silent and never quoted.
  if (command && isOwnerMessage(message)) {
    const previous = getGroupState(jid);
    if (command.type === 'enable') {
      groupSettings.set(jid, { ...previous, enabled: true });
      logger.info('A group was enabled by its owner');
    } else if (command.type === 'disable') {
      groupSettings.set(jid, { ...previous, enabled: false });
      logger.info('A group was disabled by its owner');
    } else if (command.type === 'mode' && MODES.has(command.mode)) {
      groupSettings.set(jid, { ...previous, mode: command.mode });
      logger.info({ mode: command.mode }, 'A group contest mode was changed');
    }
    return;
  }

  // Never answer the owner's own outgoing messages or expose command-like text.
  if (command || message.key?.fromMe === true) return;

  const state = getGroupState(jid);
  if (!state.enabled) return;

  // Emoji answers are handled only by the matching selected activity.
  const quickAnswer = getQuickAnswer(rawText, state.mode);
  if (quickAnswer) {
    await sleep(responseDelay(rawText, quickAnswer));
    await sock.sendMessage(jid, { text: quickAnswer });
    await sleep(3000);
    return;
  }

  if (!state.mode || state.mode === 'flags') return;
  const output = transformText(state.mode, rawText);
  if (typeof output !== 'string' || output.length === 0) return;

  await sleep(responseDelay(rawText, output));
  await sock.sendMessage(jid, { text: output });
  await sleep(3000);
}

async function requestPairingCode(sock, generation) {
  if (pairingRequestedGeneration === generation || authState.creds.registered) return;
  pairingRequestedGeneration = generation;
  await sleep(1000);
  if (shuttingDown || generation !== socketGeneration || sock !== currentSocket || authState.creds.registered) return;
  try {
    const code = await sock.requestPairingCode(OWNER_NUMBER);
    if (shuttingDown || generation !== socketGeneration || sock !== currentSocket) return;
    console.log('');
    console.log('========== WHATSAPP PAIRING CODE ==========');
    console.log(code);
    console.log('Enter this code on WhatsApp: Linked Devices > Link a Device > Link with phone number instead.');
    console.log('Keep this code and the hosting console private.');
    console.log('===========================================');
    console.log('');
  } catch (error) {
    pairingRequestedGeneration = -1;
    logger.error({ statusCode: getStatusCode(error) }, 'Could not request a WhatsApp pairing code');
    try { sock.end?.(new Error('Pairing code request failed; reconnecting')); } catch {}
    if (currentSocket === sock) currentSocket = null;
    scheduleReconnect('pairing-code-request-failed', 12000);
  }
}

async function startSocket() {
  if (shuttingDown || startupInProgress) return;
  startupInProgress = true;
  try {
    const generation = ++socketGeneration;
    pairingRequestedGeneration = -1;
    const sock = makeWASocket({
      auth: authState,
      browser: Browsers.windows('Chrome'),
      logger,
      markOnlineOnConnect: false,
      emitOwnEvents: true,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      generateHighQualityLinkPreview: false,
      keepAliveIntervalMs: 20000,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 30000
    });
    currentSocket = sock;

    // Credential updates remain in RAM; no session or history files are created.
    sock.ev.on('creds.update', update => Object.assign(authState.creds, update));

    sock.ev.on('messages.upsert', event => {
      // Do not accept placeholder/history-replay events as live commands.
      if (event?.requestId || event?.type !== 'notify') return;
      for (const message of event.messages || []) {
        messageQueue = messageQueue
          .then(() => handleIncomingMessage(sock, message))
          .catch(error => {
            // Never print message text, sender names, numbers, keys or auth data.
            logger.warn({ name: error?.name || 'Error' }, 'Incoming message processing failed');
          });
      }
    });

    sock.ev.on('connection.update', async update => {
      if (generation !== socketGeneration || sock !== currentSocket) return;
      const { connection, lastDisconnect, qr } = update;

      if (qr && !authState.creds.registered) await requestPairingCode(sock, generation);

      if (connection === 'open') {
        reconnectAttempt = 0;
        logger.info('WhatsApp connection opened; live group messages are being monitored');
        return;
      }

      if (connection !== 'close') return;
      const statusCode = getStatusCode(lastDisconnect?.error);
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      logger.warn({ statusCode, loggedOut }, 'WhatsApp connection closed');
      if (currentSocket === sock) currentSocket = null;

      if (loggedOut) {
        // A revoked link needs a fresh in-memory authentication state and a new code.
        authState = createMemoryAuthState();
        reconnectAttempt = 0;
        scheduleReconnect('whatsapp-link-revoked', 5000);
      } else {
        const delay = statusCode === DisconnectReason.restartRequired ? 900 : undefined;
        scheduleReconnect(`connection-closed-${statusCode ?? 'unknown'}`, delay);
      }
    });

  } catch (error) {
    logger.error({ name: error?.name || 'Error' }, 'Could not start WhatsApp connection');
    scheduleReconnect('socket-start-failed');
  } finally {
    startupInProgress = false;
  }
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  const sock = currentSocket;
  currentSocket = null;
  try { sock?.end?.(new Error('Process shutdown')); } catch {}
  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', error => {
  logger.error({ name: error?.name || 'Error' }, 'Unhandled async error');
});

console.log('[BOT] Starting WhatsApp contest bot. Session and group settings are memory-only.');
console.log('[BOT] New live messages are processed in groups only; old chat history is not imported.');
await startSocket();
