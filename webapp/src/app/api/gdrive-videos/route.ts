import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Primary target: Google Drive via Rclone (Drive X:\) or mounted drive D:\ / G:\
// Fallback: Local project's "outputs" directory if cloud drive is not mounted
const X_DRIVE_DIR = 'X:\\ComfyUI_Studio\\outputs';
const D_DRIVE_DIR = 'D:\\My Drive\\ComfyUI_Studio\\outputs';
const G_DRIVE_DIR = 'G:\\ComfyUI_Studio\\outputs';
const FALLBACK_VIDEO_DIR = path.resolve(process.cwd(), '..', 'outputs');

const ALLOWED_EXTS = ['.mp4', '.webm', '.mkv', '.png', '.jpg', '.jpeg', '.webp'];
const SUBFOLDERS = ['', 'picture', 'video', 'image'];

function resolveVideoDir(): string {
  try {
    // 1. Check X:\ (Rclone Google Drive mount - 5TB Cloud Drive)
    if (fs.existsSync('X:\\ComfyUI_Studio') || fs.existsSync('X:\\')) {
      if (!fs.existsSync(X_DRIVE_DIR)) {
        fs.mkdirSync(X_DRIVE_DIR, { recursive: true });
      }
      return X_DRIVE_DIR;
    }
    // 2. Check D:\My Drive (Google Drive for Desktop on D:)
    if (fs.existsSync('D:\\My Drive\\ComfyUI_Studio') || fs.existsSync('D:\\My Drive')) {
      if (!fs.existsSync(D_DRIVE_DIR)) {
        fs.mkdirSync(D_DRIVE_DIR, { recursive: true });
      }
      return D_DRIVE_DIR;
    }
    // 3. Check G:\
    if (fs.existsSync('G:\\ComfyUI_Studio') || fs.existsSync('G:\\')) {
      if (!fs.existsSync(G_DRIVE_DIR)) {
        fs.mkdirSync(G_DRIVE_DIR, { recursive: true });
      }
      return G_DRIVE_DIR;
    }
  } catch {
    // Fallback if network drives are inaccessible
  }
  return FALLBACK_VIDEO_DIR;
}

function ensureOutputDir(dir: string): boolean {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return true;
  } catch {
    return false;
  }
}

function getAllCandidateDirs(primaryDir: string): string[] {
  const roots = [primaryDir, FALLBACK_VIDEO_DIR, X_DRIVE_DIR, D_DRIVE_DIR, G_DRIVE_DIR];
  const seen = new Set<string>();
  const dirs: string[] = [];

  for (const root of roots) {
    for (const sub of SUBFOLDERS) {
      const candidate = sub ? path.join(root, sub) : root;
      const key = path.resolve(candidate).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
          dirs.push(candidate);
        }
      } catch {
        // Ignore inaccessible mounts
      }
    }
  }
  return dirs;
}

function isAllowedMediaFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ALLOWED_EXTS.some((ext) => lower.endsWith(ext));
}

function isMediaMetadataFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.endsWith('.json') && ALLOWED_EXTS.some((ext) => lower.endsWith(`${ext}.json`));
}

export async function GET(req: NextRequest) {
  try {
    const VIDEO_DIR = resolveVideoDir();
    const { searchParams } = new URL(req.url);
    const file = searchParams.get('file');

    // If specific file requested, stream the MP4/WebM video or 4K PNG image
    if (file) {
      const safeName = path.basename(file);
      const searchDirs = getAllCandidateDirs(VIDEO_DIR);

      let filePath: string | null = null;
      for (const dir of searchDirs) {
        const cand = path.join(dir, safeName);
        if (fs.existsSync(cand)) {
          filePath = cand;
          break;
        }
      }

      if (!filePath) {
        return new NextResponse('Media not found', { status: 404 });
      }

      const stat = fs.statSync(filePath);
      const fileStream = fs.createReadStream(filePath);
      const ext = path.extname(safeName).toLowerCase();
      let contentType = 'video/mp4';
      if (ext === '.webm') contentType = 'video/webm';
      else if (ext === '.png') contentType = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
      else if (ext === '.webp') contentType = 'image/webp';

      return new NextResponse(fileStream as any, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': stat.size.toString(),
          'Accept-Ranges': 'bytes',
          'Content-Disposition': `inline; filename="${safeName}"`,
        },
      });
    }

    // Otherwise, list all videos and 4K images saved in Google Drive / outputs (including picture/, video/, image/ subfolders)
    if (!ensureOutputDir(VIDEO_DIR) || !fs.existsSync(VIDEO_DIR)) {
      return NextResponse.json(
        { videos: [], directory: VIDEO_DIR },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const searchDirs = SUBFOLDERS.map((sub) => (sub ? path.join(VIDEO_DIR, sub) : VIDEO_DIR)).filter((d) => {
      try {
        return fs.existsSync(d) && fs.statSync(d).isDirectory();
      } catch {
        return false;
      }
    });

    const allFilesMap = new Map<string, any>();

    for (const dir of searchDirs) {
      try {
        const dirFiles = fs.readdirSync(dir);
        for (const filename of dirFiles) {
          if (!isAllowedMediaFile(filename)) continue;
          if (allFilesMap.has(filename)) continue;

          const fullPath = path.join(dir, filename);
          const stat = fs.statSync(fullPath);
          const isImage = ['.png', '.jpg', '.jpeg', '.webp'].some((ext) => filename.toLowerCase().endsWith(ext));

          let prompt: string | undefined = undefined;
          let originalThaiPrompt: string | undefined = undefined;
          const metaPath = path.join(dir, `${filename}.json`);
          if (fs.existsSync(metaPath)) {
            try {
              const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
              prompt = meta.prompt || meta.positivePrompt || undefined;
              originalThaiPrompt = meta.originalThaiPrompt || undefined;
            } catch (_) {}
          }

          allFilesMap.set(filename, {
            filename,
            isImage,
            sizeMb: (stat.size / (1024 * 1024)).toFixed(2),
            createdAt: stat.mtimeMs,
            url: `/api/gdrive-videos?file=${encodeURIComponent(filename)}`,
            prompt,
            originalThaiPrompt,
          });
        }
      } catch (_) {}
    }

    const files = Array.from(allFilesMap.values()).sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json(
      { videos: files, directory: VIDEO_DIR },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { videos: [], error: e.message },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

/**
 * POST /api/gdrive-videos
 * Saves a rendered video directly into G:\ComfyUI_Studio\outputs (or skips download if Colab Rclone already synced it there).
 */
export async function POST(req: NextRequest) {
  try {
    const VIDEO_DIR = resolveVideoDir();
    const body = await req.json();
    const { remoteUrl, filename, metadata } = body;

    if (!remoteUrl) {
      return NextResponse.json({ savedLocally: false, error: 'remoteUrl is required' }, { status: 400 });
    }

    if (!ensureOutputDir(VIDEO_DIR)) {
      // Running in a read-only cloud environment (e.g. Vercel); browser keeps an in-memory copy
      return NextResponse.json({ savedLocally: false, reason: 'read-only-fs' });
    }

    const baseName = path.basename(filename || `studio_video_${Date.now()}.mp4`);
    const isImage = ['.png', '.jpg', '.jpeg', '.webp'].some((ext) => baseName.toLowerCase().endsWith(ext));
    const subFolder = isImage ? 'picture' : 'video';
    const targetDir = path.join(VIDEO_DIR, subFolder);
    ensureOutputDir(targetDir);

    const targetPath = path.join(targetDir, baseName);
    const rootPath = path.join(VIDEO_DIR, baseName);

    // Save prompt metadata JSON if provided
    if (metadata && typeof metadata === 'object') {
      try {
        fs.writeFileSync(path.join(targetDir, `${baseName}.json`), JSON.stringify(metadata, null, 2), 'utf-8');
      } catch (_) {}
    }

    // If file already exists in target folder or root, no need to download again!
    const existingFile = fs.existsSync(targetPath) ? targetPath : fs.existsSync(rootPath) ? rootPath : null;
    if (existingFile) {
      const existingStat = fs.statSync(existingFile);
      if (existingStat.size > 10000) {
        return NextResponse.json({
          savedLocally: true,
          alreadySyncedFromColab: true,
          filename: baseName,
          localPath: existingFile,
          localUrl: `/api/gdrive-videos?file=${encodeURIComponent(baseName)}`,
          sizeMb: (existingStat.size / (1024 * 1024)).toFixed(2),
        });
      }
    }

    const response = await fetch(remoteUrl, { cache: 'no-store' });
    if (!response.ok) {
      return NextResponse.json(
        { savedLocally: false, error: `Failed to fetch remote video: ${response.status}` },
        { status: 502 }
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    fs.writeFileSync(targetPath, buffer);

    return NextResponse.json({
      savedLocally: true,
      filename: baseName,
      localPath: targetPath,
      localUrl: `/api/gdrive-videos?file=${encodeURIComponent(baseName)}`,
      sizeMb: (buffer.length / (1024 * 1024)).toFixed(2),
    });
  } catch (e: any) {
    return NextResponse.json({ savedLocally: false, error: e.message }, { status: 200 });
  }
}

/**
 * DELETE /api/gdrive-videos
 * Deletes a specific file or clears all media files from outputs directory and its subfolders (picture/, video/, image/).
 */
export async function DELETE(req: NextRequest) {
  try {
    const VIDEO_DIR = resolveVideoDir();
    const { searchParams } = new URL(req.url);
    const filename = searchParams.get('file');
    const clearAll = searchParams.get('all') === 'true';
    const candidateDirs = getAllCandidateDirs(VIDEO_DIR);

    if (clearAll) {
      let deletedCount = 0;

      for (const dir of candidateDirs) {
        try {
          const files = fs.readdirSync(dir);
          for (const f of files) {
            if (isAllowedMediaFile(f) || isMediaMetadataFile(f)) {
              const target = path.join(dir, f);
              try {
                if (fs.existsSync(target) && fs.statSync(target).isFile()) {
                  fs.unlinkSync(target);
                  if (isAllowedMediaFile(f)) deletedCount++;
                }
              } catch (_) {}
            }
          }
        } catch (_) {}
      }

      return NextResponse.json(
        {
          success: true,
          message: `ลบไฟล์ภาพและวิดีโอประวัติทั้งหมดเรียบร้อยแล้ว (${deletedCount} รายการ)`,
          deletedCount,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (filename) {
      const safeName = path.basename(filename);
      let removed = false;

      for (const dir of candidateDirs) {
        const filePath = path.join(dir, safeName);
        const metaPath = path.join(dir, `${safeName}.json`);
        try {
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
            removed = true;
          }
        } catch (_) {}
        try {
          if (fs.existsSync(metaPath) && fs.statSync(metaPath).isFile()) {
            fs.unlinkSync(metaPath);
          }
        } catch (_) {}
      }

      return NextResponse.json(
        {
          success: removed,
          message: removed ? `ลบไฟล์ ${safeName} เรียบร้อยแล้ว` : 'ไม่พบไฟล์ที่ต้องการลบ',
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json(
      { success: false, error: 'ระบุไฟล์ที่ต้องการลบหรือ ?all=true' },
      { status: 400 }
    );
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
