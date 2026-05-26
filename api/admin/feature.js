import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers['x-admin-key'] !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id, volcano_id } = req.body;
  if (!id || !volcano_id) {
    return res.status(400).json({ error: 'Invalid params' });
  }

  // 先取消该火山所有照片的封面标记
  await supabase
    .from('photos')
    .update({ is_featured: false })
    .eq('volcano_id', volcano_id);

  // 再设置指定照片为封面
  const { error } = await supabase
    .from('photos')
    .update({ is_featured: true })
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}
