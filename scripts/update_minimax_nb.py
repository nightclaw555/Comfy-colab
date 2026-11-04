import json

with open('colab/ComfyUI_A100_MiniMax_H3_Studio.ipynb', 'r', encoding='utf-8') as f:
    nb = json.load(f)

# Update Markdown
nb['cells'][0]['source'] = [
    "# 🎬 ComfyUI Video Studio — MiniMax-H3 Task Studio (A100 SSD)\n",
    "### โน้ตบุ๊กสำหรับสร้างคลิปวิดีโอพร้อมเสียงสเตอริโอด้วย MiniMax-H3 (3 Task Profiles: TikTok Ads, NSFW Motion Mimic, Music Video)\n",
    "\n",
    "> ⚡ **One-Click Multi-Task MiniMax-H3 (100% High-Speed Local SSD):**\n",
    "> โน้ตบุ๊กนี้ออกแบบสำหรับ **Google Colab A100** โดยเฉพาะ รองรับ 3 โหมดงานหลัก:\n",
    "> 1. **📱 TikTok Commercial Ads:** สปีดไวพิเศษ 8-Step (~35s), สัดส่วน 9:16, ภาพสินค้าคมกริบ พร้อมเสียงประกอบในตัว\n",
    "> 2. **🔞 NSFW Motion Mimic:** ใช้โมเดล Hybrid (smhfacct) + MysticXXX รองรับรูปคุมหน้าตัวละคร และคลิป Reference สำหรับก๊อปปี้ท่าทาง\n",
    "> 3. **🎬 Music Video:** ถอดรหัสภาพและเสียงระดับสตูดิโอ (PDD / Turbo) ให้จังหวะภาพ Sync กับบีทเพลง\n",
    "> \n",
    "> *ระบบจะดึงโมเดลตรงเข้า SSD ความเร็วสูงของ Colab ไม่กินพื้นที่ Google Drive และไม่หลุด!*"
]

# Get existing code lines
source = nb['cells'][1]['source']
code_text = "".join(source)

# Let's replace the custom nodes section to include ComfyUI-MiniMax-H3-PDD-Acc
old_nodes = """    %cd /content/ComfyUI/custom_nodes
    !git clone --depth 1 https://github.com/Larryvrh/ComfyUI-MiniMax-H3-Turbo.git
    !git clone --depth 1 https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git
    !git clone --depth 1 https://github.com/kijai/ComfyUI-KJNodes.git
    !pip install -q -r ComfyUI-VideoHelperSuite/requirements.txt || true"""

new_nodes = """    %cd /content/ComfyUI/custom_nodes
    !git clone --depth 1 https://github.com/Larryvrh/ComfyUI-MiniMax-H3-Turbo.git
    !git clone --depth 1 https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git
    !git clone --depth 1 https://github.com/kijai/ComfyUI-KJNodes.git
    !git clone --depth 1 https://github.com/Jalen-Brunson/ComfyUI-MiniMax-H3-PDD-Acc.git || true
    !pip install -q -r ComfyUI-VideoHelperSuite/requirements.txt || true"""

if old_nodes in code_text:
    code_text = code_text.replace(old_nodes, new_nodes)

# Replace the download section
old_dl = """dl_ssd('https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors', L_DIFF, 'minimax_h3_fl2va_pruned_int8_convrot.safetensors')
dl_ssd('https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', L_TEXT, 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors')
dl_ssd('https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_fp16.safetensors', L_VAE, 'minimax_h3_video_vae_fp16.safetensors')
dl_ssd('https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_audio_vae_fp32.safetensors', L_VAE, 'minimax_h3_audio_vae_fp32.safetensors')
dl_ssd('https://huggingface.co/larryvrh/MiniMax-H3-Turbo-Lora/resolve/main/minimax_h3_turbo_4step_ema_ckpt850.safetensors', L_LORA, 'minimax_h3_turbo_4step_ema_ckpt850.safetensors')
dl_ssd('https://huggingface.co/lynaNSFW/mysticxxx_MM_H3/resolve/main/MysticXXX_MMH3-V4.safetensors', L_LORA, 'MysticXXX_MMH3-V4.safetensors')"""

new_dl = """# ====================================================================
# 🎛️ เลือกระดับโปรไฟล์ที่ต้องการรัน (แนะนำ: FULL_STUDIO โหลดครบจบใน A100)
# ====================================================================
STUDIO_PROFILE = 'FULL_STUDIO'  #@param ["FULL_STUDIO", "TIKTOK_FAST", "NSFW_MOTION", "MUSIC_VIDEO"]
print(f'📌 ใช้งานโปรไฟล์โมเดล: {STUDIO_PROFILE}')

# 1. Base Shared Essentials (Text Encoder, Audio/Video VAE, Turbo LoRA)
dl_ssd('https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', L_TEXT, 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors')
dl_ssd('https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_fp16.safetensors', L_VAE, 'minimax_h3_video_vae_fp16.safetensors')
dl_ssd('https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_audio_vae_fp32.safetensors', L_VAE, 'minimax_h3_audio_vae_fp32.safetensors')
dl_ssd('https://huggingface.co/larryvrh/MiniMax-H3-Turbo-Lora/resolve/main/minimax_h3_turbo_4step_ema_ckpt850.safetensors', L_LORA, 'minimax_h3_turbo_4step_ema_ckpt850.safetensors')

# 2. Diffusion Checkpoints ตามประเภทงาน
# A) TikTok & Music Video Base (FL2VA Pruned Int8 - คมชัดสูงมาก)
if STUDIO_PROFILE in ['FULL_STUDIO', 'TIKTOK_FAST', 'MUSIC_VIDEO']:
    dl_ssd('https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors', L_DIFF, 'minimax_h3_fl2va_pruned_int8_convrot.safetensors')

# B) NSFW & Motion Mimic Base (smhfacct Hybrid Model: FL2VA + REF2VA คุมท่าทางตามคลิป)
if STUDIO_PROFILE in ['FULL_STUDIO', 'NSFW_MOTION']:
    dl_ssd('https://huggingface.co/smhfacct/Minimax-H3-fl2va-ref2va-hybrid-models/resolve/main/minimax_h3_hybrid_fl2va_ref2va_b25-49-int8.safetensors', L_DIFF, 'minimax_h3_hybrid_fl2va_ref2va_b25-49-int8.safetensors')
    dl_ssd('https://huggingface.co/lynaNSFW/mysticxxx_MM_H3/resolve/main/MysticXXX_MMH3-V4.safetensors', L_LORA, 'MysticXXX_MMH3-V4.safetensors')

# C) Music Video PDD Acceleration (Parallel Decoding Distillation for Audio Sync)
if STUDIO_PROFILE in ['FULL_STUDIO', 'MUSIC_VIDEO']:
    dl_ssd('https://huggingface.co/aptech0081/MiniMax-H3-PDD-ComfyUI/resolve/main/minimax_h3_fl2va_pdd_acc_8step_comfyui.safetensors', L_LORA, 'minimax_h3_fl2va_pdd_acc_8step_comfyui.safetensors')"""

if old_dl in code_text:
    code_text = code_text.replace(old_dl, new_dl)

# Split back to list of lines
nb['cells'][1]['source'] = [line + '\n' for line in code_text.splitlines()]
# Fix trailing newline on last line
if nb['cells'][1]['source'] and nb['cells'][1]['source'][-1].endswith('\n\n'):
    nb['cells'][1]['source'][-1] = nb['cells'][1]['source'][-1][:-1]

with open('colab/ComfyUI_A100_MiniMax_H3_Studio.ipynb', 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=2, ensure_ascii=False)

print('Updated colab/ComfyUI_A100_MiniMax_H3_Studio.ipynb successfully!')
