// Point d'entrée du bot. Se connecte à WhatsApp comme le ferait WhatsApp Web
// (scan d'un QR code une seule fois), écoute les messages entrants, fait
// répondre l'assistant (assistant.js) et transmet à toi (OWNER_WHATSAPP_NUMBER)
// les conversations qui doivent passer par un humain.
require('dotenv').config();
const path = require('path');
const http = require('http');
const https = require('https');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
} = require('@whiskeysockets/baileys');
const { repondre, fmt } = require('./assistant');

if (!process.env.GEMINI_API_KEY) {
  console.error("ERREUR : GEMINI_API_KEY manquante. Copie .env.example en .env et remplis-le.");
  process.exit(1);
}

const DOSSIER_SESSION = path.join(__dirname, 'session');
const NUMERO_JUMELAGE = process.env.BOT_WHATSAPP_NUMBER?.replace(/\D/g, '');
const OWNER_JID = process.env.OWNER_WHATSAPP_NUMBER
  ? process.env.OWNER_WHATSAPP_NUMBER.replace(/\D/g, '') + '@s.whatsapp.net'
  : null;

// État de connexion WhatsApp, et référence vers la connexion active — utilisés
// à la fois par /health (surveillance externe) et par l'auto-surveillance
// ci-dessous (alerte le propriétaire directement sur WhatsApp).
let connecteAWhatsapp = false;
let sockActif = null;
let deconnecteDepuis = null;
let siteHorsLigne = false;
let echecsConsecutifsSite = 0;
let surveillanceDemarree = false;

const PORT_SANTE = Number(process.env.HEALTH_PORT) || 3001;
http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(connecteAWhatsapp ? 200 : 503, { 'Content-Type': 'text/plain' });
    res.end(connecteAWhatsapp ? 'OK' : 'DOWN');
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(PORT_SANTE, '0.0.0.0', () => {
  console.log(`Endpoint de santé sur le port ${PORT_SANTE} (/health).`);
});

function alerterProprietaire(texte) {
  if (!OWNER_JID || !sockActif) return;
  sockActif.sendMessage(OWNER_JID, { text: texte }).catch(() => {});
}

function verifierSite() {
  const requete = https.get('https://sandagasoldes.com', { timeout: 10000 }, (res) => {
    res.resume();
    if (res.statusCode >= 200 && res.statusCode < 400) {
      if (siteHorsLigne) {
        siteHorsLigne = false;
        alerterProprietaire('✅ *Sandaga Soldes* — le site est de nouveau en ligne (sandagasoldes.com).');
      }
      echecsConsecutifsSite = 0;
    } else {
      signalerEchecSite(`code HTTP ${res.statusCode}`);
    }
  });
  requete.on('timeout', () => { requete.destroy(); signalerEchecSite('délai dépassé'); });
  requete.on('error', (e) => signalerEchecSite(e.message));
}

function signalerEchecSite(raison) {
  echecsConsecutifsSite++;
  // 2 échecs de suite (~10 min) avant d'alerter, pour éviter une fausse alerte
  // sur un simple ralentissement passager.
  if (echecsConsecutifsSite >= 2 && !siteHorsLigne) {
    siteHorsLigne = true;
    alerterProprietaire(`⚠️ *Sandaga Soldes* — le site sandagasoldes.com semble injoignable (${raison}). Vérifiez dès que possible.`);
  }
}

function demarrerAutoSurveillance() {
  if (surveillanceDemarree) return;
  surveillanceDemarree = true;
  setInterval(verifierSite, 5 * 60 * 1000);
}

async function demarrer() {
  const { state, saveCreds } = await useMultiFileAuthState(DOSSIER_SESSION);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }), // mets 'debug' si tu dois diagnostiquer un souci de connexion
    printQRInTerminal: false,
  });
  sockActif = sock;

  sock.ev.on('creds.update', saveCreds);

  // Jumelage par code à taper plutôt que par QR code : plus simple quand on n'a
  // pas le terminal sous les yeux (le QR, lui, expire au bout de ~30 secondes).
  if (NUMERO_JUMELAGE && !sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(NUMERO_JUMELAGE);
        console.log(`\n=== CODE DE JUMELAGE : ${code} ===`);
        console.log('Sur le téléphone : WhatsApp > Appareils connectés > Connecter un appareil');
        console.log('> "Associer avec le numéro de téléphone", puis tape ce code.\n');
      } catch (e) {
        console.log('Impossible de générer le code de jumelage :', e.message);
      }
    }, 4000);
  }

  sock.ev.on('connection.update', (maj) => {
    const { connection, lastDisconnect, qr } = maj;
    if (qr) {
      console.log('\n=== Scanne ce QR code avec WhatsApp sur le téléphone du 78 880 08 08 ===');
      console.log('(WhatsApp > Paramètres > Appareils connectés > Connecter un appareil)\n');
      qrcode.generate(qr, { small: true });
      QRCode.toFile(path.join(__dirname, 'qrcode.png'), qr, { width: 400 }).catch(() => {});
    }
    if (connection === 'close') {
      connecteAWhatsapp = false;
      if (!deconnecteDepuis) deconnecteDepuis = Date.now();
      const codeErreur = lastDisconnect?.error?.output?.statusCode;
      const doitReconnecter = codeErreur !== DisconnectReason.loggedOut;
      console.log('Connexion fermée. Code :', codeErreur, '-', lastDisconnect?.error?.message);
      console.log(doitReconnecter ? 'Nouvelle tentative dans 5s...' : 'Déconnecté (relance et rescanne le QR).');
      // Sans ce délai, un refus côté WhatsApp déclenche une boucle de reconnexion
      // immédiate qui peut faire signaler le numéro.
      if (doitReconnecter) setTimeout(demarrer, 5000);
    } else if (connection === 'open') {
      connecteAWhatsapp = true;
      console.log('✅ Bot connecté à WhatsApp et prêt à répondre.');
      demarrerAutoSurveillance();
      if (deconnecteDepuis) {
        const minutes = Math.round((Date.now() - deconnecteDepuis) / 60000);
        // On ignore les micro-coupures de quelques secondes (reconnexions
        // normales) pour ne pas envoyer une alerte à chaque redémarrage.
        if (minutes >= 1) {
          alerterProprietaire(`🔄 *Awa* a été déconnectée puis reconnectée (coupure d'environ ${minutes} min).`);
        }
        deconnecteDepuis = null;
      }
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
        text: "Je ne peux pas encore écouter les messages vocaux 🙏 Pouvez-vous m'écrire votre demande en texte ? Un conseiller peut aussi vous écouter si besoin, dites-le-moi.",
      });
    }
    return;
  }
  if (!texte.trim()) return;

  await sock.sendPresenceUpdate('composing', jid);
  const { texte: reponseTexte, transfert, commande, photos } = await repondre(jid, texte);
  if (reponseTexte) await sock.sendMessage(jid, { text: reponseTexte });
  await envoyerPhotos(sock, jid, photos || []);

  // WhatsApp masque souvent le numéro (identifiant "@lid") : on n'affiche un lien wa.me
  // que si on connaît le vrai numéro, sinon on renvoie vers la discussion de la boutique.
  const pn = [jid, msg.key.remoteJidAlt].find(j => j && j.endsWith('@s.whatsapp.net'));
  const lienWhatsApp = pn ? `wa.me/${pn.split('@')[0]}` : 'numéro masqué par WhatsApp, répondre depuis la discussion sur le WhatsApp de la boutique';

  if (commande && OWNER_JID) {
    await sock.sendMessage(OWNER_JID, {
      text:
        `🛒 *NOUVELLE COMMANDE*\n\n` +
        `*Client :* ${commande.nom_client || '—'}\n` +
        `*Téléphone :* ${commande.telephone || '—'}\n` +
        `*WhatsApp :* ${lienWhatsApp}\n\n` +
        `*Livraison :* ${commande.zone || '—'}\n` +
        `*Adresse :* ${commande.adresse || '—'}\n\n` +
        `*Produits :*\n${commande.produits || '—'}\n\n` +
        `*TOTAL : ${commande.total || '—'}*\n` +
        (commande.note ? `\n_${commande.note}_` : ''),
    });
  }

  if (transfert && OWNER_JID) {
    await sock.sendMessage(OWNER_JID, {
      text:
        `🔔 *Conversation à reprendre*\n` +
        (transfert.telephone ? `Téléphone : ${transfert.telephone}\n` : '') +
        `WhatsApp : ${lienWhatsApp}\n` +
        `Raison : ${transfert.raison || '—'}\n` +
        `Résumé : ${transfert.resume || '—'}`,
    });
  }
}

// Une fiche par produit proposé : photo + numéro, nom, prix, disponibilité, atout, lien.
// Prix, disponibilité et lien viennent du catalogue, jamais du texte de l'IA.
// Si la même photo vient d'être envoyée à ce client (moins de 15 min), on renvoie la fiche sans photo.
const DELAI_RENVOI_PHOTO_MS = 15 * 60 * 1000;
const photosEnvoyees = new Map(); // "jid|ref" -> horodatage
async function envoyerPhotos(sock, jid, cartes) {
  for (const c of cartes) {
    const cle = jid + '|' + c.ref;
    const legende =
      `${c.numero} *${c.titre}*\n` +
      `*${fmt(c.prix)} F CFA* · ${c.dispo}\n` +
      (c.atout ? `✓ ${c.atout}\n` : '') +
      `🔗 ${c.lien}`;
    const recente = Date.now() - (photosEnvoyees.get(cle) || 0) < DELAI_RENVOI_PHOTO_MS;
    try {
      if (!c.photo || recente) throw new Error('fiche sans photo');
      await sock.sendMessage(jid, { image: { url: c.photo }, caption: legende });
      photosEnvoyees.set(cle, Date.now());
    } catch (e) {
      await sock.sendMessage(jid, { text: legende }).catch(() => {});
    }
  }
  if (photosEnvoyees.size > 5000) {
    const limite = Date.now() - DELAI_RENVOI_PHOTO_MS;
    for (const [k, t] of photosEnvoyees) if (t < limite) photosEnvoyees.delete(k);
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
