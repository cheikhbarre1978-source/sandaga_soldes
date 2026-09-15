# Agent WhatsApp IA — Sandaga Soldes

Répond aux clients sur WhatsApp à partir du **vrai catalogue** (`catalogue.csv`, le même fichier que le site et la console d'administration). Ne confirme jamais un prix ou une disponibilité sans avoir vérifié dans le fichier. Peut transmettre une conversation à toi à tout moment.

> ⚠️ **Important sur le risque** : ce bot se connecte à WhatsApp comme le fait WhatsApp Web (pas l'API officielle Meta). C'est plus rapide à mettre en place mais **contraire aux règles de WhatsApp** — il y a un vrai risque que le numéro soit bloqué si WhatsApp détecte une automatisation. Comme c'est branché sur ton numéro professionnel (78 880 08 08), teste prudemment (peu de messages, sur toi-même d'abord) avant d'en parler à tes clients.

## Ce qu'il sait faire (aujourd'hui)

- Répondre en texte aux questions sur les produits (prix, dispo, caractéristiques), toujours vérifiées dans `catalogue.csv`
- Rappeler les zones de livraison et leurs frais
- Recueillir une demande de commande et **transmettre à toi** pour confirmation (il ne confirme jamais une vente lui-même)
- Transmettre la conversation à toi si le client le demande, semble mécontent, ou si le bot ne comprend pas

## Ce qu'il ne sait pas encore faire

- **Écouter les messages vocaux** — il répond poliment que ce n'est pas encore possible et demande d'écrire. Ça viendra dans une prochaine étape (ça demande un compte OpenAI en plus, pour la transcription).
- Encaisser un paiement — ça reste toi (Wave / espèces à la livraison)

## Installation (une seule fois)

1. Installe [Node.js](https://nodejs.org) (version 18 ou plus) si ce n'est pas déjà fait.
2. Ouvre un terminal dans ce dossier (`whatsapp-bot`) et lance :
   ```bash
   npm install
   ```
3. Copie `.env.example` en `.env` et remplis :
   - `ANTHROPIC_API_KEY` — crée une clé sur [console.anthropic.com](https://console.anthropic.com) (Settings → API Keys). Attention, l'utilisation de l'API est payante à l'usage (quelques centimes par conversation en général).
   - `OWNER_WHATSAPP_NUMBER` — ton numéro WhatsApp personnel (celui qui recevra les transmissions), au format `221781234567` (indicatif + numéro, sans espace ni `+`).
4. Lance le bot :
   ```bash
   npm start
   ```
5. Un QR code s'affiche dans le terminal. Sur le téléphone qui a le numéro **78 880 08 08** : WhatsApp → Paramètres → Appareils connectés → Connecter un appareil → scanne le QR code.
6. Une fois connecté (`✅ Bot connecté à WhatsApp et prêt à répondre.`), le bot répond automatiquement aux messages reçus sur ce numéro.

La connexion (session) est sauvegardée dans le dossier `session/` : pas besoin de rescanner le QR code à chaque redémarrage, sauf si tu déconnectes l'appareil depuis WhatsApp.

## Pour le laisser tourner en permanence

Sur ton PC, le bot s'arrête si tu fermes le terminal ou éteins l'ordinateur. Pour qu'il réponde même quand ton PC est éteint, il faut l'héberger ailleurs (un petit serveur qui tourne 24h/24, quelques dollars par mois — Railway ou Render, par exemple). On peut voir ça ensemble quand tu seras prêt à passer à cette étape.

## Où sont stockées les données

- `session/` — les identifiants de connexion WhatsApp (ne jamais partager ce dossier, c'est équivalent à un accès direct à ton WhatsApp)
- `conversations/` — historique récent de chaque conversation client (30 derniers messages), pour que le bot garde le contexte. Peut être supprimé sans risque si besoin (le bot repart juste sans mémoire des échanges précédents).

## Modifier le comportement du bot

Le "caractère" et les règles du bot sont dans `assistant.js`, en haut du fichier (`SYSTEM_PROMPT`). Tu peux me redemander de l'ajuster (ton, ce qu'il doit/ne doit pas dire, etc.) à tout moment.
