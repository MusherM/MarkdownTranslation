<script setup lang="ts">
import { ref, computed } from 'vue'
import { useConfigStore } from '@/stores/configStore'
import { chatCompletion, type ChatCompletionError } from '@/services/openai'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

const configStore = useConfigStore()

// 本地表单状态
const form = ref({
  baseUrl: configStore.config.baseUrl,
  apiKey: configStore.config.apiKey,
  modelName: configStore.config.modelName
})

// 错误状态
const errors = ref({
  baseUrl: '',
  apiKey: '',
  modelName: ''
})

// 测试连接状态
const isTesting = ref(false)
const testResult = ref<{
  success: boolean
  message: string
} | null>(null)

// 验证 URL 格式
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

// 验证表单
function validateForm(): boolean {
  let isValid = true
  errors.value = { baseUrl: '', apiKey: '', modelName: '' }

  // 验证 baseUrl
  if (!form.value.baseUrl.trim()) {
    errors.value.baseUrl = '请输入 API 地址'
    isValid = false
  } else if (!isValidUrl(form.value.baseUrl)) {
    errors.value.baseUrl = '请输入有效的 URL 地址（以 http:// 或 https:// 开头）'
    isValid = false
  }

  // 验证 apiKey
  if (!form.value.apiKey.trim()) {
    errors.value.apiKey = '请输入 API Key'
    isValid = false
  }

  // 验证 modelName
  if (!form.value.modelName.trim()) {
    errors.value.modelName = '请输入模型名称'
    isValid = false
  }

  return isValid
}

// 保存配置
function saveConfig() {
  if (validateForm()) {
    configStore.config.baseUrl = form.value.baseUrl.trim()
    configStore.config.apiKey = form.value.apiKey.trim()
    configStore.config.modelName = form.value.modelName.trim()
  }
}

// 测试连接
async function testConnection() {
  if (!validateForm()) {
    return
  }

  // 先保存配置
  saveConfig()

  isTesting.value = true
  testResult.value = null

  try {
    await chatCompletion({
      baseUrl: form.value.baseUrl.trim(),
      apiKey: form.value.apiKey.trim(),
      model: form.value.modelName.trim(),
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.2,
      max_tokens: 10
    })

    testResult.value = {
      success: true,
      message: '连接成功！API 配置正确。'
    }
  } catch (error) {
    const chatError = error as ChatCompletionError
    testResult.value = {
      success: false,
      message: chatError.message || '连接失败，请检查配置信息。'
    }
  } finally {
    isTesting.value = false
  }
}

// 重置为默认值
function resetToDefaults() {
  configStore.reset()
  form.value = {
    baseUrl: configStore.config.baseUrl,
    apiKey: configStore.config.apiKey,
    modelName: configStore.config.modelName
  }
  errors.value = { baseUrl: '', apiKey: '', modelName: '' }
  testResult.value = null
}
</script>

<template>
  <div class="config-view">
    <div class="max-w-2xl mx-auto space-y-6">
      <!-- 页面标题 -->
      <div class="space-y-2">
        <h1 class="text-3xl font-bold tracking-tight">配置</h1>
        <p class="text-muted-foreground">
          配置 OpenAI 兼容 API 的连接信息
        </p>
      </div>

      <!-- API 配置卡片 -->
      <Card>
        <CardHeader>
          <CardTitle>API 配置</CardTitle>
          <CardDescription>
            设置您的 OpenAI 兼容 API 连接信息
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-6">
          <!-- Base URL -->
          <div class="space-y-2">
            <Label for="baseUrl">API 地址</Label>
            <Input
              id="baseUrl"
              v-model="form.baseUrl"
              type="url"
              placeholder="https://api.openai.com/v1"
              :class="{ 'border-destructive': errors.baseUrl }"
              @blur="saveConfig"
            />
            <p v-if="errors.baseUrl" class="text-sm text-destructive">
              {{ errors.baseUrl }}
            </p>
            <p class="text-xs text-muted-foreground">
              OpenAI 兼容 API 的基础 URL，通常以 /v1 结尾
            </p>
          </div>

          <!-- API Key -->
          <div class="space-y-2">
            <Label for="apiKey">API Key</Label>
            <Input
              id="apiKey"
              v-model="form.apiKey"
              type="password"
              placeholder="sk-..."
              :class="{ 'border-destructive': errors.apiKey }"
              @blur="saveConfig"
            />
            <p v-if="errors.apiKey" class="text-sm text-destructive">
              {{ errors.apiKey }}
            </p>
            <p class="text-xs text-muted-foreground">
              您的 API 密钥，格式通常为 sk-...
            </p>
          </div>

          <!-- Model Name -->
          <div class="space-y-2">
            <Label for="modelName">模型名称</Label>
            <Input
              id="modelName"
              v-model="form.modelName"
              type="text"
              placeholder="gpt-4o-mini"
              :class="{ 'border-destructive': errors.modelName }"
              @blur="saveConfig"
            />
            <p v-if="errors.modelName" class="text-sm text-destructive">
              {{ errors.modelName }}
            </p>
            <p class="text-xs text-muted-foreground">
              要使用的模型名称，例如：gpt-4o-mini、gpt-4o、claude-3-sonnet 等
            </p>
          </div>

          <!-- 测试连接按钮 -->
          <div class="flex flex-wrap gap-3 pt-2">
            <Button
              :disabled="isTesting"
              @click="testConnection"
            >
              <span v-if="isTesting">测试中...</span>
              <span v-else>测试连接</span>
            </Button>
            <Button
              variant="outline"
              @click="resetToDefaults"
            >
              恢复默认
            </Button>
          </div>

          <!-- 测试结果 -->
          <div
            v-if="testResult"
            class="p-4 rounded-lg text-sm"
            :class="{
              'bg-green-50 text-green-800 border border-green-200': testResult.success,
              'bg-red-50 text-red-800 border border-red-200': !testResult.success
            }"
          >
            <div class="flex items-start gap-2">
              <span v-if="testResult.success" class="text-lg">✓</span>
              <span v-else class="text-lg">✗</span>
              <div class="whitespace-pre-line">{{ testResult.message }}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 安全提示卡片 -->
      <Card class="border-amber-200 bg-amber-50/50">
        <CardHeader>
          <CardTitle class="text-amber-800 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
            安全提示
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul class="text-sm text-amber-800 space-y-2 list-disc list-inside">
            <li>API Key 存储在浏览器的 localStorage 中，仅在本地使用</li>
            <li>请确保您的设备安全，避免他人获取您的 API Key</li>
            <li>建议定期更换 API Key</li>
            <li>不要在公共或共享设备上保存敏感配置</li>
          </ul>
        </CardContent>
      </Card>

      <!-- CORS 代理说明卡片 -->
      <Card class="border-blue-200 bg-blue-50/50">
        <CardHeader>
          <CardTitle class="text-blue-800 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            CORS 代理说明
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <p class="text-sm text-blue-800">
            如果您遇到 CORS 错误，说明 API 服务器未配置跨域访问。您可以：
          </p>
          <ul class="text-sm text-blue-800 space-y-2 list-disc list-inside">
            <li>使用支持 CORS 的代理服务器（如 Cloudflare Worker）</li>
            <li>配置浏览器扩展绕过 CORS（仅开发环境）</li>
            <li>联系 API 提供商启用 CORS 支持</li>
          </ul>
          <div class="text-xs text-blue-700 bg-blue-100 p-3 rounded">
            <strong>示例代理配置：</strong><br>
            将 API 地址从 <code>https://api.example.com/v1</code><br>
            改为 <code>https://your-proxy.workers.dev/?target=https://api.example.com/v1</code>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.config-view {
  padding: 2rem 1rem;
  min-height: 100%;
}
</style>
