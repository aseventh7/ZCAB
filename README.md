# 德馨苑物业管理平台 - 代码备份

## 项目结构

```
zcab-backup/
├── dexin-api/              # 腾讯云云函数后端
│   ├── index.js            # 主API（含数据修复、账单、批量打印等）
│   ├── cloudbaserc.json    # 云函数部署配置
│   ├── package.json        # 依赖配置
│   └── package-lock.json   # 依赖锁定
├── fe-fix/assets/          # 前端修复后的资源文件
│   ├── index-DrzOAkCY.js   # 楼宇预览页面（3列布局 + 业主信息联动）
│   ├── index-Omr9NHT2.js   # 系统设置页面（物业费配置后端持久化）
│   └── index-CV9nttdp.js   # 账单管理页面（批量打印功能）
└── scripts/
    └── test-deployed.py    # 部署后功能验证脚本
```

## 部署信息

- **腾讯云环境ID**: `zcab-d2g3mo1qqaf40aab1`
- **后端API**: `https://zcab-d2g3mo1qqaf40aab1.service.tcloudbase.com/api`
- **前端静态托管**: `https://zcab-d2g3mo1qqaf40aab1-1456691585.tcloudbaseapp.com`

## 后端核心接口

- `POST /api/auth/login` - 登录
- `GET /api/rooms/overview` - 楼宇预览数据（含 ownerId/ownerName 联动）
- `GET /api/rooms/stats` - 房间统计
- `GET /api/owners/stats` - 业主统计
- `GET/PUT /api/settings/fee` - 物业费配置（后端持久化）
- `POST /api/bills/generate` - 生成账单（支持 dryRun 预览）
- `POST /api/bills/batch-print` - 批量打印 HTML（4个/A4页）
- `POST /api/bills/batch-delete` - 批量删除账单
- `POST /api/owners/fix-data` - 数据去重修复

## 前端关键修复

### 楼宇预览 (index-DrzOAkCY.js)
- 楼栋排序: `["1","4","5","2","3","7","6"]` 实现 3 列布局（左1/2、中3/4/5、右6/7）
- 使用 `ownerId` 关联欠费金额（精确匹配，避免姓名重复问题）
- 门市独立显示，每栋楼下单独区块
- 鼠标悬停显示: 房号 · 业主名 · 欠费金额
- 点击方块弹出详情弹窗（非跳转列表）

### 系统设置 (index-Omr9NHT2.js)
- 物业费配置从 localStorage 迁移到后端 `/api/settings/fee` 接口
- 数据持久化，刷新页面不丢失

### 账单管理 (index-CV9nttdp.js)
- 新增 `Ae` 函数调用 `/api/bills/batch-print` 实现欠费账单批量打印
- 4 个账单/A4 页的 HTML 排版

## 门市编码规则

`8 + 楼号 + 00 + 门号`

例: `87006`
- `8` = 门市标识
- `7` = 7号楼下方位置
- `00` = 占位符（5位数补位）
- `6` = 6号门

门市是一个整体（3层为一个业主买下），不需要单元/楼层分类。

## 数据统计

- 房间总数: 598（接近预期 600）
- 业主信息联动: 598/598（100%）
- 门市数量: 34
- 门市编码前缀: `8`

## 备份时间

2026-07-24
