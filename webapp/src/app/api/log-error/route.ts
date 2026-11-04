import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const LOG_FILE_PATH = path.resolve(process.cwd(), '..', 'outputs', 'generation_errors.log');
const BACKUP_LOG_FILE_PATH = path.resolve(process.cwd(), 'generation_errors.log');

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { timestamp, error, itemId, modelEngine, mode, details } = body;
    const nowIso = timestamp || new Date().toISOString();

    const formattedLog = [
      `================================================================================`,
      `[TIMESTAMP]    ${nowIso}`,
      `[ITEM ID]      ${itemId || 'N/A'}`,
      `[MODEL ENGINE] ${modelEngine || 'unknown'}`,
      `[MODE]         ${mode || 'unknown'}`,
      `[ERROR MSG]    ${error || 'Unknown error'}`,
      details ? `[DETAILS]\n${typeof details === 'object' ? JSON.stringify(details, null, 2) : details}` : '',
      `================================================================================\n\n`
    ].filter(Boolean).join('\n');

    // 1. Write to outputs/generation_errors.log
    try {
      ensureDir(LOG_FILE_PATH);
      fs.appendFileSync(LOG_FILE_PATH, formattedLog, 'utf-8');
    } catch (e) {
      console.error('Failed to append to outputs/generation_errors.log:', e);
    }

    // 2. Also write to webapp/generation_errors.log
    try {
      ensureDir(BACKUP_LOG_FILE_PATH);
      fs.appendFileSync(BACKUP_LOG_FILE_PATH, formattedLog, 'utf-8');
    } catch (e) {
      console.error('Failed to append to webapp/generation_errors.log:', e);
    }

    return NextResponse.json({ success: true, loggedAt: nowIso });
  } catch (err: any) {
    console.error('Error logging API failure:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const targetFile = fs.existsSync(LOG_FILE_PATH) ? LOG_FILE_PATH : BACKUP_LOG_FILE_PATH;
    if (!fs.existsSync(targetFile)) {
      return NextResponse.json({ logs: '', entriesCount: 0 });
    }

    const content = fs.readFileSync(targetFile, 'utf-8');
    return NextResponse.json({ logs: content, filePath: targetFile });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
