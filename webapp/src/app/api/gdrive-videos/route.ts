import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Primary target: Google Drive via Rclone (Drive X:\) or mounted drive G:\
// Fallback: Local project's "outputs" directory if cloud drive is not mounted
const X_DRIVE_DIR = 'X:\\ComfyUI_Studio\\outputs';
const G_DRIVE_DIR = 'G:\\ComfyUI_Studio\\outputs';
const FALLBACK_VIDEO_DIR = path.resolve(process.cwd(), '..', 'outputs');

function resolveVideoDir(): string {
  try {
    // 1. Check X:\ (Rclone Google Drive mount - 5TB Cloud Drive)
    if (fs.existsSync('X:\\ComfyUI_Studio') || fs.existsSync('X:\\')) {
      if (!fs.existsSync(X_DRIVE_DIR)) {
        fs.mkdirSync(X_DRIVE_DIR, { recursive: true });
      }
      return X_DRIVE_DIR;
    }
    // 2. Check G:\
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

export async function GET(req: NextRequest) {
  try {
    const VIDEO_DIR = resolveVideoDir();
    const { searchParams } = new URL(req.url);
    const file = searchParams.get('file');

    // If specific file requested, stream the MP4/WebM video or 4K PNG image
    if (file) {
      const safeName = path.basename(file);
      const searchCandidates = [
        path.join(VIDEO_DIR, safeName),
        path.join(VIDEO_DIR, 'picture', safeName),
        path.join(VIDEO_DIR, 'video', safeName),
        path.join(FALLBACK_VIDEO_DIR, safeName),
        path.join(FALLBACK_VIDEO_DIR, 'picture', safeName),
        path.join(FALLBACK_VIDEO_DIR, 'video', safeName),
        path.join('G:\\ComfyUI_Studio\\outputs', safeName),
        path.join('G:\\ComfyUI_Studio\\outputs', 'picture', safeName),
      ];

      let filePath: string | null = null;
      for (const cand of searchCandidates) {
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

    // Otherwise, list all videos and 4K images saved in Google Drive / outputs (including picture/ and video/ subfolders)
    if (!ensureOutputDir(VIDEO_DIR) || !fs.existsSync(VIDEO_DIR)) {
      return NextResponse.json({ videos: [], directory: VIDEO_DIR });
    }

    const allowedExts = ['.mp4', '.webm', '.png', '.jpg', '.jpeg', '.webp'];
    const searchDirs = [VIDEO_DIR];
    for (const sub of ['picture', 'video', 'image']) {
      const subPath = path.join(VIDEO_DIR, sub);
      if (fs.existsSync(subPath)) {
        try {
          if (fs.statSync(subPath).isDirectory()) {
            searchDirs.push(subPath);
          }
        } catch (_) {}
      }
    }

    const allFilesMap = new Map<string, any>();

    for (const dir of searchDirs) {
      try {
        const dirFiles = fs.readdirSync(dir);
        for (const filename of dirFiles) {
          if (!allowedExts.some((ext) => filename.toLowerCase().endsWith(ext))) continue;
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

    return NextResponse.json({ videos: files, directory: VIDEO_DIR });
  } catch (e: any) {
    return NextResponse.json({ videos: [], error: e.message }, { status: 200 });
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
      // Running in a read-only cloud environment (e.g. Vercel); browser will handle auto-download
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
 * Deletes a specific file or clears all media files from outputs directory.
 */
export async function DELETE(req: NextRequest) {
  try {
    const VIDEO_DIR = resolveVideoDir();
    const { searchParams } = new URL(req.url);
    const filename = searchParams.get('file');
    const clearAll = searchParams.get('all') === 'true';

    const allowedExts = ['.mp4', '.webm', '.png', '.jpg', '.jpeg', '.webp'];

    if (clearAll) {
      let deletedCount = 0;
      const dirs = [VIDEO_DIR, FALLBACK_VIDEO_DIR];
      const seenDirs = new Set<string>();

      for (const d of dirs) {
        if (!fs.existsSync(d) || seenDirs.has(path.resolve(d))) continue;
        seenDirs.add(path.resolve(d));

        const files = fs.readdirSync(d);
        for (const f of files) {
          if (allowedExts.some((ext) => f.toLowerCase().endsWith(ext))) {
            try {
              fs.unlinkSync(path.join(d, f));
              deletedCount++;
            } catch (_) {}
          }
        }
      }

      return NextResponse.json({
        success: true,
        message: `ลบไฟล์ภาพและวิดีโอประวัติทั้งหมดเรียบร้อยแล้ว (${deletedCount} รายการ)`,
        deletedCount,
      });
    }

    if (filename) {
      const safeName = path.basename(filename);
      let removed = false;
      const dirs = [VIDEO_DIR, FALLBACK_VIDEO_DIR];

      for (const d of dirs) {
        const filePath = path.join(d, safeName);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
            removed = true;
          } catch (_) {}
        }
      }

      return NextResponse.json({
        success: removed,
        message: removed ? `ลบไฟล์ ${safeName} เรียบร้อยแล้ว` : 'ไม่พบไฟล์ที่ต้องการลบ',
      });
    }

    return NextResponse.json({ success: false, error: 'ระบุไฟล์ที่ต้องการลบหรือ ?all=true' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
