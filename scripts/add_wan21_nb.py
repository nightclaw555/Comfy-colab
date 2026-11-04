import json

nb_path = 'colab/ComfyUI_A100_MiniMax_H3_Studio.ipynb'
with open(nb_path, 'r', encoding='utf-8') as f:
    nb = json.load(f)

# Check if wan21 cell already exists
has_wan21 = any('Wan2.1 TikTok' in str(c.get('source', '')) for c in nb['cells'])

if not has_wan21:
    wan21_md = {
        "cell_type": "markdown",
        "metadata": {},
        "source": [
            "---\n",
            "# 🛍️ [Wan2.1 TikTok Commercial 14B Loader] (กดรันเฉพาะเมื่อต้องการใช้ Wan2.1 ทำคลิปขายของ)\n",
            "*ดาวน์โหลดเข้า SSD ความเร็วสูงของ Colab โดยตรง (~2 นาที) ไม่กินพื้นที่ Google Drive*"
        ]
    }

    wan21_code = {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "# ====================================================================\n",
            "# 🛍️ WAN2.1 14B FP8 COMMERCIAL LOADER (เข้า SSD ตรงๆ ไม่เปลือง Google Drive)\n",
            "# ====================================================================\n",
            "import os\n",
            "print('🚀 กำลังตรวจสอบและดาวน์โหลด Wan2.1 14B FP8 เข้า SSD ของ Colab...')\n",
            "L_DIFF = '/content/ComfyUI/models/diffusion_models'\n",
            "L_TEXT = '/content/ComfyUI/models/text_encoders'\n",
            "L_VAE = '/content/ComfyUI/models/vae'\n",
            "L_VISION = '/content/ComfyUI/models/clip_vision'\n",
            "for d in [L_DIFF, L_TEXT, L_VAE, L_VISION]:\n",
            "    os.makedirs(d, exist_ok=True)\n",
            "\n",
            "def dl_ssd(url, target_dir, filename):\n",
            "    f = os.path.join(target_dir, filename)\n",
            "    if os.path.exists(f) and os.path.getsize(f) > 1000000:\n",
            "        print(f'⚡ พบ {filename} ใน SSD แล้ว พร้อมใช้งานทันที!')\n",
            "    else:\n",
            "        print(f'📥 กำลังโหลด {filename}...')\n",
            "        !aria2c -c -x 16 -s 16 -k 1M \"{url}\" -d \"{target_dir}\" -o \"{filename}\"\n",
            "        print(f'✅ โหลด {filename} สำเร็จ!')\n",
            "\n",
            "# 1. Wan2.1 14B FP8 T2V Diffusion (~14.3 GB)\n",
            "dl_ssd('https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/diffusion_models/wan2.1_t2v_14B_fp8_e4m3fn.safetensors', L_DIFF, 'wan2.1_t2v_14B_fp8_e4m3fn.safetensors')\n",
            "\n",
            "# 2. Wan2.1 14B FP8 I2V 720p Diffusion (~14.3 GB)\n",
            "dl_ssd('https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/diffusion_models/wan2.1_i2v_720p_14B_fp8_e4m3fn.safetensors', L_DIFF, 'wan2.1_i2v_720p_14B_fp8_e4m3fn.safetensors')\n",
            "\n",
            "# 3. UMT5-XXL FP8 Text Encoder (~4.9 GB)\n",
            "dl_ssd('https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn.safetensors', L_TEXT, 'umt5_xxl_fp8_e4m3fn.safetensors')\n",
            "\n",
            "# 4. Wan 2.1 VAE (~1.4 GB)\n",
            "dl_ssd('https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors', L_VAE, 'wan_2.1_vae.safetensors')\n",
            "\n",
            "# 5. CLIP Vision for I2V (~1.2 GB)\n",
            "dl_ssd('https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/clip_vision/clip_vision_h.safetensors', L_VISION, 'clip_vision_h.safetensors')\n",
            "\n",
            "print('\\n🎉 [Wan2.1 14B พร้อมใช้งานสมบูรณ์แล้ว!] สลับในหน้าเว็บเป็น Wan2.1 แล้วกดเจนคลิป TikTok ได้เลย!')\n"
        ]
    }

    nb['cells'].extend([wan21_md, wan21_code])

    with open(nb_path, 'w', encoding='utf-8') as f:
        json.dump(nb, f, indent=2, ensure_ascii=False)

    print("Added Wan2.1 On-Demand Loader cell to notebook!")
else:
    print("Wan2.1 cell already exists in notebook.")
