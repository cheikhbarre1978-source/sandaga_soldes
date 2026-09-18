// Régénère produit/<ref>.html depuis catalogue.csv, en reproduisant EXACTEMENT
// la logique de console-admin.html (pageProduit / regenererFichesProduit),
// pour ne pas avoir à passer par le sélecteur de dossier du navigateur.
const fs = require('fs');
const path = require('path');
const Papa = require('C:/Users/Administrateur/Documents/sandaga-soldes-project/whatsapp-bot/node_modules/papaparse');

const ROOT = 'C:/Users/Administrateur/Documents/sandaga-soldes-project';
const SITE = "https://sandagasoldes.com";
const WHATSAPP = "221788800808";
const ZONES_LIVRAISON = [
  {id:"plateau",  nom:"Plateau / Médina",               frais:3000,  delai:"sous 4h"},
  {id:"granddak", nom:"Grand Dakar / Point E / Mermoz", frais:4000,  delai:"sous 4h"},
  {id:"parcelles",nom:"Parcelles / Pikine / Guédiawaye",frais:5000,  delai:"sous 4h"},
  {id:"keurm",    nom:"Keur Massar / Malika",           frais:7000,  delai:"sous 4h"},
  {id:"rufisque", nom:"Rufisque / Bargny",              frais:10000, delai:"délai à convenir avec vous"},
  {id:"thies",    nom:"Thiès / Mbour",                  frais:20000, delai:"délai à convenir avec vous"}
];
const RAYONS = [["froid","Froid"],["lavage","Lavage"],["cuisson","Cuisson"],["clim","Climatisation"],["ventilation","Ventilation"],["petit","Petit électroménager"],["tv","Téléviseurs"]];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const jsonLdSafe = obj => JSON.stringify(obj).replace(/</g, "\\u003c");
const fmt = n => Math.round(Number(n)||0).toLocaleString("fr-FR").replace(/ | /g," ");

function analyserCatalogue(texte){
  const res = Papa.parse(texte, {header:true, skipEmptyLines:true});
  return res.data.map(l => ({
    ref: (l.ref||"").trim(),
    marque: (l.marque||"").trim(),
    nom: (l.nom||"").trim(),
    rayon: (l.rayon||"").trim().toLowerCase(),
    famille: (l.famille||"").trim(),
    prix: Number(String(l.prix||"").replace(/[^\d.-]/g,"")) || 0,
    icone: (l.icone||"").trim(),
    dispo: (l.dispo||"").trim().toLowerCase() === "jour" ? "jour" : "commande",
    cap: (l.cap||"").trim(),
    specs: (l.specs||"").trim(),
    photo: (l.photo||"").trim(),
    photos: String(l.photos||"").split(";").map(s => s.trim()).filter(Boolean),
    actif: String(l.actif||"oui").trim().toLowerCase() !== "non",
    description: (l.description||"").trim()
  })).filter(p => p.ref || p.nom);
}

function refUrl(ref){
  return ref.toLowerCase().replace(/[\/\\:*?"<>|]+/g,"-");
}
function absPhoto(photo){
  if (!photo) return "";
  return photo.startsWith("http") ? photo : SITE + "/" + photo;
}
function parseSpecsLigne(specsStr){
  const out = {};
  String(specsStr||"").split("|").forEach(part => {
    const i = part.indexOf(":");
    if (i === -1) return;
    const k = part.slice(0,i).trim(), v = part.slice(i+1).trim();
    if (k && v) out[k] = v;
  });
  return out;
}
function pageProduit(p){
  const photos = (p.photos && p.photos.length) ? p.photos : (p.photo ? [p.photo] : []);
  const photosAbs = photos.map(absPhoto).filter(Boolean);
  const photoAbs = photosAbs[0] || "";
  const specs = parseSpecsLigne(p.specs);
  const titre = `${p.marque} ${p.nom} — Sandaga Soldes`.trim();
  const descMeta = `${p.nom} à ${fmt(p.prix)} F CFA. Livraison rapide à Dakar, facture au nom de Sandaga Soldes, garantie constructeur 1 an.`;
  const url = `${SITE}/produit/${refUrl(p.ref)}.html`;
  const nomsRayons = Object.fromEntries(RAYONS);
  const rayonNom = nomsRayons[p.rayon] || p.famille || "Catalogue";
  const specsTexte = Object.entries(specs).map(([k,v]) => `${k} : ${v}`).join(', ');
  const descriptionTexte = p.description
    ? p.description
    : `${p.marque} ${p.nom}${specsTexte ? " — " + specsTexte : ""}. Livraison rapide à Dakar, facture à notre nom, garantie constructeur, paiement à la livraison ou par Wave.`;

  const visuelHtml = photoAbs
    ? `<img class="foto" src="../${esc(photos[0])}" alt="${esc(p.nom)}" id="photoPrincipale">`
    : `<span class="repli">Photo à venir</span>`;
  const vignettesHtml = photos.length > 1 ? `
    <div class="vignettes">
      ${photos.map((src,i) => `<button type="button" data-src="../${esc(src)}" class="${i===0?'actif':''}"><img src="../${esc(src)}" alt="" loading="lazy"></button>`).join('')}
    </div>` : '';
  const specsHtml = Object.entries(specs).map(([k,v]) =>
    `<div class="ligne"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`
  ).join('');
  const descriptionHtml = `
    <div class="description">
      <h2>Description</h2>
      <p>${esc(descriptionTexte)}</p>
    </div>`;
  const zonesOptions = ZONES_LIVRAISON.map(z =>
    `<option value="${z.id}" data-frais="${z.frais}" data-delai="${esc(z.delai)}">${esc(z.nom)} — ${fmt(z.frais)} F, ${esc(z.delai)}</option>`
  ).join('');

  const jsonLdProduit = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": `${p.marque} ${p.nom}`.trim(),
    "sku": p.ref,
    "description": descriptionTexte,
    ...(photosAbs.length ? {"image": photosAbs} : {}),
    ...(p.marque ? {"brand": {"@type":"Brand","name": p.marque}} : {}),
    "offers": {
      "@type": "Offer",
      "url": url,
      "priceCurrency": "XOF",
      "price": Math.round(p.prix),
      "availability": p.dispo === "jour" ? "https://schema.org/InStock" : "https://schema.org/PreOrder",
      "itemCondition": "https://schema.org/NewCondition",
      "seller": {"@type":"Organization","name":"Sandaga Soldes"}
    }
  };
  const jsonLdFil = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {"@type":"ListItem","position":1,"name":"Accueil","item": SITE + "/index.html"},
      {"@type":"ListItem","position":2,"name": rayonNom,"item": SITE + "/index.html"},
      {"@type":"ListItem","position":3,"name": `${p.marque} ${p.nom}`.trim()}
    ]
  };

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titre)}</title>
<meta name="description" content="${esc(descMeta)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="product">
<meta property="og:title" content="${esc(titre)}">
<meta property="og:description" content="${esc(descMeta)}">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="Sandaga Soldes">
${photoAbs ? `<meta property="og:image" content="${esc(photoAbs)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta property="product:price:amount" content="${Math.round(p.prix)}">
<meta property="product:price:currency" content="XOF">
<link rel="icon" href="../logo.jpg">
<script type="application/ld+json">${jsonLdSafe(jsonLdProduit)}<\/script>
<script type="application/ld+json">${jsonLdSafe(jsonLdFil)}<\/script>
<style>
:root{--email:#F1F2EE;--blanc:#FFFFFF;--acier:#17252B;--acier-60:#5A6B72;--chrome:#CBD1CD;--chrome-clair:#E3E6E2;--prix:#C81E2B;--jour:#F5A300;--r:4px;--max:760px;--pad:20px}
*{box-sizing:border-box}
body{margin:0;background:var(--email);color:var(--acier);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
a{color:inherit}
.wrap{max-width:var(--max);margin:0 auto;padding:0 var(--pad)}
header{background:var(--blanc);border-bottom:1px solid var(--chrome)}
header .wrap{display:flex;align-items:center;gap:14px;min-height:64px}
header img{height:34px}
.retour{margin-left:auto;font-size:13.5px;font-weight:600;color:var(--acier-60);text-decoration:none}
.retour:hover{color:var(--acier)}
main{padding:26px 0 50px}
.filariane{font-size:12.5px;color:var(--acier-60);margin:0 0 14px}
.filariane a{color:var(--acier-60);text-decoration:none}
.filariane a:hover{text-decoration:underline}
.visuel{background:var(--blanc);border:1px solid var(--chrome);border-radius:var(--r);aspect-ratio:16/11;display:grid;place-items:center;overflow:hidden}
.visuel img{width:100%;height:100%;object-fit:contain;padding:5%}
.visuel .repli{color:var(--acier-60);font-size:14px}
.vignettes{display:flex;gap:8px;margin-top:8px;overflow-x:auto}
.vignettes button{flex:none;width:56px;height:56px;padding:0;border:2px solid var(--chrome);border-radius:calc(var(--r) - 1px);background:var(--blanc);cursor:pointer;overflow:hidden}
.vignettes button.actif{border-color:var(--acier)}
.vignettes img{width:100%;height:100%;object-fit:contain}
.marque{display:block;margin-top:18px;font-size:12.5px;font-weight:700;color:var(--acier-60);letter-spacing:.04em}
h1{font-size:24px;margin:4px 0 0;letter-spacing:-.01em}
.prix{font-size:38px;font-weight:800;color:var(--prix);margin-top:12px;letter-spacing:-.03em}
.prix span{font-size:16px;font-weight:500}
.plaque{margin-top:20px;border:1px solid var(--chrome);border-radius:var(--r);background:var(--blanc);overflow:hidden}
.plaque .ligne{display:flex;justify-content:space-between;gap:16px;padding:10px 13px;font-size:14px;border-bottom:1px solid var(--chrome-clair)}
.plaque .ligne:last-child{border-bottom:none}
.plaque .ligne dt{color:var(--acier-60);margin:0}
.plaque .ligne dd{margin:0;font-weight:600;text-align:right}
.description h2{font-size:14px;text-transform:uppercase;letter-spacing:.04em;color:var(--acier-60);margin:20px 0 8px}
.description p{margin:0;font-size:14px;line-height:1.6;color:var(--acier-60)}
.livraison{margin-top:22px;border:1px solid var(--chrome);border-radius:var(--r);background:var(--blanc);padding:14px}
.livraison label{display:block;font-size:13.5px;color:var(--acier-60);margin-bottom:7px}
.livraison select{width:100%;font:inherit;padding:10px;border:1px solid var(--chrome);border-radius:var(--r);background:var(--email)}
.resultat{margin-top:10px;font-size:13.5px;color:var(--acier-60)}
.resultat b{color:var(--acier)}
.wa{display:flex;align-items:center;justify-content:center;gap:8px;background:#128C4A;color:#fff;border:none;border-radius:var(--r);padding:15px;font-weight:700;font-size:17px;text-decoration:none;margin-top:16px}
.wa:hover{background:#0E7A40}
.wa svg{width:19px;height:19px;fill:currentColor}
footer{background:var(--acier);color:var(--email);padding:26px 0;margin-top:20px;font-size:13.5px}
footer a{text-decoration:underline}
</style>
</head>
<body>
<header><div class="wrap">
  <a href="../index.html"><img src="../logo.jpg" alt="Sandaga Soldes"></a>
  <a class="retour" href="../index.html">← Tout le catalogue</a>
</div></header>
<main class="wrap">
  <p class="filariane"><a href="../index.html">Accueil</a> › ${esc(rayonNom)} › ${esc(p.marque)} ${esc(p.nom)}</p>
  <div class="visuel">${visuelHtml}</div>
  ${vignettesHtml}
  <span class="marque">${esc(p.marque)}</span>
  <h1>${esc(p.nom)}</h1>
  <p class="prix">${fmt(p.prix)}<span> F CFA</span></p>
  <dl class="plaque">${specsHtml}</dl>
  ${descriptionHtml}
  <div class="livraison">
    <label for="zone">Votre zone de livraison</label>
    <select id="zone">${zonesOptions}</select>
    <p class="resultat" id="resultat"></p>
  </div>
  <a class="wa" id="btnWa" href="#" target="_blank" rel="noopener">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m0 1.67c2.2 0 4.27.86 5.83 2.42a8.2 8.2 0 0 1 2.41 5.82c0 4.54-3.7 8.24-8.25 8.24-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.26-8.24m-4.5 4.2c-.21 0-.55.08-.84.39-.29.31-1.1 1.08-1.1 2.63 0 1.55 1.13 3.05 1.29 3.26.16.21 2.19 3.34 5.3 4.55 2.59 1.02 3.12.82 3.68.77.56-.05 1.81-.74 2.07-1.46.25-.72.25-1.33.18-1.46-.08-.13-.29-.21-.6-.36-.31-.16-1.81-.9-2.09-1-.28-.1-.49-.16-.69.16-.21.31-.79 1-.97 1.2-.18.21-.36.23-.66.08-.31-.16-1.29-.48-2.46-1.52-.91-.81-1.52-1.81-1.7-2.12-.18-.31-.02-.48.14-.63.14-.14.31-.36.47-.54.15-.18.2-.31.31-.52.1-.21.05-.39-.03-.54-.08-.16-.69-1.66-.94-2.27-.25-.6-.5-.52-.69-.53z"/></svg>
    Commander sur WhatsApp
  </a>
</main>
<footer><div class="wrap">
  Sandaga Soldes — Électroménager · Dakar. Facture à notre nom, garantie constructeur 1 an.<br>
  <a href="../index.html">Voir tout le catalogue ↗</a>
</div></footer>
<script>
(function(){
  var PRIX = ${Math.round(p.prix)};
  var NOM = ${JSON.stringify(p.nom)};
  var REF = ${JSON.stringify(p.ref)};
  var MARQUE = ${JSON.stringify(p.marque)};
  function fmt(n){ return Math.round(n).toLocaleString('fr-FR').replace(/\\u202f|\\u00a0/g,' '); }
  var sel = document.getElementById('zone');
  function maj(){
    var o = sel.options[sel.selectedIndex];
    var frais = Number(o.dataset.frais), delai = o.dataset.delai;
    var total = PRIX + frais;
    document.getElementById('resultat').innerHTML =
      'Livraison ' + o.textContent.split(' — ')[0] + ' : <b>' + fmt(frais) + ' F</b>, ' + delai + '.<br>' +
      'Total à prévoir : <b>' + fmt(total) + ' F CFA</b>, installation comprise.';
    document.getElementById('btnWa').href = 'https://wa.me/${WHATSAPP}?text=' + encodeURIComponent(
      'Bonjour Sandaga Soldes, je veux commander :\\n\\n' + NOM + '\\nRéf. ' + REF + ' — ' + MARQUE +
      '\\nPrix : ' + fmt(PRIX) + ' F CFA\\nLivraison ' + o.textContent.split(' — ')[0] + ' : ' + fmt(frais) + ' F' +
      '\\nTotal : ' + fmt(total) + ' F CFA\\n\\nC\\'est disponible ?'
    );
  }
  sel.addEventListener('change', maj);
  maj();
  document.querySelectorAll('.vignettes button').forEach(function(b){
    b.addEventListener('click', function(){
      document.getElementById('photoPrincipale').src = b.dataset.src;
      document.querySelectorAll('.vignettes button').forEach(function(x){ x.classList.remove('actif'); });
      b.classList.add('actif');
    });
  });
})();
<\/script>
</body>
</html>
`;
}

function genererSitemap(actifs){
  const aujourdhui = new Date().toISOString().slice(0,10);
  const urls = [
    `  <url><loc>${SITE}/index.html</loc><lastmod>${aujourdhui}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...actifs.map(p => `  <url><loc>${SITE}/produit/${refUrl(p.ref)}.html</loc><lastmod>${aujourdhui}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`)
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

const csvTexte = fs.readFileSync(path.join(ROOT, 'catalogue.csv'), 'utf8');
const produits = analyserCatalogue(csvTexte);
const idsRayonsValides = new Set(RAYONS.map(r => r[0]));
const rayonInvalides = [];
const actifs = produits.filter(p => {
  if (!(p.ref && p.actif && p.nom.trim() && p.prix > 0)) return false;
  if (!idsRayonsValides.has(p.rayon)) { rayonInvalides.push(p.ref); return false; }
  return true;
});
const dossierProduit = path.join(ROOT, 'produit');
const vus = new Map();
const collisions = [];
const uniques = [];
let n = 0;
for (const p of actifs) {
  const nomFichier = refUrl(p.ref) + '.html';
  if (vus.has(nomFichier)) { collisions.push(`${p.ref} (comme ${vus.get(nomFichier)})`); continue; }
  vus.set(nomFichier, p.ref);
  uniques.push(p);
  fs.writeFileSync(path.join(dossierProduit, nomFichier), pageProduit(p), 'utf8');
  n++;
}
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), genererSitemap(uniques), 'utf8');
console.log(`${n} fiches produit régénérées dans produit/ (sur ${actifs.length} produits valides, ${produits.length} au total dans le catalogue).`);
console.log('sitemap.xml écrit avec', uniques.length + 1, 'URLs.');
if (rayonInvalides.length) console.log(`⚠ ${rayonInvalides.length} produit(s) ignoré(s) — rayon invalide :`, rayonInvalides.join(', '));
if (collisions.length) console.log(`⚠ ${collisions.length} référence(s) en collision après nettoyage de l'URL :`, collisions.join(', '));
