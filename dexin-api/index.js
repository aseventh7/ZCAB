/**
 * dexin-api - 得心物业管理系统后端 API
 * 腾讯云 CloudBase 云函数（Event 类型，通过 HTTP 访问路径 /api 对外提供接口）
 *
 * 提供物业管理系统完整后端 API：
 * - 认证管理（登录、个人信息、改密）
 * - 业主管理
 * - 房间管理
 * - 楼宇管理
 * - 车位管理
 * - 物业费账单
 * - 财务收支
 * - 用户管理
 * - 打印（收据、催缴通知单）
 *
 * 数据库集合：users, owners, rooms, bills, parking_spots, buildings
 *
 * 技术要点：
 * - CloudBase NoSQL：add() / update() 直接接收数据对象，不使用 data 包装层
 * - JWT 认证（jsonwebtoken），bcryptjs 密码加密
 * - 5 种角色：super_admin, admin(物业经理), steward(物业管家), finance(财务), executive(集团高管只读)
 */

const tcb = require('@cloudbase/node-sdk');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// ======================== 配置 ========================

// CloudBase 环境 ID（硬编码）
const ENV_ID = 'zcab-d2g3mo1qqaf40aab1';
// JWT 密钥
const JWT_SECRET = 'dxy-property-jwt-secret-2026';

// CORS 响应头
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

// 初始化 CloudBase
const app = tcb.init({ env: ENV_ID });
const db = app.database();
const _ = db.command;

// 数据库初始化标志（避免重复创建 admin 用户）
let dbInitialized = false;

// ======================== 工具函数 ========================

/**
 * 获取请求路径（去除函数名前缀和 query）
 */
function getPath(event) {
  let path = event.path || event.url || '';
  path = path.replace(/\?.*$/, '');        // 去除query
  path = path.replace(/^\/dexin-api/, ''); // 去除函数名前缀
  if (!path.startsWith('/api') && path !== '') {
    path = '/api' + path;
  }
  return path;
}

/** 成功响应（普通） */
function success(data) {
  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({ code: 0, message: 'success', data })
  };
}

/** 成功响应（分页） */
function successPage(list, total, page, pageSize) {
  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({ code: 0, message: 'success', data: list, total, page, pageSize })
  };
}

/** 错误响应 */
function error(message) {
  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({ code: -1, message })
  };
}

/** 401 未授权 */
function unauthorized() {
  return {
    statusCode: 401,
    headers: CORS_HEADERS,
    body: JSON.stringify({ code: 401, message: '未授权' })
  };
}

/** 403 无权限 */
function forbidden() {
  return {
    statusCode: 403,
    headers: CORS_HEADERS,
    body: JSON.stringify({ code: 403, message: '无权限' })
  };
}

/** 获取请求头（不区分大小写） */
function getHeader(event, name) {
  const headers = event.headers || {};
  const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

/** 获取请求体 */
function getBody(event) {
  if (!event.body) return {};
  if (typeof event.body === 'string') {
    try { return JSON.parse(event.body); } catch (e) { return {}; }
  }
  return event.body;
}

/** 获取查询参数 */
function getQuery(event) {
  return event.query || event.queryStringParameters || {};
}

/** 验证 token，返回用户信息（失败返回 null） */
function verifyToken(event) {
  const auth = getHeader(event, 'authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

/** 判断是否为只读角色 */
function isReadOnly(role) {
  return role === 'executive';
}

/**
 * 初始化数据库（创建默认 admin 用户）
 * admin/123456, role=super_admin
 */
async function initDB() {
  if (dbInitialized) return;
  try {
    const res = await db.collection('users').where({ username: 'admin' }).get();
    if (!res.data || res.data.length === 0) {
      const hashedPassword = bcrypt.hashSync('123456', 10);
      await db.collection('users').add({
        username: 'admin',
        password: hashedPassword,
        realName: '超级管理员',
        role: 'super_admin',
        phone: '',
        enabled: true,
        createdAt: new Date()
      });
      console.log('默认 admin 用户已创建');
    }
    dbInitialized = true;
  } catch (e) {
    console.error('初始化数据库失败:', e);
    dbInitialized = true; // 即使失败也置位，避免阻塞后续请求
  }
}

/** 组合查询条件（AND） */
function buildWhere(conditions) {
  const valid = conditions.filter(c => c !== null && c !== undefined && Object.keys(c).length > 0);
  if (valid.length === 0) return {};
  if (valid.length === 1) return valid[0];
  return _.and(valid);
}

// ======================== 认证路由 ========================

/** POST /api/auth/login - 登录 */
async function authLogin(event) {
  const body = getBody(event);
  const { username, password } = body;
  if (!username || !password) return error('用户名和密码不能为空');
  try {
    await initDB();
    const res = await db.collection('users').where({ username }).get();
    if (!res.data || res.data.length === 0) return error('用户名或密码错误');
    const u = res.data[0];
    if (u.enabled === false) return error('账号已被禁用');
    if (!bcrypt.compareSync(password, u.password)) return error('用户名或密码错误');
    const token = jwt.sign(
      { id: u._id, username: u.username, role: u.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    return success({
      token,
      user: {
        id: u._id,
        username: u.username,
        realName: u.realName,
        role: u.role,
        phone: u.phone,
        enabled: u.enabled
      }
    });
  } catch (e) {
    console.error('登录失败:', e);
    return error('登录失败: ' + e.message);
  }
}

/** GET /api/auth/profile - 获取当前用户信息 */
async function authProfile(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  try {
    const res = await db.collection('users').doc(user.id).get();
    if (!res.data) return error('用户不存在');
    const u = res.data;
    return success({
      id: u._id,
      username: u.username,
      realName: u.realName,
      role: u.role,
      phone: u.phone,
      enabled: u.enabled
    });
  } catch (e) {
    console.error('获取用户信息失败:', e);
    return error('获取用户信息失败: ' + e.message);
  }
}

/** POST /api/auth/change-password - 修改密码 */
async function authChangePassword(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  const body = getBody(event);
  const { oldPassword, newPassword } = body;
  if (!oldPassword || !newPassword) return error('原密码和新密码不能为空');
  try {
    const res = await db.collection('users').doc(user.id).get();
    if (!res.data) return error('用户不存在');
    const u = res.data;
    if (!bcrypt.compareSync(oldPassword, u.password)) return error('原密码错误');
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    await db.collection('users').doc(user.id).update({
      password: hashedPassword,
      updatedAt: new Date()
    });
    return success({ message: '密码修改成功' });
  } catch (e) {
    console.error('修改密码失败:', e);
    return error('修改密码失败: ' + e.message);
  }
}

// ======================== 业主管理 ========================

/** GET /api/owners - 业主列表 */
async function ownersList(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  const query = getQuery(event);
  const page = parseInt(query.page) || 1;
  const pageSize = parseInt(query.pageSize) || 20;
  const { keyword, buildingNo, status, isShop } = query;
  try {
    const conditions = [];
    if (buildingNo && String(buildingNo) !== '门市') {
      const bn = String(buildingNo);
      conditions.push(_.or([
        { buildingNo: bn },
        { buildingNo: Number(bn) }
      ]));
      if (isShop === undefined || isShop === '' || isShop === null) {
        conditions.push({ isShop: false });
      }
    }
    if (status) conditions.push({ status });
    if (isShop !== undefined && isShop !== '' && isShop !== null) {
      conditions.push({ isShop: isShop === 'true' || isShop === true });
    }
    if (keyword) {
      const reg = db.RegExp({ regexp: keyword, options: 'i' });
      conditions.push(_.or([{ name: reg }, { phone: reg }, { fullRoomNo: reg }, { userId: reg }, { code: reg }, { doorNo: reg }]));
    }
    const where = buildWhere(conditions);
    const countRes = await db.collection('owners').where(where).count();
    const total = countRes.total;
    const res = await db.collection('owners')
      .where(where)
      .orderBy('code', 'asc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();
    let owners = res.data || [];
    owners = owners.map(o => {
      if (!o.displayRoomNo) {
        const bn = String(o.buildingNo || '');
        const unitNo = String(o.unitNo || '1');
        const floor = String(o.floor || '');
        const roomNo = String(o.roomNo || '');
        if (o.isShop) {
          o.displayRoomNo = `门市${bn}-${roomNo}`;
        } else {
          const floorNum = floor.replace(/^0/, '');
          o.displayRoomNo = `${unitNo}-${floorNum}-${roomNo}`;
        }
      }
      return o;
    });
    if (owners.length > 0) {
      const ownerIds = owners.map(o => o._id);
      const roomsRes = await db.collection('rooms').where({ ownerId: _.in(ownerIds) }).get();
      const roomMap = {};
      (roomsRes.data || []).forEach(r => { roomMap[r.ownerId] = r; });
      owners = owners.map(o => ({ ...o, room: roomMap[o._id] || null }));
    }
    return successPage(owners, total, page, pageSize);
  } catch (e) {
    console.error('获取业主列表失败:', e);
    return error('获取业主列表失败: ' + e.message);
  }
}

/** GET /api/owners/statistics - 业主统计 */
async function ownersStatistics(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  try {
    const countRes = await db.collection('owners').count();
    const total = countRes.total;
    
    let residential = 0, commercial = 0;
    const statusMap = {};
    
    const batchSize = 100;
    for (let offset = 0; offset < total; offset += batchSize) {
      const res = await db.collection('owners')
        .skip(offset)
        .limit(batchSize)
        .get();
      const list = res.data || [];
      list.forEach(o => {
        statusMap[o.status] = (statusMap[o.status] || 0) + 1;
        if (o.isShop) commercial++; else residential++;
      });
    }
    
    return success({
      total,
      residential,
      commercial,
      statusMap
    });
  } catch (e) {
    console.error('业主统计失败:', e);
    return error('业主统计失败: ' + e.message);
  }
}

/** GET /api/owners/:id - 业主详情 */
async function ownerDetail(event, id) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  try {
    const res = await db.collection('owners').doc(id).get();
    if (!res.data) return error('业主不存在');
    let owner = res.data;
    // 关联房间
    const roomsRes = await db.collection('rooms').where({ ownerId: id }).get();
    owner.room = (roomsRes.data && roomsRes.data[0]) || null;
    return success(owner);
  } catch (e) {
    console.error('获取业主详情失败:', e);
    return error('获取业主详情失败: ' + e.message);
  }
}

/** POST /api/owners - 创建业主 */
async function ownerCreate(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (isReadOnly(user.role)) return forbidden();
  const body = getBody(event);
  try {
    const now = new Date();
    const owner = {
      name: body.name || '',
      phone: body.phone || '',
      idCard: body.idCard || '',
      buildingNo: body.buildingNo || '',
      unitNo: body.unitNo || '',
      roomNo: body.roomNo || '',
      fullRoomNo: body.fullRoomNo || '',
      area: Number(body.area) || 0,
      checkInDate: body.checkInDate || now,
      status: body.status || 'self_occupied',
      emergencyContact: body.emergencyContact || '',
      emergencyPhone: body.emergencyPhone || '',
      remark: body.remark || '',
      createdAt: now,
      updatedAt: now
    };
    const res = await db.collection('owners').add(owner);
    // 同步更新关联房间状态为已入住
    if (owner.fullRoomNo) {
      const roomsRes = await db.collection('rooms').where({ fullRoomNo: owner.fullRoomNo }).get();
      if (roomsRes.data && roomsRes.data.length > 0) {
        const room = roomsRes.data[0];
        await db.collection('rooms').doc(room._id).update({
          ownerId: res.id,
          status: owner.status,
          updatedAt: now
        });
      }
    }
    return success({ id: res.id, ...owner });
  } catch (e) {
    console.error('创建业主失败:', e);
    return error('创建业主失败: ' + e.message);
  }
}

/** PUT /api/owners/:id - 更新业主 */
async function ownerUpdate(event, id) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (isReadOnly(user.role)) return forbidden();
  const body = getBody(event);
  try {
    const update = {
      name: body.name,
      phone: body.phone,
      idCard: body.idCard,
      buildingNo: body.buildingNo,
      unitNo: body.unitNo,
      roomNo: body.roomNo,
      fullRoomNo: body.fullRoomNo,
      area: body.area !== undefined ? Number(body.area) : undefined,
      checkInDate: body.checkInDate,
      status: body.status,
      emergencyContact: body.emergencyContact,
      emergencyPhone: body.emergencyPhone,
      remark: body.remark,
      updatedAt: new Date()
    };
    // 去除 undefined 字段
    Object.keys(update).forEach(k => update[k] === undefined && delete update[k]);
    await db.collection('owners').doc(id).update(update);
    // 同步房间状态
    if (body.status && body.fullRoomNo) {
      const roomsRes = await db.collection('rooms').where({ fullRoomNo: body.fullRoomNo }).get();
      if (roomsRes.data && roomsRes.data.length > 0) {
        await db.collection('rooms').doc(roomsRes.data[0]._id).update({
          ownerId: id,
          status: body.status,
          updatedAt: new Date()
        });
      }
    }
    return success({ message: '更新成功' });
  } catch (e) {
    console.error('更新业主失败:', e);
    return error('更新业主失败: ' + e.message);
  }
}

/** DELETE /api/owners/:id - 删除业主 */
async function ownerDelete(event, id) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (isReadOnly(user.role)) return forbidden();
  try {
    await db.collection('owners').doc(id).remove();
    // 将关联房间状态改为 vacant
    const roomsRes = await db.collection('rooms').where({ ownerId: id }).get();
    if (roomsRes.data && roomsRes.data.length > 0) {
      for (const room of roomsRes.data) {
        await db.collection('rooms').doc(room._id).update({
          ownerId: '',
          status: 'vacant',
          updatedAt: new Date()
        });
      }
    }
    return success({ message: '删除成功' });
  } catch (e) {
    console.error('删除业主失败:', e);
    return error('删除业主失败: ' + e.message);
  }
}

// ======================== 房间管理 ========================

/** GET /api/rooms - 房间列表 */
async function roomsList(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  const query = getQuery(event);
  const page = parseInt(query.page) || 1;
  const pageSize = parseInt(query.pageSize) || 20;
  const { buildingNo, unitNo, status, keyword, isShop } = query;
  try {
    const conditions = [];
    if (buildingNo) {
      const bn = String(buildingNo);
      conditions.push(_.or([
        { buildingNo: bn },
        { buildingNo: Number(bn) }
      ]));
      if (isShop === undefined || isShop === '' || isShop === null) {
        conditions.push({ isShop: false });
      }
    }
    if (unitNo) conditions.push({ unitNo });
    if (status) conditions.push({ status });
    if (isShop !== undefined && isShop !== '' && isShop !== null) {
      conditions.push({ isShop: isShop === 'true' || isShop === true });
    }
    if (keyword) {
      const reg = db.RegExp({ regexp: keyword, options: 'i' });
      conditions.push(_.or([{ fullRoomNo: reg }, { roomNo: reg }, { displayRoomNo: reg }, { code: reg }]));
    }
    const where = buildWhere(conditions);
    const countRes = await db.collection('rooms').where(where).count();
    const total = countRes.total;
    const res = await db.collection('rooms')
      .where(where)
      .orderBy('code', 'asc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();
    let rooms = res.data || [];
    rooms = rooms.map(r => {
      if (!r.displayRoomNo) {
        const unitNo = String(r.unitNo || '1');
        const floor = String(r.floor || '');
        const roomNo = String(r.roomNo || '');
        const bn = String(r.buildingNo || '');
        if (r.isShop) {
          r.displayRoomNo = `门市${bn}-${roomNo}`;
        } else {
          const floorNum = floor.replace(/^0/, '');
          r.displayRoomNo = `${unitNo}-${floorNum}-${roomNo}`;
        }
      }
      return r;
    });
    if (rooms.length > 0) {
      // 获取所有业主用于匹配
      const ownerCountRes = await db.collection('owners').count();
      const ownerTotal = ownerCountRes.total;
      let allOwners = [];
      const batchSize2 = 100;
      for (let offset = 0; offset < ownerTotal; offset += batchSize2) {
        const res = await db.collection('owners')
          .skip(offset)
          .limit(batchSize2)
          .get();
        allOwners = allOwners.concat(res.data || []);
      }
      const ownerByIdMap = {};
      const ownerByCodeMap = {};
      const ownerByUserIdMap = {};
      allOwners.forEach(o => {
        ownerByIdMap[o._id] = o;
        if (o.code) ownerByCodeMap[String(o.code)] = o;
        if (o.userId) ownerByUserIdMap[String(o.userId)] = o;
      });
      rooms = rooms.map(r => {
        let owner = null;
        if (r.ownerId && ownerByIdMap[r.ownerId]) {
          owner = ownerByIdMap[r.ownerId];
        }
        if (!owner && r.code) {
          owner = ownerByCodeMap[String(r.code)];
        }
        if (!owner && r.userId) {
          owner = ownerByUserIdMap[String(r.userId)];
        }
        return {
          ...r,
          ownerId: owner ? owner._id : (r.ownerId || ''),
          ownerName: owner ? owner.name : '',
          ownerPhone: owner ? (owner.phone || '') : ''
        };
      });
    }
    return successPage(rooms, total, page, pageSize);
  } catch (e) {
    console.error('获取房间列表失败:', e);
    return error('获取房间列表失败: ' + e.message);
  }
}

/** GET /api/rooms/overview - 楼宇预览数据 */
async function roomsOverview(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  try {
    const countRes = await db.collection('rooms').count();
    const total = countRes.total;
    let allRooms = [];
    const batchSize = 100;
    for (let offset = 0; offset < total; offset += batchSize) {
      const res = await db.collection('rooms')
        .skip(offset)
        .limit(batchSize)
        .orderBy('buildingNo', 'asc')
        .get();
      allRooms = allRooms.concat(res.data || []);
    }
    // 关联业主信息：先按ownerId匹配，再按code/userId匹配
    if (allRooms.length > 0) {
      // 获取所有业主数据
      const ownerCountRes = await db.collection('owners').count();
      const ownerTotal = ownerCountRes.total;
      let allOwners = [];
      for (let offset = 0; offset < ownerTotal; offset += batchSize) {
        const res = await db.collection('owners')
          .skip(offset)
          .limit(batchSize)
          .get();
        allOwners = allOwners.concat(res.data || []);
      }
      // 建立多种索引
      const ownerByIdMap = {};
      const ownerByCodeMap = {};
      const ownerByUserIdMap = {};
      allOwners.forEach(o => {
        ownerByIdMap[o._id] = o;
        if (o.code) ownerByCodeMap[String(o.code)] = o;
        if (o.userId) ownerByUserIdMap[String(o.userId)] = o;
      });
      // 匹配房间和业主
      allRooms = allRooms.map(r => {
        let owner = null;
        // 1. 先按ownerId匹配
        if (r.ownerId && ownerByIdMap[r.ownerId]) {
          owner = ownerByIdMap[r.ownerId];
        }
        // 2. 按code匹配
        if (!owner && r.code) {
          owner = ownerByCodeMap[String(r.code)];
        }
        // 3. 按userId匹配
        if (!owner && r.userId) {
          owner = ownerByUserIdMap[String(r.userId)];
        }
        return {
          ...r,
          ownerId: owner ? owner._id : (r.ownerId || ''),
          ownerName: owner ? owner.name : '',
          ownerPhone: owner ? (owner.phone || '') : ''
        };
      });
    }
    const overview = allRooms.map(r => {
      let displayRoomNo = r.displayRoomNo || '';
      if (!displayRoomNo) {
        const bn = String(r.buildingNo || '');
        const unitNo = String(r.unitNo || '1');
        const floor = String(r.floor || '');
        const roomNo = String(r.roomNo || '');
        if (r.isShop) {
          displayRoomNo = `门市${bn}-${roomNo}`;
        } else {
          const floorNum = floor.replace(/^0/, '');
          displayRoomNo = `${unitNo}-${floorNum}-${roomNo}`;
        }
      }
      return {
        id: r._id,
        buildingNo: r.buildingNo,
        unitNo: r.unitNo,
        floorNo: Number(r.floor) || 0,
        roomNo: r.roomNo,
        fullRoomNo: r.fullRoomNo,
        displayRoomNo,
        status: r.status,
        ownerId: r.ownerId || '',
        ownerName: r.ownerName || '',
        ownerPhone: r.ownerPhone || '',
        area: r.area,
        isShop: r.isShop || false,
        code: r.code || ''
      };
    });
    return success(overview);
  } catch (e) {
    console.error('获取楼宇预览失败:', e);
    return error('获取楼宇预览失败: ' + e.message);
  }
}

/** GET /api/rooms/statistics - 房间统计 */
async function roomsStatistics(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  try {
    const countRes = await db.collection('rooms').count();
    const total = countRes.total;
    
    let occupied = 0, vacant = 0;
    const statusMap = {};
    
    const batchSize = 100;
    for (let offset = 0; offset < total; offset += batchSize) {
      const res = await db.collection('rooms')
        .skip(offset)
        .limit(batchSize)
        .get();
      const list = res.data || [];
      list.forEach(r => {
        statusMap[r.status] = (statusMap[r.status] || 0) + 1;
        if (r.status === 'occupied' || r.status === 'self_occupied' || r.status === 'rented') occupied++;
        if (r.status === 'vacant' || r.status === 'unsold') vacant++;
      });
    }
    
    return success({
      total,
      occupied,
      vacant,
      statusMap
    });
  } catch (e) {
    console.error('房间统计失败:', e);
    return error('房间统计失败: ' + e.message);
  }
}

/** GET /api/rooms/:id - 房间详情 */
async function roomDetail(event, id) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  try {
    const res = await db.collection('rooms').doc(id).get();
    if (!res.data) return error('房间不存在');
    let room = res.data;
    if (room.ownerId) {
      const ownerRes = await db.collection('owners').doc(room.ownerId).get();
      room.owner = ownerRes.data || null;
    }
    return success(room);
  } catch (e) {
    console.error('获取房间详情失败:', e);
    return error('获取房间详情失败: ' + e.message);
  }
}

/** PUT /api/rooms/:id/status - 更新房间状态 */
async function roomUpdateStatus(event, id) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (isReadOnly(user.role)) return forbidden();
  const body = getBody(event);
  if (!body.status) return error('状态不能为空');
  try {
    await db.collection('rooms').doc(id).update({
      status: body.status,
      updatedAt: new Date()
    });
    return success({ message: '状态更新成功' });
  } catch (e) {
    console.error('更新房间状态失败:', e);
    return error('更新房间状态失败: ' + e.message);
  }
}

/** PUT /api/rooms/:id - 更新房间信息 */
async function roomUpdate(event, id) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (isReadOnly(user.role)) return forbidden();
  const body = getBody(event);
  try {
    const update = { updatedAt: new Date() };
    ['buildingNo', 'unitNo', 'floorNo', 'roomNo', 'fullRoomNo', 'status', 'ownerId', 'remark'].forEach(k => {
      if (body[k] !== undefined) update[k] = body[k];
    });
    if (body.area !== undefined) update.area = Number(body.area);
    await db.collection('rooms').doc(id).update(update);
    return success({ message: '更新成功' });
  } catch (e) {
    console.error('更新房间失败:', e);
    return error('更新房间失败: ' + e.message);
  }
}

// ======================== 楼宇 ========================

/** GET /api/buildings - 楼宇列表 */
async function buildingsList(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  try {
    // 先查询 buildings 集合
    const res = await db.collection('buildings').get();
    let buildings = res.data || [];
    // 若集合为空，则从 rooms 表派生楼宇信息
    if (buildings.length === 0) {
      const roomsRes = await db.collection('rooms').get();
      const rooms = roomsRes.data || [];
      const map = {};
      rooms.forEach(r => {
        const bn = r.buildingNo;
        if (!bn) return;
        if (!map[bn]) {
          map[bn] = {
            buildingNo: bn,
            unitCount: new Set(),
            roomCount: 0,
            totalArea: 0
          };
        }
        if (r.unitNo) map[bn].unitCount.add(r.unitNo);
        map[bn].roomCount += 1;
        map[bn].totalArea += Number(r.area) || 0;
      });
      buildings = Object.keys(map).sort().map(k => ({
        buildingNo: k,
        unitCount: map[k].unitCount.size,
        roomCount: map[k].roomCount,
        totalArea: map[k].totalArea
      }));
    }
    return success(buildings);
  } catch (e) {
    console.error('获取楼宇列表失败:', e);
    return error('获取楼宇列表失败: ' + e.message);
  }
}

// ======================== 车位管理 ========================

/** GET /api/parking - 车位列表 */
async function parkingList(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  const query = getQuery(event);
  const page = parseInt(query.page) || 1;
  const pageSize = parseInt(query.pageSize) || 20;
  const { keyword, type, status } = query;
  try {
    const conditions = [];
    if (type) conditions.push({ type });
    if (status) conditions.push({ status });
    if (keyword) {
      const reg = db.RegExp({ regexp: keyword, options: 'i' });
      conditions.push({ code: reg });
    }
    const where = buildWhere(conditions);
    const countRes = await db.collection('parking_spots').where(where).count();
    const total = countRes.total;
    const res = await db.collection('parking_spots')
      .where(where)
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();
    let spots = res.data || [];
    // 关联业主信息
    if (spots.length > 0) {
      const ownerIds = spots.map(s => s.ownerId).filter(Boolean);
      if (ownerIds.length > 0) {
        const ownersRes = await db.collection('owners').where({ _id: _.in(ownerIds) }).get();
        const ownerMap = {};
        (ownersRes.data || []).forEach(o => { ownerMap[o._id] = o; });
        spots = spots.map(s => ({
          ...s,
          owner: s.ownerId ? (ownerMap[s.ownerId] || null) : null
        }));
      }
    }
    return successPage(spots, total, page, pageSize);
  } catch (e) {
    console.error('获取车位列表失败:', e);
    return error('获取车位列表失败: ' + e.message);
  }
}

/** GET /api/parking/statistics - 车位统计 */
async function parkingStatistics(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  try {
    const res = await db.collection('parking_spots').get();
    const list = res.data || [];
    const statusMap = {};
    let used = 0, free = 0;
    list.forEach(s => {
      statusMap[s.status] = (statusMap[s.status] || 0) + 1;
      if (s.status === 'free') free++;
      else used++;
    });
    return success({
      total: list.length,
      used,
      free,
      statusMap
    });
  } catch (e) {
    console.error('车位统计失败:', e);
    return error('车位统计失败: ' + e.message);
  }
}

/** GET /api/parking/:id - 车位详情 */
async function parkingDetail(event, id) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  try {
    const res = await db.collection('parking_spots').doc(id).get();
    if (!res.data) return error('车位不存在');
    let spot = res.data;
    if (spot.ownerId) {
      const ownerRes = await db.collection('owners').doc(spot.ownerId).get();
      spot.owner = ownerRes.data || null;
    }
    return success(spot);
  } catch (e) {
    console.error('获取车位详情失败:', e);
    return error('获取车位详情失败: ' + e.message);
  }
}

/** POST /api/parking - 创建车位 */
async function parkingCreate(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (isReadOnly(user.role)) return forbidden();
  const body = getBody(event);
  if (!body.code) return error('车位编号不能为空');
  try {
    const now = new Date();
    const spot = {
      code: body.code,
      type: body.type || 'ground',
      status: body.status || 'free',
      price: Number(body.price) || 0,
      ownerId: '',
      startDate: '',
      endDate: '',
      remark: body.remark || '',
      createdAt: now,
      updatedAt: now
    };
    const res = await db.collection('parking_spots').add(spot);
    return success({ id: res.id, ...spot });
  } catch (e) {
    console.error('创建车位失败:', e);
    return error('创建车位失败: ' + e.message);
  }
}

function getIsShop(userId, buildingNo) {
  const uid = String(userId || '');
  const bn = String(buildingNo || '');
  return uid.startsWith('8') || uid.includes('门') || bn === '门市' || bn === '8';
}

function parseShopUserId(userId) {
  const uid = String(userId || '');
  if (uid.startsWith('8') && uid.length >= 5) {
    const buildingNo = uid.charAt(1) || '1';
    const roomNo = uid.charAt(4) || '1';
    return { buildingNo, roomNo };
  }
  if (uid.includes('门')) {
    const menIdx = uid.indexOf('门');
    const buildingNo = uid.charAt(0) || '1';
    const roomNo = uid.charAt(menIdx - 1) || '1';
    return { buildingNo, roomNo };
  }
  return { buildingNo: '1', roomNo: '1' };
}

function genShopUserId(buildingNo, roomNo) {
  return '8' + String(buildingNo) + '00' + String(roomNo);
}

function parseShopDoorNo(doorNo) {
  const dn = String(doorNo || '');
  const match = dn.match(/^(\d+)-(\d+)门$/);
  if (match) {
    return { buildingNo: match[1], roomNo: match[2] };
  }
  return null;
}

function getBuildingNoForDisplay(userId, buildingNo) {
  const uid = String(userId || '');
  const bn = String(buildingNo || '');
  if (getIsShop(userId, buildingNo)) {
    if (bn && bn !== '门市' && bn !== '8') return bn;
    return parseShopUserId(uid).buildingNo;
  }
  return bn;
}

/** POST /api/owners/batch - 批量导入业主（仅 super_admin） */
async function ownersBatch(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (user.role !== 'super_admin') return forbidden();
  const body = getBody(event);
  const data = body.data || [];
  if (data.length === 0) return error('导入数据不能为空');
  try {
    const now = new Date();
    let successCount = 0;
    let failCount = 0;
    const failures = [];
    const seenCodes = new Set();
    const seenUserIds = new Set();

    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      try {
        const userId = String(item.userId || '');
        const code = String(item.code || '');
        const isShop = getIsShop(userId, item.buildingNo);
        let buildingNo = getBuildingNoForDisplay(userId, String(item.buildingNo || ''));
        let unitNo = item.unitNo || '';
        let floor = item.floor || '';
        let roomNo = item.roomNo || '';
        let displayRoomNo = item.displayRoomNo || '';
        let fullRoomNo = item.fullRoomNo || '';

        if (isShop) {
          const parsed = parseShopUserId(userId);
          if (!buildingNo || buildingNo === '门市' || buildingNo === '8') {
            buildingNo = parsed.buildingNo;
          }
          if (!roomNo) roomNo = parsed.roomNo;
          unitNo = buildingNo;
          floor = '00';
          if (!userId.startsWith('8')) {
            userId = genShopUserId(parsed.buildingNo, parsed.roomNo);
          }
          if (!displayRoomNo) {
            displayRoomNo = `门市${buildingNo}-${roomNo}`;
          }
          if (!fullRoomNo) {
            fullRoomNo = `${buildingNo}栋门市${roomNo}号`;
          }
        }

        const owner = {
          code: code,
          userId: userId,
          name: item.name || '',
          phone: item.phone || '',
          idCard: item.idCard || '',
          buildingNo: buildingNo,
          unitNo: unitNo,
          floor: floor,
          roomNo: roomNo,
          doorNo: item.doorNo || '',
          fullRoomNo: fullRoomNo,
          displayRoomNo: displayRoomNo,
          area: Number(item.area) || 0,
          checkInDate: item.checkInDate || now,
          status: item.status || 'self_occupied',
          emergencyContact: item.emergencyContact || '',
          emergencyPhone: item.emergencyPhone || '',
          isShop: isShop,
          remark: item.remark || '',
          createdAt: now,
          updatedAt: now
        };

        let ownerId;
        let existingOwner = null;

        if (code && seenCodes.has(code)) {
          failCount++;
          failures.push({ row: i + 2, reason: `编号 ${code} 重复，已跳过` });
          continue;
        }
        if (userId && seenUserIds.has(userId)) {
          failCount++;
          failures.push({ row: i + 2, reason: `用户ID ${userId} 重复，已跳过` });
          continue;
        }

        if (code) {
          const codeRes = await db.collection('owners').where({ code: code }).get();
          if (codeRes.data && codeRes.data.length > 0) {
            existingOwner = codeRes.data[0];
          }
        }
        if (!existingOwner && userId) {
          const userIdRes = await db.collection('owners').where({ userId: userId }).get();
          if (userIdRes.data && userIdRes.data.length > 0) {
            existingOwner = userIdRes.data[0];
          }
        }

        if (existingOwner) {
          ownerId = existingOwner._id;
          const updateData = { ...owner };
          delete updateData.createdAt;
          await db.collection('owners').doc(ownerId).update(updateData);
        } else {
          const res = await db.collection('owners').add(owner);
          ownerId = res.id;
        }

        if (code) seenCodes.add(code);
        if (userId) seenUserIds.add(userId);

        if (owner.fullRoomNo) {
          let existingRoom = null;
          const roomByFullNo = await db.collection('rooms').where({ fullRoomNo: owner.fullRoomNo }).get();
          if (roomByFullNo.data && roomByFullNo.data.length > 0) {
            existingRoom = roomByFullNo.data[0];
          }
          if (!existingRoom && code) {
            const roomByCode = await db.collection('rooms').where({ code: code }).get();
            if (roomByCode.data && roomByCode.data.length > 0) {
              existingRoom = roomByCode.data[0];
            }
          }

          if (existingRoom) {
            await db.collection('rooms').doc(existingRoom._id).update({
              ownerId: ownerId,
              buildingNo: buildingNo,
              unitNo: owner.unitNo,
              floor: Number(owner.floor) || 0,
              roomNo: owner.roomNo,
              displayRoomNo: owner.displayRoomNo || '',
              area: Number(owner.area) || 0,
              status: owner.status,
              code: owner.code || '',
              userId: owner.userId || '',
              isShop: isShop,
              updatedAt: now
            });
          } else {
            await db.collection('rooms').add({
              buildingNo: buildingNo,
              unitNo: owner.unitNo,
              floor: Number(owner.floor) || 0,
              roomNo: owner.roomNo,
              fullRoomNo: owner.fullRoomNo,
              displayRoomNo: owner.displayRoomNo || '',
              area: Number(owner.area) || 0,
              status: owner.status,
              ownerId: ownerId,
              code: owner.code || '',
              userId: owner.userId || '',
              isShop: isShop,
              createdAt: now,
              updatedAt: now
            });
          }
        }
        successCount++;
      } catch (e) {
        failCount++;
        failures.push({ row: i + 2, reason: e.message });
      }
    }
    return success({ success: successCount, fail: failCount, failures });
  } catch (e) {
    console.error('批量导入业主失败:', e);
    return error('批量导入业主失败: ' + e.message);
  }
}

/** DELETE /api/owners/clear - 清空所有业主和房间数据（仅 super_admin） */
async function ownersClear(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (user.role !== 'super_admin') return forbidden();
  try {
    console.log('清空业主和房间数据...');
    const ownerCountRes = await db.collection('owners').count();
    const roomCountRes = await db.collection('rooms').count();
    console.log(`原有业主: ${ownerCountRes.total} 条, 房间: ${roomCountRes.total} 条`);
    
    const batchSize = 100;
    let deletedOwners = 0;
    for (let offset = 0; offset < ownerCountRes.total; offset += batchSize) {
      const res = await db.collection('owners').skip(offset).limit(batchSize).get();
      for (const doc of res.data || []) {
        try { await db.collection('owners').doc(doc._id).remove(); deletedOwners++; } catch (e) {}
      }
    }
    let deletedRooms = 0;
    for (let offset = 0; offset < roomCountRes.total; offset += batchSize) {
      const res = await db.collection('rooms').skip(offset).limit(batchSize).get();
      for (const doc of res.data || []) {
        try { await db.collection('rooms').doc(doc._id).remove(); deletedRooms++; } catch (e) {}
      }
    }
    console.log(`清空完成: 业主 ${deletedOwners} 条, 房间 ${deletedRooms} 条`);
    return success({ deletedOwners, deletedRooms });
  } catch (e) {
    console.error('清空数据失败:', e);
    return error('清空数据失败: ' + e.message);
  }
}

/** POST /api/owners/fix-data - 修复业主和房间数据（去重、修正门市字段） */
async function ownersFixData(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (user.role !== 'super_admin') return forbidden();
  try {
    console.log('开始修复业主和房间数据...');
    
    const ownerCountRes = await db.collection('owners').count();
    const roomCountRes = await db.collection('rooms').count();
    const totalOwners = ownerCountRes.total;
    const totalRooms = roomCountRes.total;
    console.log(`修复前: 业主 ${totalOwners} 条, 房间 ${totalRooms} 条`);
    
    const before = { owners: totalOwners, rooms: totalRooms };
    const batchSize = 100;
    const allOwners = [];
    for (let offset = 0; offset < totalOwners; offset += batchSize) {
      const res = await db.collection('owners').skip(offset).limit(batchSize).get();
      allOwners.push(...(res.data || []));
    }
    
    const fixedOwners = [];
    let fixedShop = 0;
    let fixedBuildingNo = 0;
    let fixedDisplayRoomNo = 0;
    let fixedUnit = 0;
    let fixedUserId = 0;
    
    for (const owner of allOwners) {
      const uid = String(owner.userId || '');
      const doorNo = owner.doorNo || '';
      const isShop = getIsShop(uid, owner.buildingNo) || (doorNo && doorNo.includes('门'));
      let buildingNo = String(owner.buildingNo || '');
      let unitNo = String(owner.unitNo || '');
      let floor = String(owner.floor || '');
      let roomNo = String(owner.roomNo || '');
      let displayRoomNo = owner.displayRoomNo || '';
      let fullRoomNo = owner.fullRoomNo || '';
      let newUserId = uid;
      let needUpdate = false;
      
      if (isShop) {
        let parsedBuilding, parsedRoomNo;
        
        const doorParsed = parseShopDoorNo(doorNo);
        if (doorParsed) {
          parsedBuilding = doorParsed.buildingNo;
          parsedRoomNo = doorParsed.roomNo;
        } else {
          const parsed = parseShopUserId(uid);
          parsedBuilding = parsed.buildingNo;
          parsedRoomNo = parsed.roomNo;
        }
        
        if (owner.isShop !== true) { needUpdate = true; }
        if (buildingNo !== parsedBuilding) { buildingNo = parsedBuilding; needUpdate = true; fixedBuildingNo++; }
        if (unitNo !== parsedBuilding) { unitNo = parsedBuilding; needUpdate = true; fixedUnit++; }
        if (floor !== '00') { floor = '00'; needUpdate = true; }
        if (roomNo !== parsedRoomNo) { roomNo = parsedRoomNo; needUpdate = true; }
        
        const expectedUserId = genShopUserId(parsedBuilding, parsedRoomNo);
        if (uid !== expectedUserId) {
          newUserId = expectedUserId;
          needUpdate = true;
          fixedUserId++;
        }
        
        const expectedDisplay = `门市${buildingNo}-${roomNo}`;
        if (displayRoomNo !== expectedDisplay) {
          displayRoomNo = expectedDisplay;
          needUpdate = true;
          fixedDisplayRoomNo++;
        }
        const expectedFull = `${buildingNo}栋门市${roomNo}号`;
        if (fullRoomNo !== expectedFull) {
          fullRoomNo = expectedFull;
          needUpdate = true;
        }
        fixedShop++;
      } else {
        if (owner.isShop === true) { needUpdate = true; }
        const unitNum = parseInt(unitNo) || 0;
        if (unitNum > 3) {
          const floorFromUnit = unitNo.padStart(2, '0');
          if (floor === '01' || floor === '') {
            floor = floorFromUnit;
            unitNo = '1';
            needUpdate = true;
            fixedUnit++;
          }
        }
        if (!displayRoomNo && unitNo && floor && roomNo) {
          const floorNum = floor.replace(/^0/, '');
          displayRoomNo = `${unitNo}-${floorNum}-${roomNo}`;
          needUpdate = true;
          fixedDisplayRoomNo++;
        }
        if (!fullRoomNo && buildingNo && unitNo && floor && roomNo) {
          fullRoomNo = `${buildingNo}栋${unitNo}单元${floor}${roomNo}`;
          needUpdate = true;
        }
      }
      
      fixedOwners.push({
        ...owner,
        isShop,
        userId: newUserId,
        buildingNo,
        unitNo,
        floor,
        roomNo,
        displayRoomNo,
        fullRoomNo,
        _needUpdate: needUpdate
      });
    }
    
    const codeMap = {};
    fixedOwners.forEach(o => {
      const code = String(o.code || '');
      if (code && !codeMap[code]) codeMap[code] = [];
      if (code) codeMap[code].push(o);
    });
    const duplicateCodeOwners = [];
    Object.keys(codeMap).forEach(code => {
      if (codeMap[code].length > 1) {
        const sorted = codeMap[code].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        duplicateCodeOwners.push(...sorted.slice(1));
      }
    });
    console.log(`发现重复code的业主 ${duplicateCodeOwners.length} 条`);
    
    const userIdMap = {};
    fixedOwners.forEach(o => {
      const uid = String(o.userId || '');
      if (uid && !duplicateCodeOwners.find(d => d._id === o._id)) {
        if (!userIdMap[uid]) userIdMap[uid] = [];
        userIdMap[uid].push(o);
      }
    });
    const duplicateUserIdOwners = [];
    Object.keys(userIdMap).forEach(uid => {
      if (userIdMap[uid].length > 1) {
        const sorted = userIdMap[uid].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        duplicateUserIdOwners.push(...sorted.slice(1));
      }
    });
    console.log(`发现重复userId的业主 ${duplicateUserIdOwners.length} 条`);
    
    const allOwnerIdsToRemove = new Set([
      ...duplicateCodeOwners.map(o => o._id),
      ...duplicateUserIdOwners.map(o => o._id)
    ]);
    
    let updatedOwners = 0;
    const validOwners = fixedOwners.filter(o => !allOwnerIdsToRemove.has(o._id));
    const ownerByCode = {};
    
    for (const owner of validOwners) {
      const code = String(owner.code || '');
      ownerByCode[code] = owner;
      
      if (owner._needUpdate) {
        const updateData = {
          isShop: owner.isShop,
          userId: owner.userId,
          buildingNo: owner.buildingNo,
          unitNo: owner.unitNo,
          floor: owner.floor,
          roomNo: owner.roomNo,
          displayRoomNo: owner.displayRoomNo,
          fullRoomNo: owner.fullRoomNo,
          updatedAt: new Date()
        };
        await db.collection('owners').doc(owner._id).update(updateData);
        updatedOwners++;
      }
    }
    
    console.log(`删除重复业主 ${allOwnerIdsToRemove.size} 条`);
    for (const id of allOwnerIdsToRemove) {
      try { await db.collection('owners').doc(id).remove(); } catch (e) {}
    }
    
    const allRooms = [];
    for (let offset = 0; offset < totalRooms; offset += batchSize) {
      const res = await db.collection('rooms').skip(offset).limit(batchSize).get();
      allRooms.push(...(res.data || []));
    }
    
    const fixedRooms = [];
    let fixedRoomShop = 0;
    let fixedRoomBuilding = 0;
    let fixedRoomDisplay = 0;
    let fixedRoomUnit = 0;
    let fixedRoomUserId = 0;
    
    for (const room of allRooms) {
      const uid = String(room.userId || '');
      const roomCode = String(room.code || '');
      const ownerMatch = roomCode ? ownerByCode[roomCode] : null;
      let isShop = getIsShop(uid, room.buildingNo);
      if (ownerMatch && ownerMatch.isShop) isShop = true;
      
      let buildingNo = String(room.buildingNo || '');
      let unitNo = String(room.unitNo || '');
      let floorNum = Number(room.floor) || 0;
      let roomNo = String(room.roomNo || '');
      let displayRoomNo = room.displayRoomNo || '';
      let fullRoomNo = room.fullRoomNo || '';
      let newUserId = uid;
      let needUpdate = false;
      
      if (isShop) {
        let parsedBuilding, parsedRoomNo;
        
        if (ownerMatch && ownerMatch.isShop) {
          parsedBuilding = ownerMatch.buildingNo;
          parsedRoomNo = ownerMatch.roomNo;
        } else {
          const parsed = parseShopUserId(uid);
          parsedBuilding = parsed.buildingNo;
          parsedRoomNo = parsed.roomNo;
        }
        
        if (room.isShop !== true) { needUpdate = true; }
        if (buildingNo !== parsedBuilding) { buildingNo = parsedBuilding; needUpdate = true; fixedRoomBuilding++; }
        if (unitNo !== parsedBuilding) { unitNo = parsedBuilding; needUpdate = true; fixedRoomUnit++; }
        if (floorNum !== 0) { floorNum = 0; needUpdate = true; }
        if (roomNo !== parsedRoomNo) { roomNo = parsedRoomNo; needUpdate = true; }
        
        const expectedUserId = genShopUserId(parsedBuilding, parsedRoomNo);
        if (uid !== expectedUserId) {
          newUserId = expectedUserId;
          needUpdate = true;
          fixedRoomUserId++;
        }
        
        const expectedDisplay = `门市${buildingNo}-${roomNo}`;
        if (displayRoomNo !== expectedDisplay) {
          displayRoomNo = expectedDisplay;
          needUpdate = true;
          fixedRoomDisplay++;
        }
        const expectedFull = `${buildingNo}栋门市${roomNo}号`;
        if (fullRoomNo !== expectedFull) {
          fullRoomNo = expectedFull;
          needUpdate = true;
        }
        fixedRoomShop++;
      } else {
        if (room.isShop === true) { needUpdate = true; }
        const unitNum = parseInt(unitNo) || 0;
        if (unitNum > 3) {
          if (floorNum === 1 || floorNum === 0) {
            floorNum = unitNum;
            unitNo = '1';
            needUpdate = true;
            fixedRoomUnit++;
          }
        }
        if (!displayRoomNo && unitNo && floorNum && roomNo) {
          const floorStr = String(floorNum).padStart(2, '0');
          const floorDisp = floorStr.replace(/^0/, '');
          displayRoomNo = `${unitNo}-${floorDisp}-${roomNo}`;
          needUpdate = true;
          fixedRoomDisplay++;
        }
        if (!fullRoomNo && buildingNo && unitNo && floorNum && roomNo) {
          const floorStr = String(floorNum).padStart(2, '0');
          fullRoomNo = `${buildingNo}栋${unitNo}单元${floorStr}${roomNo}`;
          needUpdate = true;
        }
      }
      
      fixedRooms.push({
        ...room,
        isShop,
        userId: newUserId,
        buildingNo,
        unitNo,
        floor: floorNum,
        roomNo,
        displayRoomNo,
        fullRoomNo,
        ownerId: ownerMatch ? ownerMatch._id : room.ownerId,
        ownerName: ownerMatch ? ownerMatch.name : room.ownerName,
        _needUpdate: needUpdate || (ownerMatch && (!room.ownerId || room.ownerId !== ownerMatch._id))
      });
    }
    
    const roomCodeMap = {};
    fixedRooms.forEach(r => {
      const code = String(r.code || '');
      if (code && !roomCodeMap[code]) roomCodeMap[code] = [];
      if (code) roomCodeMap[code].push(r);
    });
    const duplicateCodeRooms = [];
    Object.keys(roomCodeMap).forEach(code => {
      if (roomCodeMap[code].length > 1) {
        const sorted = roomCodeMap[code].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        duplicateCodeRooms.push(...sorted.slice(1));
      }
    });
    console.log(`发现重复code的房间 ${duplicateCodeRooms.length} 条`);
    
    const roomFullNoMap = {};
    const remainingRoomsAfterCode = fixedRooms.filter(r => !duplicateCodeRooms.find(d => d._id === r._id));
    remainingRoomsAfterCode.forEach(r => {
      const frn = String(r.fullRoomNo || '');
      if (frn && !roomFullNoMap[frn]) roomFullNoMap[frn] = [];
      if (frn) roomFullNoMap[frn].push(r);
    });
    const duplicateFullNoRooms = [];
    Object.keys(roomFullNoMap).forEach(frn => {
      if (roomFullNoMap[frn].length > 1) {
        const sorted = roomFullNoMap[frn].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        duplicateFullNoRooms.push(...sorted.slice(1));
      }
    });
    console.log(`发现重复fullRoomNo的房间 ${duplicateFullNoRooms.length} 条`);
    
    const allRoomIdsToRemove = new Set([
      ...duplicateCodeRooms.map(r => r._id),
      ...duplicateFullNoRooms.map(r => r._id)
    ]);
    
    let updatedRooms = 0;
    const validRooms = fixedRooms.filter(r => !allRoomIdsToRemove.has(r._id));
    
    for (const room of validRooms) {
      if (room._needUpdate) {
        const updateData = {
          isShop: room.isShop,
          userId: room.userId,
          buildingNo: room.buildingNo,
          unitNo: room.unitNo,
          floor: room.floor,
          roomNo: room.roomNo,
          displayRoomNo: room.displayRoomNo,
          fullRoomNo: room.fullRoomNo,
          ownerId: room.ownerId,
          ownerName: room.ownerName,
          updatedAt: new Date()
        };
        await db.collection('rooms').doc(room._id).update(updateData);
        updatedRooms++;
      }
    }
    
    console.log(`删除重复房间 ${allRoomIdsToRemove.size} 条`);
    for (const id of allRoomIdsToRemove) {
      try { await db.collection('rooms').doc(id).remove(); } catch (e) {}
    }
    
    const newOwnerCount = await db.collection('owners').count();
    const newRoomCount = await db.collection('rooms').count();
    
    console.log(`修复完成: 业主 ${newOwnerCount.total} 条, 房间 ${newRoomCount.total} 条`);
    
    return success({
      before: { owners: totalOwners, rooms: totalRooms },
      after: { owners: newOwnerCount.total, rooms: newRoomCount.total },
      removed: { 
        owners: allOwnerIdsToRemove.size, 
        rooms: allRoomIdsToRemove.size,
        duplicateCodeOwners: duplicateCodeOwners.length,
        duplicateUserIdOwners: duplicateUserIdOwners.length,
        duplicateCodeRooms: duplicateCodeRooms.length,
        duplicateFullNoRooms: duplicateFullNoRooms.length
      },
      fixed: {
        updatedOwners,
        updatedRooms,
        shopOwners: fixedShop,
        shopRooms: fixedRoomShop,
        buildingNo: fixedBuildingNo + fixedRoomBuilding,
        displayRoomNo: fixedDisplayRoomNo + fixedRoomDisplay,
        unit: fixedUnit + fixedRoomUnit
      }
    });
  } catch (e) {
    console.error('修复数据失败:', e);
    return error('修复数据失败: ' + e.message);
  }
}

/** POST /api/rooms/batch - 批量导入房间（仅 super_admin） */
async function roomsBatch(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (user.role !== 'super_admin') return forbidden();
  const body = getBody(event);
  const data = body.data || [];
  if (data.length === 0) return error('导入数据不能为空');
  try {
    const now = new Date();
    let successCount = 0;
    let failCount = 0;
    const failures = [];
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      try {
        const room = {
          buildingNo: item.buildingNo || '',
          unitNo: item.unitNo || '',
          floor: Number(item.floor) || 0,
          roomNo: item.roomNo || '',
          fullRoomNo: item.fullRoomNo || '',
          area: Number(item.area) || 0,
          status: item.status || 'vacant',
          ownerId: item.ownerId || '',
          remark: item.remark || '',
          createdAt: now,
          updatedAt: now
        };
        await db.collection('rooms').add(room);
        successCount++;
      } catch (e) {
        failCount++;
        failures.push({ row: i + 2, reason: e.message });
      }
    }
    return success({ success: successCount, fail: failCount, failures });
  } catch (e) {
    console.error('批量导入房间失败:', e);
    return error('批量导入房间失败: ' + e.message);
  }
}

/** POST /api/bills/batch - 批量导入账单（仅 super_admin） */
async function billsBatch(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (user.role !== 'super_admin') return forbidden();
  const body = getBody(event);
  const data = body.data || [];
  if (data.length === 0) return error('导入数据不能为空');
  try {
    const now = new Date();
    let successCount = 0;
    let failCount = 0;
    const failures = [];
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      try {
        const bill = {
          ownerId: item.ownerId || '',
          ownerName: item.ownerName || '',
          roomNo: item.roomNo || '',
          type: item.type || 'property',
          year: Number(item.year) || new Date().getFullYear(),
          month: Number(item.month) || new Date().getMonth() + 1,
          amount: Number(item.amount) || 0,
          paidAmount: Number(item.paidAmount) || 0,
          status: item.status || 'unpaid',
          remark: item.remark || '',
          createdAt: now,
          updatedAt: now
        };
        await db.collection('bills').add(bill);
        successCount++;
      } catch (e) {
        failCount++;
        failures.push({ row: i + 2, reason: e.message });
      }
    }
    return success({ success: successCount, fail: failCount, failures });
  } catch (e) {
    console.error('批量导入账单失败:', e);
    return error('批量导入账单失败: ' + e.message);
  }
}

/** POST /api/parking/batch - 批量创建车位（仅 super_admin） */
async function parkingBatch(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (user.role !== 'super_admin') return forbidden();
  const body = getBody(event);
  const codes = body.codes || [];
  if (codes.length === 0) return error('车位编号列表不能为空');
  try {
    const now = new Date();
    const created = [];
    for (const code of codes) {
      const spot = {
        code,
        type: body.type || 'ground',
        status: 'free',
        price: Number(body.price) || 0,
        ownerId: '',
        startDate: '',
        endDate: '',
        remark: '',
        createdAt: now,
        updatedAt: now
      };
      const res = await db.collection('parking_spots').add(spot);
      created.push(res.id);
    }
    return success({ created: created.length, ids: created });
  } catch (e) {
    console.error('批量创建车位失败:', e);
    return error('批量创建车位失败: ' + e.message);
  }
}

/** PUT /api/parking/:id - 更新车位 */
async function parkingUpdate(event, id) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (isReadOnly(user.role)) return forbidden();
  const body = getBody(event);
  try {
    const update = { updatedAt: new Date() };
    ['code', 'type', 'status', 'remark'].forEach(k => {
      if (body[k] !== undefined) update[k] = body[k];
    });
    if (body.price !== undefined) update.price = Number(body.price);
    await db.collection('parking_spots').doc(id).update(update);
    return success({ message: '更新成功' });
  } catch (e) {
    console.error('更新车位失败:', e);
    return error('更新车位失败: ' + e.message);
  }
}

/** PUT /api/parking/:id/bind - 绑定业主 */
async function parkingBind(event, id) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (isReadOnly(user.role)) return forbidden();
  const body = getBody(event);
  if (!body.ownerId) return error('业主ID不能为空');
  try {
    await db.collection('parking_spots').doc(id).update({
      ownerId: body.ownerId,
      status: 'sold',
      startDate: body.startDate || '',
      endDate: body.endDate || '',
      updatedAt: new Date()
    });
    return success({ message: '绑定成功' });
  } catch (e) {
    console.error('绑定车位失败:', e);
    return error('绑定车位失败: ' + e.message);
  }
}

/** PUT /api/parking/:id/unbind - 解绑业主 */
async function parkingUnbind(event, id) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (isReadOnly(user.role)) return forbidden();
  try {
    await db.collection('parking_spots').doc(id).update({
      ownerId: '',
      status: 'free',
      startDate: '',
      endDate: '',
      updatedAt: new Date()
    });
    return success({ message: '解绑成功' });
  } catch (e) {
    console.error('解绑车位失败:', e);
    return error('解绑车位失败: ' + e.message);
  }
}

/** DELETE /api/parking/:id - 删除车位 */
async function parkingDelete(event, id) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (isReadOnly(user.role)) return forbidden();
  try {
    await db.collection('parking_spots').doc(id).remove();
    return success({ message: '删除成功' });
  } catch (e) {
    console.error('删除车位失败:', e);
    return error('删除车位失败: ' + e.message);
  }
}

// ======================== 物业费账单 ========================

/** GET /api/bills - 账单列表 */
async function billsList(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  const query = getQuery(event);
  const page = parseInt(query.page) || 1;
  const pageSize = parseInt(query.pageSize) || 20;
  const { billType, status, period, ownerId, keyword } = query;
  try {
    const conditions = [];
    if (billType) conditions.push({ billType });
    if (status) conditions.push({ status });
    if (period) conditions.push({ period });
    if (ownerId) conditions.push({ ownerId });
    if (keyword) {
      const reg = db.RegExp({ regexp: keyword, options: 'i' });
      conditions.push(_.or([{ ownerName: reg }, { fullRoomNo: reg }]));
    }
    const where = buildWhere(conditions);
    const countRes = await db.collection('bills').where(where).count();
    const total = countRes.total;
    const res = await db.collection('bills')
      .where(where)
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();
    let bills = res.data || [];
    // 关联业主信息（补充 ownerName / fullRoomNo / area）
    if (bills.length > 0) {
      const ownerIds = [...new Set(bills.map(b => b.ownerId).filter(Boolean))];
      if (ownerIds.length > 0) {
        const ownersRes = await db.collection('owners').where({ _id: _.in(ownerIds) }).get();
        const ownerMap = {};
        (ownersRes.data || []).forEach(o => { ownerMap[o._id] = o; });
        bills = bills.map(b => {
          const o = b.ownerId ? ownerMap[b.ownerId] : null;
          return {
            ...b,
            ownerName: (o && o.name) ? o.name : (b.ownerName || ''),
            fullRoomNo: (o && o.fullRoomNo) ? o.fullRoomNo : (b.fullRoomNo || ''),
            displayRoomNo: (o && o.displayRoomNo) ? o.displayRoomNo : (b.displayRoomNo || ''),
            buildingNo: (o && o.buildingNo) ? o.buildingNo : (b.buildingNo || ''),
            isShop: b.isShop !== undefined ? b.isShop : (o ? !!o.isShop : false),
            area: b.area || (o ? o.area : 0)
          };
        });
      }
    }
    return successPage(bills, total, page, pageSize);
  } catch (e) {
    console.error('获取账单列表失败:', e);
    return error('获取账单列表失败: ' + e.message);
  }
}

/** GET /api/bills/statistics - 账单统计 */
async function billsStatistics(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  try {
    const res = await db.collection('bills').get();
    const list = res.data || [];
    const statusMap = {};
    let unpaidCount = 0, unpaidAmount = 0, paidCount = 0, paidAmount = 0, overdueCount = 0;
    list.forEach(b => {
      statusMap[b.status] = (statusMap[b.status] || 0) + 1;
      const amount = Number(b.amount) || 0;
      const paid = Number(b.paidAmount) || 0;
      if (b.status === 'unpaid') {
        unpaidCount++;
        unpaidAmount += (amount - paid);
      } else if (b.status === 'partial') {
        unpaidCount++;
        unpaidAmount += (amount - paid);
      } else if (b.status === 'paid') {
        paidCount++;
        paidAmount += paid;
      } else if (b.status === 'overdue') {
        overdueCount++;
        unpaidAmount += (amount - paid);
      }
    });
    return success({
      unpaidCount,
      unpaidAmount: Math.round(unpaidAmount * 100) / 100,
      paidCount,
      paidAmount: Math.round(paidAmount * 100) / 100,
      overdueCount,
      statusMap
    });
  } catch (e) {
    console.error('账单统计失败:', e);
    return error('账单统计失败: ' + e.message);
  }
}

/** GET /api/bills/owner/:ownerId - 某业主所有账单 */
async function billsByOwner(event, ownerId) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  try {
    const res = await db.collection('bills')
      .where({ ownerId })
      .orderBy('createdAt', 'desc')
      .get();
    return success(res.data || []);
  } catch (e) {
    console.error('获取业主账单失败:', e);
    return error('获取业主账单失败: ' + e.message);
  }
}

/** GET /api/bills/:id - 账单详情 */
async function billDetail(event, id) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  try {
    const res = await db.collection('bills').doc(id).get();
    if (!res.data) return error('账单不存在');
    let bill = res.data;
    if (bill.ownerId) {
      const ownerRes = await db.collection('owners').doc(bill.ownerId).get();
      bill.owner = ownerRes.data || null;
    }
    return success(bill);
  } catch (e) {
    console.error('获取账单详情失败:', e);
    return error('获取账单详情失败: ' + e.message);
  }
}

/** POST /api/bills/generate - 批量生成账单 */
async function billsGenerate(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (isReadOnly(user.role)) return forbidden();
  const body = getBody(event);
  const { billType, period, unitPrice, months, buildingNo, dryRun } = body;
  if (!billType || !period) return error('账单类型和计费周期不能为空');
  const unitPriceNum = Number(unitPrice) || 0;
  const monthsNum = Number(months) || 1;
  const isDryRun = dryRun === true || dryRun === 'true';
  try {
    let feeSettings = null;
    try {
      const setRes = await db.collection('settings').where({ key: 'feeConfig' }).get();
      if (setRes.data && setRes.data.length > 0) {
        feeSettings = setRes.data[0].value || {};
      }
    } catch (e) {}

    const conditions = [];
    if (buildingNo) {
      const bn = String(buildingNo);
      conditions.push(_.or([{ buildingNo: bn }, { buildingNo: Number(bn) }]));
    }
    const ownerWhere = buildWhere(conditions);
    const ownersRes = await db.collection('owners').where(ownerWhere).get();
    const owners = ownersRes.data || [];
    if (owners.length === 0) return error('没有符合条件的业主');
    const now = new Date();
    let dueDate = new Date(now);
    dueDate.setMonth(dueDate.getMonth() + 1);
    const created = [];
    const preview = [];
    // 生成账单编号：账单类型 + 周期 + 序号
    const billTypePrefix = { property: 'P', elevator: 'E', parking: 'K' }[billType] || 'B';
    const periodCompact = String(period).replace(/-/g, '');
    let seq = 0;
    for (const o of owners) {
      const area = Number(o.area) || 0;
      let price = unitPriceNum;
      if (price <= 0) {
        if (billType === 'property') {
          if (o.isShop) {
            price = feeSettings ? (Number(feeSettings.commercialProperty) || 0.6) : 0.6;
          } else {
            price = feeSettings ? (Number(feeSettings.residentialProperty) || 1.2) : 1.2;
          }
        } else if (billType === 'elevator') {
          price = feeSettings ? (Number(feeSettings.elevator) || 30) : 30;
        } else if (billType === 'parking') {
          price = feeSettings ? (Number(feeSettings.parking) || 150) : 150;
        }
      }
      let amount = 0;
      if (billType === 'property') {
        amount = Math.round(area * price * monthsNum * 100) / 100;
      } else {
        amount = Math.round(price * monthsNum * 100) / 100;
      }
      seq += 1;
      const billNo = `${billTypePrefix}${periodCompact}${String(seq).padStart(4, '0')}`;
      const bill = {
        billNo,
        ownerId: o._id,
        ownerName: o.name,
        ownerPhone: o.phone || '',
        fullRoomNo: o.fullRoomNo || '',
        displayRoomNo: o.displayRoomNo || '',
        buildingNo: o.buildingNo || '',
        unitNo: o.unitNo || '',
        roomNo: o.roomNo || '',
        isShop: o.isShop || false,
        area,
        billType,
        period,
        months: monthsNum,
        unitPrice: price,
        amount,
        paidAmount: 0,
        status: 'unpaid',
        dueDate,
        remark: '',
        createdAt: now,
        updatedAt: now
      };
      if (isDryRun) {
        preview.push(bill);
      } else {
        const res = await db.collection('bills').add(bill);
        created.push(res.id);
      }
    }
    if (isDryRun) {
      return success({ dryRun: true, count: preview.length, preview: preview.slice(0, 20) });
    }
    return success({ created: created.length, ids: created });
  } catch (e) {
    console.error('生成账单失败:', e);
    return error('生成账单失败: ' + e.message);
  }
}

/** POST /api/bills/batch-delete - 批量删除账单（按条件） */
async function billsBatchDelete(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (user.role !== 'super_admin') return forbidden();
  const body = getBody(event);
  const { period, billType, status, ids, all } = body;
  try {
    let where = {};
    if (Array.isArray(ids) && ids.length > 0) {
      where = { _id: _.in(ids) };
    } else if (all === true || all === 'true') {
      where = {};
    } else {
      const conditions = [];
      if (period) conditions.push({ period });
      if (billType) conditions.push({ billType });
      if (status) conditions.push({ status });
      where = buildWhere(conditions);
      if (Object.keys(where).length === 0) return error('请提供删除条件（period/billType/status/ids/all）');
    }
    const countRes = await db.collection('bills').where(where).count();
    const total = countRes.total;
    if (total === 0) return success({ deleted: 0 });
    const batchSize = 100;
    let deleted = 0;
    for (let offset = 0; offset < total; offset += batchSize) {
      const res = await db.collection('bills').where(where).skip(offset).limit(batchSize).get();
      const ids = (res.data || []).map(d => d._id);
      if (ids.length > 0) {
        await db.collection('bills').where({ _id: _.in(ids) }).remove();
        deleted += ids.length;
      }
    }
    return success({ deleted, total });
  } catch (e) {
    console.error('批量删除账单失败:', e);
    return error('批量删除账单失败: ' + e.message);
  }
}

/** PUT /api/bills/:id/pay - 缴费 */
async function billPay(event, id) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (isReadOnly(user.role)) return forbidden();
  const body = getBody(event);
  const paidAmount = Number(body.paidAmount) || 0;
  if (paidAmount <= 0) return error('缴费金额必须大于0');
  try {
    const res = await db.collection('bills').doc(id).get();
    if (!res.data) return error('账单不存在');
    const bill = res.data;
    const totalAmount = Number(bill.amount) || 0;
    const oldPaid = Number(bill.paidAmount) || 0;
    const newPaid = Math.round((oldPaid + paidAmount) * 100) / 100;
    let newStatus = 'unpaid';
    if (newPaid >= totalAmount) newStatus = 'paid';
    else if (newPaid > 0) newStatus = 'partial';
    await db.collection('bills').doc(id).update({
      paidAmount: newPaid,
      status: newStatus,
      payDate: new Date(),
      remark: body.remark ? (bill.remark ? bill.remark + '; ' + body.remark : body.remark) : bill.remark,
      updatedAt: new Date()
    });
    // 如果是物业费缴费，记一笔财务收入
    try {
      await db.collection('finance').add({
        type: 'income',
        category: bill.billType === 'property' ? 'property_fee' : (bill.billType === 'elevator' ? 'elevator_fee' : 'parking_fee'),
        amount: paidAmount,
        recordDate: new Date(),
        remark: '账单缴费: ' + (bill.ownerName || '') + ' ' + (bill.period || ''),
        billId: id,
        createdAt: new Date()
      });
    } catch (fe) {
      console.error('记录财务收入失败:', fe);
    }
    return success({ message: '缴费成功', paidAmount: newPaid, status: newStatus });
  } catch (e) {
    console.error('缴费失败:', e);
    return error('缴费失败: ' + e.message);
  }
}

/** POST /api/bills/batch-pay - 批量缴费 */
async function billsBatchPay(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (isReadOnly(user.role)) return forbidden();
  const body = getBody(event);
  const billIds = body.billIds || [];
  if (billIds.length === 0) return error('账单ID列表不能为空');
  const paidAmount = body.paidAmount; // 可选，未指定则全额缴清
  try {
    let paid = 0;
    const now = new Date();
    for (const id of billIds) {
      const res = await db.collection('bills').doc(id).get();
      if (!res.data) continue;
      const bill = res.data;
      const totalAmount = Number(bill.amount) || 0;
      const oldPaid = Number(bill.paidAmount) || 0;
      const thisPay = paidAmount !== undefined ? Number(paidAmount) : (totalAmount - oldPaid);
      const newPaid = Math.round((oldPaid + thisPay) * 100) / 100;
      let newStatus = 'unpaid';
      if (newPaid >= totalAmount) newStatus = 'paid';
      else if (newPaid > 0) newStatus = 'partial';
      await db.collection('bills').doc(id).update({
        paidAmount: newPaid,
        status: newStatus,
        payDate: now,
        updatedAt: now
      });
      paid++;
    }
    return success({ paid });
  } catch (e) {
    console.error('批量缴费失败:', e);
    return error('批量缴费失败: ' + e.message);
  }
}

/** POST /api/bills/mark-overdue - 标记逾期 */
async function billsMarkOverdue(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (isReadOnly(user.role)) return forbidden();
  try {
    const now = new Date();
    // 查询未缴/部分缴且已超过到期日的账单
    const res = await db.collection('bills')
      .where(_.and([
        { status: _.in(['unpaid', 'partial']) },
        { dueDate: _.lt(now) }
      ]))
      .get();
    const list = res.data || [];
    let marked = 0;
    for (const bill of list) {
      await db.collection('bills').doc(bill._id).update({
        status: 'overdue',
        updatedAt: now
      });
      marked++;
    }
    return success({ marked });
  } catch (e) {
    console.error('标记逾期失败:', e);
    return error('标记逾期失败: ' + e.message);
  }
}

/** POST /api/bills/notice - 催缴通知单数据 */
async function billsNotice(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  const body = getBody(event);
  const billIds = body.billIds || [];
  if (billIds.length === 0) return error('账单ID列表不能为空');
  try {
    const billsRes = await db.collection('bills').where({ _id: _.in(billIds) }).get();
    const bills = billsRes.data || [];
    // 按业主分组
    const groupMap = {};
    bills.forEach(b => {
      const key = b.ownerId || 'unknown';
      if (!groupMap[key]) {
        groupMap[key] = {
          ownerId: b.ownerId,
          ownerName: b.ownerName || '',
          fullRoomNo: b.fullRoomNo || '',
          bills: [],
          totalUnpaid: 0
        };
      }
      groupMap[key].bills.push(b);
      const amount = Number(b.amount) || 0;
      const paid = Number(b.paidAmount) || 0;
      groupMap[key].totalUnpaid += (amount - paid);
    });
    const notices = Object.values(groupMap).map(g => ({
      ...g,
      totalUnpaid: Math.round(g.totalUnpaid * 100) / 100
    }));
    return success(notices);
  } catch (e) {
    console.error('获取催缴通知数据失败:', e);
    return error('获取催缴通知数据失败: ' + e.message);
  }
}

/** POST /api/bills/batch-print - 批量打印账单（每张A4纸4个账单） */
async function billsBatchPrint(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  const body = getBody(event);
  const { billIds, status = 'unpaid', period, billType, ownerId } = body;
  try {
    let bills = [];
    if (Array.isArray(billIds) && billIds.length > 0) {
      const res = await db.collection('bills').where({ _id: _.in(billIds) }).get();
      bills = res.data || [];
    } else {
      const conditions = [];
      if (status) conditions.push({ status });
      if (period) conditions.push({ period });
      if (billType) conditions.push({ billType });
      if (ownerId) conditions.push({ ownerId });
      const where = buildWhere(conditions);
      const countRes = await db.collection('bills').where(where).count();
      const total = countRes.total;
      const batchSize = 100;
      for (let offset = 0; offset < total; offset += batchSize) {
        const res = await db.collection('bills').where(where).skip(offset).limit(batchSize).get();
        bills = bills.concat(res.data || []);
      }
    }
    if (bills.length === 0) return error('没有符合条件的账单');

    // 关联业主信息
    const ownerIds = [...new Set(bills.map(b => b.ownerId).filter(Boolean))];
    if (ownerIds.length > 0) {
      const ownersRes = await db.collection('owners').where({ _id: _.in(ownerIds) }).get();
      const ownerMap = {};
      (ownersRes.data || []).forEach(o => { ownerMap[o._id] = o; });
      bills = bills.map(b => {
        const o = b.ownerId ? ownerMap[b.ownerId] : null;
        return {
          ...b,
          ownerName: (o && o.name) ? o.name : (b.ownerName || ''),
          ownerPhone: (o && o.phone) ? o.phone : (b.ownerPhone || ''),
          fullRoomNo: (o && o.fullRoomNo) ? o.fullRoomNo : (b.fullRoomNo || ''),
          displayRoomNo: (o && o.displayRoomNo) ? o.displayRoomNo : (b.displayRoomNo || ''),
          buildingNo: (o && o.buildingNo) ? o.buildingNo : (b.buildingNo || ''),
          area: b.area || (o ? Number(o.area) || 0 : 0)
        };
      });
    }

    const billTypeMap = { property: '物业费', elevator: '电梯费', parking: '车位费' };
    const statusMap = { unpaid: '未缴费', partial: '部分缴费', paid: '已缴费', overdue: '已逾期' };

    function buildBillCard(b, idx) {
      const amount = Number(b.amount) || 0;
      const paid = Number(b.paidAmount) || 0;
      const unpaid = Math.round((amount - paid) * 100) / 100;
      const billTypeName = billTypeMap[b.billType] || b.billType || '';
      const statusName = statusMap[b.status] || b.status || '';
      const period = b.period || '';
      const dueDate = b.dueDate ? new Date(b.dueDate).toLocaleDateString('zh-CN') : '';
      const unitPrice = Number(b.unitPrice) || 0;
      const months = Number(b.months) || 1;
      const area = Number(b.area) || 0;
      const today = new Date().toLocaleDateString('zh-CN');
      return `
      <div class="bill-card">
        <div class="bill-header">
          <div class="bill-title">物业费缴费通知单</div>
          <div class="bill-no">编号：${b.billNo || ''}</div>
        </div>
        <table class="bill-table">
          <tr><td class="label">业主姓名</td><td class="value">${b.ownerName || ''}</td><td class="label">联系电话</td><td class="value">${b.ownerPhone || ''}</td></tr>
          <tr><td class="label">房间号</td><td class="value" colspan="3">${b.displayRoomNo || b.fullRoomNo || ''}</td></tr>
          <tr><td class="label">楼栋</td><td class="value">${b.buildingNo || ''}号楼</td><td class="label">类型</td><td class="value">${b.isShop ? '门市' : '住宅'}</td></tr>
          <tr><td class="label">面积</td><td class="value">${area.toFixed(2)} ㎡</td><td class="label">账单类型</td><td class="value">${billTypeName}</td></tr>
          <tr><td class="label">计费周期</td><td class="value">${period}</td><td class="label">月数</td><td class="value">${months} 个月</td></tr>
          <tr><td class="label">单价</td><td class="value">¥${unitPrice.toFixed(2)}${b.billType === 'property' ? '/㎡/月' : '/月'}</td><td class="label">状态</td><td class="value status-${b.status}">${statusName}</td></tr>
          <tr><td class="label">应缴金额</td><td class="value amount-cell">¥${amount.toFixed(2)}</td><td class="label">已缴金额</td><td class="value">¥${paid.toFixed(2)}</td></tr>
          <tr><td class="label">欠缴金额</td><td class="value amount-cell unpaid-cell" colspan="3">¥${unpaid.toFixed(2)}</td></tr>
          <tr><td class="label">缴费截止</td><td class="value" colspan="3">${dueDate}</td></tr>
        </table>
        <div class="bill-footer">
          <div class="footer-left">打印日期：${today}</div>
          <div class="footer-right">得心物业管理有限公司</div>
        </div>
      </div>`;
    }

    // 每4个账单为一页
    const pages = [];
    for (let i = 0; i < bills.length; i += 4) {
      const pageBills = bills.slice(i, i + 4);
      const cards = pageBills.map((b, idx) => buildBillCard(b, idx)).join('');
      pages.push(`<div class="print-page">${cards}</div>`);
    }

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>物业费账单批量打印</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Microsoft YaHei", "SimSun", sans-serif; color: #333; }
  .print-page {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 4mm;
    page-break-after: always;
    min-height: 277mm;
  }
  .print-page:last-child { page-break-after: auto; }
  .bill-card {
    border: 1px solid #333;
    padding: 3mm;
    font-size: 10px;
    display: flex;
    flex-direction: column;
  }
  .bill-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #333;
    padding-bottom: 1mm;
    margin-bottom: 1mm;
  }
  .bill-title { font-size: 13px; font-weight: bold; }
  .bill-no { font-size: 9px; color: #666; }
  .bill-table { width: 100%; border-collapse: collapse; flex: 1; }
  .bill-table td { border: 1px solid #999; padding: 1mm 1.5mm; font-size: 10px; }
  .bill-table td.label { background: #f5f5f5; width: 22%; font-weight: bold; }
  .bill-table td.value { width: 28%; }
  .bill-table td.amount-cell { font-weight: bold; font-size: 11px; }
  .bill-table td.unpaid-cell { color: #c0392b; font-size: 12px; text-align: center; }
  .bill-table td.status-paid { color: #27ae60; }
  .bill-table td.status-unpaid { color: #c0392b; }
  .bill-table td.status-partial { color: #e67e22; }
  .bill-table td.status-overdue { color: #c0392b; font-weight: bold; }
  .bill-footer {
    display: flex;
    justify-content: space-between;
    border-top: 1px solid #999;
    padding-top: 1mm;
    margin-top: 1mm;
    font-size: 9px;
    color: #666;
  }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
${pages.join('')}
</body>
</html>`;
    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'text/html; charset=utf-8' },
      body: html
    };
  } catch (e) {
    console.error('批量打印账单失败:', e);
    return error('批量打印账单失败: ' + e.message);
  }
}

/** DELETE /api/bills/:id - 删除账单（仅 super_admin） */
async function billDelete(event, id) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (user.role !== 'super_admin') return forbidden();
  try {
    await db.collection('bills').doc(id).remove();
    return success({ message: '删除成功' });
  } catch (e) {
    console.error('删除账单失败:', e);
    return error('删除账单失败: ' + e.message);
  }
}

// ======================== 财务收支 ========================

/** GET /api/finance - 财务列表 */
async function financeList(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  const query = getQuery(event);
  const page = parseInt(query.page) || 1;
  const pageSize = parseInt(query.pageSize) || 20;
  const { type, category, startDate, endDate } = query;
  try {
    const conditions = [];
    if (type) conditions.push({ type });
    if (category) conditions.push({ category });
    if (startDate || endDate) {
      const dateCond = {};
      if (startDate) dateCond.recordDate = _.gte(new Date(startDate));
      if (endDate) dateCond.recordDate = _.lte(new Date(endDate));
      conditions.push(dateCond);
    }
    const where = buildWhere(conditions);
    const countRes = await db.collection('finance').where(where).count();
    const total = countRes.total;
    const res = await db.collection('finance')
      .where(where)
      .orderBy('recordDate', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();
    return successPage(res.data || [], total, page, pageSize);
  } catch (e) {
    console.error('获取财务列表失败:', e);
    return error('获取财务列表失败: ' + e.message);
  }
}

/** GET /api/finance/report - 财务报表 */
async function financeReport(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  try {
    const res = await db.collection('finance').get();
    const list = res.data || [];
    let totalIncome = 0, totalExpense = 0;
    list.forEach(f => {
      const amount = Number(f.amount) || 0;
      if (f.type === 'income') totalIncome += amount;
      else if (f.type === 'expense') totalExpense += amount;
    });
    return success({
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpense: Math.round(totalExpense * 100) / 100,
      netProfit: Math.round((totalIncome - totalExpense) * 100) / 100
    });
  } catch (e) {
    console.error('获取财务报表失败:', e);
    return error('获取财务报表失败: ' + e.message);
  }
}

/** GET /api/finance/:id - 财务详情 */
async function financeDetail(event, id) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  try {
    const res = await db.collection('finance').doc(id).get();
    if (!res.data) return error('记录不存在');
    return success(res.data);
  } catch (e) {
    console.error('获取财务详情失败:', e);
    return error('获取财务详情失败: ' + e.message);
  }
}

/** POST /api/finance - 创建财务记录 */
async function financeCreate(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (isReadOnly(user.role)) return forbidden();
  const body = getBody(event);
  if (!body.type || !body.category || body.amount === undefined) {
    return error('类型、分类和金额不能为空');
  }
  try {
    const now = new Date();
    const record = {
      type: body.type,
      category: body.category,
      amount: Number(body.amount) || 0,
      recordDate: body.recordDate ? new Date(body.recordDate) : now,
      remark: body.remark || '',
      createdBy: user.username,
      createdAt: now,
      updatedAt: now
    };
    const res = await db.collection('finance').add(record);
    return success({ id: res.id, ...record });
  } catch (e) {
    console.error('创建财务记录失败:', e);
    return error('创建财务记录失败: ' + e.message);
  }
}

/** PUT /api/finance/:id - 更新财务记录 */
async function financeUpdate(event, id) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (isReadOnly(user.role)) return forbidden();
  const body = getBody(event);
  try {
    const update = { updatedAt: new Date() };
    ['type', 'category', 'remark'].forEach(k => {
      if (body[k] !== undefined) update[k] = body[k];
    });
    if (body.amount !== undefined) update.amount = Number(body.amount);
    if (body.recordDate) update.recordDate = new Date(body.recordDate);
    await db.collection('finance').doc(id).update(update);
    return success({ message: '更新成功' });
  } catch (e) {
    console.error('更新财务记录失败:', e);
    return error('更新财务记录失败: ' + e.message);
  }
}

/** DELETE /api/finance/:id - 删除财务记录（仅 finance 或 super_admin） */
async function financeDelete(event, id) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (user.role !== 'finance' && user.role !== 'super_admin') return forbidden();
  try {
    await db.collection('finance').doc(id).remove();
    return success({ message: '删除成功' });
  } catch (e) {
    console.error('删除财务记录失败:', e);
    return error('删除财务记录失败: ' + e.message);
  }
}

// ======================== 用户管理 ========================

/** GET /api/users - 用户列表 */
async function usersList(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  const query = getQuery(event);
  const page = parseInt(query.page) || 1;
  const pageSize = parseInt(query.pageSize) || 20;
  try {
    const countRes = await db.collection('users').count();
    const total = countRes.total;
    const res = await db.collection('users')
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();
    const list = (res.data || []).map(u => ({
      id: u._id,
      username: u.username,
      realName: u.realName,
      role: u.role,
      phone: u.phone,
      enabled: u.enabled,
      createdAt: u.createdAt
    }));
    return successPage(list, total, page, pageSize);
  } catch (e) {
    console.error('获取用户列表失败:', e);
    return error('获取用户列表失败: ' + e.message);
  }
}

/** POST /api/users - 创建用户（仅 super_admin） */
async function userCreate(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (user.role !== 'super_admin') return forbidden();
  const body = getBody(event);
  if (!body.username || !body.password) return error('用户名和密码不能为空');
  try {
    // 检查用户名是否已存在
    const existRes = await db.collection('users').where({ username: body.username }).get();
    if (existRes.data && existRes.data.length > 0) return error('用户名已存在');
    const now = new Date();
    const newUser = {
      username: body.username,
      password: bcrypt.hashSync(body.password, 10),
      realName: body.realName || '',
      role: body.role || 'executive',
      phone: body.phone || '',
      enabled: body.enabled !== false,
      createdAt: now,
      updatedAt: now
    };
    const res = await db.collection('users').add(newUser);
    return success({
      id: res.id,
      username: newUser.username,
      realName: newUser.realName,
      role: newUser.role,
      phone: newUser.phone,
      enabled: newUser.enabled
    });
  } catch (e) {
    console.error('创建用户失败:', e);
    return error('创建用户失败: ' + e.message);
  }
}

/** PUT /api/users/:id - 更新用户（仅 super_admin，不含密码） */
async function userUpdate(event, id) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (user.role !== 'super_admin') return forbidden();
  const body = getBody(event);
  try {
    const update = { updatedAt: new Date() };
    ['realName', 'role', 'phone', 'enabled'].forEach(k => {
      if (body[k] !== undefined) update[k] = body[k];
    });
    await db.collection('users').doc(id).update(update);
    return success({ message: '更新成功' });
  } catch (e) {
    console.error('更新用户失败:', e);
    return error('更新用户失败: ' + e.message);
  }
}

/** PUT /api/users/:id/password - 重置密码（仅 super_admin） */
async function userResetPassword(event, id) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (user.role !== 'super_admin') return forbidden();
  const body = getBody(event);
  if (!body.newPassword) return error('新密码不能为空');
  try {
    await db.collection('users').doc(id).update({
      password: bcrypt.hashSync(body.newPassword, 10),
      updatedAt: new Date()
    });
    return success({ message: '密码重置成功' });
  } catch (e) {
    console.error('重置密码失败:', e);
    return error('重置密码失败: ' + e.message);
  }
}

/** DELETE /api/users/:id - 删除用户（仅 super_admin） */
async function userDelete(event, id) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (user.role !== 'super_admin') return forbidden();
  if (user.id === id) return error('不能删除当前登录用户');
  try {
    await db.collection('users').doc(id).remove();
    return success({ message: '删除成功' });
  } catch (e) {
    console.error('删除用户失败:', e);
    return error('删除用户失败: ' + e.message);
  }
}

// ======================== 系统设置 ========================

const DEFAULT_FEE_SETTINGS = {
  residentialProperty: 1.2,
  commercialProperty: 0.6,
  elevator: 30,
  parking: 150,
};

/** GET /api/settings/fee - 获取物业费设置 */
async function settingsGetFee(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  try {
    const res = await db.collection('settings').where({ key: 'feeConfig' }).get();
    let data = res.data && res.data[0] ? res.data[0].value : null;
    if (!data) {
      data = { ...DEFAULT_FEE_SETTINGS };
    } else {
      data = { ...DEFAULT_FEE_SETTINGS, ...data };
    }
    return success(data);
  } catch (e) {
    console.error('获取设置失败:', e);
    return success({ ...DEFAULT_FEE_SETTINGS });
  }
}

/** PUT /api/settings/fee - 更新物业费设置 */
async function settingsUpdateFee(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (isReadOnly(user.role)) return forbidden();
  const body = getBody(event);
  try {
    const value = {
      residentialProperty: Number(body.residentialProperty) || DEFAULT_FEE_SETTINGS.residentialProperty,
      commercialProperty: Number(body.commercialProperty) || DEFAULT_FEE_SETTINGS.commercialProperty,
      elevator: Number(body.elevator) || DEFAULT_FEE_SETTINGS.elevator,
      parking: Number(body.parking) || DEFAULT_FEE_SETTINGS.parking,
    };
    const res = await db.collection('settings').where({ key: 'feeConfig' }).get();
    if (res.data && res.data.length > 0) {
      await db.collection('settings').doc(res.data[0]._id).update({ value, updatedAt: new Date() });
    } else {
      await db.collection('settings').add({ key: 'feeConfig', value, createdAt: new Date(), updatedAt: new Date() });
    }
    return success(value);
  } catch (e) {
    console.error('更新设置失败:', e);
    return error('更新设置失败: ' + e.message);
  }
}

// ======================== 打印 ========================

/** 生成单个收据 HTML */
function buildReceiptHTML(bill) {
  const ownerName = bill.ownerName || '';
  const fullRoomNo = bill.fullRoomNo || '';
  const period = bill.period || '';
  const billTypeMap = { property: '物业费', elevator: '电梯费', parking: '车位费' };
  const billTypeName = billTypeMap[bill.billType] || bill.billType || '';
  const amount = Number(bill.amount) || 0;
  const paidAmount = Number(bill.paidAmount) || 0;
  const area = Number(bill.area) || 0;
  const payDate = bill.payDate ? new Date(bill.payDate).toLocaleDateString('zh-CN') : '';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>物业费收据</title>
<style>
@page { size: A4; margin: 15mm; }
* { box-sizing: border-box; }
body { font-family: 'Microsoft YaHei', 'SimSun', sans-serif; color: #333; margin: 0; padding: 20px; }
.receipt { width: 210mm; min-height: 297mm; padding: 30px; }
.header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 15px; }
.title { font-size: 28px; font-weight: bold; letter-spacing: 4px; }
.subtitle { font-size: 14px; color: #666; margin-top: 8px; }
.no { font-size: 13px; color: #666; margin-top: 8px; }
.content { margin-top: 30px; }
.row { display: flex; padding: 10px 0; border-bottom: 1px dashed #ddd; font-size: 16px; }
.label { width: 140px; color: #666; }
.value { flex: 1; font-weight: bold; }
.amount-box { margin: 30px 0; text-align: center; }
.amount-label { font-size: 16px; color: #666; }
.amount { font-size: 32px; color: #d32f2f; font-weight: bold; }
.footer { margin-top: 60px; display: flex; justify-content: space-between; font-size: 14px; color: #666; }
.stamp { margin-top: 40px; text-align: right; }
.stamp span { display: inline-block; border: 2px solid #d32f2f; color: #d32f2f; padding: 8px 20px; border-radius: 50%; transform: rotate(-15deg); font-size: 18px; }
</style>
</head>
<body>
<div class="receipt">
  <div class="header">
    <div class="title">得心物业管理有限公司</div>
    <div class="subtitle">物业费收款收据</div>
    <div class="no">单号：${bill._id || bill.id || ''}</div>
  </div>
  <div class="content">
    <div class="row"><div class="label">交款人</div><div class="value">${ownerName}</div></div>
    <div class="row"><div class="label">房号</div><div class="value">${fullRoomNo}</div></div>
    <div class="row"><div class="label">面积</div><div class="value">${area} ㎡</div></div>
    <div class="row"><div class="label">费用类型</div><div class="value">${billTypeName}</div></div>
    <div class="row"><div class="label">计费周期</div><div class="value">${period}</div></div>
    <div class="row"><div class="label">应收金额</div><div class="value">¥ ${amount.toFixed(2)}</div></div>
    <div class="row"><div class="label">实收金额</div><div class="value">¥ ${paidAmount.toFixed(2)}</div></div>
  </div>
  <div class="amount-box">
    <div class="amount-label">实收金额（大写）</div>
    <div class="amount">¥ ${paidAmount.toFixed(2)}</div>
  </div>
  <div class="footer">
    <div>收款日期：${payDate}</div>
    <div>收款单位（盖章）：得心物业</div>
  </div>
  <div class="stamp"><span>已收讫</span></div>
</div>
</body>
</html>`;
}

/** 生成催缴通知单 HTML */
function buildNoticeHTML(notice) {
  const billTypeMap = { property: '物业费', elevator: '电梯费', parking: '车位费' };
  const rows = notice.bills.map(b => {
    const billTypeName = billTypeMap[b.billType] || b.billType || '';
    const amount = Number(b.amount) || 0;
    const paid = Number(b.paidAmount) || 0;
    const unpaid = amount - paid;
    const dueDate = b.dueDate ? new Date(b.dueDate).toLocaleDateString('zh-CN') : '';
    return `<tr>
      <td>${billTypeName}</td>
      <td>${b.period || ''}</td>
      <td>¥ ${amount.toFixed(2)}</td>
      <td>¥ ${paid.toFixed(2)}</td>
      <td>¥ ${unpaid.toFixed(2)}</td>
      <td>${dueDate}</td>
    </tr>`;
  }).join('');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>催缴通知单</title>
<style>
@page { size: A4; margin: 15mm; }
* { box-sizing: border-box; }
body { font-family: 'Microsoft YaHei', 'SimSun', sans-serif; color: #333; margin: 0; padding: 20px; }
.notice { width: 210mm; min-height: 297mm; padding: 30px; }
.header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #d32f2f; padding-bottom: 15px; }
.title { font-size: 30px; font-weight: bold; color: #d32f2f; letter-spacing: 6px; }
.info { margin: 25px 0; font-size: 16px; line-height: 2; }
.info p { margin: 5px 0; }
table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; }
th, td { border: 1px solid #ddd; padding: 10px; text-align: center; }
th { background: #f5f5f5; font-weight: bold; }
.total-box { margin: 25px 0; text-align: right; font-size: 18px; }
.total-amount { color: #d32f2f; font-size: 28px; font-weight: bold; }
.footer { margin-top: 60px; display: flex; justify-content: space-between; font-size: 14px; color: #666; }
.notice-date { margin-top: 10px; font-size: 14px; color: #666; }
</style>
</head>
<body>
<div class="notice">
  <div class="header">
    <div class="title">催 缴 通 知 单</div>
  </div>
  <div class="info">
    <p>尊敬的业主 <strong>${notice.ownerName}</strong> 先生/女士：</p>
    <p>房号：<strong>${notice.fullRoomNo}</strong></p>
    <p>您好！经核实，您有以下物业费用尚未结清，请尽快到物业服务中心缴纳，以免影响您的正常使用。逾期未缴将按相关规定收取滞纳金。</p>
  </div>
  <table>
    <thead>
      <tr>
        <th>费用类型</th>
        <th>计费周期</th>
        <th>应收金额</th>
        <th>已缴金额</th>
        <th>欠缴金额</th>
        <th>到期日</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <div class="total-box">
    欠缴合计：<span class="total-amount">¥ ${notice.totalUnpaid.toFixed(2)}</span>
  </div>
  <div class="footer">
    <div>通知单位：得心物业管理有限公司</div>
    <div class="notice-date">通知日期：${new Date().toLocaleDateString('zh-CN')}</div>
  </div>
</div>
</body>
</html>`;
}

/** GET /api/print/receipt/:id - 单个收据 HTML */
async function printReceipt(event, id) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  try {
    const res = await db.collection('bills').doc(id).get();
    if (!res.data) return error('账单不存在');
    const bill = res.data;
    // 补充业主信息
    if (bill.ownerId) {
      const ownerRes = await db.collection('owners').doc(bill.ownerId).get();
      if (ownerRes.data) {
        bill.ownerName = bill.ownerName || ownerRes.data.name;
        bill.fullRoomNo = bill.fullRoomNo || ownerRes.data.fullRoomNo;
        bill.area = bill.area || ownerRes.data.area;
      }
    }
    const html = buildReceiptHTML(bill);
    return success({ html });
  } catch (e) {
    console.error('生成收据失败:', e);
    return error('生成收据失败: ' + e.message);
  }
}

/** POST /api/print/receipts - 批量收据 HTML */
async function printReceipts(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  const body = getBody(event);
  const billIds = body.billIds || [];
  if (billIds.length === 0) return error('账单ID列表不能为空');
  try {
    const billsRes = await db.collection('bills').where({ _id: _.in(billIds) }).get();
    const bills = billsRes.data || [];
    // 补充业主信息
    const ownerIds = [...new Set(bills.map(b => b.ownerId).filter(Boolean))];
    const ownerMap = {};
    if (ownerIds.length > 0) {
      const ownersRes = await db.collection('owners').where({ _id: _.in(ownerIds) }).get();
      (ownersRes.data || []).forEach(o => { ownerMap[o._id] = o; });
    }
    const htmls = bills.map(b => {
      const o = b.ownerId ? ownerMap[b.ownerId] : null;
      if (o) {
        b.ownerName = b.ownerName || o.name;
        b.fullRoomNo = b.fullRoomNo || o.fullRoomNo;
        b.area = b.area || o.area;
      }
      return buildReceiptHTML(b);
    });
    return success({ htmls });
  } catch (e) {
    console.error('生成批量收据失败:', e);
    return error('生成批量收据失败: ' + e.message);
  }
}

/** POST /api/print/notice - 催缴通知单 HTML（A4纸4个账单排版） */
async function printNotice(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  const body = getBody(event);
  const billIds = body.billIds || [];
  if (billIds.length === 0) return error('账单ID列表不能为空');
  try {
    const billsRes = await db.collection('bills').where({ _id: _.in(billIds) }).get();
    const bills = billsRes.data || [];
    const ownerIds = [...new Set(bills.map(b => b.ownerId).filter(Boolean))];
    const ownerMap = {};
    if (ownerIds.length > 0) {
      const ownersRes = await db.collection('owners').where({ _id: _.in(ownerIds) }).get();
      (ownersRes.data || []).forEach(o => { ownerMap[o._id] = o; });
    }
    const groupMap = {};
    bills.forEach(b => {
      const o = b.ownerId ? ownerMap[b.ownerId] : null;
      if (o) {
        b.ownerName = b.ownerName || o.name;
        b.fullRoomNo = b.fullRoomNo || o.fullRoomNo;
        b.area = b.area || o.area;
        b.phone = o.phone || '';
      }
      const key = b.ownerId || 'unknown';
      if (!groupMap[key]) {
        groupMap[key] = {
          ownerId: b.ownerId,
          ownerName: b.ownerName || '',
          fullRoomNo: b.fullRoomNo || '',
          phone: b.phone || '',
          area: b.area || 0,
          bills: [],
          totalUnpaid: 0
        };
      }
      groupMap[key].bills.push(b);
      const amount = Number(b.amount) || 0;
      const paid = Number(b.paidAmount) || 0;
      groupMap[key].totalUnpaid += (amount - paid);
    });
    const notices = Object.values(groupMap).map(g => ({
      ...g,
      totalUnpaid: Math.round(g.totalUnpaid * 100) / 100
    }));
    const html = buildBatchNoticeHTML(notices);
    return success(html);
  } catch (e) {
    console.error('生成催缴通知单失败:', e);
    return error('生成催缴通知单失败: ' + e.message);
  }
}

function buildBatchNoticeHTML(notices) {
  const billTypeMap = { property: '物业费', elevator: '电梯费', parking: '车位费' };
  const today = new Date().toLocaleDateString('zh-CN');

  function buildSingleCard(notice) {
    const rows = notice.bills.map(b => {
      const billTypeName = billTypeMap[b.billType] || b.billType || '';
      const amount = Number(b.amount) || 0;
      const paid = Number(b.paidAmount) || 0;
      const unpaid = amount - paid;
      return `<tr>
        <td>${billTypeName}</td>
        <td>${b.period || ''}</td>
        <td>¥${unpaid.toFixed(2)}</td>
      </tr>`;
    }).join('');

    return `<div class="notice-card">
      <div class="card-header">
        <div class="card-title">物业催缴通知单</div>
        <div class="card-date">${today}</div>
      </div>
      <div class="card-body">
        <div class="info-row">
          <span class="info-label">业主姓名：</span>
          <span class="info-value">${notice.ownerName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">房号：</span>
          <span class="info-value">${notice.fullRoomNo}</span>
        </div>
        <div class="info-row">
          <span class="info-label">联系电话：</span>
          <span class="info-value">${notice.phone || '-'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">房屋面积：</span>
          <span class="info-value">${Number(notice.area || 0).toFixed(2)} ㎡</span>
        </div>
        <table class="bill-table">
          <thead>
            <tr>
              <th>费用类型</th>
              <th>计费周期</th>
              <th>欠缴金额</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        <div class="total-row">
          <span class="total-label">合计欠缴：</span>
          <span class="total-amount">¥${notice.totalUnpaid.toFixed(2)}</span>
        </div>
        <div class="tip-text">
          请您尽快到物业服务中心缴纳欠费，逾期未缴将按相关规定收取滞纳金。
        </div>
      </div>
      <div class="card-footer">
        <div>得心物业管理有限公司</div>
      </div>
    </div>`;
  }

  const cards = notices.map(n => buildSingleCard(n)).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>批量催缴通知单</title>
<style>
@page { size: A4; margin: 10mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Microsoft YaHei', 'SimSun', sans-serif;
  color: #333;
  font-size: 12px;
}
.page {
  width: 190mm;
  min-height: 277mm;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 8mm;
  padding: 5mm 0;
  page-break-after: always;
}
.page:last-child {
  page-break-after: avoid;
}
.notice-card {
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.card-header {
  background: linear-gradient(135deg, #dc2626, #b91c1c);
  color: #fff;
  padding: 8px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.card-title {
  font-size: 15px;
  font-weight: bold;
  letter-spacing: 2px;
}
.card-date {
  font-size: 11px;
  opacity: 0.9;
}
.card-body {
  padding: 10px 12px;
  flex: 1;
}
.info-row {
  display: flex;
  margin-bottom: 6px;
  font-size: 12px;
}
.info-label {
  color: #666;
  min-width: 70px;
}
.info-value {
  color: #1d1d1f;
  font-weight: 500;
}
.bill-table {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 11px;
}
.bill-table th, .bill-table td {
  border: 1px solid #ddd;
  padding: 5px 4px;
  text-align: center;
}
.bill-table th {
  background: #f5f5f5;
  font-weight: 600;
}
.total-row {
  text-align: right;
  margin: 8px 0;
  font-size: 13px;
}
.total-label {
  color: #666;
}
.total-amount {
  color: #dc2626;
  font-weight: bold;
  font-size: 16px;
}
.tip-text {
  font-size: 11px;
  color: #666;
  line-height: 1.5;
  margin-top: 6px;
}
.card-footer {
  border-top: 1px solid #eee;
  padding: 6px 12px;
  text-align: right;
  font-size: 11px;
  color: #666;
  background: #fafafa;
}
@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
</style>
</head>
<body>
${chunkArray(notices, 4).map((chunk, pageIdx) => `
  <div class="page">
    ${chunk.map(n => buildSingleCard(n)).join('')}
  </div>
`).join('')}
</body>
</html>`;
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ======================== 数据备份/恢复 ========================

/**
 * GET /api/backup/export - 导出全部数据（仅 super_admin）
 * 返回所有集合的完整数据快照
 */
async function backupExport(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (user.role !== 'super_admin') return forbidden();
  try {
    const collections = ['owners', 'rooms', 'bills', 'parking_spots', 'buildings', 'users', 'finance_records'];
    const snapshot = {};
    for (const name of collections) {
      try {
        const res = await db.collection(name).limit(1000).get();
        snapshot[name] = res.data || [];
      } catch (e) {
        // 集合可能不存在，跳过
        snapshot[name] = [];
      }
    }
    const backupInfo = {
      exportTime: new Date().toISOString(),
      envId: ENV_ID,
      exporter: user.username,
      totalRecords: Object.values(snapshot).reduce((s, arr) => s + arr.length, 0)
    };
    return success({ backupInfo, snapshot });
  } catch (e) {
    console.error('数据导出失败:', e);
    return error('数据导出失败: ' + e.message);
  }
}

/**
 * POST /api/backup/restore - 从备份恢复数据（仅 super_admin）
 * body: { snapshot: {...} }
 * 注意：恢复操作会清空目标集合并重新写入
 */
async function backupRestore(event) {
  const user = verifyToken(event);
  if (!user) return unauthorized();
  if (user.role !== 'super_admin') return forbidden();
  const body = getBody(event);
  const snapshot = body.snapshot;
  if (!snapshot || typeof snapshot !== 'object') return error('备份数据格式不正确');
  try {
    const results = {};
    for (const name of Object.keys(snapshot)) {
      try {
        // 先清空集合
        const existing = await db.collection(name).limit(1000).get();
        for (const doc of (existing.data || [])) {
          await db.collection(name).doc(doc._id).remove();
        }
        // 逐条写入备份数据（去除 _id 让数据库自动生成）
        let count = 0;
        for (const doc of snapshot[name]) {
          const { _id, ...data } = doc;
          await db.collection(name).add(data);
          count++;
        }
        results[name] = count;
      } catch (e) {
        results[name] = '失败: ' + e.message;
      }
    }
    return success({ message: '恢复完成', details: results });
  } catch (e) {
    console.error('数据恢复失败:', e);
    return error('数据恢复失败: ' + e.message);
  }
}

// ======================== 路由 ========================

/**
 * 路由分发
 * @param {string} path  请求路径
 * @param {string} method HTTP 方法
 * @param {object} event  事件对象
 */
async function router(path, method, event) {
  const parts = path.split('/').filter(Boolean); // ['api', 'owners', ...]
  // 去掉 'api' 前缀
  const segs = parts.slice(1);
  const m0 = segs[0] || '';
  const m1 = segs[1] || '';
  const m2 = segs[2] || '';

  // ---------- 认证 ----------
  if (m0 === 'auth') {
    if (m1 === 'login' && method === 'POST') return authLogin(event);
    if (m1 === 'profile' && method === 'GET') return authProfile(event);
    if (m1 === 'change-password' && method === 'POST') return authChangePassword(event);
    return error('接口不存在');
  }

  // ---------- 业主管理 ----------
  if (m0 === 'owners') {
    if (!m1 && method === 'GET') return ownersList(event);
    if (m1 === 'statistics' && method === 'GET') return ownersStatistics(event);
    if (!m1 && method === 'POST') return ownerCreate(event);
    if (m1 === 'batch' && method === 'POST') return ownersBatch(event);
    if (m1 === 'clear' && method === 'DELETE') return ownersClear(event);
    if (m1 === 'fix-data' && method === 'POST') return ownersFixData(event);
    if (m1 && m1 !== 'statistics' && m1 !== 'batch' && m1 !== 'clear' && m1 !== 'fix-data' && method === 'GET') return ownerDetail(event, m1);
    if (m1 && m1 !== 'statistics' && m1 !== 'batch' && m1 !== 'clear' && m1 !== 'fix-data' && method === 'PUT') return ownerUpdate(event, m1);
    if (m1 && m1 !== 'statistics' && m1 !== 'batch' && m1 !== 'clear' && m1 !== 'fix-data' && method === 'DELETE') return ownerDelete(event, m1);
    return error('接口不存在');
  }

  // ---------- 房间管理 ----------
  if (m0 === 'rooms') {
    if (!m1 && method === 'GET') return roomsList(event);
    if (m1 === 'overview' && method === 'GET') return roomsOverview(event);
    if (m1 === 'statistics' && method === 'GET') return roomsStatistics(event);
    if (m1 === 'batch' && method === 'POST') return roomsBatch(event);
    if (m1 && m1 !== 'overview' && m1 !== 'statistics' && m1 !== 'batch') {
      if (m2 === 'status' && method === 'PUT') return roomUpdateStatus(event, m1);
      if (!m2 && method === 'GET') return roomDetail(event, m1);
      if (!m2 && method === 'PUT') return roomUpdate(event, m1);
    }
    return error('接口不存在');
  }

  // ---------- 楼宇 ----------
  if (m0 === 'buildings') {
    if (!m1 && method === 'GET') return buildingsList(event);
    return error('接口不存在');
  }

  // ---------- 车位管理 ----------
  if (m0 === 'parking') {
    if (!m1 && method === 'GET') return parkingList(event);
    if (!m1 && method === 'POST') return parkingCreate(event);
    if (m1 === 'statistics' && method === 'GET') return parkingStatistics(event);
    if (m1 === 'batch' && method === 'POST') return parkingBatch(event);
    if (m1 && m1 !== 'statistics' && m1 !== 'batch') {
      if (m2 === 'bind' && method === 'PUT') return parkingBind(event, m1);
      if (m2 === 'unbind' && method === 'PUT') return parkingUnbind(event, m1);
      if (!m2 && method === 'GET') return parkingDetail(event, m1);
      if (!m2 && method === 'PUT') return parkingUpdate(event, m1);
      if (!m2 && method === 'DELETE') return parkingDelete(event, m1);
    }
    return error('接口不存在');
  }

  // ---------- 物业费账单 ----------
  if (m0 === 'bills') {
    if (!m1 && method === 'GET') return billsList(event);
    if (m1 === 'statistics' && method === 'GET') return billsStatistics(event);
    if (m1 === 'generate' && method === 'POST') return billsGenerate(event);
    if (m1 === 'batch' && method === 'POST') return billsBatch(event);
    if (m1 === 'batch-pay' && method === 'POST') return billsBatchPay(event);
    if (m1 === 'batch-delete' && method === 'POST') return billsBatchDelete(event);
    if (m1 === 'batch-print' && method === 'POST') return billsBatchPrint(event);
    if (m1 === 'mark-overdue' && method === 'POST') return billsMarkOverdue(event);
    if (m1 === 'notice' && method === 'POST') return billsNotice(event);
    if (m1 === 'owner' && m2 && method === 'GET') return billsByOwner(event, m2);
    if (m1 && m1 !== 'statistics' && m1 !== 'generate' && m1 !== 'batch' && m1 !== 'batch-pay' && m1 !== 'batch-delete' && m1 !== 'batch-print' && m1 !== 'mark-overdue' && m1 !== 'notice' && m1 !== 'owner') {
      if (m2 === 'pay' && method === 'PUT') return billPay(event, m1);
      if (!m2 && method === 'GET') return billDetail(event, m1);
      if (!m2 && method === 'DELETE') return billDelete(event, m1);
    }
    return error('接口不存在');
  }

  // ---------- 财务收支 ----------
  if (m0 === 'finance') {
    if (!m1 && method === 'GET') return financeList(event);
    if (m1 === 'report' && method === 'GET') return financeReport(event);
    if (!m1 && method === 'POST') return financeCreate(event);
    if (m1 && m1 !== 'report') {
      if (!m2 && method === 'GET') return financeDetail(event, m1);
      if (!m2 && method === 'PUT') return financeUpdate(event, m1);
      if (!m2 && method === 'DELETE') return financeDelete(event, m1);
    }
    return error('接口不存在');
  }

  // ---------- 系统设置 ----------
  if (m0 === 'settings') {
    if (m1 === 'fee' && method === 'GET') return settingsGetFee(event);
    if (m1 === 'fee' && method === 'PUT') return settingsUpdateFee(event);
    return error('接口不存在');
  }

  // ---------- 用户管理 ----------
  if (m0 === 'users') {
    if (!m1 && method === 'GET') return usersList(event);
    if (!m1 && method === 'POST') return userCreate(event);
    if (m1) {
      if (m2 === 'password' && method === 'PUT') return userResetPassword(event, m1);
      if (!m2 && method === 'PUT') return userUpdate(event, m1);
      if (!m2 && method === 'DELETE') return userDelete(event, m1);
    }
    return error('接口不存在');
  }

  // ---------- 打印 ----------
  if (m0 === 'print') {
    if (m1 === 'receipt' && m2 && method === 'GET') return printReceipt(event, m2);
    if (m1 === 'receipts' && method === 'POST') return printReceipts(event);
    if (m1 === 'notice' && method === 'POST') return printNotice(event);
    return error('接口不存在');
  }

  // ---------- 数据备份/恢复 ----------
  if (m0 === 'backup') {
    if (m1 === 'export' && method === 'GET') return backupExport(event);
    if (m1 === 'restore' && method === 'POST') return backupRestore(event);
    return error('接口不存在');
  }

  return error('接口不存在: ' + path);
}

// ======================== 云函数入口 ========================

exports.main = async (event, context) => {
  // CORS 预检请求直接返回 200
  const method = (event.httpMethod || event.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const path = getPath(event);
  console.log('请求:', method, path);

  try {
    // 公开接口：仅登录
    const isPublic = (path === '/api/auth/login' && method === 'POST');
    if (!isPublic) {
      const user = verifyToken(event);
      if (!user) return unauthorized();
    }
    return await router(path, method, event);
  } catch (e) {
    console.error('处理请求异常:', e);
    return error('服务器异常: ' + e.message);
  }
};
