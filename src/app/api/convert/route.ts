import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  return NextResponse.json({ error: 'API 已禁用，此为纯前端应用，请使用界面进行转换' }, { status: 405 });
}
