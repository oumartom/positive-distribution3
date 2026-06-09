const API_BASE = '';

const api = {
  token: localStorage.getItem('pd_token') || null,

  headers() {
    return {
      'Content-Type': 'application/json',
      ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {})
    };
  },

  async request(method, endpoint, body = null) {
    const opts = { method, headers: this.headers() };
    if (body) opts.body = JSON.stringify(body);
    const res  = await fetch(API_BASE + endpoint, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
    return data;
  },

  get:    (ep)      => api.request('GET',    ep),
  post:   (ep, b)   => api.request('POST',   ep, b),
  put:    (ep, b)   => api.request('PUT',    ep, b),
  del:    (ep)      => api.request('DELETE', ep),

  // Auth
  async login(email, mot_de_passe) {
    const data = await this.post('/api/auth/login', { email, mot_de_passe });
    this.token = data.token;
    localStorage.setItem('pd_token', data.token);
    localStorage.setItem('pd_user',  JSON.stringify(data.user));
    return data;
  },
  logout()     { this.token = null; localStorage.removeItem('pd_token'); localStorage.removeItem('pd_user'); window.location.reload(); },
  isLoggedIn() { return !!this.token; },
  currentUser(){ try { return JSON.parse(localStorage.getItem('pd_user')); } catch { return null; } },
  isAdmin()    { return this.currentUser()?.role === 'admin'; },

  // Users
  users:          ()       => api.get('/api/auth/users'),
  createUser:     (b)      => api.post('/api/auth/users', b),
  updateUser:     (id, b)  => api.put(`/api/auth/users/${id}`, b),
  deleteUser:     (id)     => api.del(`/api/auth/users/${id}`),
  resetPassword:  (b)      => api.post('/api/auth/reset-password', b),

  // Clients
  clients:        (p={})   => api.get('/api/clients?' + new URLSearchParams(p)),
  client:         (id)     => api.get(`/api/clients/${id}`),
  createClient:   (b)      => api.post('/api/clients', b),
  updateClient:   (id, b)  => api.put(`/api/clients/${id}`, b),
  deleteClient:   (id)     => api.del(`/api/clients/${id}`),

  // Ventes
  ventes:         (p={})   => api.get('/api/ventes?' + new URLSearchParams(p)),
  prixClient:     (id)     => api.get(`/api/ventes/prix-client/${id}`),
  createVente:    (b)      => api.post('/api/ventes', b),
  updateVente:    (id, b)  => api.put(`/api/ventes/${id}`, b),
  deleteVente:    (id)     => api.del(`/api/ventes/${id}`),

  // Livraisons
  livraisons:     ()       => api.get('/api/livraisons'),
  createLivraison:(b)      => api.post('/api/livraisons', b),
  updateLivraison:(id, b)  => api.put(`/api/livraisons/${id}`, b),
  deleteLivraison:(id)     => api.del(`/api/livraisons/${id}`),

  // Recouvrements
  recouvrements:  (p={})   => api.get('/api/recouvrements?' + new URLSearchParams(p)),
  createRecouvrement:(b)   => api.post('/api/recouvrements', b),
  updateRecouvrement:(id,b)=> api.put(`/api/recouvrements/${id}`, b),
  deleteRecouvrement:(id)  => api.del(`/api/recouvrements/${id}`),

  // Impayés
  impayes:        ()       => api.get('/api/impayes'),

  // Stock
  stock:          ()       => api.get('/api/stock'),
  ajusterStock:   (b)      => api.post('/api/stock/ajuster', b),

  // Pertes
  pertes:         ()       => api.get('/api/pertes'),
  createPerte:    (b)      => api.post('/api/pertes', b),
  deletePerte:    (id)     => api.del(`/api/pertes/${id}`),

  // Banque
  banque:         (p={})   => api.get('/api/banque?' + new URLSearchParams(p)),
  createBanque:   (b)      => api.post('/api/banque', b),
  updateBanque:   (id, b)  => api.put(`/api/banque/${id}`, b),
  deleteBanque:   (id)     => api.del(`/api/banque/${id}`),

  // Prix
  prix:           ()       => api.get('/api/prix'),
  createPrix:     (b)      => api.post('/api/prix', b),

  // Rapport
  rapport:        (date)   => api.get(`/api/rapport/${date}`),
  rapportPdf:     (date)   => { window.open(`/api/rapport/${date}/pdf?token=${api.token}`, '_blank'); },

  // Dashboard
  dashboard:      ()       => api.get('/api/dashboard'),

  // Upload
  async upload(file) {
    const form = new FormData();
    form.append('fichier', file);
    const res = await fetch('/api/upload', { method:'POST', headers:{ 'Authorization': `Bearer ${this.token}` }, body: form });
    return res.json();
  }
};

// ── UTILITAIRES ──────────────────────────────────────────
const fmt  = n => new Intl.NumberFormat('fr-FR').format(Math.round(n||0)) + ' GNF';
const fmtN = n => new Intl.NumberFormat('fr-FR').format(Math.round(n||0));
const today = () => new Date().toISOString().slice(0,10);

const CAT_LABELS = { revendeur_principal:'Revendeur Principal', autre_revendeur:'Autre Revendeur', patisserie_conso:'Patisserie/Conso' };
const CAT_BADGE  = { revendeur_principal:'cat-principal', autre_revendeur:'cat-revendeur', patisserie_conso:'cat-patisserie' };
const catLabel = c => CAT_LABELS[c] || c || '—';
const catBadge = c => CAT_BADGE[c]  || 'badge-neutral';

function showNotif(msg, type='success') {
  const color = type==='success' ? 'var(--success)' : type==='warning' ? 'var(--warning)' : 'var(--danger)';
  const n = document.createElement('div');
  n.style.cssText = `position:fixed;bottom:24px;right:24px;background:var(--bg2);border:1.5px solid ${color};color:${color};padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 24px rgba(0,0,0,.3);transition:opacity .3s;max-width:380px`;
  n.textContent = (type==='success'?'✓  ':'✗  ') + msg;
  document.body.appendChild(n);
  setTimeout(()=>n.style.opacity='0', 3000);
  setTimeout(()=>n.remove(), 3400);
}

function showLoading(el) {
  if (el) el.innerHTML = `<div style="text-align:center;padding:56px;color:var(--text3)"><i class="fa fa-spinner fa-spin" style="font-size:28px"></i><p style="margin-top:12px;font-size:13px">Chargement...</p></div>`;
}

async function confirm(msg) {
  return window.confirm(msg);
}

// Popule un <select> avec les clients
async function populateClientSelect(selId, selectedId=null) {
  try {
    const clients = await api.clients({ statut:'actif' });
    const sel = document.getElementById(selId);
    if (!sel) return clients;
    sel.innerHTML = '<option value="">-- Sélectionner un client --</option>';
    clients.forEach(c => {
      const o = document.createElement('option');
      o.value = c.id;
      o.dataset.categorie = c.categorie;
      o.dataset.solde = c.solde_global;
      o.textContent = `${c.nom} (${catLabel(c.categorie)})`;
      if (selectedId && c.id == selectedId) o.selected = true;
      sel.appendChild(o);
    });
    return clients;
  } catch(e) { console.error(e); return []; }
}

// ── EXCEL ────────────────────────────────────────────────
const excel = {
  // Imports
  importClients:      (file) => uploadExcel('/api/excel/import/clients', file),
  importVentes:       (file) => uploadExcel('/api/excel/import/ventes', file),
  importRecouvrements:(file) => uploadExcel('/api/excel/import/recouvrements', file),
  importStock:        (file) => uploadExcel('/api/excel/import/stock', file),
  // Exports
  exportClients:      ()          => dlExcel('/api/excel/export/clients'),
  exportVentes:       (p={})      => dlExcel('/api/excel/export/ventes?' + new URLSearchParams(p)),
  exportImpayes:      ()          => dlExcel('/api/excel/export/impayes'),
  exportRecouvrements:(p={})      => dlExcel('/api/excel/export/recouvrements?' + new URLSearchParams(p)),
  exportRapport:      (date)      => dlExcel(`/api/excel/export/rapport/${date}`),
  exportBanque:       (p={})      => dlExcel('/api/excel/export/banque?' + new URLSearchParams(p)),
  // Modèles
  modele:             (type)      => dlExcel(`/api/excel/modele/${type}`),
};

async function uploadExcel(endpoint, file) {
  const form = new FormData();
  form.append('fichier', file);
  const res  = await fetch(endpoint, { method:'POST', headers:{ 'Authorization':`Bearer ${api.token}` }, body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur import');
  return data;
}

function dlExcel(url) {
  const a = document.createElement('a');
  a.href  = url + (url.includes('?') ? '&' : '?') + `token=${api.token}`;
  a.click();
}
