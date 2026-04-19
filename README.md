# MARTA 实时公交追踪

## 项目结构

```
marta-tracker/
├── server/
│   └── index.js          # Node.js 后端代理（解析 GTFS-RT protobuf）
├── public/
│   ├── index.html        # 前端页面
│   ├── css/style.css     # 样式
│   └── js/app.js         # 地图逻辑 + API 调用
├── package.json
└── README.md
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动服务器

```bash
# 开发模式（自动重启）
npm run dev

# 生产模式
npm start
```

### 3. 访问网站

打开浏览器访问 http://localhost:3000

---

## 功能说明

- **实时位置**：每 15 秒自动刷新 MARTA 公交车位置
- **地图显示**：蓝色=行驶中，绿色=停靠中
- **筛选**：按线路、状态、车辆ID搜索
- **车辆详情**：点击任意车辆查看速度、方向、即将到站信息

## API 接口

| 接口 | 说明 |
|------|------|
| `GET /api/vehicles` | 所有车辆位置 |
| `GET /api/vehicles/:id` | 单辆车详情 |
| `GET /api/stats` | 统计信息 |

## 部署到 Vercel

```bash
npm i -g vercel
vercel
```

> 注意：需要创建 `vercel.json` 将请求路由到 `server/index.js`

## 部署到 Railway

1. 把项目 push 到 GitHub
2. 在 Railway 新建项目，连接 GitHub 仓库
3. 自动识别 Node.js 并部署
