import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises'; // 使用 promises 版本的 fs 模块

export async function GET() {
  try {
    // process.cwd() 会获取到项目的根目录
    // path.join 会安全地拼接路径，生成 '.../your-project/CHANGELOG'
    const filePath = path.join(process.cwd(), 'CHANGELOG');

    // 从服务器硬盘上直接读取文件内容
    const content = await fs.readFile(filePath, 'utf-8');

    // 将文件内容返回给前端
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('API route /api/changelog failed to read file:', error);
    // 如果文件不存在或读取失败，返回一个清晰的错误
    return new NextResponse('Changelog file not found on server.', { status: 404 });
  }
}
