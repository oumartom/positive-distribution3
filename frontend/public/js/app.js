// ── STATE ─────────────────────────────────────────────────
const S = { page:'dashboard', clientsCache:[], stockCache:{cartons:0} };

// ── INIT ──────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('current-date').textContent =
    new Date().toLocaleDateString('fr-FR',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const theme = localStorage.getItem('pd_theme')||'dark';
  setTheme(theme);
  if (api.isLoggedIn()) initApp(); else showLogin();
});

function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('pd_theme', t);
  document.getElementById('theme-icon').className = t==='dark' ? 'fa fa-sun' : 'fa fa-moon';
}
function toggleTheme() {
  setTheme(document.documentElement.getAttribute('data-theme')==='dark' ? 'light' : 'dark');
}
function togglePwd() {
  const f = document.getElementById('login-pwd');
  f.type = f.type==='password' ? 'text' : 'password';
  document.getElementById('eye-icon').className = f.type==='password' ? 'fa fa-eye' : 'fa fa-eye-slash';
}

function showLogin() {
  document.getElementById('login-screen').style.display = 'block';
  document.getElementById('app-screen').style.display   = 'none';
}
function initApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display   = 'block';
  const u = api.currentUser();
  if (u) {
    document.getElementById('user-name').textContent    = u.nom;
    document.getElementById('user-role').textContent    = u.role==='admin' ? 'Administrateur' : 'Commercial';
    document.getElementById('user-initials').textContent= u.nom.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  }
  // Cacher items admin-only si non admin
  if (!api.isAdmin()) {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display='none');
  }
  loadBadge(); showPage('dashboard');
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pwd   = document.getElementById('login-pwd').value;
  const errEl = document.getElementById('login-error');
  const btn   = document.getElementById('login-btn');
  errEl.style.display='none'; btn.disabled=true; btn.innerHTML='<i class="fa fa-spinner fa-spin"></i> Connexion...';
  try { await api.login(email, pwd); initApp(); }
  catch(e) { errEl.style.display='flex'; errEl.textContent=e.message; }
  finally  { btn.disabled=false; btn.innerHTML='<i class="fa fa-sign-in-alt"></i> Se connecter'; }
}
document.addEventListener('keydown', e => {
  if (e.key==='Enter' && document.getElementById('login-screen').style.display!=='none') doLogin();
});

// ── BADGE IMPAYÉS ─────────────────────────────────────────
async function loadBadge() {
  try { const d=await api.impayes(); document.getElementById('badge-impayes').textContent=d.length; } catch(e){}
}

// ── NAVIGATION ────────────────────────────────────────────
function showPage(page) {
  S.page = page;
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active', b.getAttribute('onclick')?.includes(`'${page}'`)));
  const T = { dashboard:'Tableau de bord', ventes:'Ventes', livraison:'Livraison du jour',
    repartition:'Répartition du jour', clients:'Clients', recouvrements:'Recouvrements',
    impayes:'Impayés', stock:'Stock', pertes:'Pertes & Casse', banque:'Banque',
    rapports:'Rapports & PDF', prix:'Prix du carton', utilisateurs:'Utilisateurs & Droits', import:'Import / Export Excel' };
  const A = { dashboard:'Nouvelle vente', ventes:'Nouvelle vente', clients:'Nouveau client',
    recouvrements:'Enregistrer paiement', banque:'Mouvement bancaire', pertes:'Enregistrer perte',
    livraison:'Nouvelle livraison', prix:'Nouveau prix', stock:'Ajuster stock', utilisateurs:'Nouvel utilisateur' };
  document.getElementById('page-title').textContent = T[page]||page;
  const lbl=A[page]; const btn=document.getElementById('main-action-btn');
  if(lbl){ document.getElementById('main-action-label').textContent=lbl; btn.style.display=''; }
  else btn.style.display='none';
  showLoading(document.getElementById('page-content'));
  renderPage(page);
}

function openMainAction() {
  const M = { dashboard:'modal-vente', ventes:'modal-vente', clients:'modal-client',
    recouvrements:'modal-recouvrement', banque:'modal-banque', pertes:'modal-perte',
    livraison:'modal-livraison', prix:'modal-prix', stock:'modal-stock', utilisateurs:'modal-user' };
  const m = M[S.page]; if(m) openModal(m);
  if(S.page==='dashboard'||S.page==='ventes') prepVenteForm();
  if(S.page==='recouvrements') prepRecouvrForm();
  if(S.page==='utilisateurs') prepUserForm();
}

function openModal(id) {
  document.querySelectorAll(`#${id} input[type=date]`).forEach(el=>{ if(!el.value) el.value=today(); });
  document.getElementById(id).classList.add('open');
}
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(m=>m.addEventListener('click',e=>{ if(e.target===m) m.classList.remove('open'); }));

// ── VENTE FORM ────────────────────────────────────────────
async function prepVenteForm(vente=null) {
  document.getElementById('vente-modal-title').textContent = vente ? '✏️ Modifier la vente' : '➕ Nouvelle vente';
  document.getElementById('v-id').value = vente?.id||'';
  document.getElementById('v-date').value = vente?.date_vente||today();
  document.getElementById('v-qty').value  = vente?.quantite||'';
  document.getElementById('v-pu').value   = vente?.prix_unitaire||'';
  document.getElementById('v-payment').value = vente?.paiement||'';
  document.getElementById('v-obs').value  = vente?.observations||'';
  document.getElementById('v-total').value= vente ? fmtN(vente.total)+' GNF' : '';
  document.getElementById('v-solde').value= vente ? fmtN(vente.solde)+' GNF' : '';
  document.getElementById('v-cat-info').style.display='none';

  // Stock dispo
  try {
    const stk = await api.stock();
    S.stockCache = stk.actuel;
    const info = document.getElementById('v-stock-info');
    info.innerHTML = `<i class="fa fa-box"></i> Stock disponible : <strong>${stk.actuel.cartons} cartons</strong>`;
    info.style.display='flex';
  } catch(e){}

  await populateClientSelect('v-client', vente?.client_id);
  if(vente?.client_id) await onClientVenteChange(vente.client_id, vente.prix_unitaire);
  openModal('modal-vente');
}

async function onClientVenteChange(clientId, forcePu=null) {
  const id = clientId || document.getElementById('v-client').value;
  if(!id) return;
  try {
    const data = await api.prixClient(id);
    if(!forcePu) document.getElementById('v-pu').value = data.prix_unitaire;
    const info = document.getElementById('v-cat-info');
    info.innerHTML = `<div class="alert alert-info" style="margin:0"><i class="fa fa-tag"></i> <b>${catLabel(data.categorie)}</b> — Prix auto : <b>${fmtN(data.prix_unitaire)} GNF/ctn</b> (modifiable)</div>`;
    info.style.display='block';
    calcVente();
  } catch(e){}
}

function calcVente() {
  const qty = parseFloat(document.getElementById('v-qty').value)||0;
  const pu  = parseFloat(document.getElementById('v-pu').value)||0;
  const pay = parseFloat(document.getElementById('v-payment').value)||0;
  const tot = qty*pu;
  document.getElementById('v-total').value = tot ? fmtN(tot)+' GNF' : '';
  document.getElementById('v-solde').value = tot ? fmtN(Math.max(0,tot-pay))+' GNF' : '';
}

async function saveVente() {
  const id       = document.getElementById('v-id').value;
  const clientId = document.getElementById('v-client').value;
  const qty      = parseInt(document.getElementById('v-qty').value)||0;
  const pu       = parseFloat(document.getElementById('v-pu').value)||0;
  const pay      = parseFloat(document.getElementById('v-payment').value)||0;

  if(!clientId) return showNotif('Sélectionnez un client','error');
  if(qty<=0)    return showNotif('Quantité invalide','error');
  if(pu<=0)     return showNotif('Prix unitaire requis','error');

  // Vérification stock côté client (avertissement préventif)
  if(!id && qty > S.stockCache.cartons) {
    showNotif(`Stock insuffisant ! Disponible : ${S.stockCache.cartons} cartons demandé : ${qty}`,'error');
    return;
  }

  try {
    const body = { date_vente:document.getElementById('v-date').value, client_id:parseInt(clientId),
      quantite:qty, prix_unitaire:pu, paiement:pay, observations:document.getElementById('v-obs').value };
    if(id) await api.updateVente(id, body); else await api.createVente(body);
    closeModal('modal-vente');
    showNotif(id ? 'Vente modifiée !' : 'Vente enregistrée — impayés mis à jour !');
    loadBadge(); renderPage(S.page);
  } catch(e) { showNotif(e.message,'error'); }
}

// ── CLIENT FORM ───────────────────────────────────────────
function prepClientForm(client=null) {
  document.getElementById('client-modal-title').textContent = client ? '✏️ Modifier le client' : '👤 Nouveau client';
  document.getElementById('c-id').value     = client?.id||'';
  document.getElementById('c-nom').value    = client?.nom||'';
  document.getElementById('c-tel').value    = client?.telephone||'';
  document.getElementById('c-cat').value    = client?.categorie||'autre_revendeur';
  document.getElementById('c-zone').value   = client?.zone||'';
  document.getElementById('c-adresse').value= client?.adresse||'';
  document.getElementById('c-obs').value    = client?.observation||'';
  openModal('modal-client');
}
async function saveClient() {
  const id  = document.getElementById('c-id').value;
  const nom = document.getElementById('c-nom').value.trim();
  if(!nom) return showNotif('Nom requis','error');
  try {
    const body = { nom, telephone:document.getElementById('c-tel').value, categorie:document.getElementById('c-cat').value,
      zone:document.getElementById('c-zone').value, adresse:document.getElementById('c-adresse').value,
      observation:document.getElementById('c-obs').value, statut:'actif' };
    if(id) await api.updateClient(id,body); else await api.createClient(body);
    closeModal('modal-client'); showNotif(id?'Client modifié !':'Client créé !');
    renderPage(S.page);
  } catch(e) { showNotif(e.message,'error'); }
}
async function deleteClient(id, nom) {
  if(!await confirm(`Archiver/supprimer le client "${nom}" ?`)) return;
  try { await api.deleteClient(id); showNotif('Client supprimé/archivé'); renderPage('clients'); }
  catch(e) { showNotif(e.message,'error'); }
}

// ── RECOUVREMENT FORM ─────────────────────────────────────
async function prepRecouvrForm(rec=null) {
  document.getElementById('rec-modal-title').textContent = rec ? '✏️ Modifier le paiement' : '💰 Enregistrer un paiement';
  document.getElementById('r-id').value     = rec?.id||'';
  document.getElementById('r-date').value   = rec?.date_paiement||today();
  document.getElementById('r-montant').value= rec?.montant_recu||'';
  document.getElementById('r-obs').value    = rec?.observation||'';
  document.getElementById('r-suivi').value  = rec?.date_suivi||'';
  document.getElementById('r-restant').value= rec ? fmtN(rec.montant_restant)+' GNF' : '';
  document.getElementById('r-solde-info').style.display='none';
  S.clientsCache = await populateClientSelect('r-client', rec?.client_id);
  if(rec?.client_id) setTimeout(()=>onRecouvrClientChange(),100);
  openModal('modal-recouvrement');
}

function onRecouvrClientChange() {
  const sel = document.getElementById('r-client');
  const opt = sel.options[sel.selectedIndex];
  if(!opt||!opt.value) return;
  const solde = parseFloat(opt.dataset.solde||0);
  const info  = document.getElementById('r-solde-info');
  info.innerHTML = `<div class="alert alert-${solde>0?'warning':'success'}" style="margin:0">
    <i class="fa fa-${solde>0?'exclamation-triangle':'check-circle'}"></i>
    Solde actuel de <b>${opt.textContent.split('(')[0].trim()}</b> : 
    <b style="color:${solde>0?'var(--danger)':'var(--success)'}">${fmtN(solde)} GNF</b>
  </div>`;
  info.style.display='block';
  calcRestant();
}

function calcRestant() {
  const sel   = document.getElementById('r-client');
  const opt   = sel.options[sel.selectedIndex];
  const solde = parseFloat(opt?.dataset.solde||0);
  const recu  = parseFloat(document.getElementById('r-montant').value)||0;
  document.getElementById('r-restant').value = fmtN(Math.max(0, solde-recu))+' GNF';
}

async function saveRecouvrement() {
  const id       = document.getElementById('r-id').value;
  const clientId = document.getElementById('r-client').value;
  const montant  = parseFloat(document.getElementById('r-montant').value)||0;
  if(!clientId) return showNotif('Sélectionnez un client','error');
  if(montant<=0) return showNotif('Montant invalide','error');
  try {
    const body = { client_id:parseInt(clientId), date_paiement:document.getElementById('r-date').value,
      montant_recu:montant, date_suivi:document.getElementById('r-suivi').value||null,
      observation:document.getElementById('r-obs').value };
    if(id) await api.updateRecouvrement(id,body); else await api.createRecouvrement(body);
    closeModal('modal-recouvrement'); showNotif(id?'Paiement modifié !':'Paiement enregistré — solde mis à jour !');
    loadBadge(); renderPage(S.page);
  } catch(e) { showNotif(e.message,'error'); }
}
async function deleteRecouvrement(id) {
  if(!api.isAdmin()) return showNotif('Accès réservé aux admins','error');
  if(!await confirm('Supprimer ce paiement ? Le solde du client sera recalculé.')) return;
  try { await api.deleteRecouvrement(id); showNotif('Paiement supprimé'); renderPage('recouvrements'); }
  catch(e) { showNotif(e.message,'error'); }
}

// ── STOCK ─────────────────────────────────────────────────
async function saveStock() {
  const type = document.getElementById('s-type').value;
  const c=parseInt(document.getElementById('s-cartons').value)||0;
  const p=parseInt(document.getElementById('s-plateaux').value)||0;
  const o=parseInt(document.getElementById('s-oeufs').value)||0;
  if(!c&&!p&&!o) return showNotif('Saisissez au moins une quantité','error');
  try {
    await api.ajusterStock({ date_mouvement:document.getElementById('s-date').value||today(),
      type_mouvement:type, cartons:c, plateaux:p, oeufs:o, motif:document.getElementById('s-motif').value });
    closeModal('modal-stock'); showNotif('Stock mis à jour !');
    renderPage('stock');
  } catch(e) { showNotif(e.message,'error'); }
}

// ── BANQUE ────────────────────────────────────────────────
function prepBanqueForm(b=null) {
  document.getElementById('banque-modal-title').textContent = b ? '✏️ Modifier mouvement' : '🏦 Mouvement bancaire';
  document.getElementById('b-id').value      = b?.id||'';
  document.getElementById('b-date').value    = b?.date_mouvement||today();
  document.getElementById('b-desc').value    = b?.description||'';
  document.getElementById('b-ref').value     = b?.reference||'';
  document.getElementById('b-montant').value = b ? (b.encaissement>0?b.encaissement:b.decaissement) : '';
  document.getElementById('b-type').value    = b?.encaissement>0 ? 'encaissement' : 'decaissement';
  document.getElementById('b-comment').value = b?.commentaires||'';
  openModal('modal-banque');
}
async function saveBanque() {
  const id   = document.getElementById('b-id').value;
  const type = document.getElementById('b-type').value;
  const mont = parseFloat(document.getElementById('b-montant').value)||0;
  const desc = document.getElementById('b-desc').value.trim();
  if(!desc) return showNotif('Description requise','error');
  if(mont<=0) return showNotif('Montant invalide','error');
  try {
    const body = { date_mouvement:document.getElementById('b-date').value, description:desc,
      reference:document.getElementById('b-ref').value,
      encaissement: type==='encaissement'?mont:0, decaissement: type==='decaissement'?mont:0,
      commentaires:document.getElementById('b-comment').value };
    const f = document.getElementById('b-fichier').files[0];
    if(f&&!id) { const up=await api.upload(f); body.fichier_bordereau=up.url; }
    if(id) await api.updateBanque(id,body); else await api.createBanque(body);
    closeModal('modal-banque'); showNotif(id?'Mouvement modifié !':'Mouvement enregistré !');
    renderPage('banque');
  } catch(e) { showNotif(e.message,'error'); }
}
async function deleteBanque(id) {
  if(!api.isAdmin()) return showNotif('Accès réservé aux admins','error');
  if(!await confirm('Supprimer ce mouvement bancaire ?')) return;
  try { await api.deleteBanque(id); showNotif('Supprimé'); renderPage('banque'); }
  catch(e) { showNotif(e.message,'error'); }
}

// ── PERTE ─────────────────────────────────────────────────
async function savePerte() {
  const o = parseInt(document.getElementById('p-oeufs').value)||0;
  if(o<=0) return showNotif('Quantité invalide','error');
  try {
    await api.createPerte({ date_perte:document.getElementById('p-date').value,
      type_perte:document.getElementById('p-type').value, quantite_oeufs:o,
      cause:document.getElementById('p-cause').value });
    closeModal('modal-perte'); showNotif('Perte enregistrée, stock mis à jour !');
    renderPage(S.page);
  } catch(e) { showNotif(e.message,'error'); }
}
async function deletePerte(id) {
  if(!api.isAdmin()) return showNotif('Accès réservé aux admins','error');
  if(!await confirm('Supprimer cette perte ? Le stock sera restauré.')) return;
  try { await api.deletePerte(id); showNotif('Supprimé, stock restauré'); renderPage('pertes'); }
  catch(e) { showNotif(e.message,'error'); }
}

// ── LIVRAISON ─────────────────────────────────────────────
function prepLivrForm(l=null) {
  document.getElementById('livr-modal-title').textContent = l ? '✏️ Modifier livraison' : '🚚 Saisir une livraison';
  document.getElementById('l-id').value    = l?.id||'';
  document.getElementById('l-date').value  = l?.date_livraison||today();
  document.getElementById('l-qty').value   = l?.quantite_cartons||'';
  document.getElementById('l-fourn').value = l?.fournisseur||'';
  document.getElementById('l-notes').value = l?.notes||'';
  openModal('modal-livraison');
}
async function saveLivraison() {
  const id  = document.getElementById('l-id').value;
  const qty = parseInt(document.getElementById('l-qty').value)||0;
  if(qty<=0) return showNotif('Quantité invalide','error');
  try {
    const body = { date_livraison:document.getElementById('l-date').value, quantite_cartons:qty,
      fournisseur:document.getElementById('l-fourn').value, notes:document.getElementById('l-notes').value };
    const f = document.getElementById('l-fichier').files[0];
    if(f&&!id) { const up=await api.upload(f); body.fichier_facture=up.url; }
    if(id) await api.updateLivraison(id,body); else await api.createLivraison(body);
    closeModal('modal-livraison'); showNotif('Livraison enregistrée, stock mis à jour !');
    renderPage(S.page);
  } catch(e) { showNotif(e.message,'error'); }
}
async function deleteLivraison(id) {
  if(!api.isAdmin()) return showNotif('Accès réservé aux admins','error');
  if(!await confirm('Supprimer cette livraison ? Le stock sera soustrait.')) return;
  try { await api.deleteLivraison(id); showNotif('Supprimé, stock ajusté'); renderPage('livraison'); }
  catch(e) { showNotif(e.message,'error'); }
}

// ── PRIX ──────────────────────────────────────────────────
async function savePrix() {
  const date=document.getElementById('px-date').value, pu=document.getElementById('px-pu').value;
  const cat=document.getElementById('px-cat').value;
  if(!date||!pu) return showNotif('Date et prix requis','error');
  try { await api.createPrix({date_effet:date,prix_unitaire:parseFloat(pu),categorie:cat});
    closeModal('modal-prix'); showNotif('Nouveau prix actif !'); renderPage('prix'); }
  catch(e) { showNotif(e.message,'error'); }
}

// ── UTILISATEURS ──────────────────────────────────────────
function prepUserForm(u=null) {
  document.getElementById('user-modal-title').textContent = u ? '✏️ Modifier utilisateur' : '👤 Nouvel utilisateur';
  document.getElementById('u-id').value     = u?.id||'';
  document.getElementById('u-nom').value    = u?.nom||'';
  document.getElementById('u-email').value  = u?.email||'';
  document.getElementById('u-pwd').value    = '';
  document.getElementById('u-role').value   = u?.role==='admin' ? '1' : '2';
  document.getElementById('u-statut').value = u?.statut||'actif';
  document.getElementById('u-statut-group').style.display = u ? '' : 'none';
  openModal('modal-user');
}
async function saveUser() {
  const id  = document.getElementById('u-id').value;
  const nom = document.getElementById('u-nom').value.trim();
  const email=document.getElementById('u-email').value.trim();
  const pwd = document.getElementById('u-pwd').value;
  if(!nom||!email) return showNotif('Nom et email requis','error');
  if(!id&&!pwd)    return showNotif('Mot de passe requis pour un nouvel utilisateur','error');
  try {
    const body = { nom, email, role_id:parseInt(document.getElementById('u-role').value),
      statut:document.getElementById('u-statut').value };
    if(pwd) body.mot_de_passe=pwd;
    if(id) await api.updateUser(id,body); else await api.createUser(body);
    closeModal('modal-user'); showNotif(id?'Utilisateur modifié !':'Utilisateur créé !');
    renderPage('utilisateurs');
  } catch(e) { showNotif(e.message,'error'); }
}
async function deleteUser(id) {
  if(!await confirm('Désactiver cet utilisateur ?')) return;
  try { await api.deleteUser(id); showNotif('Utilisateur désactivé'); renderPage('utilisateurs'); }
  catch(e) { showNotif(e.message,'error'); }
}

// ── DELETE VENTE ──────────────────────────────────────────
async function deleteVente(id) {
  if(!api.isAdmin()) return showNotif('Accès réservé aux admins','error');
  if(!await confirm('Supprimer cette vente ? Le stock sera restauré et les impayés recalculés.')) return;
  try { await api.deleteVente(id); showNotif('Vente supprimée'); loadBadge(); renderPage('ventes'); }
  catch(e) { showNotif(e.message,'error'); }
}

// ── RAPPORT ───────────────────────────────────────────────
async function chargerRapport() {
  const date = document.getElementById('rapport-date')?.value||today();
  const el   = document.getElementById('rapport-content');
  showLoading(el);
  try {
    const r = await api.rapport(date); el.innerHTML = genRapportHTML(r, date);
  } catch(e) {
    el.innerHTML=`<div class="empty-state"><i class="fa fa-file-alt"></i><p>Aucune donnée pour le ${date}</p></div>`;
  }
}
function ouvrirPDF() {
  const date = document.getElementById('rapport-date')?.value||today();
  window.open(`/api/rapport/${date}/pdf`, '_blank');
}

function genRapportHTML(r, date) {
  const t=r.totaux;
  const dateF=new Date(date+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const totalCash = parseFloat(t.total_encaisse||0)+parseFloat(t.total_recouvrements||0);
  return `<div class="card">
    <div class="card-body">
      <div style="text-align:center;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid var(--border)">
        <div style="font-size:20px;font-weight:700;color:var(--accent)">🥚 POSITIVE DISTRIBUTION</div>
        <div style="color:var(--text2);margin-top:6px">RAPPORT JOURNALIER — ${dateF.toUpperCase()}</div>
      </div>
      <div class="grid-2" style="margin-bottom:16px">
        <div style="background:var(--bg3);border-radius:8px;padding:14px">
          <div style="font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase;margin-bottom:10px">📦 LIVRAISON DU JOUR</div>
          <div style="display:flex;justify-content:space-between;padding:4px 0"><span>Livré</span><span class="td-mono">${r.livraison.quantite_cartons||0} cartons</span></div>
          <div style="display:flex;justify-content:space-between;padding:4px 0"><span>Distribués</span><span class="td-mono">${t.distribues||0} cartons</span></div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;border-top:1px solid var(--border);margin-top:6px;padding-top:8px;font-weight:700"><span>Stock restant</span><span class="td-mono" style="color:var(--accent)">${r.stock.cartons} ctn — ${r.stock.plateaux} pltx — ${r.stock.oeufs} œufs</span></div>
        </div>
        <div style="background:var(--bg3);border-radius:8px;padding:14px">
          <div style="font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase;margin-bottom:10px">💰 FINANCES</div>
          <div style="display:flex;justify-content:space-between;padding:4px 0"><span>Total ventes</span><span class="td-mono">${fmtN(t.tv)} GNF</span></div>
          <div style="display:flex;justify-content:space-between;padding:4px 0"><span>Cash ventes</span><span class="td-mono" style="color:var(--success)">${fmtN(t.te)} GNF</span></div>
          <div style="display:flex;justify-content:space-between;padding:4px 0"><span>Recouvrements</span><span class="td-mono" style="color:var(--success)">${fmtN(t.total_recouvrements)} GNF</span></div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;border-top:1px solid var(--border);margin-top:6px;padding-top:8px;font-weight:700"><span>@ TOTAL CASH</span><span class="td-mono" style="color:var(--success)">${fmtN(totalCash)} GNF</span></div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;font-weight:700"><span>IMPAYÉS DU JOUR</span><span class="td-mono" style="color:var(--danger)">${fmtN(t.ti)} GNF</span></div>
        </div>
      </div>
      <div style="font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase;margin-bottom:8px">🧾 CLIENTS SERVIS</div>
      <table style="width:100%;font-size:13px;margin-bottom:14px"><thead><tr><th>N°</th><th>Client</th><th>Catégorie</th><th>Qté</th><th>P.U.</th><th>Total</th><th>Payé</th><th>Solde</th></tr></thead>
      <tbody>
        ${r.ventes.map((v,i)=>`<tr><td>${i+1}</td><td class="td-bold">${v.client_nom}</td><td><span class="${catBadge(v.categorie)}">${catLabel(v.categorie)}</span></td><td>${v.quantite} ctn</td><td class="td-mono">${fmtN(v.prix_unitaire)}</td><td class="td-mono">${fmtN(v.total)}</td><td class="td-mono" style="color:var(--success)">${fmtN(v.paiement)}</td><td class="td-mono" style="color:${v.solde>0?'var(--danger)':'var(--text3)'}">${fmtN(v.solde)}</td></tr>`).join('')}
        <tr style="background:var(--bg3);font-weight:700"><td colspan="3">TOTAUX</td><td>${t.distribues} ctn</td><td>—</td><td class="td-mono">${fmtN(t.tv)}</td><td class="td-mono" style="color:var(--success)">${fmtN(t.te)}</td><td class="td-mono" style="color:var(--danger)">${fmtN(t.ti)}</td></tr>
      </tbody></table>
      ${r.recouvrements.length>0?`
      <div style="font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase;margin-bottom:8px">🔁 RECOUVREMENTS</div>
      <table style="width:100%;font-size:13px;margin-bottom:14px"><thead><tr><th>Client</th><th>Montant reçu</th><th>Restant</th><th>Obs.</th></tr></thead>
      <tbody>${r.recouvrements.map(rec=>`<tr><td class="td-bold">${rec.client_nom}</td><td class="td-mono" style="color:var(--success)">${fmtN(rec.montant_recu)} GNF</td><td class="td-mono" style="color:${rec.montant_restant>0?'var(--danger)':'var(--text3)'}">${fmtN(rec.montant_restant)} GNF</td><td style="font-size:11px">${rec.observation||'—'}</td></tr>`).join('')}
      <tr style="background:var(--bg3);font-weight:700"><td>TOTAL CASH</td><td class="td-mono" style="color:var(--success)">${fmtN(t.total_recouvrements)} GNF</td><td colspan="2"></td></tr>
      </tbody></table>`:''}
      <div class="grid-2">
        <div style="background:var(--bg3);border-radius:8px;padding:12px">
          <div style="font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase;margin-bottom:8px">🏦 BANQUE</div>
          ${r.banque.length===0?'<p style="color:var(--text3);font-size:13px">Aucun mouvement</p>':
          r.banque.map(b=>`<div style="display:flex;justify-content:space-between;padding:3px 0"><span style="font-size:12px">${b.description}</span><span class="td-mono" style="color:${b.encaissement>0?'var(--success)':'var(--danger)'}">${b.encaissement>0?'+'+fmtN(b.encaissement):'-'+fmtN(b.decaissement)} GNF</span></div>`).join('')}
        </div>
        <div style="background:var(--bg3);border-radius:8px;padding:12px">
          <div style="font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase;margin-bottom:8px">🚫 PERTES</div>
          ${r.pertes.length===0?'<p style="color:var(--text3);font-size:13px">Aucune perte</p>':
          r.pertes.map(p=>`<div style="display:flex;justify-content:space-between;padding:3px 0"><span style="font-size:12px">${p.type_perte} — ${p.cause||''}</span><span class="td-mono" style="color:var(--danger)">${p.quantite_oeufs} œufs</span></div>`).join('')}
        </div>
      </div>
    </div>
  </div>`;
}

// ── RENDER PAGES ──────────────────────────────────────────
async function renderPage(page) {
  const c = document.getElementById('page-content');
  try {

    if (page==='dashboard') {
      const d = await api.dashboard();
      const sem=d.ventes_semaine||[], maxV=Math.max(...sem.map(v=>parseFloat(v.total)||0),1);
      const pct=d.ventes_hier.tv>0?Math.round(((d.ventes_jour.tv-d.ventes_hier.tv)/d.ventes_hier.tv)*100):0;
      c.innerHTML=`
        <div class="grid-4">
          <div class="stat-card blue"><div class="stat-icon blue"><i class="fa fa-receipt"></i></div><div class="stat-label">Ventes du jour</div><div class="stat-value" style="font-size:18px">${fmtN(d.ventes_jour.tv)}</div><div class="stat-sub">${pct>=0?'+':''}${pct}% vs hier</div></div>
          <div class="stat-card green"><div class="stat-icon green"><i class="fa fa-money-bill-wave"></i></div><div class="stat-label">Cash encaissé</div><div class="stat-value" style="font-size:18px">${fmtN(d.ventes_jour.te)}</div><div class="stat-sub">GNF</div></div>
          <div class="stat-card red"><div class="stat-icon red"><i class="fa fa-exclamation-triangle"></i></div><div class="stat-label">Impayés totaux</div><div class="stat-value" style="font-size:18px">${fmtN(d.impayes.total)}</div><div class="stat-sub">${d.impayes.nb} client(s)</div></div>
          <div class="stat-card accent"><div class="stat-icon accent"><i class="fa fa-university"></i></div><div class="stat-label">Solde banque</div><div class="stat-value" style="font-size:18px">${fmtN(d.banque_solde)}</div><div class="stat-sub">GNF</div></div>
        </div>
        <div class="grid-2">
          <div class="card"><div class="card-header"><div class="card-title">📦 Stock actuel</div><button class="btn btn-secondary btn-sm" onclick="showPage('stock')">Détail</button></div>
            <div class="card-body"><div style="display:flex;justify-content:space-around;text-align:center">
              <div><div style="font-size:32px;font-weight:700;color:var(--accent);font-family:'Space Mono',monospace">${d.stock.cartons}</div><div style="font-size:10px;color:var(--text3);margin-top:4px">CARTONS</div></div>
              <div style="width:1px;background:var(--border)"></div>
              <div><div style="font-size:32px;font-weight:700;color:var(--accent2);font-family:'Space Mono',monospace">${d.stock.plateaux}</div><div style="font-size:10px;color:var(--text3);margin-top:4px">PLATEAUX</div></div>
              <div style="width:1px;background:var(--border)"></div>
              <div><div style="font-size:32px;font-weight:700;color:var(--warning);font-family:'Space Mono',monospace">${fmtN((d.stock.cartons*360)+(d.stock.plateaux*30)+(d.stock.oeufs||0))}</div><div style="font-size:10px;color:var(--text3);margin-top:4px">ŒUFS TOTAL</div></div>
            </div></div>
          </div>
          <div class="card"><div class="card-header"><div class="card-title">📈 Ventes — 7 jours</div></div>
            <div class="card-body">
              <div class="mini-chart">${sem.map((v,i)=>`<div class="mini-bar" style="height:${Math.max(5,Math.round((parseFloat(v.total)||0)/maxV*100))}%;background:${i===sem.length-1?'var(--accent)':'var(--accent2)'};opacity:${i===sem.length-1?1:.5}" title="${fmtN(v.total)} GNF"></div>`).join('')}</div>
              <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:10px;color:var(--text3)">${sem.map((v,i)=>`<span style="color:${i===sem.length-1?'var(--accent)':'inherit'}">${new Date(v.date_vente+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'short'})}</span>`).join('')}</div>
            </div>
          </div>
        </div>
        <div class="card" style="margin-bottom:16px">
          <div class="card-header"><div class="card-title">🧾 Ventes d'aujourd'hui</div>
            <button class="btn btn-primary btn-sm" onclick="prepVenteForm()"><i class="fa fa-plus"></i> Ajouter</button></div>
          ${d.ventes_aujourdhui.length===0?`<div class="empty-state"><i class="fa fa-receipt"></i><p>Aucune vente aujourd'hui</p></div>`:`
          <div class="table-wrap"><table><thead><tr><th>N°</th><th>Client</th><th>Qté</th><th>P.U.</th><th>Total</th><th>Payé</th><th>Solde</th><th>Statut</th><th></th></tr></thead><tbody>
            ${d.ventes_aujourdhui.map((v,i)=>`<tr>
              <td class="td-mono">#${i+1}</td><td class="td-bold">${v.client_nom}</td><td>${v.quantite} ctn</td>
              <td class="td-mono">${fmtN(v.prix_unitaire)}</td><td class="td-mono td-bold">${fmtN(v.total)}</td>
              <td class="td-mono" style="color:var(--success)">${fmtN(v.paiement)}</td>
              <td class="td-mono" style="color:${v.solde>0?'var(--danger)':'var(--text3)'}">${fmtN(v.solde)}</td>
              <td><span class="badge ${v.solde==0?'badge-success':v.paiement==0?'badge-danger':'badge-warning'}">${v.solde==0?'Soldé':v.paiement==0?'Impayé':'Partiel'}</span></td>
              <td style="display:flex;gap:4px">
                <button class="btn btn-secondary btn-xs" onclick="prepVenteForm(${JSON.stringify(v).replace(/"/g,'&quot;')})"><i class="fa fa-edit"></i></button>
                ${api.isAdmin()?`<button class="btn btn-danger btn-xs" onclick="deleteVente(${v.id})"><i class="fa fa-trash"></i></button>`:''}
              </td>
            </tr>`).join('')}
            <tr style="background:var(--bg3);font-weight:700"><td colspan="4">TOTAUX</td><td class="td-mono" style="color:var(--accent)">${fmtN(d.ventes_jour.tv)}</td><td class="td-mono" style="color:var(--success)">${fmtN(d.ventes_jour.te)}</td><td class="td-mono" style="color:var(--danger)">${fmtN(d.ventes_jour.ti)}</td><td colspan="2"></td></tr>
          </tbody></table></div>`}
        </div>
        <div class="grid-2">
          <div class="card"><div class="card-header"><div class="card-title">⚠️ Top impayés</div><button class="btn btn-secondary btn-sm" onclick="showPage('impayes')">Voir tout</button></div>
            <div class="card-body">${d.debiteurs.length===0?'<p style="color:var(--text3);font-size:13px">Aucun impayé ✓</p>':
            d.debiteurs.map(cl=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
              <div><div style="font-size:13px;font-weight:600">${cl.nom}</div><span class="${catBadge(cl.categorie)}">${catLabel(cl.categorie)}</span></div>
              <div style="font-size:13px;font-weight:700;color:var(--danger);font-family:'Space Mono',monospace">${fmtN(cl.solde_global)} GNF</div>
            </div>`).join('')}</div>
          </div>
          <div class="card"><div class="card-header"><div class="card-title">🏦 Derniers mouvements</div></div>
            <div class="card-body">${d.derniers_mouvements_banque.map(b=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
              <div><div style="font-size:12px;font-weight:600">${b.description}</div><div style="font-size:10px;color:var(--text3)">${b.date_mouvement}</div></div>
              <div style="font-size:12px;font-weight:700;color:${b.encaissement>0?'var(--success)':'var(--danger)'};font-family:'Space Mono',monospace">${b.encaissement>0?'+'+fmtN(b.encaissement):'-'+fmtN(b.decaissement)} GNF</div>
            </div>`).join('')}</div>
          </div>
        </div>`;
    }

    else if (page==='ventes') {
      const ventes = await api.ventes();
      const tv=ventes.reduce((s,v)=>s+parseFloat(v.total||0),0);
      const te=ventes.reduce((s,v)=>s+parseFloat(v.paiement||0),0);
      const ti=ventes.reduce((s,v)=>s+parseFloat(v.solde||0),0);
      c.innerHTML=`
        <div class="grid-4" style="margin-bottom:14px">
          <div class="stat-card blue"><div class="stat-icon blue"><i class="fa fa-receipt"></i></div><div class="stat-label">Total ventes</div><div class="stat-value" style="font-size:16px">${fmtN(tv)}</div><div class="stat-sub">GNF</div></div>
          <div class="stat-card green"><div class="stat-icon green"><i class="fa fa-check"></i></div><div class="stat-label">Encaissé</div><div class="stat-value" style="font-size:16px">${fmtN(te)}</div><div class="stat-sub">GNF</div></div>
          <div class="stat-card red"><div class="stat-icon red"><i class="fa fa-clock"></i></div><div class="stat-label">Impayés</div><div class="stat-value" style="font-size:16px">${fmtN(ti)}</div><div class="stat-sub">GNF</div></div>
          <div class="stat-card orange"><div class="stat-icon orange"><i class="fa fa-box"></i></div><div class="stat-label">Cartons vendus</div><div class="stat-value" style="font-size:16px">${ventes.reduce((s,v)=>s+parseInt(v.quantite||0),0)}</div><div class="stat-sub">cartons</div></div>
        </div>
        <div class="card">
          <div class="card-header">
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              <div class="search-bar"><i class="fa fa-search"></i><input id="sv-search" placeholder="Client..." oninput="flt('ventes-tbody','sv-search','sv-statut','sv-date')"></div>
              <input type="date" class="form-input" style="width:auto;padding:8px" id="sv-date" onchange="flt('ventes-tbody','sv-search','sv-statut','sv-date')" title="Filtrer par date">
              <select class="form-select" style="width:130px;padding:8px" id="sv-statut" onchange="flt('ventes-tbody','sv-search','sv-statut','sv-date')">
                <option value="">Tous</option><option value="impaye">Impayés</option><option value="solde">Soldés</option>
              </select>
            </div>
            <button class="btn btn-primary btn-sm" onclick="prepVenteForm()"><i class="fa fa-plus"></i> Nouvelle vente</button>
          </div>
          <div class="table-wrap"><table><thead><tr><th>Date</th><th>Client</th><th>Catégorie</th><th>Qté</th><th>P.U.</th><th>Total</th><th>Payé</th><th>Solde</th><th>Obs.</th><th>Statut</th><th></th></tr></thead>
          <tbody id="ventes-tbody">
            ${ventes.map(v=>`<tr data-client="${(v.client_nom||'').toLowerCase()}" data-statut="${v.solde>0?(v.paiement>0?'partiel':'impaye'):'solde'}" data-date="${v.date_vente}">
              <td style="font-size:11px;color:var(--text3)">${v.date_vente}</td>
              <td class="td-bold">${v.client_nom}</td>
              <td><span class="${catBadge(v.categorie)}">${catLabel(v.categorie)}</span></td>
              <td>${v.quantite} ctn</td><td class="td-mono">${fmtN(v.prix_unitaire)}</td>
              <td class="td-mono td-bold">${fmtN(v.total)}</td>
              <td class="td-mono" style="color:var(--success)">${fmtN(v.paiement)}</td>
              <td class="td-mono" style="color:${v.solde>0?'var(--danger)':'var(--text3)'}">${fmtN(v.solde)}</td>
              <td style="font-size:11px;color:var(--text3);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v.observations||'—'}</td>
              <td><span class="badge ${v.solde==0?'badge-success':v.paiement==0?'badge-danger':'badge-warning'}">${v.solde==0?'Soldé':v.paiement==0?'Impayé':'Partiel'}</span></td>
              <td style="display:flex;gap:3px;white-space:nowrap">
                <button class="btn btn-secondary btn-xs" onclick="prepVenteForm(${JSON.stringify(v).replace(/"/g,'&quot;')})"><i class="fa fa-edit"></i></button>
                ${api.isAdmin()?`<button class="btn btn-danger btn-xs" onclick="deleteVente(${v.id})"><i class="fa fa-trash"></i></button>`:''}
              </td>
            </tr>`).join('')}
          </tbody></table></div>
        </div>`;
    }

    else if (page==='clients') {
      const clients = await api.clients();
      c.innerHTML=`<div class="card">
        <div class="card-header">
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <div class="search-bar"><i class="fa fa-search"></i><input id="cl-s" placeholder="Nom, code..." oninput="fltClients()"></div>
            <select class="form-select" style="width:170px;padding:8px" id="cl-cat" onchange="fltClients()">
              <option value="">Toutes catégories</option>
              <option value="revendeur_principal">Revendeur Principal</option>
              <option value="autre_revendeur">Autre Revendeur</option>
              <option value="patisserie_conso">Patisserie/Conso</option>
            </select>
          </div>
          <button class="btn btn-primary btn-sm" onclick="prepClientForm()"><i class="fa fa-user-plus"></i> Nouveau client</button>
        </div>
        <div class="table-wrap"><table><thead><tr><th>Code</th><th>Nom</th><th>Zone</th><th>Catégorie</th><th>Statut</th><th>Solde dû</th><th></th></tr></thead>
        <tbody id="clients-tbody">
          ${clients.map(cl=>`<tr data-nom="${cl.nom.toLowerCase()}" data-code="${(cl.code||'').toLowerCase()}" data-cat="${cl.categorie||''}">
            <td class="td-mono" style="color:var(--accent2)">${cl.code}</td>
            <td class="td-bold">${cl.nom}</td>
            <td style="font-size:12px">${cl.zone||'—'}</td>
            <td><span class="${catBadge(cl.categorie)}">${catLabel(cl.categorie)}</span></td>
            <td><span class="badge ${cl.statut==='actif'?'badge-success':'badge-neutral'}">${cl.statut}</span></td>
            <td class="td-mono" style="color:${cl.solde_global>0?'var(--danger)':'var(--text3)'};font-weight:${cl.solde_global>0?700:400}">${cl.solde_global>0?fmtN(cl.solde_global)+' GNF':'—'}</td>
            <td style="display:flex;gap:3px;white-space:nowrap">
              <button class="btn btn-secondary btn-xs" onclick="prepClientForm(${JSON.stringify(cl).replace(/"/g,'&quot;')})"><i class="fa fa-edit"></i></button>
              ${api.isAdmin()?`<button class="btn btn-danger btn-xs" onclick="deleteClient(${cl.id},'${cl.nom.replace(/'/g,"\\'")}')"><i class="fa fa-trash"></i></button>`:''}
            </td>
          </tr>`).join('')}
        </tbody></table></div>
      </div>`;
    }

    else if (page==='recouvrements') {
      const data = await api.recouvrements();
      const tot  = data.reduce((s,r)=>s+parseFloat(r.montant_recu||0),0);
      c.innerHTML=`
        <div class="card">
          <div class="card-header">
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              <div class="search-bar"><i class="fa fa-search"></i><input id="rec-s" placeholder="Client..." oninput="fltRec()"></div>
              <input type="date" class="form-input" style="width:auto;padding:8px" id="rec-date-debut" placeholder="Du" onchange="fltRec()">
              <input type="date" class="form-input" style="width:auto;padding:8px" id="rec-date-fin" placeholder="Au" onchange="fltRec()">
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <div style="font-size:12px;color:var(--success);font-weight:600">Total : ${fmt(tot)}</div>
              <button class="btn btn-primary btn-sm" onclick="prepRecouvrForm()"><i class="fa fa-plus"></i> Enregistrer</button>
            </div>
          </div>
          <div class="table-wrap"><table><thead><tr><th>Date</th><th>Client</th><th>Zone</th><th>Montant reçu</th><th>Restant</th><th>Date suivi</th><th>Obs.</th><th></th></tr></thead>
          <tbody id="rec-tbody">
            ${data.length===0?`<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text3)">Aucun paiement</td></tr>`:
            data.map(r=>`<tr data-client="${(r.client_nom||'').toLowerCase()}" data-date="${r.date_paiement}">
              <td style="font-size:11px;color:var(--text3)">${r.date_paiement}</td>
              <td class="td-bold">${r.client_nom}</td>
              <td style="font-size:12px">${r.zone||'—'}</td>
              <td class="td-mono" style="color:var(--success);font-weight:700">${fmtN(r.montant_recu)} GNF</td>
              <td class="td-mono" style="color:${r.montant_restant>0?'var(--danger)':'var(--text3)'}">${fmtN(r.montant_restant)} GNF</td>
              <td style="font-size:11px">${r.date_suivi||'—'}</td>
              <td style="font-size:11px;color:var(--text3)">${r.observation||'—'}</td>
              <td style="display:flex;gap:3px">
                <button class="btn btn-secondary btn-xs" onclick="prepRecouvrForm(${JSON.stringify(r).replace(/"/g,'&quot;')})"><i class="fa fa-edit"></i></button>
                ${api.isAdmin()?`<button class="btn btn-danger btn-xs" onclick="deleteRecouvrement(${r.id})"><i class="fa fa-trash"></i></button>`:''}
              </td>
            </tr>`).join('')}
          </tbody></table></div>
        </div>`;
    }

    else if (page==='impayes') {
      const data = await api.impayes();
      const tot  = data.reduce((s,c)=>s+parseFloat(c.solde_global||0),0);
      c.innerHTML=`
        ${data.length>0?`<div class="alert alert-danger"><i class="fa fa-exclamation-triangle"></i><div><b>${data.length} clients débiteurs</b> — Total impayé : <b>${fmt(tot)}</b></div></div>`:`<div class="alert alert-success"><i class="fa fa-check-circle"></i> Aucun impayé !</div>`}
        <div class="card"><div class="card-header"><div class="card-title">⚠️ Clients débiteurs</div></div>
          <div class="table-wrap"><table><thead><tr><th>Client</th><th>Catégorie</th><th>Zone</th><th>Tél.</th><th>Solde dû</th><th>Dernière vente</th><th>Actions</th></tr></thead>
          <tbody>${data.map(cl=>`<tr>
            <td class="td-bold">${cl.nom}</td>
            <td><span class="${catBadge(cl.categorie)}">${catLabel(cl.categorie)}</span></td>
            <td>${cl.zone||'—'}</td><td style="font-size:12px">${cl.telephone||'—'}</td>
            <td class="td-mono" style="color:var(--danger);font-weight:700">${fmtN(cl.solde_global)} GNF</td>
            <td style="font-size:11px;color:var(--text3)">${cl.derniere_vente||'—'}</td>
            <td><button class="btn btn-success btn-sm" onclick="prepRecouvrForm({client_id:${cl.id}})"><i class="fa fa-money-bill"></i> Payer</button></td>
          </tr>`).join('')}</tbody>
          </table></div>
        </div>`;
    }

    else if (page==='stock') {
      const data = await api.stock(); const s=data.actuel;
      c.innerHTML=`
        <div class="grid-3">
          <div class="stat-card blue"><div class="stat-icon blue"><i class="fa fa-box"></i></div><div class="stat-label">Cartons</div><div class="stat-value">${s.cartons}</div><div class="stat-sub">= ${fmtN(s.cartons*360)} œufs</div></div>
          <div class="stat-card orange"><div class="stat-icon orange"><i class="fa fa-layer-group"></i></div><div class="stat-label">Plateaux</div><div class="stat-value">${s.plateaux}</div><div class="stat-sub">= ${fmtN(s.plateaux*30)} œufs</div></div>
          <div class="stat-card green"><div class="stat-icon green"><i class="fa fa-egg"></i></div><div class="stat-label">Total œufs</div><div class="stat-value">${fmtN(s.total_oeufs)}</div><div class="stat-sub">toutes unités</div></div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:14px">
          <button class="btn btn-primary" onclick="openModal('modal-stock')"><i class="fa fa-edit"></i> Ajuster stock</button>
          <button class="btn btn-secondary" onclick="prepLivrForm()"><i class="fa fa-truck"></i> Nouvelle livraison</button>
        </div>
        <div class="card"><div class="card-header"><div class="card-title">📊 Mouvements de stock</div></div>
          <div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Cartons</th><th>Plateaux</th><th>Œufs</th><th>Motif</th></tr></thead>
          <tbody>${data.mouvements.map(m=>`<tr>
            <td style="font-size:11px;color:var(--text3)">${m.date_mouvement}</td>
            <td><span class="badge ${m.type_mouvement==='entree'?'badge-success':m.type_mouvement==='sortie'?'badge-danger':'badge-warning'}">${m.type_mouvement}</span></td>
            <td class="td-mono">${m.cartons}</td><td class="td-mono">${m.plateaux}</td><td class="td-mono">${m.oeufs}</td>
            <td style="font-size:11px;color:var(--text3)">${m.motif||'—'}</td>
          </tr>`).join('')}</tbody>
          </table></div>
        </div>`;
    }

    else if (page==='livraison') {
      const data = await api.livraisons();
      c.innerHTML=`<div class="card"><div class="card-header"><div class="card-title">🚚 Livraisons</div>
        <button class="btn btn-primary btn-sm" onclick="prepLivrForm()"><i class="fa fa-plus"></i> Saisir livraison</button></div>
        <div class="table-wrap"><table><thead><tr><th>Date</th><th>Cartons reçus</th><th>Fournisseur</th><th>Notes</th><th>Facture</th><th></th></tr></thead>
        <tbody>${data.length===0?`<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text3)">Aucune livraison</td></tr>`:
        data.map(l=>`<tr>
          <td>${l.date_livraison}</td>
          <td class="td-mono td-bold" style="color:var(--accent)">${l.quantite_cartons} cartons</td>
          <td>${l.fournisseur||'—'}</td><td style="font-size:11px;color:var(--text3)">${l.notes||'—'}</td>
          <td>${l.fichier_facture?`<a href="${l.fichier_facture}" target="_blank" class="badge badge-success"><i class="fa fa-paperclip"></i> Voir</a>`:`<span class="badge badge-warning">Manquante</span>`}</td>
          <td style="display:flex;gap:3px">
            <button class="btn btn-secondary btn-xs" onclick="prepLivrForm(${JSON.stringify(l).replace(/"/g,'&quot;')})"><i class="fa fa-edit"></i></button>
            ${api.isAdmin()?`<button class="btn btn-danger btn-xs" onclick="deleteLivraison(${l.id})"><i class="fa fa-trash"></i></button>`:''}
          </td>
        </tr>`).join('')}</tbody>
        </table></div>
      </div>`;
    }

    else if (page==='banque') {
      const data = await api.banque();
      const encT=data.mouvements.reduce((s,b)=>s+parseFloat(b.encaissement||0),0);
      const decT=data.mouvements.reduce((s,b)=>s+parseFloat(b.decaissement||0),0);
      c.innerHTML=`
        <div class="grid-3">
          <div class="stat-card green"><div class="stat-icon green"><i class="fa fa-university"></i></div><div class="stat-label">Solde actuel</div><div class="stat-value" style="font-size:16px">${fmtN(data.solde_actuel)}</div><div class="stat-sub">GNF</div></div>
          <div class="stat-card blue"><div class="stat-icon blue"><i class="fa fa-arrow-down"></i></div><div class="stat-label">Total encaissé</div><div class="stat-value" style="font-size:16px">${fmtN(encT)}</div><div class="stat-sub">GNF</div></div>
          <div class="stat-card red"><div class="stat-icon red"><i class="fa fa-arrow-up"></i></div><div class="stat-label">Total décaissé</div><div class="stat-value" style="font-size:16px">${fmtN(decT)}</div><div class="stat-sub">GNF</div></div>
        </div>
        <div class="card"><div class="card-header"><div class="card-title">📒 Journal bancaire</div>
          <button class="btn btn-primary btn-sm" onclick="prepBanqueForm()"><i class="fa fa-plus"></i> Mouvement</button></div>
          <div class="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Réf.</th><th>Encaissement</th><th>Décaissement</th><th>Solde</th><th>Obs.</th><th></th></tr></thead>
          <tbody>${data.mouvements.map(b=>`<tr>
            <td style="font-size:11px;color:var(--text3)">${b.date_mouvement}</td>
            <td class="td-bold">${b.description}</td>
            <td class="td-mono" style="font-size:11px;color:var(--accent2)">${b.reference||'—'}</td>
            <td class="td-mono" style="color:var(--success)">${b.encaissement>0?fmtN(b.encaissement)+' GNF':'—'}</td>
            <td class="td-mono" style="color:var(--danger)">${b.decaissement>0?fmtN(b.decaissement)+' GNF':'—'}</td>
            <td class="td-mono td-bold">${fmtN(b.solde)}</td>
            <td style="font-size:11px;color:var(--text3)">${b.commentaires||'—'}</td>
            <td style="display:flex;gap:3px">
              ${api.isAdmin()?`<button class="btn btn-secondary btn-xs" onclick="prepBanqueForm(${JSON.stringify(b).replace(/"/g,'&quot;')})"><i class="fa fa-edit"></i></button>`:''}
              ${api.isAdmin()?`<button class="btn btn-danger btn-xs" onclick="deleteBanque(${b.id})"><i class="fa fa-trash"></i></button>`:''}
              ${b.fichier_bordereau?`<a href="${b.fichier_bordereau}" target="_blank" class="btn btn-info btn-xs"><i class="fa fa-paperclip"></i></a>`:''}
            </td>
          </tr>`).join('')}</tbody>
          </table></div>
        </div>`;
    }

    else if (page==='pertes') {
      const data = await api.pertes();
      const tot  = data.reduce((s,p)=>s+parseInt(p.quantite_oeufs||0),0);
      c.innerHTML=`
        ${tot>0?`<div class="alert alert-danger"><i class="fa fa-ban"></i><div>Total pertes : <b>${fmtN(tot)} œufs</b> = ${(tot/360).toFixed(2)} cartons</div></div>`:''}
        <div class="card"><div class="card-header"><div class="card-title">🚫 Pertes & Casse</div>
          <button class="btn btn-danger btn-sm" onclick="openModal('modal-perte')"><i class="fa fa-plus"></i> Enregistrer</button></div>
          <div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Œufs</th><th>Plateaux</th><th>Cartons</th><th>Cause</th><th></th></tr></thead>
          <tbody>${data.length===0?`<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text3)">Aucune perte</td></tr>`:
          data.map(p=>`<tr>
            <td style="font-size:11px;color:var(--text3)">${p.date_perte}</td>
            <td><span class="badge badge-danger">${p.type_perte}</span></td>
            <td class="td-mono" style="color:var(--danger)">${p.quantite_oeufs}</td>
            <td class="td-mono">${(p.quantite_oeufs/30).toFixed(1)}</td>
            <td class="td-mono">${(p.quantite_oeufs/360).toFixed(2)}</td>
            <td style="font-size:11px">${p.cause||'—'}</td>
            <td>${api.isAdmin()?`<button class="btn btn-danger btn-xs" onclick="deletePerte(${p.id})"><i class="fa fa-trash"></i></button>`:''}</td>
          </tr>`).join('')}</tbody>
          </table></div>
        </div>`;
    }

    else if (page==='repartition') {
      const ventes = await api.ventes({ date:today() });
      const total  = ventes.reduce((s,v)=>s+parseInt(v.quantite||0),0);
      const stk    = await api.stock();
      c.innerHTML=`
        <div class="grid-3">
          <div class="stat-card blue"><div class="stat-icon blue"><i class="fa fa-share-alt"></i></div><div class="stat-label">Distribués aujourd'hui</div><div class="stat-value">${total}</div><div class="stat-sub">cartons</div></div>
          <div class="stat-card green"><div class="stat-icon green"><i class="fa fa-users"></i></div><div class="stat-label">Clients servis</div><div class="stat-value">${ventes.length}</div><div class="stat-sub">clients</div></div>
          <div class="stat-card orange"><div class="stat-icon orange"><i class="fa fa-box"></i></div><div class="stat-label">Stock restant</div><div class="stat-value">${stk.actuel.cartons}</div><div class="stat-sub">cartons disponibles</div></div>
        </div>
        <div class="card"><div class="card-header"><div class="card-title">📦 Distribution d'aujourd'hui</div></div>
          ${ventes.length===0?`<div class="empty-state"><i class="fa fa-share-alt"></i><p>Aucune vente aujourd'hui</p></div>`:`
          <div class="table-wrap"><table><thead><tr><th>Client</th><th>Catégorie</th><th>Qté (ctn)</th><th>Prix/ctn</th><th>Total</th><th>Payé</th><th>Solde</th></tr></thead>
          <tbody>${ventes.map(v=>`<tr>
            <td class="td-bold">${v.client_nom}</td>
            <td><span class="${catBadge(v.categorie)}">${catLabel(v.categorie)}</span></td>
            <td class="td-mono td-bold">${v.quantite}</td>
            <td class="td-mono">${fmtN(v.prix_unitaire)}</td>
            <td class="td-mono">${fmtN(v.total)} GNF</td>
            <td class="td-mono" style="color:var(--success)">${fmtN(v.paiement)} GNF</td>
            <td class="td-mono" style="color:${v.solde>0?'var(--danger)':'var(--text3)'}">${fmtN(v.solde)} GNF</td>
          </tr>`).join('')}</tbody></table></div>`}
        </div>`;
    }

    else if (page==='rapports') {
      c.innerHTML=`
        <div class="card" style="margin-bottom:14px">
          <div class="card-header">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <div class="form-group" style="margin:0"><label class="form-label" style="margin-bottom:4px">Date du rapport</label>
                <input type="date" class="form-input" style="width:auto" id="rapport-date" value="${today()}">
              </div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn btn-secondary btn-sm" onclick="chargerRapport()"><i class="fa fa-search"></i> Charger</button>
              <button class="btn btn-info btn-sm" onclick="ouvrirPDF()"><i class="fa fa-file-pdf"></i> Ouvrir PDF</button>
              <button class="btn btn-secondary btn-sm" onclick="window.print()"><i class="fa fa-print"></i> Imprimer</button>
            </div>
          </div>
        </div>
        <div id="rapport-content"><div class="empty-state"><i class="fa fa-file-alt"></i><p>Cliquez "Charger" pour afficher le rapport</p></div></div>`;
      chargerRapport();
    }

    else if (page==='prix') {
      const data = await api.prix();
      const cats = { revendeur_principal:'Revendeur Principal', autre_revendeur:'Autre Revendeur', patisserie_conso:'Patisserie/Conso' };
      c.innerHTML=`
        <div class="grid-3">
          ${['revendeur_principal','autre_revendeur','patisserie_conso'].map(cat=>{
            const actif=data.find(p=>p.actif&&p.categorie===cat);
            return `<div class="stat-card ${cat==='revendeur_principal'?'blue':cat==='autre_revendeur'?'accent':'orange'}">
              <div class="stat-label">${cats[cat]}</div>
              <div class="stat-value" style="font-size:20px">${actif?fmtN(actif.prix_unitaire):'—'}</div>
              <div class="stat-sub">GNF/carton${actif?' • depuis '+actif.date_effet:' • non configuré'}</div>
            </div>`;
          }).join('')}
        </div>
        <div class="card"><div class="card-header"><div class="card-title">🏷️ Historique des prix</div>
          <button class="btn btn-primary btn-sm" onclick="openModal('modal-prix')"><i class="fa fa-plus"></i> Nouveau prix</button></div>
          <div class="table-wrap"><table><thead><tr><th>Date d'effet</th><th>Catégorie</th><th>Prix (GNF/carton)</th><th>Statut</th></tr></thead>
          <tbody>${data.map(p=>`<tr>
            <td>${p.date_effet}</td>
            <td><span class="${catBadge(p.categorie)}">${cats[p.categorie]||p.categorie}</span></td>
            <td class="td-mono td-bold" style="color:var(--accent)">${fmtN(p.prix_unitaire)}</td>
            <td><span class="badge ${p.actif?'badge-success':'badge-neutral'}">${p.actif?'✓ Actif':'Archivé'}</span></td>
          </tr>`).join('')}</tbody>
          </table></div>
        </div>`;
    }

    else if (page==='import') {
      await renderImportPage();
    }

    else if (page==='utilisateurs') {
      if(!api.isAdmin()) { c.innerHTML=`<div class="alert alert-danger"><i class="fa fa-lock"></i> Accès réservé aux administrateurs.</div>`; return; }
      const users = await api.users();
      const roleLabel = r => r==='admin' ? '👑 Admin' : '💼 Commercial';
      c.innerHTML=`
        <div class="alert alert-info" style="margin-bottom:14px"><i class="fa fa-info-circle"></i>
          <div><b>Admins :</b> Oumar, Abdoulaye, Brahim, Zenab — Accès complet<br>
          <b>Commerciaux :</b> Bechir, Moussa — Ventes, livraisons, recouvrements, stock<br>
          Mot de passe initial : <b>Positive2026!</b></div>
        </div>
        <div class="card"><div class="card-header"><div class="card-title">👥 Utilisateurs</div>
          <button class="btn btn-primary btn-sm" onclick="prepUserForm()"><i class="fa fa-user-plus"></i> Nouvel utilisateur</button></div>
          <div class="table-wrap"><table><thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Statut</th><th>Dernier accès</th><th></th></tr></thead>
          <tbody>${users.map(u=>`<tr>
            <td class="td-bold">${u.nom}</td>
            <td style="font-size:12px">${u.email}</td>
            <td><span class="badge ${u.role==='admin'?'badge-danger':'badge-info'}">${roleLabel(u.role)}</span></td>
            <td><span class="badge ${u.statut==='actif'?'badge-success':'badge-neutral'}">${u.statut}</span></td>
            <td style="font-size:11px;color:var(--text3)">${u.dernier_acces ? new Date(u.dernier_acces).toLocaleDateString('fr-FR') : 'Jamais'}</td>
            <td style="display:flex;gap:3px">
              <button class="btn btn-secondary btn-xs" onclick="prepUserForm(${JSON.stringify(u).replace(/"/g,'&quot;')})"><i class="fa fa-edit"></i></button>
              <button class="btn btn-danger btn-xs" onclick="deleteUser(${u.id})"><i class="fa fa-user-slash"></i></button>
            </td>
          </tr>`).join('')}</tbody>
          </table></div>
        </div>`;
    }

  } catch(e) {
    c.innerHTML=`<div class="alert alert-danger"><i class="fa fa-exclamation-triangle"></i><div><b>Erreur</b><br>${e.message}</div></div>`;
  }
}

// ── FILTRES ───────────────────────────────────────────────
function flt(tbId, searchId, statusId, dateId) {
  const q  = (document.getElementById(searchId)?.value||'').toLowerCase();
  const st = (document.getElementById(statusId)?.value||'').toLowerCase();
  const dt = (document.getElementById(dateId)?.value||'');
  document.querySelectorAll(`#${tbId} tr`).forEach(tr=>{
    const nm = (tr.dataset.client||tr.dataset.nom||'').toLowerCase();
    const s  = (tr.dataset.statut||'').toLowerCase();
    const d  = (tr.dataset.date||'');
    const vQ = !q || nm.includes(q);
    const vS = !st || s===st || (st==='impaye' && (s==='impaye'||s==='partiel'));
    const vD = !dt || d===dt;
    tr.style.display = (vQ&&vS&&vD) ? '' : 'none';
  });
}
function fltClients() {
  const q  = (document.getElementById('cl-s')?.value||'').toLowerCase();
  const cat= (document.getElementById('cl-cat')?.value||'');
  document.querySelectorAll('#clients-tbody tr').forEach(tr=>{
    const nm = tr.dataset.nom||'', cod=tr.dataset.code||'', c=tr.dataset.cat||'';
    tr.style.display=((!q||nm.includes(q)||cod.includes(q))&&(!cat||c===cat))?'':'none';
  });
}
function fltRec() {
  const q   = (document.getElementById('rec-s')?.value||'').toLowerCase();
  const deb = document.getElementById('rec-date-debut')?.value||'';
  const fin = document.getElementById('rec-date-fin')?.value||'';
  document.querySelectorAll('#rec-tbody tr').forEach(tr=>{
    const nm = tr.dataset.client||'', d=tr.dataset.date||'';
    const vQ = !q  || nm.includes(q);
    const vD = (!deb||d>=deb) && (!fin||d<=fin);
    tr.style.display=(vQ&&vD)?'':'none';
  });
}

// ── PAGE IMPORT / EXPORT ──────────────────────────────────
async function renderImportPage() {
  const c = document.getElementById('page-content');
  c.innerHTML = `
  <div class="grid-2">

    <!-- IMPORTS -->
    <div class="card">
      <div class="card-header"><div class="card-title">📥 Importer des données Excel</div></div>
      <div class="card-body">
        <div class="alert alert-info"><i class="fa fa-info-circle"></i>
          <div>Téléchargez d'abord le modèle, remplissez-le, puis importez-le.<br>
          Les colonnes doivent correspondre exactement au modèle.</div>
        </div>

        ${[
          { key:'clients',       label:'Clients',       icon:'fa-users',          color:'var(--success)' },
          { key:'ventes',        label:'Ventes',        icon:'fa-receipt',         color:'var(--accent2)' },
          { key:'recouvrements', label:'Recouvrements', icon:'fa-hand-holding-usd',color:'var(--warning)' },
          { key:'stock',         label:'Stock',         icon:'fa-boxes',           color:'var(--accent3)' },
        ].map(item => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--bg3);border-radius:8px;margin-bottom:8px">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:36px;height:36px;background:${item.color}20;border-radius:8px;display:flex;align-items:center;justify-content:center;color:${item.color}"><i class="fa ${item.icon}"></i></div>
              <div>
                <div style="font-size:13px;font-weight:600">${item.label}</div>
                <div style="font-size:11px;color:var(--text3)">Importer depuis Excel</div>
              </div>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-secondary btn-sm" onclick="excel.modele('${item.key}')" title="Télécharger le modèle vide">
                <i class="fa fa-download"></i> Modèle
              </button>
              <label class="btn btn-primary btn-sm" style="cursor:pointer;margin:0">
                <i class="fa fa-upload"></i> Importer
                <input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="importerExcel('${item.key}', this)">
              </label>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- EXPORTS -->
    <div class="card">
      <div class="card-header"><div class="card-title">📤 Exporter les données</div></div>
      <div class="card-body">

        <div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Export direct</div>
        ${[
          { fn:"excel.exportClients()",       label:'Clients complet',    icon:'fa-users',    color:'var(--success)' },
          { fn:"excel.exportImpayes()",        label:'Impayés',            icon:'fa-exclamation-triangle', color:'var(--danger)' },
        ].map(item => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:var(--bg3);border-radius:8px;margin-bottom:6px">
            <div style="display:flex;align-items:center;gap:8px">
              <i class="fa ${item.icon}" style="color:${item.color};width:16px"></i>
              <span style="font-size:13px">${item.label}</span>
            </div>
            <button class="btn btn-success btn-sm" onclick="${item.fn}"><i class="fa fa-file-excel"></i> Excel</button>
          </div>
        `).join('')}

        <div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin:14px 0 10px">Export par période</div>

        <div style="background:var(--bg3);border-radius:8px;padding:12px;margin-bottom:8px">
          <div style="font-size:12px;font-weight:600;margin-bottom:8px"><i class="fa fa-receipt" style="color:var(--accent2)"></i> Ventes</div>
          <div class="form-row" style="margin-bottom:8px">
            <div class="form-group" style="margin:0"><label class="form-label">Du</label><input type="date" class="form-input" id="exp-ventes-deb"></div>
            <div class="form-group" style="margin:0"><label class="form-label">Au</label><input type="date" class="form-input" id="exp-ventes-fin"></div>
          </div>
          <button class="btn btn-success btn-sm" onclick="exportVentes()"><i class="fa fa-file-excel"></i> Exporter</button>
        </div>

        <div style="background:var(--bg3);border-radius:8px;padding:12px;margin-bottom:8px">
          <div style="font-size:12px;font-weight:600;margin-bottom:8px"><i class="fa fa-hand-holding-usd" style="color:var(--warning)"></i> Recouvrements</div>
          <div class="form-row" style="margin-bottom:8px">
            <div class="form-group" style="margin:0"><label class="form-label">Du</label><input type="date" class="form-input" id="exp-rec-deb"></div>
            <div class="form-group" style="margin:0"><label class="form-label">Au</label><input type="date" class="form-input" id="exp-rec-fin"></div>
          </div>
          <button class="btn btn-success btn-sm" onclick="exportRecouvrements()"><i class="fa fa-file-excel"></i> Exporter</button>
        </div>

        <div style="background:var(--bg3);border-radius:8px;padding:12px;margin-bottom:8px">
          <div style="font-size:12px;font-weight:600;margin-bottom:8px"><i class="fa fa-file-alt" style="color:var(--accent)"></i> Rapport journalier (Excel)</div>
          <div class="form-group" style="margin-bottom:8px"><label class="form-label">Date</label>
            <input type="date" class="form-input" id="exp-rapport-date" value="${today()}">
          </div>
          <button class="btn btn-success btn-sm" onclick="exportRapport()"><i class="fa fa-file-excel"></i> Exporter rapport</button>
        </div>

        <div style="background:var(--bg3);border-radius:8px;padding:12px">
          <div style="font-size:12px;font-weight:600;margin-bottom:8px"><i class="fa fa-university" style="color:var(--accent2)"></i> Banque</div>
          <div class="form-row" style="margin-bottom:8px">
            <div class="form-group" style="margin:0"><label class="form-label">Du</label><input type="date" class="form-input" id="exp-bnk-deb"></div>
            <div class="form-group" style="margin:0"><label class="form-label">Au</label><input type="date" class="form-input" id="exp-bnk-fin"></div>
          </div>
          <button class="btn btn-success btn-sm" onclick="exportBanque()"><i class="fa fa-file-excel"></i> Exporter</button>
        </div>

      </div>
    </div>
  </div>

  <!-- RÉSULTATS IMPORT -->
  <div id="import-result" style="display:none" class="card" style="margin-top:14px">
    <div class="card-header"><div class="card-title" id="import-result-title">Résultat import</div></div>
    <div class="card-body" id="import-result-body"></div>
  </div>`;
}

async function importerExcel(type, input) {
  const file = input.files[0];
  if (!file) return;
  showNotif(`Import ${type} en cours...`, 'warning');
  try {
    const fnMap = {
      clients:       () => excel.importClients(file),
      ventes:        () => excel.importVentes(file),
      recouvrements: () => excel.importRecouvrements(file),
      stock:         () => excel.importStock(file),
    };
    const result = await fnMap[type]();
    input.value = '';

    // Afficher résultat
    const resEl = document.getElementById('import-result');
    const titleEl = document.getElementById('import-result-title');
    const bodyEl  = document.getElementById('import-result-body');
    resEl.style.display = '';
    titleEl.textContent = `Résultat import ${type}`;

    const ok = result.imported || 0;
    const total = result.total || 0;
    const errors = result.errors || [];

    bodyEl.innerHTML = `
      <div class="alert alert-${ok>0?'success':'warning'}">
        <i class="fa fa-${ok>0?'check-circle':'exclamation-triangle'}"></i>
        <div><b>${ok} lignes importées</b> sur ${total} total${errors.length>0?` — ${errors.length} erreur(s)`:''}</div>
      </div>
      ${errors.length>0?`<div style="margin-top:10px"><div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--danger)">Erreurs :</div>
        ${errors.map(e=>`<div style="font-size:11px;color:var(--danger);padding:3px 0;border-bottom:1px solid var(--border)">${e}</div>`).join('')}
      </div>`:''}`;

    if (ok > 0) {
      showNotif(`${ok} ${type} importés avec succès !`);
      loadBadge();
    }
  } catch(e) {
    showNotif(e.message, 'error');
    input.value = '';
  }
}

function exportVentes() {
  const deb = document.getElementById('exp-ventes-deb')?.value;
  const fin = document.getElementById('exp-ventes-fin')?.value;
  excel.exportVentes(deb||fin ? { date_debut:deb, date_fin:fin } : {});
}
function exportRecouvrements() {
  const deb = document.getElementById('exp-rec-deb')?.value;
  const fin = document.getElementById('exp-rec-fin')?.value;
  excel.exportRecouvrements(deb||fin ? { date_debut:deb, date_fin:fin } : {});
}
function exportRapport() {
  const date = document.getElementById('exp-rapport-date')?.value || today();
  excel.exportRapport(date);
}
function exportBanque() {
  const deb = document.getElementById('exp-bnk-deb')?.value;
  const fin = document.getElementById('exp-bnk-fin')?.value;
  excel.exportBanque(deb||fin ? { date_debut:deb, date_fin:fin } : {});
}
