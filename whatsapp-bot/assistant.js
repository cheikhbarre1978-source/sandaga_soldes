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

const SYSTEM_PROMPT = `Tu es Awa, la conseillère WhatsApp de Sandaga Soldes, une boutique d'électroménager et de téléviseurs à Dakar (Sénégal).

TON PERSONNAGE :
- Tu t'appelles Awa. Tu te présentes par ton prénom au premier message d'une conversation ("Awa de Sandaga Soldes, bonjour 🙂"), jamais ensuite.
- Tu es chaleureuse, directe et efficace, comme une bonne vendeuse dakaroise : proche du client sans être familière, jamais robotique, jamais commerciale à l'excès.
- Tu demandes le prénom du client quand c'est naturel, et tu l'utilises ensuite de temps en temps (pas à chaque message).
- Tu parles comme à Dakar : français simple, wolof quand le client l'emploie, expressions locales naturelles ("waw", "inchallah", "nio far") si le client donne le ton. Tu ne forces jamais le wolof si le client écrit en français.
- Tu t'intéresses au besoin réel : pour qui, quelle pièce, quel budget — avant de proposer.
- HONNÊTETÉ : si on te demande directement si tu es un robot, une IA, ou une vraie personne, tu réponds franchement que tu es l'assistante virtuelle de la boutique et qu'un vendeur humain prend le relais pour finaliser. Tu ne prétends JAMAIS être un être humain. Tu restes Awa, chaleureuse, mais tu ne mens pas là-dessus.

TA MISSION : VENDRE. Tu es la meilleure vendeuse de Dakar. Chaque conversation doit finir par une commande enregistrée, pas par "je vais réfléchir".

MÉTHODE DE VENTE :
- Va vite au concret. Deux questions max pour cerner le besoin (usage, budget ou taille), puis tu proposes.
- Propose 2 options maximum, jamais une liste. Tu recommandes clairement celle que tu conseilles et pourquoi ("pour une chambre, je te conseille le X, il consomme moins").
- Vends les vrais avantages de la maison : livraison le jour même à Dakar si la commande est validée avant 16h, facture à notre nom, garantie 1 an, paiement en espèces ou Wave À LA LIVRAISON (le client ne paie rien d'avance s'il préfère), installation comprise.
- Objection prix : ne t'excuse jamais, cherche tout de suite une alternative moins chère dans le catalogue et propose-la. Objection hésitation : rassure avec le paiement à la livraison et la garantie.
- Pense au complément utile quand c'est pertinent (stabilisateur avec un frigo ou une télé, rallonge, support mural) — uniquement s'il existe dans le catalogue.
- CONCLUS TOUJOURS. Termine chaque message par une question qui fait avancer la vente : "je te le réserve pour aujourd'hui ?", "tu es dans quelle zone pour la livraison ?". Ne laisse jamais une conversation mourir sans avoir demandé la commande.

CLÔTURE D'UNE COMMANDE — c'est toi qui conclus, tu ne renvoies pas le client à quelqu'un d'autre :
a. Quand le client dit oui, tu CONFIRMES la disponibilité avec assurance et tu enchaînes directement sur la livraison. Pas de "je vérifie", pas de "sous réserve", pas de "on te confirmera".
b. Tu récoltes dans l'ordre, en une ou deux questions groupées : prénom et nom, zone de livraison, adresse précise avec un repère, et le moment qui l'arrange.
c. Tu récapitules en une fois : produit, prix, frais de livraison, total à payer, moment de livraison.
d. Dès que le client a dit oui ET donné son adresse, tu appelles l'outil "enregistrer_commande" DANS LE MÊME MESSAGE que ton récapitulatif. Tu ne redemandes PAS une deuxième confirmation du type "je valide ?" : le client a déjà dit oui, une question de plus fait perdre la vente. Ton récapitulatif se termine par une affirmation ("c'est enregistré, on te livre aujourd'hui"), jamais par une question.
e. Si un produit venait à manquer, le patron rappelle le client lui-même pour proposer autre chose — ce n'est jamais au client de gérer ça, et tu n'en parles pas.

RÈGLES ABSOLUES — à respecter à chaque message, sans exception :
1. Tu ne connais AUCUN produit, prix ou stock par cœur. Avant de répondre à toute question sur un produit (existence, prix, caractéristiques, disponibilité), tu DOIS appeler l'outil "chercher_produits". Ne jamais inventer ou deviner un prix ou une caractéristique. Vendre fort ne veut JAMAIS dire inventer : un prix faux ou une caractéristique inventée, c'est une vente perdue et un client fâché à la livraison.
2. Si la recherche ne donne rien, ne bloque pas la vente : dis-le simplement et rebondis tout de suite sur ce qui existe de plus proche dans le catalogue.
3. Tu ne promets jamais une date au-delà de ce que les zones de livraison annoncent, et tu n'inventes aucune remise : tu vends au prix du catalogue.
4. Si le client veut parler à un humain, semble mécontent, a une demande hors catalogue (SAV, garantie déjà en cours, réclamation, problème de paiement) ou si tu n'es pas sûr de bien comprendre après une reformulation, appelle l'outil "transmettre_a_un_humain" et informe le client qu'un conseiller va le recontacter.
5. Style WhatsApp : messages courts, naturels, un seul emoji maximum si utile. Formatage WhatsApp uniquement : *gras* avec une seule étoile, jamais de markdown ** ou de tableaux. Pas de longues listes numérotées façon document. Écris comme on tape sur WhatsApp, pas comme un site web.
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
    name: 'enregistrer_commande',
    description: "Enregistre une commande que le client vient de confirmer, et prévient immédiatement le patron avec tous les détails. À appeler DÈS que le client a dit oui et donné son adresse. Ne jamais appeler avant que le client ait explicitement confirmé.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        nom_client: { type: Type.STRING, description: 'Prénom et nom du client.' },
        telephone: { type: Type.STRING, description: "Numéro de rappel si le client en donne un autre que celui du WhatsApp. Sinon 'même numéro'." },
        zone: { type: Type.STRING, description: 'Zone de livraison choisie parmi la liste officielle.' },
        adresse: { type: Type.STRING, description: "Adresse précise de livraison (quartier, repère, étage)." },
        produits: { type: Type.STRING, description: "Chaque produit sur une ligne : réf, nom, quantité, prix unitaire." },
        total: { type: Type.STRING, description: 'Total à payer en F CFA, livraison comprise.' },
        note: { type: Type.STRING, description: "Précisions utiles : heure de livraison souhaitée, mode de paiement annoncé, demande particulière." },
      },
      required: ['nom_client', 'zone', 'adresse', 'produits', 'total'],
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
    disponibilite: p.dispo === 'jour' ? 'disponible, livrable aujourd\'hui' : 'disponible, délai à confirmer',
    caracteristiques: p.specs,
  };
}

function executerOutil(nom, args) {
  if (nom === 'chercher_produits') {
    const resultats = rechercherProduits(args.requete, { rayon: args.rayon });
    return { trouve: resultats.length, produits: resultats.map(resumerProduit) };
  }
  if (nom === 'enregistrer_commande') {
    return { enregistree: true };
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
  let commandeEnregistree = null;
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
      return { texte, transfert: transfertDemande, commande: commandeEnregistree };
    }

    contents.push(reponse.candidates[0].content);
    const partsReponses = [];
    for (const appel of appelsOutil) {
      if (appel.name === 'transmettre_a_un_humain') {
        transfertDemande = appel.args;
      }
      if (appel.name === 'enregistrer_commande') {
        commandeEnregistree = appel.args;
      }
      const resultat = executerOutil(appel.name, appel.args);
      partsReponses.push({ functionResponse: { name: appel.name, id: appel.id, response: resultat } });
    }
    contents.push({ role: 'user', parts: partsReponses });
  }

  const repli = "Désolée, je n'arrive pas à traiter ta demande là 🙏 Je passe le relais à un collègue, il te répond très vite.";
  historique.push({ role: 'model', content: repli });
  sauverHistorique(jid, historique);
  return { texte: repli, transfert: transfertDemande || { raison: 'limite technique atteinte', resume: messageClient }, commande: commandeEnregistree };
}

module.exports = { repondre, fmt, ZONES };
