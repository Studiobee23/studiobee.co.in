const { supabase, checkAdmin } = require('./_lib/supabase');

function esc(s) { return String(s ?? '').trim(); }

async function nextDocNumber(type) {
  const { data, error } = await supabase.rpc('increment_doc_series', { series_type: type });
  if (error) throw new Error(error.message);
  const n = String(data).padStart(3, '0');
  const prefix = type === 'quote' ? 'SB-Q' : type === 'invoice' ? 'SB-I' : 'SB-R';
  return `${prefix}-${n}`;
}

const NEXT_TYPE = { quote: 'invoice', invoice: 'receipt' };

module.exports = async function handler(req, res) {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });

  // Parse path: /api/billing/clients, /api/billing/clients/123, etc.
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.replace(/^\/api\/billing\/?/, '').split('/').filter(Boolean);
  const resource = parts[0]; // 'clients' or 'documents'
  const id       = parts[1] || null;
  const action   = parts[2] || null; // 'convert'

  // ── CLIENTS ──────────────────────────────────────────────────────────────

  if (resource === 'clients') {

    if (req.method === 'GET' && !id) {
      const { data, error } = await supabase
        .from('clients').select('*').order('created_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }

    if (req.method === 'POST' && !id) {
      const b = req.body || {};
      const client = {
        name:           esc(b.name).slice(0, 200),
        contact_person: esc(b.contact_person).slice(0, 200),
        email:          esc(b.email).slice(0, 200),
        phone:          esc(b.phone).slice(0, 50),
        gstin:          esc(b.gstin).slice(0, 50),
        address:        esc(b.address).slice(0, 500),
        city:           esc(b.city).slice(0, 100),
        state:          esc(b.state).slice(0, 100),
      };
      if (!client.name) return res.status(400).json({ error: 'Name is required' });
      const { data, error } = await supabase.from('clients').insert(client).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }

    if (req.method === 'PUT' && id) {
      const b = req.body || {};
      const updates = {};
      if (b.name           !== undefined) updates.name           = esc(b.name).slice(0, 200);
      if (b.contact_person !== undefined) updates.contact_person = esc(b.contact_person).slice(0, 200);
      if (b.email          !== undefined) updates.email          = esc(b.email).slice(0, 200);
      if (b.phone          !== undefined) updates.phone          = esc(b.phone).slice(0, 50);
      if (b.gstin          !== undefined) updates.gstin          = esc(b.gstin).slice(0, 50);
      if (b.address        !== undefined) updates.address        = esc(b.address).slice(0, 500);
      if (b.city           !== undefined) updates.city           = esc(b.city).slice(0, 100);
      if (b.state          !== undefined) updates.state          = esc(b.state).slice(0, 100);
      if (updates.name === '') return res.status(400).json({ error: 'Name is required' });
      const { data, error } = await supabase.from('clients').update(updates).eq('id', id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }
  }

  // ── DOCUMENTS ─────────────────────────────────────────────────────────────

  if (resource === 'documents') {

    if (req.method === 'GET' && !id) {
      let q = supabase.from('documents').select('*').order('created_at', { ascending: false });
      if (req.query.type)      q = q.eq('type', req.query.type);
      if (req.query.client_id) q = q.eq('client_id', req.query.client_id);
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }

    if (req.method === 'POST' && !id) {
      const b = req.body || {};
      const type = ['quote','invoice','receipt'].includes(b.type) ? b.type : 'quote';
      let number;
      try { number = await nextDocNumber(type); }
      catch (e) { return res.status(500).json({ error: e.message }); }
      const doc = {
        type, number,
        client_id:    b.client_id || null,
        status:       'draft',
        project_name: esc(b.project_name).slice(0, 300),
        category:     esc(b.category).slice(0, 100),
        line_items:   Array.isArray(b.line_items) ? b.line_items : [],
        subtotal:     Number(b.subtotal) || 0,
        gst_enabled:  b.gst_enabled !== false,
        gst_type:     b.gst_type === 'igst' ? 'igst' : 'cgst_sgst',
        gst_rate:     Number(b.gst_rate) || 18,
        gst_amount:   Number(b.gst_amount) || 0,
        discount:     Number(b.discount) || 0,
        total:        Number(b.total) || 0,
        notes:        esc(b.notes).slice(0, 2000),
        validity_days: Number(b.validity_days) || 15,
      };
      const { data, error } = await supabase.from('documents').insert(doc).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }

    if (req.method === 'PUT' && id && !action) {
      const b = req.body || {};
      const allowed = ['client_id','status','project_name','category','line_items',
                       'subtotal','gst_enabled','gst_type','gst_rate','gst_amount',
                       'discount','total','notes','validity_days'];
      const updates = {};
      for (const k of allowed) {
        if (b[k] === undefined) continue;
        if (k === 'project_name') updates[k] = esc(b[k]).slice(0, 300);
        else if (k === 'category') updates[k] = esc(b[k]).slice(0, 100);
        else if (k === 'notes') updates[k] = esc(b[k]).slice(0, 2000);
        else if (k === 'gst_type') updates[k] = b[k] === 'igst' ? 'igst' : 'cgst_sgst';
        else if (k === 'status') updates[k] = ['draft','sent','accepted','paid','cancelled'].includes(b[k]) ? b[k] : 'draft';
        else if (k === 'line_items') updates[k] = Array.isArray(b[k]) ? b[k] : [];
        else if (k === 'gst_enabled') updates[k] = b[k] !== false;
        else updates[k] = b[k];
      }
      const { data, error } = await supabase.from('documents').update(updates).eq('id', id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }

    if (req.method === 'POST' && id && action === 'convert') {
      const { data: src, error: fetchErr } = await supabase.from('documents').select('*').eq('id', id).single();
      if (fetchErr) return res.status(404).json({ error: 'Document not found' });
      const nextType = NEXT_TYPE[src.type];
      if (!nextType) return res.status(400).json({ error: 'Receipts cannot be converted further' });
      let number;
      try { number = await nextDocNumber(nextType); }
      catch (e) { return res.status(500).json({ error: e.message }); }
      const { id: _id, created_at: _ca, number: _num, type: _type, status: _st, converted_from: _cf, ...rest } = src;
      const { data, error } = await supabase.from('documents').insert(
        { ...rest, type: nextType, number, status: 'draft', converted_from: id }
      ).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }
  }

  res.status(404).json({ error: 'Not found' });
};
