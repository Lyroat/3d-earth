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

  const { id, image_path } = req.body;
  if (!id) return res.status(400).json({ error: 'Invalid params' });

  // 删除存储中的文件（忽略错误，文件可能已不存在）
  if (image_path) {
    await supabase.storage.from('volcano-photos').remove([image_path]);
  }

  // 删除数据库记录
  const { error } = await supabase
    .from('photos')
    .delete()
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}
