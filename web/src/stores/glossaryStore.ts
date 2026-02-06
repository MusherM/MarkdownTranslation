import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { parse } from 'jsonc-parser'

/**
 * 词汇表类型
 * source: 源语言词汇
 * target: 目标语言翻译
 */
export type Glossary = Record<string, string>

/**
 * 导入选项
 */
export interface GlossaryImportOptions {
  strategy: 'replace' | 'merge'
}

/**
 * localStorage 键名
 */
const STORAGE_KEY = 'md-translate-glossary'

/**
 * 防抖保存延迟时间 (毫秒)
 */
const DEBOUNCE_MS = 500

/**
 * 词汇表管理 Store
 * - 使用 localStorage 持久化存储
 * - 防抖自动保存
 * - 支持导入/导出 JSON 文件
 * - 支持 Replace/Merge 导入策略
 */
export const useGlossaryStore = defineStore('glossary', () => {
  // 词汇表状态
  const glossary = ref<Glossary>({})

  // 防抖定时器
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 防抖保存到 localStorage
   */
  function debouncedSave(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }
    debounceTimer = setTimeout(() => {
      saveToStorage()
    }, DEBOUNCE_MS)
  }

  /**
   * 从 localStorage 加载词汇表
   */
  function loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        glossary.value = JSON.parse(stored)
      }
    } catch (e) {
      console.error('加载词汇表失败:', e)
    }
  }

  /**
   * 保存词汇表到 localStorage
   */
  function saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(glossary.value))
    } catch (e) {
      console.error('保存词汇表失败:', e)
    }
  }

  /**
   * 立即保存（取消防抖）
   */
  function saveImmediately(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    saveToStorage()
  }

  /**
   * 添加词条
   * @param source 源语言词汇
   * @param target 目标语言翻译
   */
  function addEntry(source: string, target: string): void {
    if (source.trim()) {
      glossary.value[source.trim()] = target
    }
  }

  /**
   * 删除词条
   * @param source 源语言词汇
   */
  function removeEntry(source: string): void {
    delete glossary.value[source]
  }

  /**
   * 更新词条
   * @param source 源语言词汇
   * @param target 新的目标语言翻译
   */
  function updateEntry(source: string, target: string): void {
    if (source in glossary.value) {
      glossary.value[source] = target
    }
  }

  /**
   * 清空词汇表
   */
  function clear(): void {
    glossary.value = {}
  }

  /**
   * 从 JSON 文件导入词汇表
   * @param file 文件对象
   * @param options 导入选项
   */
  async function importFromFile(file: File, options: GlossaryImportOptions): Promise<void> {
    try {
      const text = await file.text()
      const data = parse(text)

      // 验证数据格式
      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        throw new Error('词汇表必须是 JSON 对象')
      }

      if (options.strategy === 'replace') {
        // Replace 策略：完全替换
        glossary.value = data
      } else {
        // Merge 策略：合并，新词覆盖旧词
        glossary.value = { ...glossary.value, ...data }
      }
    } catch (e) {
      console.error('导入词汇表失败:', e)
      throw e
    }
  }

  /**
   * 导出词汇表为 JSON 文件下载
   */
  function exportToFile(): void {
    const blob = new Blob([JSON.stringify(glossary.value, null, 2)], {
      type: 'application/json'
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url

    // 生成文件名：glossary-YYYY-MM-DD.json
    const date = new Date().toISOString().split('T')[0]
    a.download = `glossary-${date}.json`

    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /**
   * 获取词条数量
   */
  function getEntryCount(): number {
    return Object.keys(glossary.value).length
  }

  /**
   * 检查词条是否存在
   * @param source 源语言词汇
   */
  function hasEntry(source: string): boolean {
    return source in glossary.value
  }

  // 监听词汇表变化，防抖保存到 localStorage
  watch(glossary, debouncedSave, { deep: true })

  // 初始化时从 localStorage 加载
  loadFromStorage()

  return {
    // 状态
    glossary,

    // 持久化方法
    loadFromStorage,
    saveToStorage,
    saveImmediately,

    // 词条管理方法
    addEntry,
    removeEntry,
    updateEntry,
    clear,
    hasEntry,
    getEntryCount,

    // 导入导出方法
    importFromFile,
    exportToFile
  }
})
