const { supabase, checkAdmin } = require('../../_lib/supabase');

const NEXT_TYPE = { quote: 'invoice', invoice: 'receipt' };

async function nextDocNumber(type) {
  const { data, error } = await supabase.rpc('increment_doc_series', { series_type: type });
  if (error) throw new Error(error.message);
  const n = String(data).padStart(3, '0');
  const prefix = type === 'quote' ? 'SB-Q' : type === 'invoice' ? 'SB-I' : 'SB-R';
  return `${prefix}-${n}`;
}

module.exports = async function handler(req, res) {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  const { id } = req.query;
  const { data: src, error: fetchErr } = await supabase.from('documents').select('*').eq('id', id).single();
  if (fetchErr) return res.status(404).json({ error: 'Document not found' });

  const nextType = NEXT_TYPE[src.type];
  if (!nextType) return res.status(400).json({ error: 'Receipts cannot be converted further' });

  let number;
  try { number = await nextDocNumber(nextType); }
  catch (e) { return res.status(500).json({ error: e.message }); }

  const { id: _id, created_at: _ca, number: _num, type: _type, status: _st, converted_from: _cf, ...rest } = src;
  const newDoc = { ...rest, type: nextType, number, status: 'draft', converted_from: id };

  const { data, error } = await supabase.from('documents').insert(newDoc).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json(data);
};
