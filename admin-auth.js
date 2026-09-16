// Verrou d'accès simple pour les pages d'administration (console-admin.html,
// console-pub.html). Le site étant 100% statique (pas de serveur), ceci n'est
// qu'un garde-fou côté navigateur : ça bloque un lien tombé entre de mauvaises
// mains, pas une personne déterminée à lire le code source. Pour changer le
// mot de passe, remplace HACHAGE_MDP par le résultat de :
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('nouveau-mdp'))
//     .then(b => console.log([...new Uint8Array(b)].map(o => o.toString(16).padStart(2,'0')).join('')))
(function () {
  const HACHAGE_MDP = '40328418dfd33a49bb4c0228945e2a356df7fdd38b7a979b05c490232d2c3450';
  const CLE_SESSION = 'sandaga_admin_ok';

  if (sessionStorage.getItem(CLE_SESSION) === '1') return;

  document.documentElement.style.visibility = 'hidden';

  async function hacher(texte) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
    return [...new Uint8Array(buf)].map(o => o.toString(16).padStart(2, '0')).join('');
  }

  function afficherEcran() {
    document.documentElement.style.visibility = '';
    const ecran = document.createElement('div');
    ecran.style.cssText = 'position:fixed;inset:0;background:#17252B;display:flex;align-items:center;justify-content:center;z-index:99999;font-family:"Archivo",system-ui,sans-serif;';
    ecran.innerHTML = `
      <form id="formAuthAdmin" style="background:#FFFFFF;border-radius:8px;padding:32px 28px;width:min(90vw,340px);box-shadow:0 10px 40px rgba(0,0,0,.35)">
        <h1 style="margin:0 0 6px;font-size:17px;color:#17252B">Accès protégé</h1>
        <p style="margin:0 0 16px;font-size:13px;color:#5A6B72">Page d'administration Sandaga Soldes.</p>
        <input type="password" id="champAuthAdmin" placeholder="Mot de passe" autocomplete="current-password"
          style="width:100%;padding:10px 12px;border:1px solid #CBD1CD;border-radius:4px;font-size:15px;box-sizing:border-box">
        <p id="erreurAuthAdmin" hidden style="color:#C81E2B;font-size:13px;margin:8px 0 0">Mot de passe incorrect.</p>
        <button type="submit" style="width:100%;margin-top:14px;padding:10px;border:0;border-radius:4px;background:#17252B;color:#fff;font-size:14px;font-weight:600;cursor:pointer">Entrer</button>
      </form>`;
    document.body.appendChild(ecran);

    const champ = ecran.querySelector('#champAuthAdmin');
    const erreur = ecran.querySelector('#erreurAuthAdmin');
    champ.focus();

    ecran.querySelector('#formAuthAdmin').addEventListener('submit', async (e) => {
      e.preventDefault();
      if ((await hacher(champ.value)) === HACHAGE_MDP) {
        sessionStorage.setItem(CLE_SESSION, '1');
        ecran.remove();
      } else {
        erreur.hidden = false;
        champ.value = '';
        champ.focus();
      }
    });
  }

  if (document.body) afficherEcran();
  else document.addEventListener('DOMContentLoaded', afficherEcran);
})();
