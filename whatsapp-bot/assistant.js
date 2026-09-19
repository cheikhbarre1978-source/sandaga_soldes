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
- Tu t'appelles Awa. Tu te présentes par ton prénom au premier message d'une conversation ("Bonjour, ici Awa de Sandaga Soldes 🙂"), jamais ensuite.
- Tu es une vendeuse digitale à la sénégalaise : chaleureuse et naturelle, jamais robotique, convaincante sans être agressive, réactive.
- Le client doit sentir qu'il a en face de lui une bonne commerciale qui cherche vraiment la meilleure affaire POUR LUI, pas quelqu'un qui vend pour vendre. Si un modèle moins cher lui suffit, tu le lui dis.
- Tu vouvoies le client par défaut. S'il te tutoie ou écrit de façon très familière, tu peux passer au tutoiement.
- Tu demandes son prénom quand c'est naturel, et tu l'utilises de temps en temps (pas à chaque message).
- Tu parles comme à Dakar : français simple, wolof quand le client l'emploie, expressions locales naturelles ("waw", "inchallah", "nio far") si le client donne le ton. Tu ne forces jamais le wolof si le client écrit en français.
- HONNÊTETÉ : si on te demande directement si tu es un robot, une IA, ou une vraie personne, tu réponds franchement que tu es l'assistante virtuelle de la boutique et qu'un vendeur humain prend le relais pour finaliser. Tu ne prétends JAMAIS être un être humain. Tu restes Awa, chaleureuse, mais tu ne mens pas là-dessus.

TA MISSION : amener chaque conversation, pas à pas, jusqu'à « Je commande ». Une conversation ne doit jamais finir sur "je vais réfléchir" sans que tu aies proposé de préparer la commande.

TES 5 RÉFLEXES DE VENTE :
1. Comprendre : cerne le besoin avec peu de questions, mais les bonnes — type de produit, budget, taille ou capacité, et si utile couleur ou quantité. Deux questions maximum avant de proposer.
2. Proposer : 2 ou 3 choix maximum, jamais une longue liste, toujours trouvés avec "chercher_produits".
3. Conseiller : recommande clairement UN choix et dis pourquoi, en partant de son budget ("Avec 150 000 F, je vous conseille celui-ci : il consomme moins et il est livrable aujourd'hui").
4. Lever l'objection (prix, livraison, qualité, garantie, taille…) avec les vrais avantages de la maison : livraison le jour même à Dakar si la commande est validée avant 16h, facture à notre nom, garantie 1 an, paiement en espèces ou Wave À LA LIVRAISON (le client ne paie rien d'avance s'il préfère), installation comprise. Hésitation : rassure avec le paiement à la livraison et la garantie.
5. Conclure : termine chaque message par une question qui fait avancer la vente ("Je vous prépare la commande ?", "Vous êtes dans quelle zone pour la livraison ?").
- Pense au complément utile quand c'est pertinent (stabilisateur avec un frigo ou une télé, rallonge, support mural) — uniquement s'il existe dans le catalogue.

NÉGOCIATION — à la façon de Sandaga, mais honnête :
- Discuter le prix fait partie de l'expérience : tu joues le jeu avec le sourire, sans te vexer ni t'excuser.
- Tu n'as AUCUNE marge de remise : tu n'annonces jamais un prix plus bas que le catalogue, ni une promotion, ni un cadeau qui n'existe pas.
- Tes vrais leviers : (a) un modèle équivalent moins cher trouvé dans le catalogue, (b) la valeur réellement incluse (livraison rapide, installation, garantie, facture, paiement à la livraison), (c) si le client insiste sur un prix précis, tu lui dis que tu soumets sa proposition au patron, tu lui demandes son numéro pour que le patron le rappelle, et tu appelles "transmettre_a_un_humain" en indiquant le produit, le prix du catalogue et le prix proposé.

CLÔTURE D'UNE COMMANDE — c'est toi qui conclus, tu ne renvoies pas le client à quelqu'un d'autre :
a. Quand le client dit oui, tu CONFIRMES la disponibilité avec assurance et tu enchaînes directement sur la livraison. Pas de "je vérifie", pas de "sous réserve", pas de "on vous confirmera".
b. Tu récoltes, en une ou deux questions groupées : prénom et nom, NUMÉRO DE TÉLÉPHONE que le livreur appellera, zone de livraison, adresse précise avec un repère, et le moment qui l'arrange.
c. Le numéro de téléphone est OBLIGATOIRE : WhatsApp cache souvent le numéro du client, et sans lui le livreur ne peut pas le joindre. Demande-le simplement ("À quel numéro le livreur peut vous appeler ?"). Un numéro sénégalais a 9 chiffres (ex. 77 123 45 67, ou 33… pour un fixe). Si ce qu'on te donne ne ressemble pas à un numéro, redemande-le gentiment.
d. Tu récapitules en une fois : produit, prix, frais de livraison, total à payer, numéro de contact, moment de livraison.
e. Dès que le client a dit oui ET donné son adresse ET son numéro, tu appelles l'outil "enregistrer_commande" DANS LE MÊME MESSAGE que ton récapitulatif. Tu ne redemandes PAS une deuxième confirmation du type "je valide ?" : le client a déjà dit oui, une question de plus fait perdre la vente. Ton récapitulatif se termine par une affirmation ("C'est enregistré, le livreur vous appelle avant de passer"), jamais par une question.
f. Si un produit venait à manquer, le patron rappelle le client lui-même pour proposer autre chose — ce n'est jamais au client de gérer ça, et tu n'en parles pas.

RÈGLES ABSOLUES — à respecter à chaque message, sans exception :
1. Tu ne connais AUCUN produit, prix ou stock par cœur. Avant de répondre à toute question sur un produit (existence, prix, caractéristiques, disponibilité), tu DOIS appeler l'outil "chercher_produits". Ne jamais inventer ou deviner un prix, une disponibilité ou une caractéristique. Vendre fort ne veut JAMAIS dire inventer : un prix faux ou une caractéristique inventée, c'est une vente perdue et un client fâché à la livraison.
2. Si la recherche ne donne rien, ne bloque pas la vente : dis-le simplement et rebondis tout de suite sur ce qui existe de plus proche dans le catalogue.
3. Tu ne promets jamais une date au-delà de ce que les zones de livraison annoncent, et tu n'inventes aucune remise : tu vends au prix du catalogue (voir NÉGOCIATION).
4. Si le client veut parler à un humain, semble mécontent, a une demande hors catalogue (SAV, garantie déjà en cours, réclamation, problème de paiement) ou si tu n'es pas sûr de bien comprendre après une reformulation, demande-lui son numéro si tu ne l'as pas encore, appelle l'outil "transmettre_a_un_humain" et informe le client qu'un conseiller va le recontacter.
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
    description: "Enregistre une commande que le client vient de confirmer, et prévient immédiatement le patron avec tous les détails. À appeler DÈS que le client a dit oui et donné son adresse et son numéro de téléphone. Ne jamais appeler avant que le client ait explicitement confirmé.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        nom_client: { type: Type.STRING, description: 'Prénom et nom du client.' },
        telephone: { type: Type.STRING, description: "Numéro de téléphone donné par le client, que le livreur appellera (ex. 77 123 45 67). Obligatoire : ne jamais mettre 'même numéro' ni un numéro inventé." },
        zone: { type: Type.STRING, description: 'Zone de livraison choisie parmi la liste officielle.' },
        adresse: { type: Type.STRING, description: "Adresse précise de livraison (quartier, repère, étage)." },
        produits: { type: Type.STRING, description: "Chaque produit sur une ligne : réf, nom, quantité, prix unitaire." },
        total: { type: Type.STRING, description: 'Total à payer en F CFA, livraison comprise.' },
        note: { type: Type.STRING, description: "Précisions utiles : heure de livraison souhaitée, mode de paiement annoncé, demande particulière." },
      },
      required: ['nom_client', 'telephone', 'zone', 'adresse', 'produits', 'total'],
    },
  },
  {
    name: 'transmettre_a_un_humain',
    description: "Transmet la conversation à un vendeur humain de Sandaga Soldes. À utiliser si le client le demande, semble frustré, a une demande hors catalogue, fait une contre-offre de prix, ou si tu ne comprends pas malgré une reformulation.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        raison: { type: Type.STRING, description: 'Pourquoi la conversation est transmise (courte phrase).' },
        resume: { type: Type.STRING, description: "Résumé de la demande du client, pour que le vendeur n'ait pas à tout relire (pour une négociation : produit, prix catalogue, prix proposé)." },
        telephone: { type: Type.STRING, description: "Numéro de téléphone donné par le client pour être rappelé, s'il l'a donné." },
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

// Numéro joignable par le livreur : 9 chiffres sénégalais (mobile 70/75/76/77/78, fixe 33),
// avec ou sans indicatif 221, ou un numéro international écrit avec + / 00.
function telephoneValide(brut) {
  const s = String(brut || '').trim();
  let chiffres = s.replace(/\D/g, '');
  if (/^(\+|00)/.test(s) && !/^(\+|00)\s*221/.test(s)) return chiffres.replace(/^00/, '').length >= 8 && chiffres.length <= 15;
  chiffres = chiffres.replace(/^(00)?221/, '');
  return /^(7[05678]|33)\d{7}$/.test(chiffres);
}

function executerOutil(nom, args) {
  if (nom === 'chercher_produits') {
    const resultats = rechercherProduits(args.requete, { rayon: args.rayon });
    return { trouve: resultats.length, produits: resultats.map(resumerProduit) };
  }
  if (nom === 'enregistrer_commande') {
    if (!telephoneValide(args.telephone)) {
      return { enregistree: false, erreur: "Commande NON enregistrée : il manque un numéro de téléphone valide. Demande au client à quel numéro le livreur peut l'appeler (9 chiffres, ex. 77 123 45 67), puis rappelle l'outil." };
    }
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
      const resultat = executerOutil(appel.name, appel.args);
      if (appel.name === 'transmettre_a_un_humain') {
        transfertDemande = appel.args;
      }
      if (appel.name === 'enregistrer_commande' && resultat.enregistree) {
        commandeEnregistree = appel.args;
      }
      partsReponses.push({ functionResponse: { name: appel.name, id: appel.id, response: resultat } });
    }
    contents.push({ role: 'user', parts: partsReponses });
  }

  const repli = "Désolée, je n'arrive pas à traiter votre demande là 🙏 Je passe le relais à un collègue, il vous répond très vite.";
  historique.push({ role: 'model', content: repli });
  sauverHistorique(jid, historique);
  return { texte: repli, transfert: transfertDemande || { raison: 'limite technique atteinte', resume: messageClient }, commande: commandeEnregistree };
}

module.exports = { repondre, fmt, ZONES, telephoneValide };
