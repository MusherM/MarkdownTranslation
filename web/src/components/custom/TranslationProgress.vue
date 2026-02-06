<script setup lang="ts">
import { computed } from 'vue'
import { FileText, CheckCircle2, Loader2, AlertCircle } from 'lucide-vue-next'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Props {
  progress: number
  status: 'idle' | 'translating' | 'completed' | 'error'
  fileName: string
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  progress: 0,
  status: 'idle',
  fileName: '',
})

const normalizedProgress = computed(() => {
  return Math.min(100, Math.max(0, props.progress))
})

const statusConfig = computed(() => {
  switch (props.status) {
    case 'translating':
      return {
        icon: Loader2,
        iconClass: 'animate-spin text-primary',
        text: '翻译中...',
        textClass: 'text-primary',
        progressClass: 'bg-primary',
      }
    case 'completed':
      return {
        icon: CheckCircle2,
        iconClass: 'text-green-500',
        text: '翻译完成',
        textClass: 'text-green-600',
        progressClass: 'bg-green-500',
      }
    case 'error':
      return {
        icon: AlertCircle,
        iconClass: 'text-destructive',
        text: '翻译失败',
        textClass: 'text-destructive',
        progressClass: 'bg-destructive',
      }
    default:
      return {
        icon: FileText,
        iconClass: 'text-muted-foreground',
        text: '等待开始',
        textClass: 'text-muted-foreground',
        progressClass: 'bg-muted-foreground',
      }
  }
})

const isActive = computed(() => props.status === 'translating')
</script>

<template>
  <Card :class="cn('w-full', props.class)">
    <CardContent class="p-4 space-y-3">
      <!-- 文件信息和状态 -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3 min-w-0">
          <FileText class="w-5 h-5 text-muted-foreground flex-shrink-0" />
          <span class="text-sm font-medium truncate" :title="fileName">
            {{ fileName || '未选择文件' }}
          </span>
        </div>
        
        <div class="flex items-center gap-2 flex-shrink-0">
          <component
            :is="statusConfig.icon"
            :class="cn('w-4 h-4', statusConfig.iconClass)"
          />
          <span :class="cn('text-sm font-medium', statusConfig.textClass)">
            {{ statusConfig.text }}
          </span>
        </div>
      </div>

      <!-- 进度条 -->
      <div class="space-y-1">
        <Progress
          :model-value="normalizedProgress"
          :class="cn(
            'h-2 transition-all duration-300',
            isActive && 'animate-pulse'
          )"
        >
          <div
            :class="cn(
              'h-full transition-all duration-300 rounded-full',
              statusConfig.progressClass
            )"
            :style="{ width: `${normalizedProgress}%` }"
          />
        </Progress>
        
        <div class="flex justify-between text-xs text-muted-foreground">
          <span>进度</span>
          <span class="font-medium">{{ normalizedProgress }}%</span>
        </div>
      </div>

      <!-- 详细信息（仅在翻译中显示） -->
      <div
        v-if="isActive"
        class="text-xs text-muted-foreground text-center pt-1"
      >
        正在翻译，请稍候...
      </div>
    </CardContent>
  </Card>
</template>
