"""
Script to install required Custom Nodes for ComfyUI MiniMax-H3 Studio on Local PC.
Works on Windows (Portable or Standard) and Linux.
"""

import os
import sys
import shutil
import subprocess

CUSTOM_NODES = [
    {
        "name": "ComfyUI-MiniMax-H3-Turbo",
        "url": "https://github.com/Larryvrh/ComfyUI-MiniMax-H3-Turbo.git",
        "req": None,
    },
    {
        "name": "ComfyUI-VideoHelperSuite",
        "url": "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git",
        "req": "requirements.txt",
    },
    {
        "name": "ComfyUI-KJNodes",
        "url": "https://github.com/kijai/ComfyUI-KJNodes.git",
        "req": "requirements.txt",
    },
    {
        "name": "ComfyUI-MiniMax-H3-PDD-Acc",
        "url": "https://github.com/Jalen-Brunson/ComfyUI-MiniMax-H3-PDD-Acc.git",
        "req": None,
    },
]

def find_comfy_root(provided_path=None):
    if provided_path and os.path.isdir(provided_path):
        return os.path.abspath(provided_path)

    candidates = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "ComfyUI")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ComfyUI")),
        r"C:\ComfyUI_windows_portable\ComfyUI",
        r"D:\ComfyUI_windows_portable\ComfyUI",
        r"E:\ComfyUI_windows_portable\ComfyUI",
    ]
    for c in candidates:
        if os.path.isdir(c) and os.path.exists(os.path.join(c, "main.py")):
            return c

    # Ask user interactively if running in terminal
    print("\n[?] ไม่พบโฟลเดอร์ ComfyUI อัตโนมัติ")
    val = input("กรุณาระบุ Path ของโฟลเดอร์ ComfyUI ในเครื่องของคุณ (เช่น C:\\ComfyUI_windows_portable\\ComfyUI): ").strip()
    if val and os.path.isdir(val):
        return os.path.abspath(val)
    
    raise FileNotFoundError("ไม่พบโฟลเดอร์ ComfyUI กรุณาระบุ path ให้ถูกต้อง")

def find_comfy_python(comfy_dir):
    parent = os.path.dirname(comfy_dir)
    portable_py = os.path.join(parent, "python_embeded", "python.exe")
    if os.path.isfile(portable_py):
        return portable_py

    venv_py_win = os.path.join(comfy_dir, "venv", "Scripts", "python.exe")
    if os.path.isfile(venv_py_win):
        return venv_py_win

    venv_py_nix = os.path.join(comfy_dir, "venv", "bin", "python")
    if os.path.isfile(venv_py_nix):
        return venv_py_nix

    return sys.executable

def main():
    print("=" * 65)
    print(" 🛠️  ComfyUI MiniMax-H3 Studio — Local Custom Nodes Installer")
    print("=" * 65)

    provided = sys.argv[1] if len(sys.argv) > 1 else None
    comfy_dir = find_comfy_root(provided)
    print(f"\n📁 ตรวจพบโฟลเดอร์ ComfyUI: {comfy_dir}")

    custom_nodes_dir = os.path.join(comfy_dir, "custom_nodes")
    os.makedirs(custom_nodes_dir, exist_ok=True)
    python_bin = find_comfy_python(comfy_dir)
    print(f"🐍 ตรวจพบ Python: {python_bin}\n")

    for node in CUSTOM_NODES:
        name = node["name"]
        url = node["url"]
        target = os.path.join(custom_nodes_dir, name)

        if os.path.exists(target):
            print(f"⚡ [พบอยู่แล้ว] {name} -> ดึงอัปเดตล่าสุด (git pull)...")
            subprocess.run(["git", "pull"], cwd=target, check=False)
        else:
            print(f"📥 [กำลังติดตั้ง] {name} จาก {url}...")
            subprocess.run(["git", "clone", "--depth", "1", url, target], check=False)

        # Install requirements if exists
        if node["req"]:
            req_file = os.path.join(target, node["req"])
            if os.path.isfile(req_file):
                print(f"   📦 ติดตั้ง dependencies สำหรับ {name}...")
                subprocess.run([python_bin, "-m", "pip", "install", "-q", "-r", req_file], check=False)

    # Extra dependencies for local sidecar
    print("\n📦 ติดตั้งไลบรารีเสริมสำหรับ Local Sidecar (fastapi, uvicorn, pydantic, requests)...")
    subprocess.run([python_bin, "-m", "pip", "install", "-q", "fastapi", "uvicorn", "pydantic", "requests"], check=False)

    print("\n" + "=" * 65)
    print(" ✅ ติดตั้ง Custom Nodes ทั้งหมดเรียบร้อยแล้ว!")
    print("=" * 65)

if __name__ == "__main__":
    main()
