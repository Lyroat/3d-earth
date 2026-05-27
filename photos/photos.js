import { createClient } from '@supabase/supabase-js';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';

const SUPABASE_URL = 'https://kbighainzawljrmtxolw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_URGP-MtGqxHPysh7LlvB1A_fFX4B-PT';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const photoCache = new Map();

export async function loadApprovedPhotos() {
  const { data } = await supabase
    .from('photos')
    .select('volcano_id, image_path, uploader_id, is_featured, taken_date, description')
    .eq('status', 'approved')
    .order('created_at', { ascending: false });

  if (!data) return;
  photoCache.clear();
  data.forEach(p => {
    if (!photoCache.has(p.volcano_id)) photoCache.set(p.volcano_id, []);
    photoCache.get(p.volcano_id).push(p);
  });
  // 封面照片排到最前
  photoCache.forEach((photos) => {
    photos.sort((a, b) => (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0));
  });
}

export function getPhotosForVolcano(volcanoId) {
  return photoCache.get(volcanoId) || [];
}

export function getPhotoUrl(imagePath) {
  return `${SUPABASE_URL}/storage/v1/object/public/volcano-photos/${imagePath}`;
}

async function uploadPhoto(volcanoId, uploaderId, blob, takenDate, description) {
  const safeName = volcanoId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${safeName}/${Date.now()}.jpg`;

  const { error: storageErr } = await supabase.storage
    .from('volcano-photos')
    .upload(filename, blob, { contentType: 'image/jpeg' });
  if (storageErr) throw storageErr;

  const row = {
    volcano_id: volcanoId,
    uploader_id: uploaderId,
    image_path: filename,
  };
  if (takenDate) row.taken_date = takenDate;
  if (description) row.description = description;

  const { error: dbErr } = await supabase.from('photos').insert(row);
  if (dbErr) throw dbErr;
}

/* ══ Upload Modal ══ */
export function initUploadModal() {
  const modal    = document.getElementById('upload-modal');
  const fileInput = document.getElementById('upload-file');
  const cropWrap = document.getElementById('cropper-container');
  const cropImg  = document.getElementById('cropper-img');
  const nameInput = document.getElementById('uploader-id');
  const dateInput = document.getElementById('taken-date');
  const timeInput = document.getElementById('taken-time');
  const descInput = document.getElementById('photo-desc');
  const ccCheck  = document.getElementById('cc-check');
  const submitBtn = document.getElementById('upload-submit');
  const closeBtn = document.getElementById('upload-close');
  const statusEl = document.getElementById('upload-status');
  const volcNameEl = document.getElementById('upload-volcano-name');

  let cropper = null;
  let currentVolcanoId = null;

  function closeModal() {
    modal.classList.remove('show');
    if (cropper) { cropper.destroy(); cropper = null; }
    fileInput.value = '';
    nameInput.value = '';
    dateInput.value = '';
    timeInput.value = '';
    descInput.value = '';
    ccCheck.checked = false;
    statusEl.textContent = '';
    cropWrap.style.display = 'none';
  }

  function openModal(volcanoId, volcanoName) {
    currentVolcanoId = volcanoId;
    volcNameEl.textContent = volcanoName;
    modal.classList.add('show');
  }

  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      cropImg.src = ev.target.result;
      cropWrap.style.display = 'block';
      if (cropper) cropper.destroy();
      cropper = new Cropper(cropImg, {
        aspectRatio: 3 / 2,
        viewMode: 1,
        autoCropArea: 0.8,
        responsive: true,
      });
    };
    reader.readAsDataURL(file);
  });

  submitBtn.addEventListener('click', async () => {
    if (!cropper)            { statusEl.textContent = '请先选择照片'; return; }
    if (!nameInput.value.trim()) { statusEl.textContent = '请填写上传者 ID'; return; }
    if (!ccCheck.checked)    { statusEl.textContent = '请同意版权声明'; return; }

    submitBtn.disabled = true;
    statusEl.textContent = '上传中…';

    try {
      const canvas = cropper.getCroppedCanvas({ width: 1800, height: 1200, imageSmoothingQuality: 'high' });
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.92));
      let takenDate = dateInput.value || null;
      if (takenDate && timeInput.value) takenDate += ' ' + timeInput.value;
      await uploadPhoto(currentVolcanoId, nameInput.value.trim(), blob, takenDate, descInput.value.trim() || null);
      statusEl.textContent = '上传成功！照片将在审核通过后显示。';
      setTimeout(closeModal, 2000);
    } catch (err) {
      statusEl.textContent = '上传失败：' + (err.message || '未知错误');
    } finally {
      submitBtn.disabled = false;
    }
  });

  return { openModal, closeModal };
}
