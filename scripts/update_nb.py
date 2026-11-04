import json

nb_path = 'colab/ComfyUI_A100_MiniMax_H3_Studio.ipynb'
with open(nb_path, 'r', encoding='utf-8') as f:
    nb = json.load(f)

# Find code cell
code_cell = nb['cells'][2]
source = code_cell['source']

new_source = []
skip = False
for line in source:
    if '# ติดตั้ง Cloudflared' in line:
        new_source.extend([
            "# ติดตั้ง Cloudflared\n",
            "!wget -q -nc https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb\n",
            "!dpkg -i cloudflared-linux-amd64.deb > /dev/null 2>&1\n",
            "\n",
            "# รัน Tunnel สดใหม่และบันทึกลง logfile โดยตรง\n",
            "!pkill -f cloudflared > /dev/null 2>&1 || true\n",
            "!rm -f /content/cf_comfy.log /content/cf_sidecar.log\n",
            "!nohup cloudflared tunnel --logfile /content/cf_comfy.log --url http://127.0.0.1:8188 > /dev/null 2>&1 &\n",
            "!nohup cloudflared tunnel --logfile /content/cf_sidecar.log --url http://127.0.0.1:8189 > /dev/null 2>&1 &\n",
            "\n",
            "print('⏳ [7/7] กำลังรอ Cloudflare สร้าง Public URL และซิงก์ Google Drive...')\n",
            "def extract_tunnel_url(log_file, max_wait=35):\n",
            "    start_t = time.time()\n",
            "    while time.time() - start_t < max_wait:\n",
            "        if os.path.exists(log_file):\n",
            "            try:\n",
            "                with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:\n",
            "                    content = f.read()\n",
            "                match = re.search(r'https://[a-zA-Z0-9-]+\\.trycloudflare\\.com', content)\n",
            "                if match:\n",
            "                    return match.group(0)\n",
            "            except Exception:\n",
            "                pass\n",
            "        time.sleep(1.5)\n",
            "    return None\n",
            "\n",
            "comfy_url = extract_tunnel_url('/content/cf_comfy.log')\n",
            "sidecar_url = extract_tunnel_url('/content/cf_sidecar.log')\n"
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

print("Notebook updated successfully!")
