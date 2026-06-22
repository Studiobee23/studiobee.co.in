const { supabase, checkAdmin } = require('./_lib/supabase');

function toEntry(row) {
  return { id: row.id, note: row.note, clockIn: row.clock_in, clockOut: row.clock_out };
}

module.exports = async function handler(req, res) {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });

  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.replace(/^\/(api\/)?timelog\/?/, '').split('/').filter(Boolean);
  const action = parts[0] || null; // 'clockin' | 'clockout' | <id> for DELETE

  if (req.method === 'GET' && !action) {
    const { data, error } = await supabase
      .from('timelog')
      .select('*')
      .order('clock_in', { ascending: true });
    if (error) return res.status(500).json({ error: 'Failed to fetch time log' });
    return res.status(200).json((data || []).map(toEntry));
  }

  if (req.method === 'POST' && action === 'clockin') {
    const { data: open, error: openErr } = await supabase
      .from('timelog')
      .select('id')
      .is('clock_out', null)
      .limit(1);
    if (openErr) return res.status(500).json({ error: 'Failed to check open entry' });
    if (open && open.length) return res.status(409).json({ error: 'Already clocked in' });

    const note = String((req.body || {}).note || '').trim().slice(0, 500);
    const { data, error } = await supabase
      .from('timelog')
      .insert({ note, clock_in: new Date().toISOString(), clock_out: null })
      .select()
      .single();
    if (error) return res.status(500).json({ error: 'Failed to clock in' });
    return res.status(200).json(toEntry(data));
  }

  if (req.method === 'POST' && action === 'clockout') {
    const id = String((req.body || {}).id || '');
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const { data, error } = await supabase
      .from('timelog')
      .update({ clock_out: new Date().toISOString() })
      .eq('id', id)
      .is('clock_out', null)
      .select()
      .single();
    if (error || !data) return res.status(404).json({ error: 'No matching open entry' });
    return res.status(200).json(toEntry(data));
  }

  if (req.method === 'DELETE' && action) {
    const { error } = await supabase.from('timelog').delete().eq('id', action);
    if (error) return res.status(500).json({ error: 'Failed to delete entry' });
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
};
