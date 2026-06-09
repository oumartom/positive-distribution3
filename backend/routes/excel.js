const router  = require('express').Router();
const db      = require('../config/db');
const auth    = require('../middleware/auth');
const multer  = require('multer');
const XLSX    = require('xlsx');
const ExcelJS = require('exceljs');
const path    = require('path');
const fs      = require('fs');

// Upload temporaire pour les imports
const upload = multer({
  dest: path.join(__dirname, '../uploads/tmp/'),
  limits: { fileSize: 20 * 1024 * 1024 }
});

// ─── HELPER : lire un fichier Excel uploadé ──────────────
function readExcel(filePath) {
  const wb   = XLSX.readFile(filePath);
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
  fs.unlinkSync(filePath); // supprimer le fichier tmp
  return data;
}

// ─── HELPER : style header ExcelJS ───────────────────────
function styleHeader(row, color = '006644') {
  row.eachCell(cell => {
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + color } };
    cell.font   = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFcccccc' } } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  row.height = 22;
}

// ══════════════════════════════════════════════════════════
//  IMPORTS
// ══════════════════════════════════════════════════════════

// POST /api/excel/import/clients
router.post('/import/clients', auth, upload.single('fichier'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier requis' });
  try {
    const rows = readExcel(req.file.path);
    let imported = 0, errors = [];

    for (const row of rows) {
      const nom = (row['Nom'] || row['nom'] || row['NAME'] || '').toString().trim();
      if (!nom) continue;

      const categorie = normalizeCategorie(row['Categorie'] || row['catégorie'] || row['categorie'] || '');
      const code_custom = (row['Code'] || row['code'] || '').toString().trim();

      try {
        // Générer un code si absent
        const [last] = await db.query('SELECT MAX(id) as mid FROM clients');
        const nextId = (last[0].mid || 0) + 1;
        const code = code_custom || `CLI-${String(nextId).padStart(3, '0')}`;

        await db.query(
          `INSERT IGNORE INTO clients (code, nom, telephone, zone, adresse, categorie, statut, observation, solde_global)
           VALUES (?, ?, ?, ?, ?, ?, 'actif', ?, ?)`,
          [
            code, nom,
            (row['Telephone'] || row['téléphone'] || row['Tel'] || '').toString().trim() || null,
            (row['Zone'] || row['zone'] || '').toString().trim() || null,
            (row['Adresse'] || row['adresse'] || '').toString().trim() || null,
            categorie,
            (row['Observation'] || row['observation'] || '').toString().trim() || null,
            parseFloat(row['Solde'] || row['solde'] || row['Impayé'] || row['impaye'] || 0) || 0
          ]
        );
        imported++;
      } catch (e) {
        errors.push(`Ligne ${imported + errors.length + 2}: ${e.message}`);
      }
    }

    res.json({ success: true, imported, errors, total: rows.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/excel/import/ventes
router.post('/import/ventes', auth, upload.single('fichier'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier requis' });
  try {
    const rows = readExcel(req.file.path);
    let imported = 0, errors = [];

    for (const [i, row] of rows.entries()) {
      try {
        const clientNom = (row['Client'] || row['client'] || '').toString().trim();
        const dateVente = parseDate(row['Date'] || row['date'] || '');
        const quantite  = parseInt(row['Quantite'] || row['quantité'] || row['Qte'] || 0);
        const paiement  = parseFloat(row['Paiement'] || row['paiement'] || row['Paye'] || 0) || 0;
        const pu        = parseFloat(row['PU'] || row['Prix'] || row['prix_unitaire'] || 0) || 0;

        if (!clientNom || !dateVente || !quantite) continue;

        // Trouver le client
        const [clients] = await db.query(
          'SELECT id, categorie FROM clients WHERE nom LIKE ? LIMIT 1',
          [`%${clientNom}%`]
        );
        if (!clients.length) { errors.push(`Ligne ${i+2}: Client "${clientNom}" non trouvé`); continue; }

        const client = clients[0];
        let prixU = pu;
        if (!prixU) {
          const [prix] = await db.query(
            'SELECT prix_unitaire FROM prix_carton WHERE categorie=? AND actif=TRUE LIMIT 1',
            [client.categorie]
          );
          prixU = prix[0]?.prix_unitaire || 29500;
        }

        const total = quantite * prixU;
        const solde = Math.max(0, total - paiement);

        const [maxNum] = await db.query('SELECT MAX(numero) as mx FROM ventes WHERE date_vente=?', [dateVente]);
        const numero = (maxNum[0].mx || 0) + 1;

        await db.query(
          'INSERT INTO ventes (date_vente,numero,client_id,quantite,prix_unitaire,total,paiement,solde,observations,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [dateVente, numero, client.id, quantite, prixU, total, paiement, solde,
           (row['Observations'] || row['observation'] || '').toString() || null, req.user.id]
        );

        // Mettre à jour le solde client
        await db.query(
          'UPDATE clients SET solde_global=(SELECT COALESCE(SUM(solde),0) FROM ventes WHERE client_id=?) WHERE id=?',
          [client.id, client.id]
        );
        imported++;
      } catch (e) {
        errors.push(`Ligne ${i+2}: ${e.message}`);
      }
    }

    res.json({ success: true, imported, errors, total: rows.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/excel/import/recouvrements
router.post('/import/recouvrements', auth, upload.single('fichier'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier requis' });
  try {
    const rows = readExcel(req.file.path);
    let imported = 0, errors = [];

    for (const [i, row] of rows.entries()) {
      try {
        const clientNom = (row['Client'] || row['client'] || '').toString().trim();
        const date      = parseDate(row['Date'] || row['date'] || '');
        const montant   = parseFloat(row['Montant'] || row['montant'] || row['Montant recu'] || 0);
        if (!clientNom || !date || !montant) continue;

        const [clients] = await db.query('SELECT id FROM clients WHERE nom LIKE ? LIMIT 1', [`%${clientNom}%`]);
        if (!clients.length) { errors.push(`Ligne ${i+2}: Client "${clientNom}" non trouvé`); continue; }

        const cid = clients[0].id;
        const [cl] = await db.query('SELECT solde_global FROM clients WHERE id=?', [cid]);
        const restant = Math.max(0, parseFloat(cl[0]?.solde_global || 0) - montant);

        await db.query(
          'INSERT INTO recouvrements (client_id,date_paiement,montant_recu,montant_restant,observation,created_by) VALUES (?,?,?,?,?,?)',
          [cid, date, montant, restant, (row['Observation'] || '').toString() || null, req.user.id]
        );
        await db.query('UPDATE clients SET solde_global=? WHERE id=?', [restant, cid]);
        imported++;
      } catch (e) {
        errors.push(`Ligne ${i+2}: ${e.message}`);
      }
    }
    res.json({ success: true, imported, errors, total: rows.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/excel/import/stock
router.post('/import/stock', auth, upload.single('fichier'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier requis' });
  try {
    const rows = readExcel(req.file.path);
    let imported = 0;

    for (const row of rows) {
      const type    = (row['Type'] || row['type'] || 'entree').toLowerCase().trim();
      const cartons = parseInt(row['Cartons'] || row['cartons'] || 0) || 0;
      const plateaux= parseInt(row['Plateaux'] || row['plateaux'] || 0) || 0;
      const oeufs   = parseInt(row['Oeufs'] || row['oeufs'] || row['Œufs'] || 0) || 0;
      const date    = parseDate(row['Date'] || row['date'] || '') || new Date().toISOString().slice(0,10);
      const motif   = (row['Motif'] || row['motif'] || 'Import Excel').toString();

      if (!cartons && !plateaux && !oeufs) continue;

      await db.query(
        'INSERT INTO stock_mouvements (date_mouvement,type_mouvement,cartons,plateaux,oeufs,motif,created_by) VALUES (?,?,?,?,?,?,?)',
        [date, type, cartons, plateaux, oeufs, motif, req.user.id]
      );
      if (type === 'entree') {
        await db.query('UPDATE stock_actuel SET cartons=cartons+?,plateaux=plateaux+?,oeufs=oeufs+? WHERE id=1', [cartons,plateaux,oeufs]);
      } else {
        await db.query('UPDATE stock_actuel SET cartons=GREATEST(0,cartons-?),plateaux=GREATEST(0,plateaux-?),oeufs=GREATEST(0,oeufs-?) WHERE id=1', [cartons,plateaux,oeufs]);
      }
      imported++;
    }
    res.json({ success: true, imported, total: rows.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════
//  EXPORTS
// ══════════════════════════════════════════════════════════

// GET /api/excel/export/clients
// export
router.get('/export/clients', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM clients WHERE statut != "archive" ORDER BY nom');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Clients');
    ws.columns = [
      { header: 'Code',       key: 'code',       width: 12 },
      { header: 'Nom',        key: 'nom',         width: 30 },
      { header: 'Telephone',  key: 'telephone',   width: 18 },
      { header: 'Zone',       key: 'zone',        width: 20 },
      { header: 'Categorie',  key: 'categorie',   width: 22 },
      { header: 'Statut',     key: 'statut',      width: 10 },
      { header: 'Solde (GNF)',key: 'solde_global',width: 16 },
      { header: 'Observation',key: 'observation', width: 30 },
    ];
    styleHeader(ws.getRow(1));
    rows.forEach(r => {
      const row = ws.addRow(r);
      if (parseFloat(r.solde_global) > 0) {
        row.getCell('solde_global').font = { color: { argb: 'FFCC0000' }, bold: true };
      }
      row.getCell('solde_global').numFmt = '#,##0';
    });
    ws.autoFilter = { from: 'A1', to: 'H1' };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="clients_${today()}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/excel/export/ventes?date_debut=&date_fin=
// export
router.get('/export/ventes', auth, async (req, res) => {
  try {
    const { date_debut, date_fin, date } = req.query;
    let sql = `SELECT v.*, c.nom as client_nom, c.zone, c.categorie
               FROM ventes v JOIN clients c ON v.client_id=c.id WHERE 1=1`;
    const p = [];
    if (date)       { sql += ' AND v.date_vente=?';   p.push(date); }
    if (date_debut) { sql += ' AND v.date_vente>=?';  p.push(date_debut); }
    if (date_fin)   { sql += ' AND v.date_vente<=?';  p.push(date_fin); }
    sql += ' ORDER BY v.date_vente DESC, v.numero';
    const [rows] = await db.query(sql, p);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Ventes');
    ws.columns = [
      { header: 'Date',         key: 'date_vente',    width: 14 },
      { header: 'N°',           key: 'numero',        width: 6  },
      { header: 'Client',       key: 'client_nom',    width: 28 },
      { header: 'Zone',         key: 'zone',          width: 18 },
      { header: 'Categorie',    key: 'categorie',     width: 22 },
      { header: 'Quantite',     key: 'quantite',      width: 10 },
      { header: 'PU (GNF)',     key: 'prix_unitaire', width: 14 },
      { header: 'Total (GNF)',  key: 'total',         width: 16 },
      { header: 'Paiement',     key: 'paiement',      width: 16 },
      { header: 'Solde (GNF)',  key: 'solde',         width: 16 },
      { header: 'Observations', key: 'observations',  width: 30 },
    ];
    styleHeader(ws.getRow(1));
    rows.forEach(r => {
      const row = ws.addRow(r);
      ['prix_unitaire','total','paiement','solde'].forEach(k => {
        row.getCell(k).numFmt = '#,##0';
      });
      if (parseFloat(r.solde) > 0) row.getCell('solde').font = { color: { argb: 'FFCC0000' }, bold: true };
      if (parseFloat(r.paiement) > 0 && parseFloat(r.solde) === 0) row.getCell('solde').font = { color: { argb: 'FF006644' } };
    });

    // Ligne totaux
    const lastRow = ws.lastRow.number + 1;
    ws.getCell(`F${lastRow}`).value = { formula: `SUM(F2:F${lastRow-1})` };
    ws.getCell(`H${lastRow}`).value = { formula: `SUM(H2:H${lastRow-1})` };
    ws.getCell(`I${lastRow}`).value = { formula: `SUM(I2:I${lastRow-1})` };
    ws.getCell(`J${lastRow}`).value = { formula: `SUM(J2:J${lastRow-1})` };
    ['F','H','I','J'].forEach(c => {
      ws.getCell(`${c}${lastRow}`).font = { bold: true };
      ws.getCell(`${c}${lastRow}`).numFmt = '#,##0';
      ws.getCell(`${c}${lastRow}`).fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFe8f5e9' } };
    });
    ws.getCell(`A${lastRow}`).value = 'TOTAUX';
    ws.getCell(`A${lastRow}`).font  = { bold: true };
    ws.autoFilter = { from: 'A1', to: 'K1' };

    const suffix = date||`${date_debut||'debut'}_${date_fin||'fin'}`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="ventes_${suffix}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/excel/export/impayes
// export
router.get('/export/impayes', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.code,c.nom,c.telephone,c.zone,c.categorie,c.solde_global,
              MAX(v.date_vente) as derniere_vente
       FROM clients c LEFT JOIN ventes v ON c.id=v.client_id AND v.solde>0
       WHERE c.solde_global>0 GROUP BY c.id ORDER BY c.solde_global DESC`
    );
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Impayés');
    ws.columns = [
      { header: 'Code',           key: 'code',           width: 12 },
      { header: 'Client',         key: 'nom',            width: 30 },
      { header: 'Téléphone',      key: 'telephone',      width: 18 },
      { header: 'Zone',           key: 'zone',           width: 18 },
      { header: 'Catégorie',      key: 'categorie',      width: 22 },
      { header: 'Solde dû (GNF)', key: 'solde_global',   width: 18 },
      { header: 'Dernière vente', key: 'derniere_vente', width: 16 },
    ];
    styleHeader(ws.getRow(1), 'CC0000');
    rows.forEach(r => {
      const row = ws.addRow(r);
      row.getCell('solde_global').numFmt  = '#,##0';
      row.getCell('solde_global').font    = { color: { argb: 'FFCC0000' }, bold: true };
    });
    // Total
    const lr = ws.lastRow.number + 1;
    ws.getCell(`A${lr}`).value = 'TOTAL IMPAYÉS';
    ws.getCell(`A${lr}`).font  = { bold: true };
    ws.getCell(`F${lr}`).value = { formula: `SUM(F2:F${lr-1})` };
    ws.getCell(`F${lr}`).numFmt= '#,##0';
    ws.getCell(`F${lr}`).font  = { bold: true, color: { argb: 'FFCC0000' } };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="impayes_${today()}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/excel/export/recouvrements
// export
router.get('/export/recouvrements', auth, async (req, res) => {
  try {
    const { date_debut, date_fin } = req.query;
    let sql = `SELECT r.*,c.nom as client_nom,c.zone FROM recouvrements r JOIN clients c ON r.client_id=c.id WHERE 1=1`;
    const p = [];
    if (date_debut) { sql += ' AND r.date_paiement>=?'; p.push(date_debut); }
    if (date_fin)   { sql += ' AND r.date_paiement<=?'; p.push(date_fin); }
    sql += ' ORDER BY r.date_paiement DESC';
    const [rows] = await db.query(sql, p);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Recouvrements');
    ws.columns = [
      { header: 'Date',            key: 'date_paiement',  width: 14 },
      { header: 'Client',          key: 'client_nom',     width: 28 },
      { header: 'Zone',            key: 'zone',           width: 18 },
      { header: 'Montant reçu',    key: 'montant_recu',   width: 16 },
      { header: 'Montant restant', key: 'montant_restant',width: 16 },
      { header: 'Date suivi',      key: 'date_suivi',     width: 14 },
      { header: 'Observation',     key: 'observation',    width: 30 },
    ];
    styleHeader(ws.getRow(1), '1565C0');
    rows.forEach(r => {
      const row = ws.addRow(r);
      row.getCell('montant_recu').numFmt    = '#,##0';
      row.getCell('montant_restant').numFmt = '#,##0';
      row.getCell('montant_recu').font      = { color: { argb: 'FF006644' }, bold: true };
      if (parseFloat(r.montant_restant) > 0) row.getCell('montant_restant').font = { color: { argb: 'FFCC0000' } };
    });
    const lr = ws.lastRow.number + 1;
    ws.getCell(`A${lr}`).value = 'TOTAL';
    ws.getCell(`A${lr}`).font  = { bold: true };
    ws.getCell(`D${lr}`).value = { formula: `SUM(D2:D${lr-1})` };
    ws.getCell(`D${lr}`).numFmt= '#,##0';
    ws.getCell(`D${lr}`).font  = { bold: true, color: { argb: 'FF006644' } };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="recouvrements_${today()}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/excel/export/rapport/:date
// export
router.get('/export/rapport/:date', auth, async (req, res) => {
  try {
    const date = req.params.date;
    const [ventes]  = await db.query('SELECT v.*,c.nom as client_nom,c.categorie FROM ventes v JOIN clients c ON v.client_id=c.id WHERE v.date_vente=? ORDER BY v.numero',[date]);
    const [recouv]  = await db.query('SELECT r.*,c.nom as client_nom FROM recouvrements r JOIN clients c ON r.client_id=c.id WHERE r.date_paiement=?',[date]);
    const [livr]    = await db.query('SELECT * FROM livraisons WHERE date_livraison=?',[date]);
    const [stock]   = await db.query('SELECT * FROM stock_actuel WHERE id=1');
    const [totaux]  = await db.query('SELECT COALESCE(SUM(total),0) as tv,COALESCE(SUM(paiement),0) as te,COALESCE(SUM(solde),0) as ti,COALESCE(SUM(quantite),0) as cartons FROM ventes WHERE date_vente=?',[date]);
    const t = totaux[0];
    const totalRecouv = recouv.reduce((s,r)=>s+parseFloat(r.montant_recu||0),0);

    const wb = new ExcelJS.Workbook();

    // FEUILLE 1 : Résumé
    const wsR = wb.addWorksheet('Rapport');
    wsR.mergeCells('A1:F1');
    wsR.getCell('A1').value     = `RAPPORT JOURNALIER — ${date}`;
    wsR.getCell('A1').font      = { bold: true, size: 14, color: { argb: 'FF006644' } };
    wsR.getCell('A1').alignment = { horizontal: 'center' };
    wsR.getRow(1).height        = 28;

    wsR.addRow([]);
    const hR = wsR.addRow(['RÉSUMÉ', '', '', '', '', '']);
    styleHeader(hR);
    wsR.addRow(['Qté livrée',     `${livr[0]?.quantite_cartons||0} cartons`, '', 'Total ventes',    `${t.tv} GNF`, '']);
    wsR.addRow(['Qté distribuée', `${t.cartons} cartons`,                   '', 'Cash encaissé',   `${t.te} GNF`, '']);
    wsR.addRow(['Stock restant',  `${stock[0]?.cartons||0} cartons`,         '', 'Recouvrements',   `${totalRecouv} GNF`, '']);
    wsR.addRow(['',               '',                                         '', 'TOTAL CASH',      `${parseFloat(t.te)+totalRecouv} GNF`, '']);
    wsR.addRow(['',               '',                                         '', 'Impayés du jour', `${t.ti} GNF`, '']);

    // FEUILLE 2 : Ventes détail
    const wsV = wb.addWorksheet('Ventes');
    wsV.columns = [
      { header:'N°',       key:'numero',       width:6  },
      { header:'Client',   key:'client_nom',   width:28 },
      { header:'Catégorie',key:'categorie',    width:22 },
      { header:'Qté',      key:'quantite',     width:8  },
      { header:'P.U.',     key:'prix_unitaire',width:14 },
      { header:'Total',    key:'total',        width:16 },
      { header:'Payé',     key:'paiement',     width:16 },
      { header:'Solde',    key:'solde',        width:16 },
      { header:'Obs.',     key:'observations', width:24 },
    ];
    styleHeader(wsV.getRow(1));
    ventes.forEach(v => {
      const row = wsV.addRow(v);
      ['prix_unitaire','total','paiement','solde'].forEach(k => row.getCell(k).numFmt='#,##0');
      if (parseFloat(v.solde)>0) row.getCell('solde').font={color:{argb:'FFCC0000'},bold:true};
    });
    const lv = wsV.lastRow.number+1;
    wsV.getCell(`D${lv}`).value={formula:`SUM(D2:D${lv-1})`};
    wsV.getCell(`F${lv}`).value={formula:`SUM(F2:F${lv-1})`};
    wsV.getCell(`G${lv}`).value={formula:`SUM(G2:G${lv-1})`};
    wsV.getCell(`H${lv}`).value={formula:`SUM(H2:H${lv-1})`};
    ['D','F','G','H'].forEach(c=>{wsV.getCell(`${c}${lv}`).font={bold:true};wsV.getCell(`${c}${lv}`).numFmt='#,##0';});
    wsV.getCell(`A${lv}`).value='TOTAUX'; wsV.getCell(`A${lv}`).font={bold:true};

    // FEUILLE 3 : Recouvrements
    if (recouv.length > 0) {
      const wsRec = wb.addWorksheet('Recouvrements');
      wsRec.columns = [
        { header:'Client',       key:'client_nom',    width:28 },
        { header:'Montant reçu', key:'montant_recu',  width:16 },
        { header:'Restant',      key:'montant_restant',width:16 },
        { header:'Observation',  key:'observation',   width:30 },
      ];
      styleHeader(wsRec.getRow(1), '1565C0');
      recouv.forEach(r => {
        const row = wsRec.addRow(r);
        row.getCell('montant_recu').numFmt='#,##0';
        row.getCell('montant_restant').numFmt='#,##0';
        row.getCell('montant_recu').font={color:{argb:'FF006644'},bold:true};
      });
      const lr=wsRec.lastRow.number+1;
      wsRec.getCell(`A${lr}`).value='TOTAL CASH'; wsRec.getCell(`A${lr}`).font={bold:true};
      wsRec.getCell(`B${lr}`).value={formula:`SUM(B2:B${lr-1})`};
      wsRec.getCell(`B${lr}`).numFmt='#,##0';
      wsRec.getCell(`B${lr}`).font={bold:true,color:{argb:'FF006644'}};
    }

    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename="rapport_${date}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/excel/export/banque
// export
router.get('/export/banque', auth, async (req, res) => {
  try {
    const { date_debut, date_fin } = req.query;
    let sql = 'SELECT * FROM banque_mouvements WHERE 1=1';
    const p = [];
    if (date_debut) { sql+=' AND date_mouvement>=?'; p.push(date_debut); }
    if (date_fin)   { sql+=' AND date_mouvement<=?'; p.push(date_fin); }
    sql += ' ORDER BY date_mouvement, id';
    const [rows] = await db.query(sql, p);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Banque');
    ws.columns = [
      { header:'Date',         key:'date_mouvement', width:14 },
      { header:'Description',  key:'description',    width:30 },
      { header:'Référence',    key:'reference',      width:14 },
      { header:'Encaissement', key:'encaissement',   width:16 },
      { header:'Décaissement', key:'decaissement',   width:16 },
      { header:'Solde',        key:'solde',          width:16 },
      { header:'Commentaires', key:'commentaires',   width:30 },
    ];
    styleHeader(ws.getRow(1), '1565C0');
    rows.forEach(r => {
      const row = ws.addRow(r);
      ['encaissement','decaissement','solde'].forEach(k=>row.getCell(k).numFmt='#,##0');
      if (parseFloat(r.encaissement)>0) row.getCell('encaissement').font={color:{argb:'FF006644'},bold:true};
      if (parseFloat(r.decaissement)>0) row.getCell('decaissement').font={color:{argb:'FFCC0000'}};
    });

    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename="banque_${today()}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── MODÈLES EXCEL (templates vides à télécharger) ─────────
router.get('/modele/:type', auth, async (req, res) => {
  try {
    const type = req.params.type;
    const wb   = new ExcelJS.Workbook();
    wb.creator  = 'Positive Distribution';
    wb.created  = new Date();
    const configs = {
      clients: {
        sheet: 'Clients', color: '006644',
        cols: [
          { header:'Nom',        key:'nom',        width:30, note:'Obligatoire' },
          { header:'Telephone',  key:'telephone',  width:18, note:'Optionnel' },
          { header:'Zone',       key:'zone',        width:20, note:'Ex: Farcha, Gassi...' },
          { header:'Categorie',  key:'categorie',  width:25, note:'revendeur_principal / autre_revendeur / patisserie_conso' },
          { header:'Adresse',    key:'adresse',    width:30, note:'Optionnel' },
          { header:'Solde',      key:'solde',      width:16, note:'Solde initial en GNF (0 si nouveau)' },
          { header:'Observation',key:'observation',width:30, note:'Optionnel' },
        ],
        examples: [
          ['Adam Issakha', '+235 XX XX XX XX', 'Farcha', 'revendeur_principal', 'Farcha Djougoulie', 0, ''],
          ['Hadje Mariam', '+235 XX XX XX XX', 'Massaguet', 'autre_revendeur', '', 150000, 'Impayé antérieur'],
        ]
      },
      ventes: {
        sheet: 'Ventes', color: '1565C0',
        cols: [
          { header:'Date',        key:'date',     width:14, note:'Format: YYYY-MM-DD ou DD/MM/YYYY' },
          { header:'Client',      key:'client',   width:30, note:'Nom exact du client dans la BD' },
          { header:'Quantite',    key:'qty',      width:12, note:'Nombre de cartons' },
          { header:'PU',          key:'pu',       width:14, note:'Prix unitaire GNF (laisser vide = prix auto)' },
          { header:'Paiement',    key:'pay',      width:16, note:'Montant payé GNF (0 si impayé)' },
          { header:'Observations',key:'obs',      width:30, note:'Optionnel' },
        ],
        examples: [
          ['2026-06-06', 'Adam Issakha Idriss Farcha', 20, 29000, 200000, 'Recouvrement partiel'],
          ['2026-06-06', 'Goni Gassi', 10, 29000, 290000, 'Soldé'],
        ]
      },
      recouvrements: {
        sheet: 'Recouvrements', color: 'E65100',
        cols: [
          { header:'Date',        key:'date',    width:14, note:'Format: YYYY-MM-DD' },
          { header:'Client',      key:'client',  width:30, note:'Nom exact du client' },
          { header:'Montant',     key:'montant', width:16, note:'Montant reçu en GNF' },
          { header:'Observation', key:'obs',     width:30, note:'Optionnel' },
        ],
        examples: [
          ['2026-06-06', 'Adam Issakha Idriss Farcha', 200000, 'Paiement partiel'],
          ['2026-06-06', 'Goni Gassi', 290000, 'Solde complet'],
        ]
      },
      stock: {
        sheet: 'Stock', color: '4A148C',
        cols: [
          { header:'Date',     key:'date',    width:14, note:'Format: YYYY-MM-DD' },
          { header:'Type',     key:'type',    width:14, note:'entree / sortie / ajustement' },
          { header:'Cartons',  key:'cartons', width:10, note:'Nombre de cartons' },
          { header:'Plateaux', key:'plateaux',width:10, note:'Nombre de plateaux' },
          { header:'Oeufs',    key:'oeufs',   width:10, note:'Nombre d\'œufs' },
          { header:'Motif',    key:'motif',   width:30, note:'Ex: Livraison fournisseur' },
        ],
        examples: [
          ['2026-06-06', 'entree', 55, 0, 0, 'Livraison du jour'],
          ['2026-06-06', 'sortie', 20, 0, 0, 'Distribution Adam'],
        ]
      }
    };

    const cfg = configs[type];
    if (!cfg) return res.status(404).json({ error: 'Type inconnu. Valeurs: clients, ventes, recouvrements, stock' });

    const ws = wb.addWorksheet(cfg.sheet);
    ws.columns = cfg.cols.map(c => ({ header: c.header, key: c.key, width: c.width }));

    // Style header
    const hRow = ws.getRow(1);
    styleHeader(hRow, cfg.color);

    // Ligne de notes (grise)
    const noteRow = ws.addRow(cfg.cols.map(c => c.note));
    noteRow.eachCell(cell => {
      cell.font = { italic: true, color: { argb: 'FF888888' }, size: 9 };
      cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFF5F5F5' } };
    });
    noteRow.height = 16;

    // Exemples
    cfg.examples.forEach(ex => {
      const r = ws.addRow(ex);
      r.eachCell(cell => {
        cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFE8F5E9' } };
        cell.font = { color:{ argb:'FF555555' }, italic: true };
      });
    });

    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename="modele_${type}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── HELPERS ───────────────────────────────────────────────
function today() { return new Date().toISOString().slice(0,10); }

function parseDate(val) {
  if (!val) return null;
  const s = val.toString().trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d,m,y] = s.split('/');
    return `${y}-${m}-${d}`;
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [d,m,y] = s.split('-');
    return `${y}-${m}-${d}`;
  }
  // Numéro série Excel
  if (!isNaN(s)) {
    const d = new Date(Date.UTC(1899,11,30) + parseInt(s)*86400000);
    return d.toISOString().slice(0,10);
  }
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0,10);
}

function normalizeCategorie(val) {
  const v = val.toString().toLowerCase().trim();
  if (v.includes('principal') || v.includes('29000') || v==='1') return 'revendeur_principal';
  if (v.includes('patisserie') || v.includes('conso') || v.includes('33000') || v==='3') return 'patisserie_conso';
  return 'autre_revendeur';
}

module.exports = router;
