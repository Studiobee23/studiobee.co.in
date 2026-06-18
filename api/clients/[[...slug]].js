const { supabase, checkAdmin } = require('../_lib/supabase');

function esc(s) { return String(s ?? '').trim(); }

module.exports = async function handler(req, res) {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });

  const slug = req.query.slug || [];
  const id = slug[0] || null;

  // GET /api/clients — list all
  if (req.method === 'GET' && !id) {
    const { data, error } = await supabase
      .from('clients').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // POST /api/clients — create
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

  // PUT /api/clients/:id — update
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

  res.status(405).end();
};
