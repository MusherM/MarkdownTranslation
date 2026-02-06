<script setup lang="ts">
import { ref, computed } from 'vue'
import { Upload, X, File } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  multiple?: boolean
  accept?: string
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  multiple: false,
  accept: '.md,.markdown,.txt',
})

const emits = defineEmits<{
  select: [files: File[]]
}>()

const selectedFiles = ref<File[]>([])
const isDragging = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

const fileCount = computed(() => selectedFiles.value.length)

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    const files = Array.from(input.files)
    addFiles(files)
  }
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  isDragging.value = false
  
  if (event.dataTransfer?.files) {
    const files = Array.from(event.dataTransfer.files)
    addFiles(files)
  }
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
  isDragging.value = true
}

function handleDragLeave(event: DragEvent) {
  event.preventDefault()
  isDragging.value = false
}

function addFiles(files: File[]) {
  if (props.multiple) {
    selectedFiles.value.push(...files)
  } else {
    selectedFiles.value = files.slice(0, 1)
  }
  emits('select', selectedFiles.value)
}

function removeFile(index: number) {
  selectedFiles.value.splice(index, 1)
  emits('select', selectedFiles.value)
}

function clearFiles() {
  selectedFiles.value = []
  emits('select', [])
}

function triggerFileInput() {
  fileInputRef.value?.click()
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
</script>

<template>
  <div :class="cn('w-full', props.class)">
    <!-- 拖拽上传区域 -->
    <div
      :class="cn(
        'relative border-2 border-dashed rounded-lg p-8 transition-all duration-200 cursor-pointer',
        'hover:border-primary/50 hover:bg-primary/5',
        isDragging ? 'border-primary bg-primary/10' : 'border-muted-foreground/25',
        selectedFiles.length > 0 ? 'bg-muted/30' : ''
      )"
      @click="triggerFileInput"
      @drop="handleDrop"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
    >
      <input
        ref="fileInputRef"
        type="file"
        :accept="accept"
        :multiple="multiple"
        class="hidden"
        @change="handleFileSelect"
      >
      
      <div class="flex flex-col items-center justify-center gap-3 text-center">
        <div
          :class="cn(
            'p-4 rounded-full transition-colors duration-200',
            isDragging ? 'bg-primary/20' : 'bg-muted'
          )"
        >
          <Upload
            :class="cn(
              'w-8 h-8 transition-colors duration-200',
              isDragging ? 'text-primary' : 'text-muted-foreground'
            )"
          />
        </div>
        
        <div class="space-y-1">
          <p class="text-sm font-medium">
            <span v-if="isDragging">释放以上传文件</span>
            <span v-else>点击或拖拽文件到此处</span>
          </p>
          <p class="text-xs text-muted-foreground">
            支持 {{ accept }} 格式{{ multiple ? '，可多选' : '' }}
          </p>
        </div>
      </div>
    </div>

    <!-- 已选文件列表 -->
    <div v-if="selectedFiles.length > 0" class="mt-4 space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium text-muted-foreground">
          已选择 {{ fileCount }} 个文件
        </span>
        <Button variant="ghost" size="sm" @click="clearFiles">
          清空全部
        </Button>
      </div>
      
      <div class="space-y-2 max-h-48 overflow-y-auto">
        <div
          v-for="(file, index) in selectedFiles"
          :key="`${file.name}-${index}`"
          class="flex items-center justify-between p-3 rounded-md bg-muted/50 border border-border/50 group hover:bg-muted transition-colors"
        >
          <div class="flex items-center gap-3 min-w-0">
            <File class="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div class="min-w-0">
              <p class="text-sm font-medium truncate">{{ file.name }}</p>
              <p class="text-xs text-muted-foreground">{{ formatFileSize(file.size) }}</p>
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            @click.stop="removeFile(index)"
          >
            <X class="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
