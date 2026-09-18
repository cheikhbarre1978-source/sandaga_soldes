// Régénère feed.xml depuis catalogue.csv, en reproduisant EXACTEMENT la logique
// de genererFluxMeta() dans console-admin.html — pour ne pas dépendre du bouton
// "Générer le flux" (sélecteur de dossier navigateur) à chaque changement de prix.
const fs = require('fs');
const Papa = require('C:/Users/Administrateur/Documents/sandaga-soldes-project/whatsapp-bot/node_modules/papaparse');

const ROOT = 'C:/Users/Administrateur/Documents/sandaga-soldes-project';
const SITE = "https://sandagasoldes.com";
const RAYONS = [["froid","Froid"],["lavage","Lavage"],["cuisson","Cuisson"],["clim","Climatisation"],["ventilation","Ventilation"],["petit","Petit électroménager"],["tv","Téléviseurs"]];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function refUrl(ref){ return ref.toLowerCase().replace(/[\/\\:*?"<>|]+/g,"-"); }
function absPhoto(photo){ if(!photo) return ""; return photo.startsWith("http") ? photo : SITE+"/"+photo; }
function parseSpecsLigne(specsStr){
  const out = {};
  String(specsStr||"").split("|").forEach(part=>{
    const i = part.indexOf(":");
    if(i===-1) return;
    const k = part.slice(0,i).trim(), v = part.slice(i+1).trim();
    if(k && v) out[k]=v;
  });
  return out;
}

// Même logique que console-admin.html : le flux Meta reçoit un texte simple (introduction + points forts).
function descriptionPlate(txt){
  const paras = [], points = [];
  String(txt||"").replace(/\r/g,"").split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean).forEach(b=>{
    const lignes = b.split("\n").map(l=>l.trim()).filter(Boolean);
    const titre = lignes[0].toLowerCase().replace(/\s*:\s*$/,"");
    if (titre === "points forts") lignes.slice(1).forEach(l => points.push(l.replace(/^[•\-*]\s*/,"")));
    else if (titre !== "caractéristiques" && titre !== "caracteristiques") paras.push(lignes.join("\n"));
  });
  return [...paras, points.length ? "Points forts : " + points.join(" ; ") + "." : ""].filter(Boolean).join(" ").replace(/\s+/g," ").trim();
}

function analyserCatalogue(texte){
  const res = Papa.parse(texte, {header:true, skipEmptyLines:true});
  return res.data.map(l => ({
    ref: (l.ref||"").trim(),
    marque: (l.marque||"").trim(),
    nom: (l.nom||"").trim(),
    rayon: (l.rayon||"").trim().toLowerCase(),
    famille: (l.famille||"").trim(),
    prix: Number(String(l.prix||"").replace(/[^\d.-]/g,"")) || 0,
    dispo: (l.dispo||"").trim().toLowerCase() === "jour" ? "jour" : "commande",
    specs: (l.specs||"").trim(),
    photo: (l.photo||"").trim(),
    actif: String(l.actif||"oui").trim().toLowerCase() !== "non",
    description: (l.description||"").trim(),
  })).filter(p => p.ref || p.nom);
}

function genererFluxMeta(produits){
  const nomsRayons = Object.fromEntries(RAYONS);
  const idsRayonsValides = new Set(RAYONS.map(r => r[0]));
  const actifs = produits.filter(p => p.ref && p.actif && p.nom.trim() && p.prix > 0 && idsRayonsValides.has(p.rayon));

  const items = actifs.map(p => {
    const specs = parseSpecsLigne(p.specs);
    const specsTexte = Object.entries(specs).map(([k,v]) => `${k} : ${v}`).join(", ");
    const descriptionTexte = p.description
      ? descriptionPlate(p.description)
      : `${p.marque} ${p.nom}${specsTexte ? " — " + specsTexte : ""}. Livraison et installation à Dakar.`;
    const imageAbs = absPhoto(p.photo) || `${SITE}/img/${p.ref.toLowerCase()}.jpg`;
    return `    <item>
      <g:id>${esc(p.ref)}</g:id>
      <g:title>${esc(`${p.marque} ${p.nom}`.trim())}</g:title>
      <g:description>${esc(descriptionTexte)}</g:description>
      <g:availability>${p.dispo === "jour" ? "in stock" : "available for order"}</g:availability>
      <g:condition>new</g:condition>
      <g:price>${Math.round(p.prix)} XOF</g:price>
      <g:link>${SITE}/produit/${refUrl(p.ref)}.html</g:link>
      <g:image_link>${esc(imageAbs)}</g:image_link>
      <g:brand>${esc(p.marque)}</g:brand>
      <g:product_type>${esc(`${nomsRayons[p.rayon]} > ${p.famille}`)}</g:product_type>
    </item>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Sandaga Soldes — Électroménager Dakar</title>
    <link>${SITE}</link>
    <description>Catalogue produit pour les pubs carrousel Meta, la boutique Instagram et le catalogue WhatsApp.</description>
${items}
  </channel>
</rss>`;
}

const texte = fs.readFileSync(ROOT + '/catalogue.csv', 'utf8');
const produits = analyserCatalogue(texte);
const xml = genererFluxMeta(produits);
fs.writeFileSync(ROOT + '/feed.xml', xml);

const nbItems = (xml.match(/<item>/g) || []).length;
console.log('feed.xml régénéré :', nbItems, 'produits,', (xml.length/1024).toFixed(0), 'Ko');
