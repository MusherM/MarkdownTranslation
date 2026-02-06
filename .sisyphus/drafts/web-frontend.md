# Draft: Markdown Translate Web Frontend

## 项目现状分析

### 核心架构
- **技术栈**: Node.js, ES Modules, remark/unified (AST处理)
- **翻译流程**: 
  1. Markdown AST解析 (remark-parse, remark-gfm)
  2. 文本片段提取与分批
  3. OpenAI API 调用 (流式/批量)
  4. 词汇表检查与重试机制
  5. AST序列化回 Markdown
- **配置字段**: base_url, api_key, model, retry_times, temperature, max_tokens, max_batch_chars, max_batch_segments
- **词汇表格式**: JSON对象 { "Source Term": "Target Term", ... }

### 关键文件
- `src/translate.js:777` - 核心翻译逻辑（需要复用/移植到前端）
- `src/openai.js:63` - API 调用封装
- `src/config.js:77` - 配置管理
- `src/glossary.js:36` - 词汇表处理

## 需求澄清

### 待确认问题
1. **前端架构**
   - 是否使用 Vite 作为构建工具？
   - UI 组件库偏好（Element Plus, Ant Design Vue, 还是自定义）？
   - 是否需要响应式设计（移动端适配）？

2. **翻译流程复用**
   - 后端逻辑是完整移植到前端，还是部分逻辑（如 remark 解析）可以复用？
   - 是否需要保持分批翻译的能力（对于大文件）？

3. **词汇表功能细节**
   - "替换" vs "覆盖" 的具体含义？
     - 替换: 清空原有词汇表，使用新上传的
     - 合并: 新词汇表与现有词汇表合并（键冲突时新值优先）
   - 词汇表编辑界面设计：表格形式还是键值对形式？

4. **用户体验**
   - 翻译进度展示方式？
   - 是否需要翻译历史记录？
   - 错误处理策略（如 API 失败时的重试 UI）？

5. **部署方式**
   - 纯静态部署，还是需要说明构建流程？

### 设计方向
- 采用现代、简洁的设计风格
- 深色/浅色主题切换
- 清晰的功能分区（配置区、文件区、词汇表区、翻译区）
- 流畅的动画过渡效果
