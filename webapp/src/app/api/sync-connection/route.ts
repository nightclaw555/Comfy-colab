import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const EXACT_GDRIVE_PATH = 'G:\\My Drive\\ComfyUI_Studio\\connection.json';

export async function GET(req: NextRequest) {
  try {
    if (fs.existsSync(EXACT_GDRIVE_PATH)) {
      const content = fs.readFileSync(EXACT_GDRIVE_PATH, 'utf-8');
      const data = JSON.parse(content);
      return NextResponse.json({ success: true, data, source: EXACT_GDRIVE_PATH });
    }
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }

  return NextResponse.json(
    { 
      success: false, 
      message: 'connection.json not yet synced to G:\\My Drive\\ComfyUI_Studio. Make sure Colab has finished writing it.' 
    },
    { status: 404 }
  );
}
