# 德馨苑物业管理平台 - 后端启动指南

> 本文件是给"不懂编程但电脑操作熟练"的物业管理人员看的，按步骤照做即可。

## 一、项目结构

```
backend/                  ← 后端项目（NestJS + TypeORM）
  ├── .env                ← 环境配置（数据库、管理员账号等，改这里）
  ├── src/                ← 源代码（不用动）
  ├── data/               ← SQLite 数据库文件（自动生成，开发用）
  ├── dist/               ← 编译产物（自动生成）
  └── package.json
```

## 二、在 Cloud Studio 中启动（开箱即用）

### 第 1 步：打开终端
在 Cloud Studio 顶部菜单：终端 → 新建终端

### 第 2 步：进入后端目录
```bash
cd backend
```

### 第 3 步：首次运行——安装依赖（只需第一次）
```bash
npm install
```
> 等待 1-2 分钟，看到 "added xxx packages" 即成功。以后再启动不用重复此步。

### 第 4 步：启动服务
```bash
npm run start:dev
```
> 看到下面这段日志就说明启动成功：
> ```
> [Bootstrap] 物业管理系统后端已启动
> [Bootstrap] 接口地址:    http://localhost:3000/api
> [Bootstrap] 接口文档:    http://localhost:3000/api-docs
> [Bootstrap] 默认管理员:  admin / admin123
> ```

### 第 5 步：访问接口文档（Swagger）
在 Cloud Studio 里点"端口"面板，打开 3000 端口的预览，然后地址栏加上 `/api-docs`，即：
```
https://<你的云工作室地址>/api-docs
```
在这里可以直接看到所有接口、点击测试，不用写代码。

### 默认账号
- 用户名：`admin`
- 密码：`admin123`
- 角色：超级管理员（拥有全部权限）
> ⚠️ 上线前请务必修改密码（登录后在"修改密码"接口操作），或在 `.env` 里改 `ADMIN_PASSWORD` 后重新初始化。

## 三、数据库说明（重要）

本项目**默认使用 SQLite**，无需安装任何数据库，`data/` 目录会自动生成一个 `.db` 文件，开箱即用。
适合：开发、演示、小规模使用（几百户以内完全够用）。

### 切换到 MySQL（腾讯云部署时用）

1. 在腾讯云开通 MySQL（见下一节）
2. 编辑 `backend/.env`，把 `DB_TYPE` 改成 `mysql`，并填写连接信息：
   ```env
   DB_TYPE=mysql
   DB_MYSQL_HOST=xxxxxxxxxx   # 腾讯云 MySQL 内网地址
   DB_MYSQL_PORT=3306
   DB_MYSQL_USERNAME=root
   DB_MYSQL_PASSWORD=你的密码
   DB_MYSQL_DATABASE=dxy_property
   ```
3. 重新 `npm run start:dev`，系统会自动建表 + 初始化数据（首次）。

> 切换数据库后，原 SQLite 里的数据不会自动迁移。生产环境请直接用 MySQL。

## 四、腾讯云 MySQL 开通步骤（获取密钥）

### 1. 开通云数据库 MySQL
- 登录腾讯云控制台：https://console.cloud.tencent.com/
- 顶部搜索"云数据库 MySQL"或进入：数据库 → MySQL
- 点"新建"，推荐配置：
  - 计费模式：按量计费（先试便宜）
  - 地域：选离你最近的（如广州、上海、北京）
  - 数据库版本：MySQL 8.0
  - 实例规格：1核2G（物业系统足够，后续可升级）
  - 存储空间：50GB
- 设置 root 密码：**请记牢这个密码**（这就是 `DB_MYSQL_PASSWORD`）

### 2. 创建业务数据库
- 实例创建完成后，点实例名进入详情
- 左侧"数据库管理" → "创建数据库"，名称填 `dxy_property`，字符集选 `utf8mb4`

### 3. 获取连接地址（这就是 DB_MYSQL_HOST）
- 实例详情页 → "实例详情" → 找到"内网地址"，形如：
  `gz-cdb-xxx.sql.tencentcdb.com`
- 端口默认 3306

### 4. 开放访问（重要）
- 如果后端部署在腾讯云 CVM/Cloud Studio 上，且与 MySQL 同地域同 VPC：用内网地址即可，无需额外配置
- 如果要从本地电脑连接：需在"安全组"开放 3306 端口，并开启外网访问（生产环境不建议）

### 5. 把地址填进 .env
按上面拿到的信息填到 `backend/.env`，然后重启服务即可。

## 五、所有接口清单（共 40+ 个，全部已实现）

> 完整可测文档地址：`http://localhost:3000/api-docs`

所有接口统一前缀 `/api`，统一返回格式：
```json
{ "code": 0, "message": "success", "data": {...} }
```
`code=0` 表示成功，非 0 表示错误。分页接口额外返回 `total`、`page`、`pageSize`。

### 1. 认证登录（Auth）
| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| POST | /api/auth/login | 管理员登录，返回 JWT token | 公开 |
| GET  | /api/auth/profile | 获取当前登录用户信息 | 需登录 |
| POST | /api/auth/change-password | 修改自己的密码 | 需登录 |

> 登录后，后续所有请求都要在 Header 加：`Authorization: Bearer <token>`

### 2. 管理员账号（Users，仅超管）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET    | /api/users | 管理员列表 |
| POST   | /api/users | 新增管理员（角色：super_admin/admin/finance）|
| PUT    | /api/users/:id | 修改管理员信息 |
| PUT    | /api/users/:id/password | 重置密码 |
| DELETE | /api/users/:id | 删除管理员 |

### 3. 业主信息（Owners，一户一档）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET    | /api/owners | 业主列表（支持 keyword/buildingNo/status 筛选）|
| GET    | /api/owners/statistics | 业主统计 |
| GET    | /api/owners/:id | 业主详情 |
| POST   | /api/owners | 新增业主（自动同步房间状态）|
| PUT    | /api/owners/:id | 修改业主 |
| DELETE | /api/owners/:id | 删除业主（房间恢复空置）|

### 4. 楼栋管理（Buildings）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET    | /api/buildings | 楼栋列表（已内置 7 栋）|
| GET    | /api/buildings/:buildingNo | 楼栋详情 |
| POST   | /api/buildings | 新增楼栋 |
| PUT    | /api/buildings/:buildingNo | 修改楼栋 |
| DELETE | /api/buildings/:buildingNo | 删除楼栋 |
| POST   | /api/buildings/:buildingNo/generate-rooms | 按配置生成房间 |
| POST   | /api/buildings/generate-all-rooms | 一键生成所有楼栋房间 |

### 5. 房间管理 / 楼宇预览（Rooms）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/rooms/overview | **楼宇预览平面图**（7 栋楼每户状态聚合，前端画平面图用）|
| GET | /api/rooms/statistics | 房间统计（各状态/各楼栋数量）|
| GET | /api/rooms | 房间列表（分页/筛选）|
| GET | /api/rooms/:id | 房间详情 |
| PUT | /api/rooms/:id/status | 修改房间状态 |
| PUT | /api/rooms/:id/area | 修改房间面积 |

### 6. 车位管理（Parking）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET    | /api/parking | 车位列表 |
| GET    | /api/parking/statistics | 车位统计 |
| GET    | /api/parking/:id | 车位详情 |
| POST   | /api/parking | 新增车位 |
| POST   | /api/parking/batch | 批量新增车位 |
| PUT    | /api/parking/:id | 修改车位 |
| PUT    | /api/parking/:id/bind | **绑定业主**（sold/rented/reserved）|
| PUT    | /api/parking/:id/unbind | 解绑业主 |
| DELETE | /api/parking/:id | 删除车位 |

### 7. 物业费账单（Bills）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET    | /api/bills | 账单列表（billType/status/period/ownerId 筛选）|
| GET    | /api/bills/statistics | **账单统计**（应缴/实缴/欠费，按状态/类型/周期）|
| GET    | /api/bills/owner/:ownerId | 某业主的历史账单 |
| GET    | /api/bills/:id | 账单详情 |
| POST   | /api/bills/generate | **批量生成账单**（物业费=面积×单价×月数；电梯费=单价×月数；停车费=单价×月数）|
| PUT    | /api/bills/:id/pay | 单个缴费（自动联动财务收支表）|
| POST   | /api/bills/batch-pay | 批量缴费 |
| POST   | /api/bills/mark-overdue | 一键标记逾期 |
| POST   | /api/bills/notice | 生成催缴通知单数据（按业主合并）|
| DELETE | /api/bills/:id | 删除账单 |

### 8. 财务收支（Finance）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET    | /api/finance | 收支记录列表 |
| GET    | /api/finance/report | **财务报表**（收支汇总/分类/月度趋势）|
| GET    | /api/finance/:id | 记录详情 |
| POST   | /api/finance | 新增收支记录 |
| PUT    | /api/finance/:id | 修改记录 |
| DELETE | /api/finance/:id | 删除记录 |

### 9. 打印（Print）
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/print/notice | **催缴通知单 HTML**（浏览器直接打印，支持批量）|
| GET  | /api/print/receipt/:id | 单个缴费收据 HTML |
| POST | /api/print/receipts | 批量缴费收据 HTML |

## 六、微信小程序对接说明（未来用）

后端已预留好，小程序直接调用同一套接口即可，注意 3 点：
1. 所有接口前缀 `/api`，统一 JSON 格式
2. 登录拿 token 后，每次请求 Header 带 `Authorization: Bearer <token>`
3. 小程序端需要在 `app.js` 配置一个 baseURL（后端公网地址）

后续做小程序时，只需：
- 给小程序单独加一个"业主端登录"接口（用业主手机号+验证码，复用现有业主表）
- 小程序复用 `/api/bills/owner/:ownerId`、`/api/parking` 等接口即可

## 七、角色权限说明

| 角色 | 代号 | 权限 |
|------|------|------|
| 超级管理员 | super_admin | 全部权限（含管理员账号管理、删除楼栋）|
| 物业管理员 | admin | 业主/车位/账单/财务的增删改查 |
| 财务 | finance | 仅账单缴费、财务收支（不能改业主/车位）|

## 八、常用运维命令

```bash
cd backend

# 开发模式（自动重启，改代码后自动生效）
npm run start:dev

# 生产模式（先编译再启动，性能更好）
npm run build
npm run start:prod

# 切换数据库：编辑 .env 里的 DB_TYPE 后重启即可
```

## 九、已内置的初始数据（首次启动自动创建）

- 管理员：admin / admin123（super_admin）
- 7 栋楼：1-3 号楼（2单元×18层×4户=144户/栋），4-7 号楼（2单元×15层×4户=120户/栋）
- 房间总数：912 套（全部初始为"未售 unsold"）
- 示例车位：A 区地下车位 50 个（A-001 ~ A-050，月租 300 元）

## 十、业务流程速查

### 物业费收缴完整流程
1. **登记业主**：`POST /api/owners`（填姓名、电话、楼栋房号、面积）→ 房间自动变"自住/出租"
2. **生成账单**：`POST /api/bills/generate`（选物业费/电梯费，填周期、单价、月数）→ 每户自动生成一条
3. **催缴**：`POST /api/print/notice` 传欠费账单ID → 浏览器打印催缴单
4. **收费**：`PUT /api/bills/:id/pay` 填实缴金额 → 自动记入财务收支表
5. **查报表**：`GET /api/bills/statistics` 看收缴率；`GET /api/finance/report` 看收支汇总

### 车位管理流程
1. `POST /api/parking/batch` 批量建车位
2. `PUT /api/parking/:id/bind` 把车位绑给业主（已售/已租）
3. `POST /api/bills/generate`（billType=parking）生成停车费账单
