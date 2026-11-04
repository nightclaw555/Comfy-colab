import json

nb_path = 'colab/ComfyUI_A100_MiniMax_H3_Studio.ipynb'
with open(nb_path, 'r', encoding='utf-8') as f:
    nb = json.load(f)

code_cell = nb['cells'][2]

source = code_cell['source']
new_source = []
skip = False

for line in source:
    if 'def ensure_model_on_ssd' in line:
        new_source.extend([
            "def ensure_model_on_ssd(filename, gdrive_dir, local_dir, url):\n",
            "    local_file = os.path.join(local_dir, filename)\n",
            "    gdrive_file = os.path.join(gdrive_dir, filename)\n",
            "    \n",
            "    # 1. ถ้ามีบน SSD แล้ว (เช่น รันซ้ำในเซสชันเดิม) ข้ามได้ทันทีใน 0 วินาที\n",
            "    if os.path.exists(local_file) and os.path.getsize(local_file) > 1000000:\n",
            "        print(f'⚡ [SSD พร้อมใช้งาน 100%] {filename}')\n",
            "        return\n",
            "    \n",
            "    # 2. ถ้าใน Google Drive มีไฟล์อยู่แล้ว ก็อปปี้เข้า SSD\n",
            "    # หรือดึงตรงจาก Hugging Face ผ่าน aria2c 16 ท่อ (เร็วสุด ~2 นาที)\n",
            "    if os.path.exists(gdrive_file) and os.path.getsize(gdrive_file) > 1000000:\n",
            "        print(f'📦 ย้าย {filename} จาก Google Drive ➔ เข้าสู่ SSD ความเร็วสูง...')\n",
            "        !cp \"{gdrive_file}\" \"{local_file}\"\n",
            "        print(f'✅ โหลดเข้า SSD สำเร็จ: {filename}')\n",
            "        return\n",
            "    \n",
            "    print(f'📥 ดาวน์โหลดความเร็วแสงเข้า SSD: {filename}...')\n",
            "    !aria2c -c -x 16 -s 16 -k 1M \"{url}\" -d \"{local_dir}\" -o \"{filename}\"\n",
            "    print(f'✅ โหลดเข้า SSD สำเร็จ: {filename}')\n",
            "    !cp \"{local_file}\" \"{gdrive_file}\" > /dev/null 2>&1 &\n",
            "\n"
        ])
        skip = True
    elif skip:
        if 'ensure_model_on_ssd(' in line:
            skip = False
            new_source.append(line)
    else:
        new_source.append(line)

code_cell['source'] = new_source

with open(nb_path, 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=2, ensure_ascii=False)

print("Updated ensure_model_on_ssd in notebook!")
