const { supabase, checkAdmin } = require('./_lib/supabase');

function toEntry(row) {
  return {
    id: row.id,
    name: row.name,
    note: row.note,
    project: row.project,
    clockIn: row.clock_in,
    clockOut: row.clock_out,
    pausedMs: row.paused_ms || 0,
    pauseStart: row.pause_start,
  };
}

module.exports = async function handler(req, res) {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });

  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.replace(/^\/(api\/)?timelog\/?/, '').split('/').filter(Boolean);
  const action = parts[0] || null; // 'clockin' | 'clockout' | 'pause' | 'resume' | 'manual' | <id> for DELETE

  if (req.method === 'GET' && !action) {
    const { data, error } = await supabase
      .from('timelog')
      .select('*')
      .order('clock_in', { ascending: true });
    if (error) return res.status(500).json({ error: 'Failed to fetch time log' });
    return res.status(200).json((data || []).map(toEntry));
  }

  if (req.method === 'POST' && action === 'clockin') {
    const name = String((req.body || {}).name || '').trim().slice(0, 100);
    const note = String((req.body || {}).note || '').trim().slice(0, 500);
    const project = String((req.body || {}).project || '').trim().slice(0, 100);
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const { data: open, error: openErr } = await supabase
      .from('timelog')
      .select('id, name')
      .is('clock_out', null);
    if (openErr) return res.status(500).json({ error: 'Failed to check open entry' });
    if ((open || []).some(e => (e.name || '').trim().toLowerCase() === name.toLowerCase())) {
      return res.status(409).json({ error: 'Already clocked in as ' + name });
    }

    const { data, error } = await supabase
      .from('timelog')
      .insert({ name, note, project, clock_in: new Date().toISOString(), clock_out: null, paused_ms: 0, pause_start: null })
      .select()
      .single();
    if (error) return res.status(500).json({ error: 'Failed to clock in' });
    return res.status(200).json(toEntry(data));
  }

  if (req.method === 'POST' && action === 'pause') {
    const id = String((req.body || {}).id || '');
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const { data, error } = await supabase
      .from('timelog')
      .update({ pause_start: new Date().toISOString() })
      .eq('id', id)
      .is('clock_out', null)
      .is('pause_start', null)
      .select()
      .single();
    if (error || !data) return res.status(404).json({ error: 'No matching running entry' });
    return res.status(200).json(toEntry(data));
  }

  if (req.method === 'POST' && action === 'resume') {
    const id = String((req.body || {}).id || '');
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const { data: row, error: fetchErr } = await supabase
      .from('timelog')
      .select('*')
      .eq('id', id)
      .is('clock_out', null)
      .not('pause_start', 'is', null)
      .single();
    if (fetchErr || !row) return res.status(404).json({ error: 'No matching paused entry' });
    const pausedMs = (row.paused_ms || 0) + (Date.now() - new Date(row.pause_start).getTime());
    const { data, error } = await supabase
      .from('timelog')
      .update({ paused_ms: pausedMs, pause_start: null })
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: 'Failed to resume' });
    return res.status(200).json(toEntry(data));
  }

  if (req.method === 'POST' && action === 'clockout') {
    const id = String((req.body || {}).id || '');
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const { data: row, error: fetchErr } = await supabase
      .from('timelog')
      .select('*')
      .eq('id', id)
      .is('clock_out', null)
      .single();
    if (fetchErr || !row) return res.status(404).json({ error: 'No matching open entry' });
    let pausedMs = row.paused_ms || 0;
    if (row.pause_start) pausedMs += Date.now() - new Date(row.pause_start).getTime();
    const { data, error } = await supabase
      .from('timelog')
      .update({ clock_out: new Date().toISOString(), paused_ms: pausedMs, pause_start: null })
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: 'Failed to clock out' });
    return res.status(200).json(toEntry(data));
  }

  if (req.method === 'POST' && action === 'manual') {
    const name = String((req.body || {}).name || '').trim().slice(0, 100);
    const note = String((req.body || {}).note || '').trim().slice(0, 500);
    const project = String((req.body || {}).project || '').trim().slice(0, 100);
    const clockIn = new Date((req.body || {}).clockIn);
    const clockOut = new Date((req.body || {}).clockOut);
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (isNaN(clockIn) || isNaN(clockOut) || clockOut <= clockIn) {
      return res.status(400).json({ error: 'Invalid clock in/out times' });
    }
    const { data, error } = await supabase
      .from('timelog')
      .insert({ name, note, project, clock_in: clockIn.toISOString(), clock_out: clockOut.toISOString(), paused_ms: 0, pause_start: null })
      .select()
      .single();
    if (error) return res.status(500).json({ error: 'Failed to add entry' });
    return res.status(200).json(toEntry(data));
  }

  if (req.method === 'PUT' && action) {
    const id = action;
    const name = String((req.body || {}).name || '').trim().slice(0, 100);
    const note = String((req.body || {}).note || '').trim().slice(0, 500);
    const project = String((req.body || {}).project || '').trim().slice(0, 100);
    const clockIn = new Date((req.body || {}).clockIn);
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (isNaN(clockIn)) return res.status(400).json({ error: 'Invalid clock in time' });

    const { data: existing, error: fetchErr } = await supabase.from('timelog').select('*').eq('id', id).single();
    if (fetchErr || !existing) return res.status(404).json({ error: 'Entry not found' });

    let clockOut = existing.clock_out;
    const rawClockOut = (req.body || {}).clockOut;
    if (rawClockOut != null && rawClockOut !== '') {
      const co = new Date(rawClockOut);
      if (isNaN(co) || co <= clockIn) return res.status(400).json({ error: 'Clock out must be after clock in' });
      clockOut = co.toISOString();
    }

    const { data, error } = await supabase
      .from('timelog')
      .update({ name, note, project, clock_in: clockIn.toISOString(), clock_out: clockOut })
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: 'Failed to update entry' });
    return res.status(200).json(toEntry(data));
  }

  if (req.method === 'DELETE' && action) {
    const { error } = await supabase.from('timelog').delete().eq('id', action);
    if (error) return res.status(500).json({ error: 'Failed to delete entry' });
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
};
