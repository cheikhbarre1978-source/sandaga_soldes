// Charge catalogue.csv (le même fichier que le site, modifié via console-admin.html)
// et fournit une recherche tolérante. Aucune donnée produit n'est jamais
// inventée ici : tout vient directement du fichier.
const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

const CSV_PATH = path.resolve(__dirname, process.env.CATALOGUE_CSV_PATH || '../catalogue.csv');

// Doit rester identique à RAYONS_VALIDES dans index.html : un produit dont le rayon n'est
// pas reconnu est invisible sur le site, donc le bot ne doit jamais le recommander non plus.
const RAYONS_VALIDES = new Set(['froid', 'lavage', 'cuisson', 'clim', 'ventilation', 'petit', 'tv']);

let catalogue = [];
let derniereLecture = 0;
const DUREE_CACHE_MS = 60 * 1000; // relit le fichier au plus une fois par minute

function normaliser(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function analyserSpecs(txt) {
  const specs = {};
  String(txt || '').split('|').forEach(part => {
    const i = part.indexOf(':');
    if (i === -1) return;
    const cle = part.slice(0, i).trim();
    const val = part.slice(i + 1).trim();
    if (cle && val) specs[cle] = val;
  });
  return specs;
}

function chargerCatalogue(force = false) {
  const maintenant = Date.now();
  if (!force && catalogue.length && maintenant - derniereLecture < DUREE_CACHE_MS) {
    return catalogue;
  }
  const texte = fs.readFileSync(CSV_PATH, 'utf8');
  const analyse = Papa.parse(texte, { header: true, skipEmptyLines: true });
  catalogue = analyse.data
    .map(l => ({
      ref: String(l.ref || '').trim(),
      marque: String(l.marque || '').trim(),
      nom: String(l.nom || '').trim(),
      rayon: String(l.rayon || '').trim().toLowerCase(),
      famille: String(l.famille || '').trim(),
      prix: Number(String(l.prix || '').replace(/[^\d.-]/g, '')) || 0,
      dispo: String(l.dispo || '').trim().toLowerCase() === 'jour' ? 'jour' : 'commande',
      cap: String(l.cap || '').trim(),
      specs: analyserSpecs(l.specs),
      photo: String(l.photo || '').trim(),
      actif: String(l.actif || 'oui').trim().toLowerCase() !== 'non',
    }))
    .filter(p => p.ref && p.nom && p.actif && p.prix > 0 && RAYONS_VALIDES.has(p.rayon));
  derniereLecture = maintenant;
  return catalogue;
}

// Recherche tolérante : tous les mots de la requête doivent se retrouver
// (même partiellement) dans le nom, la marque, la famille, le rayon, la
// capacité ou les caractéristiques du produit.
function rechercherProduits(requete, { rayon = '', limite = 8 } = {}) {
  const liste = chargerCatalogue();
  const mots = normaliser(requete).split(' ').filter(Boolean);
  const rayonNorm = normaliser(rayon);

  const correspond = (p) => {
    if (rayonNorm && p.rayon !== rayonNorm) return false;
    if (!mots.length) return true;
    const texte = normaliser(
      [p.nom, p.marque, p.famille, p.rayon, p.cap, Object.values(p.specs).join(' ')].join(' ')
    );
    return mots.every(m => texte.includes(m) || (m.length >= 4 && texte.includes(m.slice(0, -1))));
  };

  return liste.filter(correspond).slice(0, limite);
}

function produitParRef(ref) {
  return chargerCatalogue().find(p => p.ref.toLowerCase() === String(ref || '').toLowerCase());
}

function rayonsDisponibles() {
  return [...new Set(chargerCatalogue().map(p => p.rayon))];
}

// Mêmes URL que le site (refUrl de index.html / scripts/regenerer_fiches.js).
const SITE = 'https://sandagasoldes.com';
function lienProduit(p) {
  return `${SITE}/produit/${p.ref.toLowerCase().replace(/[\/\\:*?"<>|]+/g, '-')}.html`;
}
function photoProduit(p) {
  if (!p.photo) return '';
  return /^https?:\/\//.test(p.photo) ? p.photo : `${SITE}/${p.photo.replace(/^\//, '')}`;
}

module.exports = { chargerCatalogue, rechercherProduits, produitParRef, rayonsDisponibles, lienProduit, photoProduit, CSV_PATH };
