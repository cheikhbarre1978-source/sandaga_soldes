// Surveille catalogue.csv / promos.json / populaires.json — les fichiers écrits
// par console-admin.html (bouton "Enregistrer...") — et republie automatiquement
// le site quelques secondes après toute modification.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FICHIERS_SURVEILLES = ['catalogue.csv', 'promos.json', 'populaires.json'];
const DELAI_ATTENTE_MS = 5000;

let minuteur = null;
let publicationEnCours = false;
let publicationEnAttente = false;

function horodatage() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function publier() {
  if (publicationEnCours) {
    publicationEnAttente = true;
    return;
  }
  publicationEnCours = true;
  console.log(`[${horodatage()}] Changement détecté, publication en cours...`);

  execFile(
    path.join(ROOT, 'scripts', 'publier-core.bat'),
    [],
    { cwd: ROOT, windowsHide: true, shell: true, maxBuffer: 1024 * 1024 * 20 },
    (err, stdout, stderr) => {
      if (stdout) console.log(stdout.trim());
      if (err) {
        console.error(`[${horodatage()}] ÉCHEC de la publication :`, err.message);
        if (stderr) console.error(stderr.trim());
      } else {
        console.log(`[${horodatage()}] Publication terminée.`);
      }
      publicationEnCours = false;
      if (publicationEnAttente) {
        publicationEnAttente = false;
        publier();
      }
    }
  );
}

function planifierPublication() {
  clearTimeout(minuteur);
  minuteur = setTimeout(publier, DELAI_ATTENTE_MS);
}

FICHIERS_SURVEILLES.forEach((nomFichier) => {
  const cheminComplet = path.join(ROOT, nomFichier);
  if (!fs.existsSync(cheminComplet)) {
    console.log(`[${horodatage()}] ⚠ ${nomFichier} introuvable, surveillance ignorée pour ce fichier.`);
    return;
  }
  fs.watch(cheminComplet, { persistent: true }, () => planifierPublication());
});

console.log(`[${horodatage()}] Surveillance active sur : ${FICHIERS_SURVEILLES.join(', ')}`);

// Rattrape les modifications faites pendant que la surveillance était arrêtée (PC éteint, redémarrage…) :
// publier-core.bat ne fait rien s'il n'y a aucun changement à publier.
planifierPublication();
