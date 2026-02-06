

## 2025-02-06 - GlossaryView 词汇表管理页面实现

### 实现要点

#### 页面结构
```
GlossaryView.vue
├── 页面标题 + 导入/导出按钮
├── 添加新词条卡片 (Card)
│   ├── 源语言输入
│   ├── 目标语言输入
│   └── 添加按钮
└── 词条列表卡片 (Card)
    ├── 搜索框
    ├── 词条表格 (Table)
    │   ├── 源语言列
    │   ├── 目标语言列（可编辑）
    │   └── 操作列（删除）
    └── 底部统计/清空按钮
```

#### 技术实现
1. **可编辑表格**
   - 点击 target 列进入编辑模式
   - 内联编辑输入框 + 保存/取消按钮
   - 支持回车保存、ESC 取消
   - 使用 `editingEntry` ref 管理编辑状态

2. **添加词条**
   - 验证 source 不为空
   - 检查词条是否已存在
   - 回车键快捷添加

3. **导入功能**
   - 隐藏的文件输入框 (`<input type="file">`)
   - 策略选择对话框（Merge/Replace）
   - 复用 glossaryStore.importFromFile()

4. **导出功能**
   - 直接调用 glossaryStore.exportToFile()
   - 自动生成带日期的文件名

5. **搜索过滤**
   - 使用 computed `filteredEntries`
   - 同时搜索 source 和 target
   - 实时过滤，区分大小写

6. **删除确认**
   - Dialog 组件确认对话框
   - 显示要删除的词条名称
   - 支持批量清空（带二次确认）

#### 使用的 Shadcn 组件
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`
- `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`
- `Input`
- `Label`
- `Button`
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`

#### 图标组件
使用 h() 函数创建内联 SVG 图标：
- SearchIcon: 搜索框前缀
- PlusIcon: 添加按钮
- TrashIcon: 删除按钮
- UploadIcon: 导入按钮
- DownloadIcon: 导出按钮
- FileJsonIcon: 空状态提示

#### 路由配置
```typescript
{
  path: '/glossary',
  name: 'glossary',
  component: () => import('../views/GlossaryView.vue')
}
```

### 构建验证
- `pnpm run build` ✓
- 无 TypeScript 错误 ✓
- GlossaryView 懒加载 chunk: 18.60 kB

## 2026-02-06 - ConfigView 配置页面实现

### 实现要点

#### 页面结构
```
ConfigView.vue
├── 页面标题
├── API 配置卡片 (Card)
│   ├── Base URL 输入
│   ├── API Key 输入 (password)
│   ├── Model Name 输入
│   ├── 测试连接按钮
│   └── 恢复默认按钮
├── 安全提示卡片 (amber)
└── CORS 代理说明卡片 (blue)
```

#### 技术实现
1. **表单状态管理**
   - 使用本地 `form` 对象存储临时输入值
   - `@blur` 事件触发保存到 configStore
   - configStore 自动持久化到 localStorage

2. **表单验证**
   - baseUrl: 必填 + URL 格式验证
   - apiKey: 必填
   - modelName: 必填
   - 实时显示错误信息

3. **测试连接功能**
   - 调用 `chatCompletion()` 发送简单测试消息
   - 显示成功/失败提示
   - 正确处理 CORS 错误和超时错误

4. **安全设计**
   - API Key 使用 `type="password"` 隐藏
   - 安全提示卡片说明 localStorage 存储风险
   - 建议用户定期更换 API Key

5. **CORS 处理**
   - 专门的说明卡片解释 CORS 问题
   - 提供代理服务器解决方案示例
   - 错误提示中包含详细解决方案

#### 使用的 Shadcn 组件
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`
- `Input` (支持 password 类型)
- `Label`
- `Button`

#### 颜色主题
- 成功提示: `bg-green-50 text-green-800`
- 错误提示: `bg-red-50 text-red-800`
- 安全提示: `bg-amber-50/50 border-amber-200`
- CORS 说明: `bg-blue-50/50 border-blue-200`

### 构建验证
- `pnpm run build` ✓
- 无 TypeScript 错误 ✓
- 文件大小: 9.4KB

## 2026-02-06 - TranslateView 实现

### 实现的功能
1. **文件上传区域** - 使用 FileUpload 组件，支持拖拽上传和点击选择，支持多文件
2. **文件列表** - 显示已上传文件，包含文件名、大小、状态标签
3. **翻译进度** - 使用 TranslationProgress 组件显示每个文件的翻译进度
4. **左右分栏预览** - 原文和译文并排显示，使用 ScrollArea 组件
5. **下载功能** - 支持单个文件下载和批量下载，文件名格式为 `原文件名.zh.md`
6. **批量翻译队列** - 支持同时上传多个文件，按顺序翻译

### 技术要点
- 使用 `translateMarkdown` 服务进行翻译
- 通过 `onProgress` 回调更新进度条
- 使用 `generateId()` 生成唯一文件 ID
- 使用 `FileReader` API 读取文件内容
- 使用 Blob 和 URL.createObjectURL 实现文件下载

### 使用的组件
- FileUpload (自定义) - 文件上传
- TranslationProgress (自定义) - 翻译进度
- Card, CardHeader, CardContent, CardTitle (shadcn) - 卡片布局
- Button (shadcn) - 按钮
- ScrollArea (shadcn) - 滚动区域
- Badge (shadcn) - 状态标签
- lucide-vue-next 图标库

### 路由配置
在 router/index.ts 中添加了 `/translate` 路由
