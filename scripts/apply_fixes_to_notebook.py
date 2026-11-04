import sys, json
sys.stdout.reconfigure(encoding='utf-8')

nb_path = 'colab/ComfyUI_A100_MiniMax_H3_Studio.ipynb'
with open(nb_path, 'r', encoding='utf-8') as f:
    nb = json.load(f)

with open('colab/colab_sidecar.py', 'r', encoding='utf-8') as f:
    sidecar_full_code = f.read()

code_cell = nb['cells'][2]

cell_content = f"""# ====================================================================
# 🚀 ONE-CLICK A100 SMART STUDIO LAUNCHER (SSD Acceleration + Drive Outputs)
# ====================================================================
import os, sys, time, re, json, subprocess, torch, shutil
from google.colab import drive
from IPython.display import display, HTML

print('⚡ [1/6] เชื่อมต่อ Google Drive และตรวจสอบ GPU A100...')
drive.mount('/content/drive')
!nvidia-smi

# ตรวจสอบขนาด VRAM แบบไดนามิก
gpu_vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
print(f'\\n🔍 ตรวจพบการ์ดจอ: {{torch.cuda.get_device_name(0)}} (VRAM รวม: {{gpu_vram_gb:.1f}} GB)')

if gpu_vram_gb > 60.0:
    print('🚀 [โหมด A100 80GB High-RAM]: เปิดประสิทธิภาพสูงสุด (--highvram)')
    vram_flags = '--highvram --fast'
else:
    print('⚡ [โหมด A100 40GB Standard]: ประหยัดเครดิต ป้องกัน OOM (--reserve-vram 3.0 --fast)')
    vram_flags = '--reserve-vram 3.0 --fast'

GDRIVE_BASE = '/content/drive/MyDrive/ComfyUI_Studio'
G_DIFF = f'{{GDRIVE_BASE}}/models/diffusion_models'
G_TEXT = f'{{GDRIVE_BASE}}/models/text_encoders'
G_VAE = f'{{GDRIVE_BASE}}/models/vae'
G_LORA = f'{{GDRIVE_BASE}}/models/loras'
G_OUT = f'{{GDRIVE_BASE}}/outputs'

for d in [G_DIFF, G_TEXT, G_VAE, G_LORA, G_OUT]:
    os.makedirs(d, exist_ok=True)

print('\\n⏳ [2/6] ตรวจสอบและติดตั้ง ComfyUI + Custom Nodes...')
if not os.path.exists('/content/ComfyUI'):
    %cd /content
    !git clone https://github.com/comfyanonymous/ComfyUI.git
    %cd /content/ComfyUI
    !pip install -q torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
    !pip install -q -r requirements.txt
    !pip install -q fastapi uvicorn pydantic requests pycloudflared

    %cd /content/ComfyUI/custom_nodes
    !git clone https://github.com/ltdrdata/ComfyUI-Manager.git
    !git clone https://github.com/Larryvrh/ComfyUI-MiniMax-H3-Turbo.git
    !git clone https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git
    !git clone https://github.com/kijai/ComfyUI-KJNodes.git
    !pip install -q -r ComfyUI-VideoHelperSuite/requirements.txt || true

!apt-get -y install aria2 > /dev/null 2>&1

print('\\n🚀 [3/6] ดึงไฟล์โมเดลเข้า SSD ความเร็วสูงของ Colab โดยตรง (โหลดเร็วติดจรวด)...')
# โฟลเดอร์โมเดลบน Local SSD
L_DIFF = '/content/ComfyUI/models/diffusion_models'
L_TEXT = '/content/ComfyUI/models/text_encoders'
L_VAE = '/content/ComfyUI/models/vae'
L_LORA = '/content/ComfyUI/models/loras'
for d in [L_DIFF, L_TEXT, L_VAE, L_LORA]:
    os.makedirs(d, exist_ok=True)

def dl_minimax_ssd(url, target_dir, filename):
    local_file = os.path.join(target_dir, filename)
    if os.path.exists(local_file) and os.path.getsize(local_file) > 1000000:
        print(f'⚡ [SSD พร้อมใช้งาน 100%] {{filename}}')
    else:
        print(f'📥 ดาวน์โหลดความเร็วแสงเข้า SSD (ไม่ผ่าน Google Drive): {{filename}}...')
        !aria2c -c -x 16 -s 16 -k 1M "{{url}}" -d "{{target_dir}}" -o "{{filename}}"
        print(f'✅ โหลดเข้า SSD สำเร็จ: {{filename}}')

dl_minimax_ssd('https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors', L_DIFF, 'minimax_h3_fl2va_pruned_int8_convrot.safetensors')
dl_minimax_ssd('https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', L_TEXT, 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors')
dl_minimax_ssd('https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_fp16.safetensors', L_VAE, 'minimax_h3_video_vae_fp16.safetensors')
dl_minimax_ssd('https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_audio_vae_fp32.safetensors', L_VAE, 'minimax_h3_audio_vae_fp32.safetensors')
dl_minimax_ssd('https://huggingface.co/larryvrh/MiniMax-H3-Turbo-Lora/resolve/main/minimax_h3_turbo_4step_ema_ckpt850.safetensors', L_LORA, 'minimax_h3_turbo_4step_ema_ckpt850.safetensors')
dl_minimax_ssd('https://huggingface.co/lynaNSFW/mysticxxx_MM_H3/resolve/main/MysticXXX_MMH3-V4.safetensors', L_LORA, 'MysticXXX_MMH3-V4.safetensors')

print('\\n🛡️ [4/6] เริ่มต้น Sidecar Agent (Bulletproof Kill Switch & GPU Monitor)...')
# บันทึก TBE_RUNTIME_ADDR สำหรับ Kill Switch ตัดเครื่องจริง 100%
tbe_addr = os.environ.get('TBE_RUNTIME_ADDR', '')
with open('/content/sidecar_config.json', 'w') as f:
    json.dump({{'TBE_RUNTIME_ADDR': tbe_addr}}, f)

sidecar_code = r'''{sidecar_full_code}'''
with open('/content/colab_sidecar.py', 'w', encoding='utf-8') as f:
    f.write(sidecar_code)

!fuser -k 8189/tcp > /dev/null 2>&1 || true
!export TBE_RUNTIME_ADDR="{{tbe_addr}}" && nohup python /content/colab_sidecar.py > /content/sidecar.log 2>&1 &

print('\\n🌐 [5/6] สตาร์ท ComfyUI (บันทึกวิดีโอลง Google Drive อัตโนมัติ)...')
%cd /content/ComfyUI
!fuser -k 8188/tcp > /dev/null 2>&1 || true
time.sleep(2)
!nohup env PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True python main.py --listen 0.0.0.0 --port 8188 --output-directory "{{G_OUT}}" {{vram_flags}} > /content/comfyui.log 2>&1 &
time.sleep(5)

print('\\n🔗 [6/6] เปิด Cloudflare Named Tunnel เชื่อมต่อโดเมนถาวร...')
TUNNEL_TOKEN = 'eyJhIjoiMjYwMTc0YTk0M2FkMDBmZDM3ZDc3NjQ4YjViY2ZkYzUiLCJ0IjoiZGVkMTU0ZjctNzEzNy00NjYyLWE1OTQtNjNiOWMyYWNiMGZlIiwicyI6Ik1UTTVaVGt3WkdJdFlUWm1NaTAwWkRoakxXSXdNRGd0T1RCa00yWmtZakE1TldVMiJ9'

!test -f /usr/local/bin/cloudflared || (wget -q -nc https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && dpkg -i cloudflared-linux-amd64.deb > /dev/null 2>&1)

!pkill -f cloudflared > /dev/null 2>&1 || true
!rm -f /content/cf_tunnel.log
!nohup cloudflared tunnel run --token {{TUNNEL_TOKEN}} > /content/cf_tunnel.log 2>&1 &
time.sleep(3)

comfy_url = 'https://comfy-api.ayaigaldie.site'
sidecar_url = 'https://sidecar.ayaigaldie.site'

print('=' * 65)
print('🎉 เซิร์ฟเวอร์ A100 สปีด SSD เปิดเสร็จสมบูรณ์เรียบร้อยแล้ว!')
print(f'💾 โมเดลทั้งหมดถูกเก็บใน : Local SSD (/content/ComfyUI/models) [ความเร็วสูงสุด]')
print(f'📁 วิดีโอผลลัพธ์จะบันทึกลง: {{G_OUT}} (Google Drive)')
print(f'🔗 1. ComfyUI Endpoint URL : {{comfy_url}}')
print(f'🔗 2. Sidecar Kill Switch URL: {{sidecar_url}}')
print('=' * 65)
"""

lines = [l + '\n' for l in cell_content.split('\n')]
if lines and lines[-1] == '\n':
    lines.pop()

code_cell['source'] = lines

with open(nb_path, 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=2, ensure_ascii=False)

print("Applied 100% clean notebook updates!")
