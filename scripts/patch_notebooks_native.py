import json
import os
import sys

def patch_notebook(filepath, model_title):
    with open(filepath, 'r', encoding='utf-8') as f:
        nb = json.load(f)
    
    code = ''.join(nb['cells'][1]['source'])
    marker = "with open('/content/colab_sidecar.py', 'w', encoding='utf-8') as f:\n    f.write(sidecar_code)"
    if marker not in code:
        print('Marker not found in', filepath)
        return False
    
    prefix = code.split(marker)[0] + marker + '\n'
    
    new_suffix = f'''
# 🛡️ สตาร์ท Sidecar Agent ด้วย subprocess.Popen (Native Python ไม่บล็อก IPython Subshell 100%)
subprocess.run(["fuser", "-k", "-9", "8189/tcp"], check=False)
sidecar_env = os.environ.copy()
if tbe_addr:
    sidecar_env["TBE_RUNTIME_ADDR"] = tbe_addr
with open('/content/sidecar.log', 'w') as out_sidecar:
    subprocess.Popen(
        [sys.executable, "/content/colab_sidecar.py", "8189"],
        env=sidecar_env,
        stdin=subprocess.DEVNULL,
        stdout=out_sidecar,
        stderr=subprocess.STDOUT,
        start_new_session=True
    )
print('✅ Sidecar Agent สตาร์ทเรียบร้อยแล้ว', flush=True)

print('\\n🌐 [5/6] สตาร์ท ComfyUI (โหมด SSD ความเร็วสูง)...', flush=True)
subprocess.run(["fuser", "-k", "-9", "8188/tcp"], check=False)
comfy_env = os.environ.copy()
comfy_env["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
comfy_args = [
    sys.executable, "main.py",
    "--listen", "0.0.0.0",
    "--port", "8188",
    "--output-directory", L_OUT
] + vram_flags.split()

with open('/content/comfyui.log', 'w') as out_comfy:
    subprocess.Popen(
        comfy_args,
        cwd="/content/ComfyUI",
        env=comfy_env,
        stdin=subprocess.DEVNULL,
        stdout=out_comfy,
        stderr=subprocess.STDOUT,
        start_new_session=True
    )
print('✅ ComfyUI Core สตาร์ทเรียบร้อยแล้ว', flush=True)

print('\\n🔗 [6/6] เปิด Cloudflare Named Tunnel เชื่อมต่อโดเมนถาวร...', flush=True)
TUNNEL_TOKEN = 'eyJhIjoiMjYwMTc0YTk0M2FkMDBmZDM3ZDc3NjQ4YjViY2ZkYzUiLCJ0IjoiZGVkMTU0ZjctNzEzNy00NjYyLWE1OTQtNjNiOWMyYWNiMGZlIiwicyI6Ik1UTTVaVGt3WkdJdFlUWm1NaTAwWkRoakxXSXdNRGd0T1RCa00yWmtZakE1TldVMiJ9'

if not os.path.exists('/usr/local/bin/cloudflared'):
    print('📥 กำลังติดตั้ง Cloudflared Client...', flush=True)
    subprocess.run("wget -q -nc https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && dpkg -i cloudflared-linux-amd64.deb > /dev/null 2>&1", shell=True, check=False)

subprocess.run(["pkill", "-9", "-f", "cloudflared"], check=False)
if os.path.exists('/content/cf_tunnel.log'):
    try: os.remove('/content/cf_tunnel.log')
    except Exception: pass

with open('/content/cf_tunnel.log', 'w') as out_cf:
    subprocess.Popen(
        ["cloudflared", "tunnel", "run", "--token", TUNNEL_TOKEN],
        stdin=subprocess.DEVNULL,
        stdout=out_cf,
        stderr=subprocess.STDOUT,
        start_new_session=True
    )

print('⏳ กำลังรอให้พอร์ต 8188 และ 8189 ตอบสนอง...', flush=True)
import socket
for _ in range(15):
    time.sleep(1)
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s1, socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s2:
        s1.settimeout(0.5)
        s2.settimeout(0.5)
        if s1.connect_ex(('127.0.0.1', 8188)) == 0 and s2.connect_ex(('127.0.0.1', 8189)) == 0:
            break

comfy_url = 'https://comfy-api.ayaigaldie.site'
sidecar_url = 'https://sidecar.ayaigaldie.site'

print('=' * 65, flush=True)
print('🎉 เซิร์ฟเวอร์ {model_title} (A100 SSD) เปิดเสร็จสมบูรณ์แล้ว!', flush=True)
print('💾 โมเดลทั้งหมดถูกเก็บใน : Local SSD (/content/ComfyUI/models)', flush=True)
print('📁 วิดีโอผลลัพธ์จะส่งตรงไปเซฟที่เครื่องและเบราว์เซอร์ของคุณอัตโนมัติ!', flush=True)
print(f'🔗 1. ComfyUI Endpoint URL : {{comfy_url}}', flush=True)
print(f'🔗 2. Sidecar Kill Switch URL: {{sidecar_url}}', flush=True)
print('=' * 65, flush=True)
'''
    
    full_code = prefix + new_suffix
    # Split back into lines for ipynb
    lines = [l + '\n' for l in full_code.split('\n')]
    if lines and lines[-1] == '\n':
        lines.pop()
    
    nb['cells'][1]['source'] = lines
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(nb, f, indent=2, ensure_ascii=False)
    print(f'Successfully patched {filepath}')
    return True

if __name__ == '__main__':
    patch_notebook('colab/ComfyUI_A100_MiniMax_H3_Studio.ipynb', 'MiniMax-H3 Turbo')
    patch_notebook('colab/ComfyUI_A100_Wan22_Commercial_Studio.ipynb', 'Wan2.2 Commercial')
