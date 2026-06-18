const { supabase, checkAdmin } = require('./_lib/supabase');

function esc(s) { return String(s ?? '').trim(); }

module.exports = async function handler(req, res) {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });

  // GET — list all clients
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('clients').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // POST — create client
  if (req.method === 'POST') {
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

  res.status(405).end();
};
