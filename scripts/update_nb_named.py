import json

nb_path = 'colab/ComfyUI_A100_MiniMax_H3_Studio.ipynb'
with open(nb_path, 'r', encoding='utf-8') as f:
    nb = json.load(f)

code_cell = nb['cells'][2]
source = code_cell['source']

new_source = []
skip = False
for line in source:
    if '# ติดตั้ง Cloudflared' in line:
        new_source.extend([
            "# ====================================================================\n",
            "# 🌐 [ถาวร] เชื่อมต่อ Cloudflare Named Tunnel (URL ไม่เปลี่ยนตลอดชีพ)\n",
            "# ====================================================================\n",
            "TUNNEL_TOKEN = 'eyJhIjoiMjYwMTc0YTk0M2FkMDBmZDM3ZDc3NjQ4YjViY2ZkYzUiLCJ0IjoiZGVkMTU0ZjctNzEzNy00NjYyLWE1OTQtNjNiOWMyYWNiMGZlIiwicyI6Ik1UTTVaVGt3WkdJdFlUWm1NaTAwWkRoakxXSXdNRGd0T1RCa00yWmtZakE1TldVMiJ9'\n",
            "\n",
            "print('🌐 [6/6] ติดตั้งและเชื่อมต่อ Cloudflare Tunnel ถาวร...')\n",
            "!if [ ! -f /usr/local/bin/cloudflared ]; then \\\n",
            "    wget -q -nc https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && \\\n",
            "    dpkg -i cloudflared-linux-amd64.deb > /dev/null 2>&1; \\\n",
            "fi\n",
            "\n",
            "!pkill -f cloudflared > /dev/null 2>&1 || true\n",
            "!rm -f /content/cf_tunnel.log\n",
            "!nohup cloudflared tunnel run --token {TUNNEL_TOKEN} > /content/cf_tunnel.log 2>&1 &\n",
            "time.sleep(4)\n",
            "\n",
            "comfy_url = 'https://comfy-api.ayaigaldie.site'\n",
            "sidecar_url = 'https://sidecar.ayaigaldie.site'\n",
            "\n"
        ])
        skip = True
    elif skip:
        if '# บันทึก URL ทั้ง 2 ลงไฟล์' in line:
            skip = False
            new_source.append(line)
    else:
        new_source.append(line)

code_cell['source'] = new_source

with open(nb_path, 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=2, ensure_ascii=False)

print("Notebook updated to use permanent named tunnel!")
