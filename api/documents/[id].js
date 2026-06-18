const { supabase, checkAdmin } = require('../_lib/supabase');

function esc(s) { return String(s ?? '').trim(); }

module.exports = async function handler(req, res) {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  const { id } = req.query;

  if (req.method === 'PUT') {
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

  res.status(405).end();
};
