import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

// 获取用户机器码信息
export async function GET(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // 管理员获取所有用户的机器码信息
    if (action === 'list' && (authInfo.role === 'admin' || authInfo.role === 'owner')) {
      const machineCodeUsers = await db.getMachineCodeUsers();
      return NextResponse.json({ users: machineCodeUsers });
    }

    // 默认行为：获取当前用户的机器码列表
    const userMachineCodes = await db.getUserMachineCodes(authInfo.username);

    return NextResponse.json({
      devices: userMachineCodes, // 返回设备列表
      isBound: userMachineCodes && userMachineCodes.length > 0
    });
  } catch (error) {
    console.error('获取机器码信息失败:', error);
    return NextResponse.json({ error: '获取机器码信息失败' }, { status: 500 });
  }
}

// 绑定或由管理员解绑机器码
export async function POST(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { machineCode, deviceInfo, action, targetUser } = body;

    // 管理员操作：解绑指定用户的机器码
    if (action === 'unbind' && (authInfo.role === 'admin' || authInfo.role === 'owner')) {
      if (!targetUser) {
        return NextResponse.json({ error: '目标用户不能为空' }, { status: 400 });
      }
      await db.deleteUserMachineCode(targetUser);
      return NextResponse.json({ success: true, message: '机器码解绑成功' });
    }

    // 用户绑定自己的机器码
    if (!machineCode) {
      return NextResponse.json({ error: '机器码不能为空' }, { status: 400 });
    }

    // 检查机器码是否已被其他用户绑定
    const boundUser = await db.isMachineCodeBound(machineCode);
    if (boundUser && boundUser !== authInfo.username) {
      return NextResponse.json({
        error: `该设备码已被用户 ${boundUser} 绑定，请联系管理员处理`,
        boundUser
      }, { status: 409 }); // 409 Conflict
    }

    // 检查用户是否已绑定其他机器码
    const existingDevices = await db.getUserMachineCodes(authInfo.username);
    if (existingDevices && existingDevices.length >= 5) {
      // 检查当前设备是否已在列表中，如果是，则允许（相当于更新设备信息）
      const isAlreadyBound = existingDevices.some(d => d.machineCode === machineCode);
      if (!isAlreadyBound) {
        return NextResponse.json({
          error: '您已绑定5台设备，已达到数量上限。请联系管理员解绑不用的设备。',
        }, { status: 409 }); // 409 Conflict
      }

    // 绑定新机器码或更新已有的
    await db.setUserMachineCode(authInfo.username, machineCode, deviceInfo);

    return NextResponse.json({
      success: true,
      message: '设备码绑定成功',
      machineCode
    });
  } catch (error) {
    console.error('机器码操作失败:', error);
    return NextResponse.json({ error: '机器码操作失败' }, { status: 500 });
  }
}

// 用户自己解绑机器码
export async function DELETE(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 检查是否有绑定的机器码
    const existingDevices = await db.getUserMachineCodes(authInfo.username);
    if (!existingDevices || existingDevices.length === 0) {
      return NextResponse.json({ error: '您还未绑定任何设备码' }, { status: 400 });
    }

    // 解绑机器码
    await db.deleteUserMachineCode(authInfo.username);

    return NextResponse.json({
      success: true,
      message: '设备码解绑成功'
    });
  } catch (error) {
    console.error('解绑机器码失败:', error);
    return NextResponse.json({ error: '解绑机器码失败' }, { status: 500 });
  }
}
