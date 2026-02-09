<script setup lang="ts">
import { ref, computed } from 'vue'
import { useConfigStore } from '@/stores/configStore'
import { useGlossaryStore } from '@/stores/glossaryStore'
import { translateMarkdown } from '@/services/translator'
import { chatCompletion } from '@/services/openai'
import FileUpload from '@/components/custom/FileUpload.vue'
import TranslationProgress from '@/components/custom/TranslationProgress.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { 
  Languages, 
  Download, 
  Play, 
  Trash2, 
  FileText,
  AlertCircle,
  CheckCircle2,
  X
} from 'lucide-vue-next'

// 文件项类型
interface FileItem {
  id: string
  file: File
  name: string
  content: string
  translatedContent: string
  status: 'idle' | 'translating' | 'completed' | 'error'
  progress: number
  error?: string
}

// Store
const configStore = useConfigStore()
const glossaryStore = useGlossaryStore()

// 状态
const files = ref<FileItem[]>([])
const selectedFileId = ref<string | null>(null)
const isTranslating = ref(false)

const TRANSLATION_PROMPT = `You are a professional translator specializing in technical documentation.
Translate the following English Markdown content to Simplified Chinese.

Requirements:
1. Preserve all Markdown formatting (headers, lists, code blocks, links, etc.)
2. Maintain the original document structure
3. Use professional and accurate technical terminology
4. Ensure natural and fluent Chinese expression
5. Do not translate content inside code blocks or inline code
6. Keep all URLs, file paths, and code identifiers unchanged`

const GLOSSARY_JUDGE_PROMPT = `你是术语表合规判定器，负责判断翻译是否可以在未使用术语表的情况下被接受。

每个 item 包含：
- source: 英文原文片段
- translation: 当前中文翻译
- missing_terms: 未命中的术语表对照（source -> target）

任务：
- 判断该翻译是否仍然合适。
- 只有在翻译准确且使用术语表会显得不自然、别扭或不正确时才 accept。
- 如果翻译不准确，或应该使用术语表目标词，或不确定，请 reject。
- 保守判断：宁可 reject 以便重试。

只返回严格 JSON，格式必须为：
{"decisions": [{"id": <id>, "accept": <true|false>, "reason": <string>}, ...]}`

// 计算属性
const hasFiles = computed(() => files.value.length > 0)
const canTranslate = computed(() => {
  return files.value.some(f => f.status === 'idle' || f.status === 'error') && 
         configStore.config.apiKey && 
         configStore.config.baseUrl
})
const canDownload = computed(() => files.value.some(f => f.status === 'completed'))
const allCompleted = computed(() => files.value.every(f => f.status === 'completed'))
const selectedFile = computed(() => files.value.find(f => f.id === selectedFileId.value))

// 生成唯一ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// 读取文件内容
async function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target?.result as string)
    reader.onerror = (e) => reject(e)
    reader.readAsText(file)
  })
}

// 处理文件选择
async function handleFileSelect(selectedFiles: File[]) {
  const existingSignatures = new Set(
    files.value.map((item) => `${item.file.name}::${item.file.size}::${item.file.lastModified}`)
  )

  for (const file of selectedFiles) {
    const signature = `${file.name}::${file.size}::${file.lastModified}`
    if (existingSignatures.has(signature)) {
      continue
    }

    try {
      const content = await readFile(file)
      const fileItem: FileItem = {
        id: generateId(),
        file,
        name: file.name,
        content,
        translatedContent: '',
        status: 'idle',
        progress: 0
      }
      files.value.push(fileItem)
      existingSignatures.add(signature)
    } catch (error) {
      console.error('读取文件失败:', error)
    }
  }
  // 自动选择第一个文件
  if (files.value.length > 0 && !selectedFileId.value) {
    selectedFileId.value = files.value[0].id
  }
}

// 删除文件
function removeFile(id: string) {
  const index = files.value.findIndex(f => f.id === id)
  if (index > -1) {
    files.value.splice(index, 1)
    if (selectedFileId.value === id) {
      selectedFileId.value = files.value.length > 0 ? files.value[0].id : null
    }
  }
}

// 清空所有文件
function clearAllFiles() {
  files.value = []
  selectedFileId.value = null
}

// 翻译单个文件
async function translateFile(fileItem: FileItem) {
  if (!configStore.config.apiKey || !configStore.config.baseUrl) {
    fileItem.status = 'error'
    fileItem.error = '请先配置 API 设置'
    return
  }

  fileItem.status = 'translating'
  fileItem.progress = 0
  fileItem.error = undefined

  try {
    const result = await translateMarkdown(fileItem.content, {
      config: {
        base_url: configStore.config.baseUrl,
        api_key: configStore.config.apiKey,
        model: configStore.config.modelName,
        retry_times: 3,
        temperature: 0.2,
        max_tokens: 2048,
        timeout_ms: 120000,
        max_batch_chars: 4000,
        max_batch_segments: 100
      },
      glossary: glossaryStore.glossary,
      prompt: TRANSLATION_PROMPT,
      judgePrompt: GLOSSARY_JUDGE_PROMPT,
      translateMarkdownCodeBlocks: configStore.config.translateMarkdownCodeBlocks,
      chatCompletion,
      onProgress: ({ done, total }) => {
        fileItem.progress = Math.round((done / total) * 100)
      }
    })

    fileItem.translatedContent = result
    fileItem.status = 'completed'
    fileItem.progress = 100
  } catch (error) {
    console.error('翻译失败:', error)
    fileItem.status = 'error'
    fileItem.error = error instanceof Error ? error.message : '翻译失败'
    fileItem.progress = 0
  }
}

// 开始翻译
async function startTranslation() {
  if (isTranslating.value) return
  
  isTranslating.value = true
  const pendingFiles = files.value.filter(f => f.status === 'idle' || f.status === 'error')
  
  for (const fileItem of pendingFiles) {
    await translateFile(fileItem)
  }
  
  isTranslating.value = false
}

// 下载单个文件
function downloadFile(fileItem: FileItem) {
  if (!fileItem.translatedContent) return
  
  const blob = new Blob([fileItem.translatedContent], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  
  // 生成文件名：原文件名.zh.md
  const originalName = fileItem.name.replace(/\.md$/i, '')
  a.download = `${originalName}.zh.md`
  
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// 下载所有已完成的文件
function downloadAll() {
  files.value.forEach(fileItem => {
    if (fileItem.status === 'completed') {
      downloadFile(fileItem)
    }
  })
}

// 获取状态配置
function getStatusConfig(status: FileItem['status']) {
  switch (status) {
    case 'translating':
      return { icon: Languages, class: 'text-primary', label: '翻译中' }
    case 'completed':
      return { icon: CheckCircle2, class: 'text-green-500', label: '已完成' }
    case 'error':
      return { icon: AlertCircle, class: 'text-destructive', label: '失败' }
    default:
      return { icon: FileText, class: 'text-muted-foreground', label: '待翻译' }
  }
}

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
</script>

<template>
  <div class="container mx-auto py-6 px-4 max-w-7xl">
    <!-- 页面标题 -->
    <div class="mb-8">
      <h1 class="text-3xl font-bold tracking-tight flex items-center gap-3">
        <Languages class="w-8 h-8 text-primary" />
        Markdown 翻译
      </h1>
      <p class="text-muted-foreground mt-2">
        上传 Markdown 文件，批量翻译为简体中文
      </p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- 左侧：文件上传和列表 -->
      <div class="lg:col-span-1 space-y-6">
        <!-- 文件上传 -->
        <Card>
          <CardHeader>
            <CardTitle class="text-lg">上传文件</CardTitle>
          </CardHeader>
          <CardContent>
            <FileUpload 
              multiple 
              accept=".md,.markdown,.txt"
              @select="handleFileSelect" 
            />
          </CardContent>
        </Card>

        <!-- 文件列表 -->
        <Card v-if="hasFiles">
          <CardHeader class="flex flex-row items-center justify-between pb-2">
            <CardTitle class="text-lg">文件列表</CardTitle>
            <Button 
              variant="ghost" 
              size="sm" 
              @click="clearAllFiles"
              class="text-muted-foreground hover:text-destructive"
            >
              <Trash2 class="w-4 h-4 mr-1" />
              清空
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea class="h-[300px] pr-4">
              <div class="space-y-2">
                <div
                  v-for="fileItem in files"
                  :key="fileItem.id"
                  :class="[
                    'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                    selectedFileId === fileItem.id 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  ]"
                  @click="selectedFileId = fileItem.id"
                >
                  <!-- 状态图标 -->
                  <component
                    :is="getStatusConfig(fileItem.status).icon"
                    :class="['w-5 h-5 flex-shrink-0', getStatusConfig(fileItem.status).class]"
                  />
                  
                  <!-- 文件信息 -->
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium truncate">{{ fileItem.name }}</p>
                    <p class="text-xs text-muted-foreground">
                      {{ formatFileSize(fileItem.file.size) }}
                    </p>
                  </div>
                  
                  <!-- 状态标签 -->
                  <Badge 
                    :variant="fileItem.status === 'completed' ? 'default' : 'secondary'"
                    :class="[
                      'text-xs flex-shrink-0',
                      fileItem.status === 'error' && 'bg-destructive text-destructive-foreground'
                    ]"
                  >
                    {{ getStatusConfig(fileItem.status).label }}
                  </Badge>
                  
                  <!-- 删除按钮 -->
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-7 w-7 flex-shrink-0 opacity-0 group-hover:opacity-100"
                    @click.stop="removeFile(fileItem.id)"
                  >
                    <X class="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </ScrollArea>

            <!-- 操作按钮 -->
            <div class="mt-4 space-y-2">
              <Button 
                class="w-full" 
                :disabled="!canTranslate || isTranslating"
                @click="startTranslation"
              >
                <Play class="w-4 h-4 mr-2" />
                {{ isTranslating ? '翻译中...' : '开始翻译' }}
              </Button>
              
              <Button 
                v-if="canDownload"
                variant="outline" 
                class="w-full"
                @click="downloadAll"
              >
                <Download class="w-4 h-4 mr-2" />
                下载全部 ({{ files.filter(f => f.status === 'completed').length }})
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- 右侧：预览区域 -->
      <div class="lg:col-span-2 space-y-6 min-h-0">
        <!-- 未选择文件提示 -->
        <Card v-if="!selectedFile" class="h-[600px] flex items-center justify-center">
          <div class="text-center text-muted-foreground">
            <FileText class="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>请上传文件并选择要预览的文档</p>
          </div>
        </Card>

        <template v-else>
          <!-- 翻译进度 -->
          <TranslationProgress
            v-if="selectedFile.status !== 'idle'"
            :file-name="selectedFile.name"
            :status="selectedFile.status"
            :progress="selectedFile.progress"
          />

          <!-- 预览区域 -->
          <Card class="flex-1 overflow-hidden">
            <CardHeader class="flex flex-row items-center justify-between pb-2">
              <CardTitle class="text-lg">翻译预览</CardTitle>
              <div class="flex items-center gap-2">
                <Badge variant="outline">原文</Badge>
                <Badge variant="default">译文</Badge>
              </div>
            </CardHeader>
            <CardContent class="h-[500px] overflow-hidden">
              <div class="grid grid-cols-2 gap-4 h-full min-h-0">
                <!-- 原文 -->
                <div class="flex flex-col min-h-0">
                  <label class="text-sm font-medium text-muted-foreground mb-2">原文</label>
                  <ScrollArea class="flex-1 min-h-0 border rounded-lg bg-muted/30 overflow-hidden">
                    <pre class="p-4 text-sm whitespace-pre-wrap break-words font-mono text-muted-foreground">{{ selectedFile.content }}</pre>
                  </ScrollArea>
                </div>
                
                <!-- 译文 -->
                <div class="flex flex-col min-h-0">
                  <label class="text-sm font-medium text-muted-foreground mb-2">译文</label>
                  <ScrollArea class="flex-1 min-h-0 border rounded-lg bg-primary/5 overflow-hidden">
                    <pre v-if="selectedFile.translatedContent" class="p-4 text-sm whitespace-pre-wrap break-words font-mono">{{ selectedFile.translatedContent }}</pre>
                    <div v-else class="h-full flex items-center justify-center text-muted-foreground">
                      <p v-if="selectedFile.status === 'translating'">翻译中...</p>
                      <p v-else-if="selectedFile.status === 'error'" class="text-destructive">
                        {{ selectedFile.error || '翻译失败' }}
                      </p>
                      <p v-else>等待翻译</p>
                    </div>
                  </ScrollArea>
                </div>
              </div>

              <!-- 单个文件下载按钮 -->
              <div v-if="selectedFile.status === 'completed'" class="mt-4 flex justify-end">
                <Button @click="downloadFile(selectedFile)">
                  <Download class="w-4 h-4 mr-2" />
                  下载 {{ selectedFile.name.replace(/\.md$/i, '.zh.md') }}
                </Button>
              </div>
            </CardContent>
          </Card>
        </template>
      </div>
    </div>
  </div>
</template>
