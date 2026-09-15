// Point d'entrée du bot. Se connecte à WhatsApp comme le ferait WhatsApp Web
// (scan d'un QR code une seule fois), écoute les messages entrants, fait
// répondre l'assistant (assistant.js) et transmet à toi (OWNER_WHATSAPP_NUMBER)
// les conversations qui doivent passer par un humain.
require('dotenv').config();
const path = require('path');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
} = require('@whiskeysockets/baileys');
const { repondre, fmt } = require('./assistant');

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ERREUR : ANTHROPIC_API_KEY manquante. Copie .env.example en .env et remplis-le.");
  process.exit(1);
}

const DOSSIER_SESSION = path.join(__dirname, 'session');
const OWNER_JID = process.env.OWNER_WHATSAPP_NUMBER
  ? process.env.OWNER_WHATSAPP_NUMBER.replace(/\D/g, '') + '@s.whatsapp.net'
  : null;

async function demarrer() {
  const { state, saveCreds } = await useMultiFileAuthState(DOSSIER_SESSION);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }), // mets 'debug' si tu dois diagnostiquer un souci de connexion
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (maj) => {
    const { connection, lastDisconnect, qr } = maj;
    if (qr) {
      console.log('\n=== Scanne ce QR code avec WhatsApp sur le téléphone du 78 880 08 08 ===');
      console.log('(WhatsApp > Paramètres > Appareils connectés > Connecter un appareil)\n');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'close') {
      const codeErreur = lastDisconnect?.error?.output?.statusCode;
      const doitReconnecter = codeErreur !== DisconnectReason.loggedOut;
      console.log('Connexion fermée.', doitReconnecter ? 'Nouvelle tentative...' : 'Déconnecté (relance et rescanne le QR).');
      if (doitReconnecter) demarrer();
    } else if (connection === 'open') {
      console.log('✅ Bot connecté à WhatsApp et prêt à répondre.');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        await traiterMessage(sock, msg);
      } catch (e) {
        console.error('Erreur en traitant un message :', e);
      }
    }
  });
}

async function traiterMessage(sock, msg) {
  const jid = msg.key.remoteJid;
  if (!jid || jid.endsWith('@g.us')) return; // on ignore les groupes
  if (msg.key.fromMe) return;
  if (jid === 'status@broadcast') return;

  const texte = extraireTexte(msg);
  if (texte === null) {
    // Message vocal, image, etc. — phase 1 : on le dit honnêtement au client.
    if (msg.message?.audioMessage) {
      await sock.sendMessage(jid, {
        text: "Je ne peux pas encore écouter les messages vocaux 🙏 Peux-tu m'écrire ta demande en texte ? Un conseiller peut aussi t'écouter si besoin, dis-le-moi.",
      });
    }
    return;
  }
  if (!texte.trim()) return;

  await sock.sendPresenceUpdate('composing', jid);
  const { texte: reponseTexte, transfert } = await repondre(jid, texte);
  await sock.sendMessage(jid, { text: reponseTexte });

  if (transfert && OWNER_JID) {
    const numeroClient = jid.split('@')[0];
    await sock.sendMessage(OWNER_JID, {
      text:
        `🔔 *Conversation à reprendre*\n` +
        `Client : wa.me/${numeroClient}\n` +
        `Raison : ${transfert.raison || '—'}\n` +
        `Résumé : ${transfert.resume || '—'}`,
    });
  }
}

function extraireTexte(msg) {
  const m = msg.message;
  if (!m) return null;
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  return null;
}

demarrer().catch(e => {
  console.error('Impossible de démarrer le bot :', e);
  process.exit(1);
});
