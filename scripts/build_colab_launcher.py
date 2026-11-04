import os, sys, base64

with open('colab/sidecar_b64.txt', 'r', encoding='utf-8') as f:
    b64 = f.read().strip()

template = f'''# ====================================================================
# 🚀 MINIMAX-H3 TURBO STUDIO (L4 GPU OPTIMIZED LAUNCHER)
# ====================================================================
import os, sys, time, json, subprocess, base64, socket

print("⚡ [3/5] Setting up Sidecar Agent...")
b64_data = """{b64}"""
with open("/content/colab_sidecar.py", "wb") as f:
    f.write(base64.b64decode(b64_data))

tbe_addr = os.environ.get("TBE_RUNTIME_ADDR", "")
with open("/content/sidecar_config.json", "w") as f:
    json.dump({{"TBE_RUNTIME_ADDR": tbe_addr}}, f)

subprocess.run(["fuser", "-k", "-9", "8189/tcp"], check=False)
sidecar_env = os.environ.copy()
if tbe_addr:
    sidecar_env["TBE_RUNTIME_ADDR"] = tbe_addr
with open("/content/sidecar.log", "w") as out_sidecar:
    subprocess.Popen(
        [sys.executable, "/content/colab_sidecar.py", "8189"],
        env=sidecar_env,
        stdin=subprocess.DEVNULL,
        stdout=out_sidecar,
        stderr=subprocess.STDOUT,
        start_new_session=True
    )
print("✅ Sidecar Agent started on port 8189")

print("\\n🌐 [4/5] Starting ComfyUI Core on NVIDIA L4...")
subprocess.run(["fuser", "-k", "-9", "8188/tcp"], check=False)
comfy_env = os.environ.copy()
comfy_env["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
comfy_args = [
    sys.executable, "main.py",
    "--listen", "0.0.0.0",
    "--port", "8188",
    "--output-directory", "/content/ComfyUI/output",
    "--reserve-vram", "2.0",
    "--fast"
]

with open("/content/comfyui.log", "w") as out_comfy:
    subprocess.Popen(
        comfy_args,
        cwd="/content/ComfyUI",
        env=comfy_env,
        stdin=subprocess.DEVNULL,
        stdout=out_comfy,
        stderr=subprocess.STDOUT,
        start_new_session=True
    )
print("✅ ComfyUI process spawned on port 8188")

print("\\n🔗 [5/5] Launching Cloudflare Tunnel...")
TUNNEL_TOKEN = "eyJhIjoiMjYwMTc0YTk0M2FkMDBmZDM3ZDc3NjQ4YjViY2ZkYzUiLCJ0IjoiZGVkMTU0ZjctNzEzNy00NjYyLWE1OTQtNjNiOWMyYWNiMGZlIiwicyI6Ik1UTTVaVGt3WkdJdFlUWm1NaTAwWkRoakxXSXdNRGd0T1RCa00yWmtZakE1TldVMiJ9"

if not os.path.exists("/usr/local/bin/cloudflared"):
    print("Installing cloudflared...")
    subprocess.run("wget -q -nc https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && dpkg -i cloudflared-linux-amd64.deb > /dev/null 2>&1", shell=True, check=False)

subprocess.run(["pkill", "-9", "-f", "cloudflared"], check=False)
with open("/content/cf_tunnel.log", "w") as out_cf:
    subprocess.Popen(
        ["cloudflared", "tunnel", "run", "--token", TUNNEL_TOKEN],
        stdin=subprocess.DEVNULL,
        stdout=out_cf,
        stderr=subprocess.STDOUT,
        start_new_session=True
    )

print("⏳ Waiting for ports 8188 and 8189 to be ready...")
ready = False
for i in range(30):
    time.sleep(1)
    s1 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s2 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s1.settimeout(0.5)
    s2.settimeout(0.5)
    c1 = (s1.connect_ex(("127.0.0.1", 8188)) == 0)
    c2 = (s2.connect_ex(("127.0.0.1", 8189)) == 0)
    s1.close()
    s2.close()
    if c1 and c2:
        print(f"🎉 Both services ready in {{i+1}}s!")
        ready = True
        break

print("=" * 60)
print("🔗 ComfyUI URL : https://comfy-api.ayaigaldie.site")
print("🔗 Sidecar URL : https://sidecar.ayaigaldie.site")
print("=" * 60)
'''

with open('colab/launcher_script.py', 'w', encoding='utf-8') as f:
    f.write(template)

print("launcher_script.py written successfully!")
