# Draft: Markdown Translate Web Frontend

## 项目概览
- **目标**: 为 markdown-translate CLI 工具创建一个优雅、设计感的纯前端 Vue3 Web 界面
- **技术栈**: Vue 3 + Vite + TypeScript + Tailwind CSS
- **核心功能**: Markdown 翻译 + Glossary 管理 + 配置管理

## 核心需求确认

### 功能需求
1. **配置管理**
   - baseurl: API 基础 URL
   - apikey: API 密钥
   - modelname: 模型名称
   - 自动保存到 localStorage

2. **Markdown 翻译**
   - 上传单个 Markdown 文件
   - 上传多个 Markdown 文件（批量）
   - 实时翻译进度显示
   - 翻译结果预览
   - 下载翻译后的文件

3. **Glossary 管理**
   - 上传 glossary JSON 文件
   - 如果已存在词汇表，提供策略选择：
     - 替换（Replace）：完全覆盖现有词汇表
     - 合并（Merge）：合并新旧词汇表（新词覆盖旧词）
   - 通过输入框手动编辑 glossary
   - 导出 glossary 为 JSON 格式（与 glossary.jsonc 一致）
   - 每次输入后自动保存到 localStorage
   - 支持 Key-Value 对的可视化编辑

4. **翻译流程**
   - 复用 CLI 的翻译逻辑
   - 在浏览器中运行（使用 remark 等库）
   - 流式进度更新
   - 错误处理和重试机制

### 技术架构

#### 项目结构
```
web/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── src/
│   ├── main.ts                 # 应用入口
│   ├── App.vue                 # 根组件
│   ├── router/                 # 路由（单页面应用，可能不需要复杂路由）
│   │   └── index.ts
│   ├── components/             # 通用组件
│   │   ├── Button/
│   │   ├── Input/
│   │   ├── Card/
│   │   ├── Modal/
│   │   ├── Progress/
│   │   ├── FileUpload/
│   │   └── GlossaryEditor/
│   ├── views/                  # 页面视图
│   │   ├── HomeView.vue
│   │   ├── TranslateView.vue
│   │   └── GlossaryView.vue
│   ├── composables/            # Vue 组合式函数
│   │   ├── useConfig.ts       # 配置管理
│   │   ├── useGlossary.ts     # Glossary 管理
│   │   ├── useTranslation.ts  # 翻译逻辑
│   │   └── useLocalStorage.ts # localStorage 封装
│   ├── stores/                 # 状态管理（使用 Pinia）
│   │   ├── configStore.ts
│   │   ├── glossaryStore.ts
│   │   └── translateStore.ts
│   ├── services/               # 核心服务（复用 CLI 逻辑）
│   │   ├── translator.ts      # 翻译引擎
│   │   ├── markdown.ts        # Markdown 处理
│   │   ├── openai.ts          # API 调用
│   │   └── glossary.ts        # Glossary 处理
│   ├── utils/                  # 工具函数
│   │   ├── jsonc.ts           # JSONC 解析
│   │   ├── storage.ts         # 存储工具
│   │   └── file.ts            # 文件处理
│   ├── types/                  # TypeScript 类型
│   │   └── index.ts
│   ├── styles/                 # 样式文件
│   │   └── main.css
│   └── assets/                 # 静态资源
└── public/
    └── prompts/                # 翻译提示词文件
        ├── translate.md
        └── glossary-judge.md
```

#### 核心模块设计

1. **配置模块 (useConfig)**
   - localStorage key: `md-translate-config`
   - 数据结构:
     ```typescript
     interface Config {
       baseUrl: string;
       apiKey: string;
       modelName: string;
     }
     ```
   - 自动保存: 使用 Vue watch 监听变化

2. **Glossary 模块 (useGlossary)**
   - localStorage key: `md-translate-glossary`
   - 数据结构:
     ```typescript
     interface Glossary {
       [sourceTerm: string]: string;  // source -> target
     }
     ```
   - 自动保存: 每次修改后 debounce 保存
   - 导入策略:
     - Replace: 直接替换整个对象
     - Merge: Object.assign(existing, new)

3. **翻译模块 (useTranslation)**
   - 复用 CLI 的 translate.js 逻辑
   - 需要浏览器兼容的修改:
     - 移除 fs/promises 依赖
     - 使用 Web Streams API
     - 使用 fetch 替代 node 的 fetch
   - 进度回调: 通过 reactive 对象实时更新
   - 批量处理: 支持队列和并发控制

#### UI 设计方向

参考设计系统:
- 简洁现代的卡片式布局
- 柔和的阴影和圆角
- 渐变色点缀
- 流畅的过渡动画
- 清晰的视觉层次

关键页面:
1. **首页/仪表盘**
   - 快速开始区域（拖拽上传）
   - 最近翻译历史
   - 配置状态概览

2. **翻译页面**
   - 文件上传区（支持拖拽）
   - 进度显示（进度条 + 文件列表状态）
   - 实时预览面板（源文件 / 翻译结果）
   - 下载按钮

3. **Glossary 管理页面**
   - 表格/列表视图（可编辑）
   - 导入/导出按钮
   - 添加新词条表单
   - 搜索/过滤功能

4. **配置页面**
   - 表单输入（带验证）
   - 测试连接按钮
   - 默认值提示

## 从 CLI 迁移的核心逻辑

### 1. translate.js -> translator.ts
主要修改:
- 移除文件系统依赖
- 使用纯字符串输入/输出
- 保持 AST 翻译逻辑不变

### 2. openai.js -> openai.ts
主要修改:
- 浏览器环境已支持 fetch，无需修改
- 可能需要添加 CORS 代理说明

### 3. glossary.js -> glossary.ts
主要修改:
- 从 localStorage 读取
- 合并策略逻辑
- 导出为 JSON Blob

### 4. config.js -> config.ts
主要修改:
- 从 localStorage 读取
- 移除文件系统依赖
- 移除环境变量支持

## 需要确认的问题

1. 是否需要支持多语言界面？（当前假设只需中文）
2. 是否需要支持暗黑模式？
3. 是否需要在浏览器中支持完整的 CLI 功能（如温度、max_tokens 等高级参数）？
4. 是否需要翻译历史记录功能？
5. 是否需要支持文件夹上传（整个目录）？
6. 设计偏好：更偏向哪种风格？（Apple-like / Material Design / 其他）

## 技术选型

- **构建工具**: Vite（快速、现代）
- **UI 框架**: Vue 3 + Composition API
- **样式**: Tailwind CSS（原子化、灵活）
- **状态管理**: Pinia（Vue 官方推荐）
- **图标**: Lucide Vue（简洁现代）
- **Markdown 处理**: 复用现有 remark 生态
- **TypeScript**: 完整类型支持

## 执行计划

### Phase 1: 基础架构
1. 初始化 Vue 3 + Vite + TypeScript 项目
2. 配置 Tailwind CSS 和基础样式系统
3. 设置 Pinia 状态管理
4. 创建基础组件库

### Phase 2: 核心服务
1. 实现 configStore（配置管理）
2. 实现 glossaryStore（词汇表管理）
3. 迁移 translate.js 到浏览器环境
4. 实现 openai.ts API 调用

### Phase 3: UI 页面
1. 配置页面
2. Glossary 管理页面
3. 翻译页面（文件上传、进度、预览）

### Phase 4: 集成与优化
1. 页面间导航和状态同步
2. 错误处理和用户反馈
3. 响应式布局适配
4. 动画和过渡效果

## 设计亮点建议

1. **拖拽上传区域**: 大面积虚线边框，支持文件拖入
2. **实时预览**: 左右分栏，源 Markdown 和翻译结果同步滚动
3. **词汇表编辑器**: Excel-like 的可编辑表格，支持快速添加
4. **进度可视化**: 优雅的进度条和文件状态指示器
5. **Toast 通知**: 操作成功/失败的轻量级提示
6. **空状态设计**: 无文件时的引导性插图和文字
7. **微交互**: 悬停效果、按钮动效、加载动画
