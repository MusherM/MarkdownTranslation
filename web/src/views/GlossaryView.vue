<script setup lang="ts">
import { ref, computed, h } from 'vue'
import { useGlossaryStore } from '@/stores/glossaryStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const glossaryStore = useGlossaryStore()

// 搜索关键词
const searchQuery = ref('')

// 新词条表单
const newSource = ref('')
const newTarget = ref('')
const addError = ref('')

// 导入对话框状态
const isImportDialogOpen = ref(false)
const importStrategy = ref<'replace' | 'merge'>('merge')
const fileInputRef = ref<HTMLInputElement | null>(null)
const pendingImportFile = ref<File | null>(null)

// 删除确认对话框
const isDeleteDialogOpen = ref(false)
const entryToDelete = ref<string | null>(null)

// 编辑状态
const editingEntry = ref<{ source: string; target: string } | null>(null)

// 过滤后的词条列表
const filteredEntries = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) {
    return Object.entries(glossaryStore.glossary)
  }
  return Object.entries(glossaryStore.glossary).filter(
    ([source, target]) =>
      source.toLowerCase().includes(query) || target.toLowerCase().includes(query)
  )
})

// 词条数量
const entryCount = computed(() => Object.keys(glossaryStore.glossary).length)

// 图标组件
const SearchIcon = {
  render() {
    return h('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      width: '16',
      height: '16',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }, [
      h('circle', { cx: '11', cy: '11', r: '8' }),
      h('path', { d: 'm21 21-4.3-4.3' }),
    ])
  },
}

const PlusIcon = {
  render() {
    return h('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      width: '16',
      height: '16',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }, [
      h('path', { d: 'M5 12h14' }),
      h('path', { d: 'M12 5v14' }),
    ])
  },
}

const TrashIcon = {
  render() {
    return h('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      width: '16',
      height: '16',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }, [
      h('path', { d: 'M3 6h18' }),
      h('path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }),
      h('path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }),
      h('line', { x1: '10', x2: '10', y1: '11', y2: '17' }),
      h('line', { x1: '14', x2: '14', y1: '11', y2: '17' }),
    ])
  },
}

const UploadIcon = {
  render() {
    return h('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      width: '16',
      height: '16',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }, [
      h('path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }),
      h('polyline', { points: '17 8 12 3 7 8' }),
      h('line', { x1: '12', x2: '12', y1: '3', y2: '15' }),
    ])
  },
}

const DownloadIcon = {
  render() {
    return h('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      width: '16',
      height: '16',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }, [
      h('path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }),
      h('polyline', { points: '7 10 12 15 17 10' }),
      h('line', { x1: '12', x2: '12', y1: '15', y2: '3' }),
    ])
  },
}

const FileJsonIcon = {
  render() {
    return h('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      width: '48',
      height: '48',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.5',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }, [
      h('path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }),
      h('path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }),
      h('path', { d: 'M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1' }),
      h('path', { d: 'M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1' }),
    ])
  },
}

// 添加词条
function addEntry() {
  addError.value = ''

  const source = newSource.value.trim()
  const target = newTarget.value.trim()

  if (!source) {
    addError.value = '请输入源语言词汇'
    return
  }

  if (glossaryStore.hasEntry(source)) {
    addError.value = '该词条已存在'
    return
  }

  glossaryStore.addEntry(source, target)
  newSource.value = ''
  newTarget.value = ''
}

// 开始编辑词条
function startEdit(source: string, target: string) {
  editingEntry.value = { source, target }
}

// 保存编辑
function saveEdit() {
  if (editingEntry.value) {
    glossaryStore.updateEntry(editingEntry.value.source, editingEntry.value.target)
    editingEntry.value = null
  }
}

// 取消编辑
function cancelEdit() {
  editingEntry.value = null
}

// 确认删除
function confirmDelete(source: string) {
  entryToDelete.value = source
  isDeleteDialogOpen.value = true
}

// 执行删除
function executeDelete() {
  if (entryToDelete.value) {
    glossaryStore.removeEntry(entryToDelete.value)
    entryToDelete.value = null
    isDeleteDialogOpen.value = false
  }
}

// 触发文件选择
function triggerFileInput() {
  fileInputRef.value?.click()
}

// 处理文件选择
function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (file) {
    pendingImportFile.value = file
    isImportDialogOpen.value = true
  }

  // 重置 input 以便可以再次选择同一文件
  target.value = ''
}

// 执行导入
async function executeImport() {
  if (!pendingImportFile.value) return

  try {
    await glossaryStore.importFromFile(pendingImportFile.value, {
      strategy: importStrategy.value,
    })
    pendingImportFile.value = null
    isImportDialogOpen.value = false
  } catch (error) {
    alert('导入失败：' + (error instanceof Error ? error.message : '未知错误'))
  }
}

// 导出词条
function exportGlossary() {
  glossaryStore.exportToFile()
}

// 清空所有词条
function clearAll() {
  if (confirm('确定要清空所有词条吗？此操作不可恢复。')) {
    glossaryStore.clear()
  }
}
</script>

<template>
  <div class="glossary-view">
    <div class="max-w-5xl mx-auto space-y-6">
      <!-- 页面标题 -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div class="space-y-1">
          <h1 class="text-3xl font-bold tracking-tight">词汇表管理</h1>
          <p class="text-muted-foreground">
            管理翻译词汇表，共 {{ entryCount }} 个词条
          </p>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" @click="triggerFileInput">
            <UploadIcon class="mr-2 h-4 w-4" />
            导入
          </Button>
          <Button variant="outline" @click="exportGlossary">
            <DownloadIcon class="mr-2 h-4 w-4" />
            导出
          </Button>
        </div>
      </div>

      <!-- 隐藏的文件输入 -->
      <input
        ref="fileInputRef"
        type="file"
        accept=".json,.jsonc"
        class="hidden"
        @change="handleFileSelect"
      />

      <!-- 添加新词条卡片 -->
      <Card>
        <CardHeader>
          <CardTitle class="text-lg">添加新词条</CardTitle>
          <CardDescription>
            添加源语言词汇及其对应的目标语言翻译
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div class="flex flex-col sm:flex-row gap-4 items-start">
            <div class="flex-1 space-y-2 w-full">
              <Label for="new-source">源语言</Label>
              <Input
                id="new-source"
                v-model="newSource"
                placeholder="例如：API"
                @keyup.enter="addEntry"
              />
            </div>
            <div class="flex-1 space-y-2 w-full">
              <Label for="new-target">目标语言</Label>
              <Input
                id="new-target"
                v-model="newTarget"
                placeholder="例如：应用程序接口"
                @keyup.enter="addEntry"
              />
            </div>
            <div class="pt-7">
              <Button @click="addEntry">
                <PlusIcon class="mr-2 h-4 w-4" />
                添加
              </Button>
            </div>
          </div>
          <p v-if="addError" class="text-sm text-destructive mt-2">
            {{ addError }}
          </p>
        </CardContent>
      </Card>

      <!-- 词条列表卡片 -->
      <Card>
        <CardHeader>
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle class="text-lg">词条列表</CardTitle>
              <CardDescription>
                点击目标语言列可直接编辑，点击删除按钮移除词条
              </CardDescription>
            </div>
            <div class="relative">
              <SearchIcon class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                v-model="searchQuery"
                placeholder="搜索词条..."
                class="pl-9 w-full sm:w-64"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div class="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="w-[45%]">源语言</TableHead>
                  <TableHead class="w-[45%]">目标语言</TableHead>
                  <TableHead class="w-[10%] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-if="filteredEntries.length === 0">
                  <TableCell colspan="3" class="text-center py-8 text-muted-foreground">
                    <div class="flex flex-col items-center gap-2">
                      <FileJsonIcon class="h-12 w-12 text-muted-foreground/50" />
                      <p v-if="searchQuery">
                        没有找到匹配的词条
                      </p>
                      <p v-else>
                        词汇表为空，请添加词条或导入文件
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
                <TableRow
                  v-for="[source, target] in filteredEntries"
                  :key="source"
                >
                  <TableCell class="font-medium">
                    {{ source }}
                  </TableCell>
                  <TableCell>
                    <div v-if="editingEntry?.source === source" class="flex gap-2">
                      <Input
                        v-model="editingEntry.target"
                        size="sm"
                        class="h-8"
                        @keyup.enter="saveEdit"
                        @keyup.esc="cancelEdit"
                      />
                      <Button size="sm" variant="ghost" class="h-8 px-2" @click="saveEdit">
                        保存
                      </Button>
                      <Button size="sm" variant="ghost" class="h-8 px-2" @click="cancelEdit">
                        取消
                      </Button>
                    </div>
                    <span
                      v-else
                      class="cursor-pointer hover:text-primary transition-colors"
                      @click="startEdit(source, target)"
                    >
                      {{ target || '-' }}
                    </span>
                  </TableCell>
                  <TableCell class="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      @click="confirmDelete(source)"
                    >
                      <TrashIcon class="h-4 w-4" />
                      <span class="sr-only">删除</span>
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <!-- 底部操作栏 -->
          <div v-if="entryCount > 0" class="flex justify-between items-center mt-4 pt-4 border-t">
            <p class="text-sm text-muted-foreground">
              显示 {{ filteredEntries.length }} / {{ entryCount }} 个词条
            </p>
            <Button
              v-if="entryCount > 0"
              variant="outline"
              size="sm"
              class="text-destructive hover:text-destructive hover:bg-destructive/10"
              @click="clearAll"
            >
              <TrashIcon class="mr-2 h-4 w-4" />
              清空全部
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 导入策略对话框 -->
    <Dialog v-model:open="isImportDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>选择导入策略</DialogTitle>
          <DialogDescription>
            请选择如何处理导入的词汇表文件
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4 py-4">
          <div
            class="flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors"
            :class="importStrategy === 'merge' ? 'border-primary bg-primary/5' : 'hover:bg-accent'"
            @click="importStrategy = 'merge'"
          >
            <div class="mt-0.5">
              <div
                class="h-4 w-4 rounded-full border-2 flex items-center justify-center"
                :class="importStrategy === 'merge' ? 'border-primary' : 'border-muted-foreground'"
              >
                <div
                  v-if="importStrategy === 'merge'"
                  class="h-2 w-2 rounded-full bg-primary"
                />
              </div>
            </div>
            <div class="flex-1">
              <h4 class="font-medium">合并 (Merge)</h4>
              <p class="text-sm text-muted-foreground mt-1">
                将导入的词条与现有词汇表合并，相同词条将被覆盖
              </p>
            </div>
          </div>
          <div
            class="flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors"
            :class="importStrategy === 'replace' ? 'border-primary bg-primary/5' : 'hover:bg-accent'"
            @click="importStrategy = 'replace'"
          >
            <div class="mt-0.5">
              <div
                class="h-4 w-4 rounded-full border-2 flex items-center justify-center"
                :class="importStrategy === 'replace' ? 'border-primary' : 'border-muted-foreground'"
              >
                <div
                  v-if="importStrategy === 'replace'"
                  class="h-2 w-2 rounded-full bg-primary"
                />
              </div>
            </div>
            <div class="flex-1">
              <h4 class="font-medium">替换 (Replace)</h4>
              <p class="text-sm text-muted-foreground mt-1">
                完全替换现有词汇表，导入前请确保已备份重要数据
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="isImportDialogOpen = false">
            取消
          </Button>
          <Button @click="executeImport">
            确认导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 删除确认对话框 -->
    <Dialog v-model:open="isDeleteDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认删除</DialogTitle>
          <DialogDescription>
            确定要删除词条 "{{ entryToDelete }}" 吗？此操作不可恢复。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="isDeleteDialogOpen = false">
            取消
          </Button>
          <Button variant="destructive" @click="executeDelete">
            删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
.glossary-view {
  padding: 2rem 1rem;
  min-height: 100%;
}
</style>
