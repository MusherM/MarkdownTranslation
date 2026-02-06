<script setup lang="ts">
import { ref, computed } from 'vue'
import { Plus, Trash2, Languages } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

interface Props {
  modelValue: Record<string, string>
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: () => ({}),
})

const emits = defineEmits<{
  'update:modelValue': [value: Record<string, string>]
  add: [source: string, target: string]
  remove: [source: string]
}>()

const newSource = ref('')
const newTarget = ref('')

const entries = computed(() => {
  return Object.entries(props.modelValue).map(([source, target]) => ({
    source,
    target,
  }))
})

const canAdd = computed(() => {
  return newSource.value.trim() && newTarget.value.trim()
})

function handleAdd() {
  if (!canAdd.value) return
  
  const source = newSource.value.trim()
  const target = newTarget.value.trim()
  
  const newValue = { ...props.modelValue, [source]: target }
  emits('update:modelValue', newValue)
  emits('add', source, target)
  
  newSource.value = ''
  newTarget.value = ''
}

function handleRemove(source: string) {
  const newValue = { ...props.modelValue }
  delete newValue[source]
  emits('update:modelValue', newValue)
  emits('remove', source)
}

function handleUpdate(source: string, field: 'source' | 'target', value: string) {
  const newValue = { ...props.modelValue }
  
  if (field === 'source') {
    // 如果修改了 source，需要删除旧的 key
    const oldTarget = newValue[source]
    delete newValue[source]
    newValue[value] = oldTarget
  } else {
    newValue[source] = value
  }
  
  emits('update:modelValue', newValue)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && canAdd.value) {
    handleAdd()
  }
}
</script>

<template>
  <div :class="cn('w-full space-y-4', props.class)">
    <!-- 添加新词条 -->
    <div class="flex items-end gap-2">
      <div class="flex-1 space-y-1.5">
        <label class="text-xs font-medium text-muted-foreground">原文</label>
        <Input
          v-model="newSource"
          placeholder="输入原文..."
          @keydown="handleKeydown"
        />
      </div>
      
      <div class="flex items-center justify-center pb-2">
        <Languages class="w-4 h-4 text-muted-foreground" />
      </div>
      
      <div class="flex-1 space-y-1.5">
        <label class="text-xs font-medium text-muted-foreground">译文</label>
        <Input
          v-model="newTarget"
          placeholder="输入译文..."
          @keydown="handleKeydown"
        />
      </div>
      
      <Button
        :disabled="!canAdd"
        @click="handleAdd"
      >
        <Plus class="w-4 h-4 mr-1" />
        添加
      </Button>
    </div>

    <!-- 词汇表表格 -->
    <div class="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead class="w-[45%]">原文</TableHead>
            <TableHead class="w-[45%]">译文</TableHead>
            <TableHead class="w-[10%] text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        
        <TableBody>
          <TableRow v-if="entries.length === 0">
            <TableCell colspan="3" class="text-center text-muted-foreground py-8">
              暂无词汇，请添加词条
            </TableCell>
          </TableRow>
          
          <TableRow
            v-for="entry in entries"
            :key="entry.source"
          >
            <TableCell>
              <Input
                :model-value="entry.source"
                class="h-8"
                @update:model-value="(v) => handleUpdate(entry.source, 'source', v as string)"
              />
            </TableCell>
            
            <TableCell>
              <Input
                :model-value="entry.target"
                class="h-8"
                @update:model-value="(v) => handleUpdate(entry.source, 'target', v as string)"
              />
            </TableCell>
            
            <TableCell class="text-right">
              <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8 text-destructive hover:text-destructive"
                @click="handleRemove(entry.source)"
              >
                <Trash2 class="w-4 h-4" />
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <!-- 统计信息 -->
    <div class="text-xs text-muted-foreground text-right">
      共 {{ entries.length }} 个词条
    </div>
  </div>
</template>
