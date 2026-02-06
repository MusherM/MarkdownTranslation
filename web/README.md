# Markdown Translate Web

一个优雅、设计感的纯前端 Vue3 Web 界面，用于 Markdown 文档翻译。

## 功能特性

- **配置管理**：设置 API 地址、API Key 和模型名称，自动保存到 localStorage
- **Markdown 翻译**：支持单个/多个 Markdown 文件上传和翻译
- **Glossary 管理**：可视化编辑词汇表，支持导入/导出（Replace/Merge 策略）
- **实时进度**：翻译进度实时显示，支持批量翻译队列
- **响应式设计**：适配桌面端和移动端

## 技术栈

- **Vue 3** + **Vite** + **TypeScript**
- **Tailwind CSS** + **Shadcn Vue**
- **Pinia** 状态管理
- **pnpm** 包管理

## 快速开始

### 安装依赖

```bash
cd web
pnpm install
```

### 开发模式

```bash
pnpm run dev
```

访问 http://localhost:5173

### 构建生产版本

```bash
pnpm run build
```

构建输出在 `dist/` 目录。

## 使用说明

### 1. 配置 API

首次使用需要配置 API 信息：

1. 点击左侧导航"配置"
2. 填写 Base URL（如：https://api.openai.com/v1）
3. 填写 API Key
4. 填写模型名称（如：gpt-4o-mini）
5. 点击"测试连接"验证配置

**注意**：API Key 存储在浏览器 localStorage 中，请注意安全。

### 2. 管理词汇表

1. 点击左侧导航"词汇表"
2. 添加常用术语翻译：
   - 在底部输入框输入源语言和目标语言
   - 点击"添加词条"
3. 导入现有词汇表：
   - 点击"导入"按钮
   - 选择 JSON 文件
   - 选择策略（Replace：完全替换；Merge：合并覆盖）
4. 导出词汇表：
   - 点击"导出"按钮
   - 下载 glossary-YYYY-MM-DD.json 文件

### 3. 翻译文档

1. 点击左侧导航"翻译"
2. 拖拽或点击上传 Markdown 文件（支持 .md, .markdown, .txt）
3. 点击"开始翻译"按钮
4. 等待翻译完成，查看左右分栏预览
5. 点击"下载"按钮保存翻译结果

**批量翻译**：支持同时上传多个文件，系统会按顺序翻译。

## CORS 代理配置

由于浏览器安全限制，直接调用某些 API 可能会遇到 CORS 错误。

**解决方案**：

1. 使用支持 CORS 的代理服务器（如 Cloudflare Worker）
2. 在配置中设置代理 URL
3. 联系 API 提供商启用 CORS

示例代理配置请参考相关文档。

## 项目结构

```
web/
├── src/
│   ├── components/
│   │   ├── custom/          # 自定义业务组件
│   │   │   ├── FileUpload.vue
│   │   │   ├── GlossaryEditor.vue
│   │   │   ├── TranslationProgress.vue
│   │   │   ├── ConfigForm.vue
│   │   │   └── ToastProvider.vue
│   │   └── ui/              # Shadcn 组件
│   ├── views/               # 页面视图
│   │   ├── TranslateView.vue
│   │   ├── GlossaryView.vue
│   │   └── ConfigView.vue
│   ├── stores/              # Pinia 状态管理
│   │   ├── configStore.ts
│   │   └── glossaryStore.ts
│   ├── services/            # 核心服务
│   │   ├── translator.ts    # 翻译引擎
│   │   └── openai.ts        # API 调用
│   ├── layouts/             # 布局组件
│   │   └── AppLayout.vue
│   └── router/              # 路由配置
│       └── index.ts
├── components.json          # Shadcn 配置
├── tailwind.config.js       # Tailwind 配置
└── package.json
```

## 核心功能实现

### 翻译流程

1. 使用 `remark` 解析 Markdown 为 AST
2. 提取文本节点进行批量翻译
3. 使用 glossary 进行术语一致性检查
4. 重试机制确保翻译质量
5. 将翻译后的文本写回 AST
6. 序列化为 Markdown 输出

### 词汇表管理

- 自动保存到 localStorage（防抖 500ms）
- 支持导入/导出 JSON 格式
- Replace/Merge 两种导入策略
- 实时搜索过滤

### 配置管理

- 自动保存到 localStorage
- 表单验证（URL 格式、必填项）
- 测试连接功能

## 浏览器兼容性

- Chrome 90+
- Firefox 90+
- Safari 14+
- Edge 90+

## 注意事项

1. **API Key 安全**：存储在 localStorage 中，建议使用专用 Key，避免使用主账户 Key
2. **大文件处理**：超大文件（>1MB）可能需要较长时间翻译
3. **网络要求**：需要稳定的网络连接，翻译过程中请勿关闭页面

## License

MIT
