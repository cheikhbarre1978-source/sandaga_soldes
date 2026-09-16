// Cerveau du bot : appelle Gemini (Google) avec deux outils (chercher_produits,
// transmettre_a_un_humain). Le modèle n'a JAMAIS le catalogue en mémoire —
// il doit systématiquement appeler l'outil de recherche avant d'annoncer un
// prix ou une disponibilité. C'est ce qui garantit qu'on ne confirme jamais
// une dispo sans vérifier.
const fs = require('fs');
const path = require('path');
const { GoogleGenAI, Type } = require('@google/genai');
const { rechercherProduits } = require('./catalog');

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODELE = 'gemini-flash-lite-latest';

const ZONES = [
  { nom: 'Plateau / Médina', frais: 3000, delai: "aujourd'hui" },
  { nom: 'Grand Dakar / Point E / Mermoz', frais: 4000, delai: "aujourd'hui" },
  { nom: 'Parcelles / Pikine / Guédiawaye', frais: 5000, delai: "aujourd'hui" },
  { nom: 'Keur Massar / Malika', frais: 7000, delai: "aujourd'hui" },
  { nom: 'Rufisque / Bargny', frais: 10000, delai: 'sous 24h' },
  { nom: 'Thiès / Mbour', frais: 20000, delai: 'sous 48h' },
];

function fmt(n) {
  return Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ');
}

const ZONES_TEXTE = ZONES.map(z => `- ${z.nom} : ${fmt(z.frais)} F CFA, livré ${z.delai}`).join('\n');

const SYSTEM_PROMPT = `Tu es l'assistant WhatsApp de Sandaga Soldes, une boutique d'électroménager et de téléviseurs à Dakar (Sénégal).

RÈGLES ABSOLUES — à respecter à chaque message, sans exception :
1. Tu ne connais AUCUN produit, prix ou stock par cœur. Avant de répondre à toute question sur un produit (existence, prix, caractéristiques, disponibilité), tu DOIS appeler l'outil "chercher_produits". Ne jamais inventer ou deviner un prix ou une caractéristique.
2. Si la recherche ne donne rien, dis-le honnêtement au client et propose une reformulation ou une alternative trouvée dans le catalogue. Ne dis jamais "oui c'est disponible" sans résultat de recherche à l'appui.
3. Tu ne confirmes JAMAIS une vente ou un stock final toi-même — même si l'outil renvoie "dispo: jour". Le stock réel est vérifié par un humain avant chaque livraison. Termine toujours une proposition de commande par une phrase du type "on te confirme la disponibilité exacte avant la livraison".
4. Si le client veut parler à un humain, semble mécontent, a une demande hors catalogue (SAV, garantie déjà en cours, réclamation, problème de paiement) ou si tu n'es pas sûr de bien comprendre après une reformulation, appelle l'outil "transmettre_a_un_humain" et informe le client qu'un conseiller va le recontacter.
5. Style WhatsApp : messages courts, naturels, un seul emoji maximum si utile. Formatage WhatsApp uniquement : *gras* avec une seule étoile, jamais de markdown ** ou de tableaux. Pas de longues listes numérotées façon document.
6. Le client peut écrire en français, en wolof, ou un mélange des deux — réponds dans la même langue/registre que lui, en restant naturel. Si tu ne comprends vraiment pas un message (ex. note vocale mal transcrite), demande poliment de reformuler plutôt que de deviner.
7. Prix toujours en F CFA. Voici les zones de livraison et leurs frais (données fixes, pas besoin de les chercher) :
${ZONES_TEXTE}
8. Tu ne gères ni paiement ni encaissement toi-même : le client paie un acompte Wave à la commande (recommandé) ou solde en espèces/Wave à la livraison — rappelle-le si le client demande comment payer.
9. Reste concis. Une réponse WhatsApp fait 2 à 5 lignes, pas un roman.`;

const OUTILS = [
  {
    name: 'chercher_produits',
    description: "Cherche dans le vrai catalogue Sandaga Soldes. À utiliser AVANT toute réponse sur un produit, un prix ou une disponibilité. Renvoie les produits qui correspondent (ou une liste vide si rien ne correspond).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        requete: { type: Type.STRING, description: "Termes de recherche en français (ex: 'frigo 200 litres', 'climatiseur 12000 btu', 'machine a laver samsung')." },
        rayon: { type: Type.STRING, description: "Optionnel. Un parmi : froid, lavage, cuisson, clim, ventilation, petit, entretien, tv." },
      },
      required: ['requete'],
    },
  },
  {
    name: 'transmettre_a_un_humain',
    description: "Transmet la conversation à un vendeur humain de Sandaga Soldes. À utiliser si le client le demande, semble frustré, a une demande hors catalogue, ou si tu ne comprends pas malgré une reformulation.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        raison: { type: Type.STRING, description: 'Pourquoi la conversation est transmise (courte phrase).' },
        resume: { type: Type.STRING, description: "Résumé de la demande du client, pour que le vendeur n'ait pas à tout relire." },
      },
      required: ['raison', 'resume'],
    },
  },
];

function resumerProduit(p) {
  return {
    ref: p.ref,
    marque: p.marque,
    nom: p.nom,
    prix_fcfa: p.prix,
    capacite: p.cap,
    disponibilite: p.dispo === 'jour' ? 'en stock, livrable aujourd\'hui (à reconfirmer)' : 'sur commande, environ 5 jours',
    caracteristiques: p.specs,
  };
}

function executerOutil(nom, args) {
  if (nom === 'chercher_produits') {
    const resultats = rechercherProduits(args.requete, { rayon: args.rayon });
    return { trouve: resultats.length, produits: resultats.map(resumerProduit) };
  }
  if (nom === 'transmettre_a_un_humain') {
    return { transmis: true };
  }
  return { erreur: 'outil inconnu' };
}

// ---- Persistance simple des conversations (survit à un redémarrage) ----
const DOSSIER_CONVERSATIONS = path.join(__dirname, 'conversations');
fs.mkdirSync(DOSSIER_CONVERSATIONS, { recursive: true });

function fichierConversation(jid) {
  return path.join(DOSSIER_CONVERSATIONS, jid.replace(/[^a-zA-Z0-9]/g, '_') + '.json');
}

function chargerHistorique(jid) {
  try {
    return JSON.parse(fs.readFileSync(fichierConversation(jid), 'utf8'));
  } catch {
    return [];
  }
}

function sauverHistorique(jid, historique) {
  // Garde les 30 derniers messages pour ne pas laisser grossir le fichier ni le coût des appels.
  const tronque = historique.slice(-30);
  fs.writeFileSync(fichierConversation(jid), JSON.stringify(tronque, null, 2));
}

// Un client peut envoyer deux messages WhatsApp coup sur coup (deux événements
// séparés) : sans verrou, les deux appels à repondre() liraient le même historique
// de départ et le second à finir écraserait la réponse du premier. Une file
// d'attente par numéro sérialise les appels pour CE client, sans ralentir les autres.
const filesAttenteParJid = new Map();

/**
 * Traite un message entrant et renvoie la réponse texte à envoyer, plus une
 * éventuelle demande de transfert humain.
 */
function repondre(jid, messageClient) {
  const precedente = filesAttenteParJid.get(jid) || Promise.resolve();
  const tache = precedente.then(() => repondreSequentiel(jid, messageClient), () => repondreSequentiel(jid, messageClient));
  const suite = tache.catch(() => {}); // une erreur sur ce message ne doit pas bloquer les suivants
  filesAttenteParJid.set(jid, suite);
  suite.finally(() => { if (filesAttenteParJid.get(jid) === suite) filesAttenteParJid.delete(jid); });
  return tache;
}

async function repondreSequentiel(jid, messageClient) {
  const historique = chargerHistorique(jid);
  historique.push({ role: 'user', content: messageClient });

  let transfertDemande = null;
  let tours = 0;
  let contents = historique.map(m => ({ role: m.role, parts: [{ text: m.content }] }));

  while (tours < 4) {
    tours++;
    const reponse = await genai.models.generateContent({
      model: MODELE,
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ functionDeclarations: OUTILS }],
        maxOutputTokens: 700,
      },
    });

    const appelsOutil = reponse.functionCalls || [];

    if (!appelsOutil.length) {
      const texte = (reponse.text || '').trim();
      historique.push({ role: 'model', content: texte });
      sauverHistorique(jid, historique);
      return { texte, transfert: transfertDemande };
    }

    contents.push(reponse.candidates[0].content);
    const partsReponses = [];
    for (const appel of appelsOutil) {
      if (appel.name === 'transmettre_a_un_humain') {
        transfertDemande = appel.args;
      }
      const resultat = executerOutil(appel.name, appel.args);
      partsReponses.push({ functionResponse: { name: appel.name, id: appel.id, response: resultat } });
    }
    contents.push({ role: 'user', parts: partsReponses });
  }

  const repli = "Désolé, je n'arrive pas à traiter ta demande là, je transmets directement à un conseiller.";
  historique.push({ role: 'model', content: repli });
  sauverHistorique(jid, historique);
  return { texte: repli, transfert: transfertDemande || { raison: 'limite technique atteinte', resume: messageClient } };
}

module.exports = { repondre, fmt, ZONES };
