import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

/**
 * 配置接口
 */
export interface Config {
  baseUrl: string
  apiKey: string
  modelName: string
  translateMarkdownCodeBlocks: boolean
}

/**
 * localStorage 键名
 */
const STORAGE_KEY = 'md-translate-config'

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Config = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  modelName: 'gpt-4o-mini',
  translateMarkdownCodeBlocks: false
}

/**
 * 配置管理 Store
 * - 使用 localStorage 持久化存储
 * - 自动监听变化并保存
 * - 提供默认值
 */
export const useConfigStore = defineStore('config', () => {
  // 配置状态
  const config = ref<Config>({ ...DEFAULT_CONFIG })

  /**
   * 从 localStorage 加载配置
   */
  function loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        // 合并存储的配置与默认值，确保结构完整性
        config.value = { ...DEFAULT_CONFIG, ...parsed }
      }
    } catch (e) {
      console.error('加载配置失败:', e)
    }
  }

  /**
   * 保存配置到 localStorage
   */
  function saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config.value))
    } catch (e) {
      console.error('保存配置失败:', e)
    }
  }

  /**
   * 重置配置为默认值
   */
  function reset(): void {
    config.value = { ...DEFAULT_CONFIG }
  }

  // 监听配置变化，自动保存到 localStorage
  watch(config, saveToStorage, { deep: true })

  // 初始化时从 localStorage 加载
  loadFromStorage()

  return {
    config,
    loadFromStorage,
    saveToStorage,
    reset
  }
})
