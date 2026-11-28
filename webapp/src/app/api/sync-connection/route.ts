import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const GDRIVE_CONNECTION_CANDIDATES = [
  'D:\\My Drive\\ComfyUI_Studio\\connection.json',
  'X:\\ComfyUI_Studio\\connection.json',
  'G:\\ComfyUI_Studio\\connection.json',
  'G:\\My Drive\\ComfyUI_Studio\\connection.json',
];

export async function GET(req: NextRequest) {
  try {
    for (const candidatePath of GDRIVE_CONNECTION_CANDIDATES) {
      if (fs.existsSync(candidatePath)) {
        const content = fs.readFileSync(candidatePath, 'utf-8');
        const data = JSON.parse(content);
        return NextResponse.json({ success: true, data, source: candidatePath });
      }
    }
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }

  return NextResponse.json(
    { 
      success: false, 
      message: 'connection.json not yet synced to Google Drive (D:\\My Drive\\ComfyUI_Studio or G:\\ComfyUI_Studio). Make sure Colab has finished writing it.' 
    },
    { status: 404 }
  );
}
