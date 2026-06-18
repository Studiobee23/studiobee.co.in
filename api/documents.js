const { supabase, checkAdmin } = require('./_lib/supabase');

function esc(s) { return String(s ?? '').trim(); }

async function nextDocNumber(type) {
  const { data, error } = await supabase.rpc('increment_doc_series', { series_type: type });
  if (error) throw new Error(error.message);
  const n = String(data).padStart(3, '0');
  const prefix = type === 'quote' ? 'SB-Q' : type === 'invoice' ? 'SB-I' : 'SB-R';
  return `${prefix}-${n}`;
}

module.exports = async function handler(req, res) {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });

  // GET — list documents (optional ?type= filter)
  if (req.method === 'GET') {
    let q = supabase.from('documents').select('*').order('created_at', { ascending: false });
    if (req.query.type) q = q.eq('type', req.query.type);
    if (req.query.client_id) q = q.eq('client_id', req.query.client_id);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // POST — create document
  if (req.method === 'POST') {
    const b = req.body || {};
    const type = ['quote','invoice','receipt'].includes(b.type) ? b.type : 'quote';
    let number;
    try { number = await nextDocNumber(type); }
    catch (e) { return res.status(500).json({ error: e.message }); }

    const doc = {
      type,
      number,
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

  res.status(405).end();
};
