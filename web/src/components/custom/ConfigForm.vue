<script setup lang="ts">
import { computed } from 'vue'
import { Server, Key, Bot, TestTube } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Config {
  baseUrl: string
  apiKey: string
  modelName: string
}

interface Props {
  modelValue: Config
  class?: string
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: () => ({
    baseUrl: '',
    apiKey: '',
    modelName: '',
  }),
  loading: false,
})

const emits = defineEmits<{
  'update:modelValue': [value: Config]
  test: [config: Config]
}>()

const config = computed({
  get: () => props.modelValue,
  set: (value) => emits('update:modelValue', value),
})

const isValid = computed(() => {
  return config.value.baseUrl.trim() && 
         config.value.apiKey.trim() && 
         config.value.modelName.trim()
})

function handleTest() {
  if (isValid.value) {
    emits('test', config.value)
  }
}
</script>

<template>
  <Card :class="cn('w-full', props.class)">
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Server class="w-5 h-5" />
        API 配置
      </CardTitle>
      <CardDescription>
        配置翻译服务的 API 连接信息
      </CardDescription>
    </CardHeader>

    <CardContent class="space-y-4">
      <!-- Base URL -->
      <div class="space-y-2">
        <Label for="baseUrl" class="flex items-center gap-2">
          <Server class="w-4 h-4 text-muted-foreground" />
          Base URL
        </Label>
        <Input
          id="baseUrl"
          v-model="config.baseUrl"
          placeholder="https://api.openai.com/v1"
          type="url"
        />
        <p class="text-xs text-muted-foreground">
          OpenAI 兼容 API 的基础地址
        </p>
      </div>

      <!-- API Key -->
      <div class="space-y-2">
        <Label for="apiKey" class="flex items-center gap-2">
          <Key class="w-4 h-4 text-muted-foreground" />
          API Key
        </Label>
        <Input
          id="apiKey"
          v-model="config.apiKey"
          placeholder="sk-..."
          type="password"
        />
        <p class="text-xs text-muted-foreground">
          您的 API 密钥将被安全存储
        </p>
      </div>

      <!-- Model Name -->
      <div class="space-y-2">
        <Label for="modelName" class="flex items-center gap-2">
          <Bot class="w-4 h-4 text-muted-foreground" />
          Model Name
        </Label>
        <Input
          id="modelName"
          v-model="config.modelName"
          placeholder="gpt-4o-mini"
        />
        <p class="text-xs text-muted-foreground">
          要使用的模型名称，如 gpt-4o-mini、claude-3-haiku 等
        </p>
      </div>

      <!-- 测试连接按钮 -->
      <div class="pt-2">
        <Button
          class="w-full"
          :disabled="!isValid || loading"
          @click="handleTest"
        >
          <TestTube class="w-4 h-4 mr-2" />
          <span v-if="loading">测试中...</span>
          <span v-else>测试连接</span>
        </Button>
      </div>
    </CardContent>
  </Card>
</template>
