import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Primary target: High-Speed Rclone Mounted Google Drive (G:\ComfyUI_Studio\outputs)
// Fallback: Local project's "outputs" directory if G: is not mounted
const GDRIVE_VIDEO_DIR = 'G:\\ComfyUI_Studio\\outputs';
const FALLBACK_VIDEO_DIR = path.resolve(process.cwd(), '..', 'outputs');

function resolveVideoDir(): string {
  try {
    if (fs.existsSync('G:\\')) {
      if (!fs.existsSync(GDRIVE_VIDEO_DIR)) {
        fs.mkdirSync(GDRIVE_VIDEO_DIR, { recursive: true });
      }
      return GDRIVE_VIDEO_DIR;
    }
  } catch {
    // Fallback if G: is inaccessible
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

    // If specific file requested, stream the MP4/WebM video directly from G:\ComfyUI_Studio\outputs
    if (file) {
      const safeName = path.basename(file);
      let filePath = path.join(VIDEO_DIR, safeName);
      if (!fs.existsSync(filePath)) {
        const fallbackPath = path.join(FALLBACK_VIDEO_DIR, safeName);
        if (fs.existsSync(fallbackPath)) {
          filePath = fallbackPath;
        } else {
          return new NextResponse('Video not found', { status: 404 });
        }
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

    // Otherwise, list all videos and 4K images saved in G:\ComfyUI_Studio\outputs
    if (!ensureOutputDir(VIDEO_DIR) || !fs.existsSync(VIDEO_DIR)) {
      return NextResponse.json({ videos: [], directory: VIDEO_DIR });
    }

    const allowedExts = ['.mp4', '.webm', '.png', '.jpg', '.jpeg', '.webp'];
    const files = fs
      .readdirSync(VIDEO_DIR)
      .filter((f) => allowedExts.some((ext) => f.toLowerCase().endsWith(ext)))
      .map((filename) => {
        const fullPath = path.join(VIDEO_DIR, filename);
        const stat = fs.statSync(fullPath);
        const isImage = ['.png', '.jpg', '.jpeg', '.webp'].some((ext) => filename.toLowerCase().endsWith(ext));
        return {
          filename,
          isImage,
          sizeMb: (stat.size / (1024 * 1024)).toFixed(2),
          createdAt: stat.mtimeMs,
          url: `/api/gdrive-videos?file=${encodeURIComponent(filename)}`,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);

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
    const { remoteUrl, filename } = body;

    if (!remoteUrl) {
      return NextResponse.json({ savedLocally: false, error: 'remoteUrl is required' }, { status: 400 });
    }

    if (!ensureOutputDir(VIDEO_DIR)) {
      // Running in a read-only cloud environment (e.g. Vercel); browser will handle auto-download
      return NextResponse.json({ savedLocally: false, reason: 'read-only-fs' });
    }

    const baseName = path.basename(filename || `studio_video_${Date.now()}.mp4`);
    const targetPath = path.join(VIDEO_DIR, baseName);

    // If Colab Rclone Sync already placed this exact file in G:\ComfyUI_Studio\outputs, no need to download again!
    if (fs.existsSync(targetPath)) {
      const existingStat = fs.statSync(targetPath);
      if (existingStat.size > 10000) {
        return NextResponse.json({
          savedLocally: true,
          alreadySyncedFromColab: true,
          filename: baseName,
          localPath: targetPath,
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
