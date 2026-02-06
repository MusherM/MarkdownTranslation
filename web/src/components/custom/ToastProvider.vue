<script setup lang="ts">
import { provide, readonly } from 'vue'
import { toast as sonnerToast } from 'vue-sonner'
import Sonner from '@/components/ui/sonner/Sonner.vue'

// Toast 类型定义
export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'loading'

export interface ToastOptions {
  description?: string
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}

// 注入键
export const ToastInjectionKey = Symbol('toast')

// Toast 方法接口
export interface ToastMethods {
  success: (message: string, options?: ToastOptions) => void
  error: (message: string, options?: ToastOptions) => void
  info: (message: string, options?: ToastOptions) => void
  warning: (message: string, options?: ToastOptions) => void
  loading: (message: string, options?: ToastOptions) => void
  dismiss: (id?: string | number) => void
}

// 创建 toast 方法
function createToastMethods(): ToastMethods {
  return {
    success: (message: string, options?: ToastOptions) => {
      sonnerToast.success(message, {
        description: options?.description,
        duration: options?.duration,
      })
    },
    
    error: (message: string, options?: ToastOptions) => {
      sonnerToast.error(message, {
        description: options?.description,
        duration: options?.duration,
      })
    },
    
    info: (message: string, options?: ToastOptions) => {
      sonnerToast.info(message, {
        description: options?.description,
        duration: options?.duration,
      })
    },
    
    warning: (message: string, options?: ToastOptions) => {
      sonnerToast.warning(message, {
        description: options?.description,
        duration: options?.duration,
      })
    },
    
    loading: (message: string, options?: ToastOptions) => {
      sonnerToast.loading(message, {
        description: options?.description,
        duration: options?.duration,
      })
    },
    
    dismiss: (id?: string | number) => {
      if (id !== undefined) {
        sonnerToast.dismiss(id)
      } else {
        sonnerToast.dismiss()
      }
    },
  }
}

const toastMethods = createToastMethods()

// 提供给子组件
provide(ToastInjectionKey, readonly(toastMethods))
</script>

<template>
  <!-- Sonner Toast 容器 -->
  <Sonner
    position="bottom-right"
    :expand="true"
    :rich-colors="true"
    :close-button="true"
    :duration="4000"
  />
  
  <!-- 插槽内容 -->
  <slot />
</template>
