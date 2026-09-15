# Sandaga Soldes — contexte du projet

Site vitrine + catalogue en ligne pour Sandaga Soldes (sandagasoldes.com),
vente d'électroménager (+ téléviseurs) à Dakar.

## Modèle économique

- CSB n'est pas grossiste : il est apporteur d'affaires pour **Bara Mboup
  Electronics** (baramboupelectronics.com), qui donne ses prix de gros.
- CSB fixe sa propre marge, et la **facture est à son nom** (pas celui du
  grossiste) — c'est ce qui protège la relation client.
- **Garantie constructeur d'un an**, indiquée sur la facture.
- **Livraison propre** : CSB a son propre réseau de livreurs (livraison
  quasi immédiate près du fournisseur), pas celui du grossiste. C'est
  l'argument commercial principal du site.
- Paiement : acompte Wave à la commande recommandé (filtre les refus à la
  livraison), solde en espèces ou Wave à la livraison.
- WhatsApp Business : **221 78 880 08 08**

## État actuel du site (index.html)

Fichier HTML unique, autonome, sans framework (HTML/CSS/JS vanilla).

- **Palette de couleurs** (variables CSS en haut du `<style>`) : fond
  `--email` (F1F2EE), texte `--acier` (17252B, quasi-noir), accents
  `--prix` (rouge, réservé aux prix) et `--jour` (ambre, réservé aux
  badges "livré aujourd'hui" / réassurance / étiquettes promo).
  Coins nets (`--r: 4px`), pas d'ombres portées — esthétique "plaque
  signalétique d'électroménager", pas de style SaaS générique.
- **Héros** en deux colonnes (≥940px) : recherche + réassurance à
  gauche, panneau **"Promo de la semaine"** à droite (constante
  `PROMO_SEMAINE` en haut du script, à changer chaque semaine).
- **Recherche tolérante** : table `SYNONYMES` qui reconnaît le
  vocabulaire courant à Dakar (ex. "clim", "machine", "congélateur
  horizontal/vertical" — pas "bahut"/"armoire", vocabulaire pas utilisé
  ici).
- **Catalogue** : chargé depuis une **feuille Google Sheets publiée en
  CSV** (via PapaParse, chargé depuis cdnjs). Constante
  `SHEET_CSV_URL` en haut du script — **actuellement vide**, donc le
  site tourne sur un petit catalogue de secours (4 produits) en
  attendant. Voir `catalogue-demarrage.xlsx` : fichier prêt à importer
  dans Google Sheets, avec un onglet "Aide" qui documente les colonnes
  et valeurs autorisées (rayon, icone, dispo, format de specs).
- **Flux produit Meta** : généré dynamiquement à partir du même
  catalogue (bouton en bas de page), pour alimenter les futures pubs
  carrousel Facebook/Instagram.
- **Logo** : image intégrée en **base64** directement dans le HTML
  (recadrée depuis une photo d'enseigne 3D fournie par CSB). À
  remplacer par un vrai fichier image hébergé séparément avant mise en
  production — le base64 alourdit le fichier et n'est pas caché
  efficacement par le navigateur.
- **WhatsApp** : uniquement des liens `wa.me` avec message pré-rempli
  (référence produit, prix, zone de livraison). **Ce n'est pas un
  agent IA** — juste des liens pratiques.
- **Zones de livraison** : tableau `ZONES` en haut du script (frais et
  délai par zone). Le slogan promet "sous 4h" mais Rufisque/Thiès sont
  à 24h/48h — incohérence à trancher avant de communiquer sur ce
  chiffre partout.

## Reste à faire (par ordre de priorité discuté)

1. **Connecter le vrai catalogue** : remplir `catalogue-demarrage.xlsx`
   avec les vrais prix de gros + marge, le publier en CSV depuis
   Google Sheets, coller le lien dans `SHEET_CSV_URL`.
2. **Vraies photos produits** : demander à Bara Mboup Electronics
   d'abord ; sinon photos maison (fond uni, cadrage carré cohérent).
   Remplacent les dessins SVG actuels dans `ICONES`.
3. **Construire le vrai agent WhatsApp** (chatbot IA) : doit lire le
   catalogue réel, ne jamais confirmer une dispo sans vérifier, gérer
   les notes vocales (wolof/français mélangés), avoir une échappatoire
   humaine explicite.
4. **Mise en ligne** : héberger le site sur le vrai domaine
   sandagasoldes.com, sortir le logo du base64.

## Projet lié

- **JustePrix** (justprix.sn) : comparateur de prix séparé du même
  auteur, qui démarre justement sur électronique/téléphonie +
  électroménager. Sandaga Soldes = couche transaction, JustePrix =
  couche audience/comparaison. Éviter de les faire se concurrencer.
