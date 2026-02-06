<script setup lang="ts">
import { ref } from 'vue'
import { Upload } from 'lucide-vue-next'
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

const isDragging = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    emits('select', Array.from(input.files))
    // Reset input so selecting the same file again can still trigger change.
    input.value = ''
  }
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  isDragging.value = false
  
  if (event.dataTransfer?.files) {
    emits('select', Array.from(event.dataTransfer.files))
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

function triggerFileInput() {
  fileInputRef.value?.click()
}
</script>

<template>
  <div :class="cn('w-full', props.class)">
    <!-- 拖拽上传区域 -->
    <div
      :class="cn(
        'relative border-2 border-dashed rounded-lg p-8 transition-all duration-200 cursor-pointer',
        'hover:border-primary/50 hover:bg-primary/5',
        isDragging ? 'border-primary bg-primary/10' : 'border-muted-foreground/25'
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
  </div>
</template>
