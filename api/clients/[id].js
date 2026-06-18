const { supabase, checkAdmin } = require('../_lib/supabase');

function esc(s) { return String(s ?? '').trim(); }

module.exports = async function handler(req, res) {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  const { id } = req.query;

  if (req.method === 'PUT') {
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

  res.status(405).end();
};
