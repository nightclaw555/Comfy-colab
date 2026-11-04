import json
import base64
import shutil
import os
import re

with open(r'C:\Users\night\AppData\Roaming\rclone\rclone.conf', 'r', encoding='utf-8') as f:
    rclone_conf_text = f.read().strip()

with open('colab/colab_sidecar.py', 'r', encoding='utf-8') as f:
    sidecar_code = f.read()

# 1. Update sidecar_b64.txt
b64_str = base64.b64encode(sidecar_code.encode('utf-8')).decode('ascii')
with open('colab/sidecar_b64.txt', 'w', encoding='utf-8') as f:
    f.write(b64_str)

rclone_setup_snippet = f'''# 🔗 ตั้งค่า Rclone Private API (ซิงค์วิดีโอเข้า G:\\ComfyUI_Studio\\outputs อัตโนมัติ ไม่ต้องกด Login ซ้ำ)
subprocess.run("apt-get -y install rclone > /dev/null 2>&1", shell=True, check=False)
with open("/content/rclone.conf", "w", encoding="utf-8") as rf:
    rf.write({rclone_conf_text!r} + "\\n")'''


def update_notebook(nb_path):
    with open(nb_path, 'r', encoding='utf-8') as f:
        nb = json.load(f)
    cell_idx = 1 if len(nb['cells']) > 1 else 0
    code = ''.join(nb['cells'][cell_idx]['source'])

    pattern = r"sidecar_code = r'''.*?'''\nwith open\('/content/colab_sidecar\.py', 'w', encoding='utf-8'\) as f:\n    f\.write\(sidecar_code\)"
    replacement = (
        rclone_setup_snippet + '\n\n' +
        "sidecar_code = r'''\n" + sidecar_code + "\n'''\n" +
        "with open('/content/colab_sidecar.py', 'w', encoding='utf-8') as f:\n    f.write(sidecar_code)"
    )

    code = re.sub(r'# 🔗 ตั้งค่า Rclone Private API.*?rf\.write\(.*?\)\n*', '', code, flags=re.DOTALL)
    new_code, count = re.subn(pattern, lambda m: replacement, code, flags=re.DOTALL)
    if count == 0:
        print('Warning: pattern not matched in', nb_path)
    else:
        lines = [l + '\n' for l in new_code.split('\n')]
        if lines and lines[-1] == '\n':
            lines.pop()
        nb['cells'][cell_idx]['source'] = lines
        with open(nb_path, 'w', encoding='utf-8') as f:
            json.dump(nb, f, indent=2, ensure_ascii=False)
        print('Updated notebook:', nb_path)


for nb_file in ['ComfyUI_A100_MiniMax_H3_Studio.ipynb', 'ComfyUI_A100_Wan22_Commercial_Studio.ipynb']:
    local_p = os.path.join('colab', nb_file)
    update_notebook(local_p)
    gdrive_p = os.path.join(r'G:\Colab Notebooks', nb_file)
    if os.path.exists(r'G:\Colab Notebooks'):
        shutil.copyfile(local_p, gdrive_p)
        print('Synced updated notebook to Google Drive:', gdrive_p)
