<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'
import { computed } from 'vue'
import AppLayout from '@/layouts/AppLayout.vue'
import { Toaster } from '@/components/ui/sonner'

const route = useRoute()
const isHomePage = computed(() => route.path === '/')
</script>

<template>
  <!-- 首页不使用侧边栏，独占全屏 -->
  <template v-if="isHomePage">
    <RouterView />
  </template>

  <!-- 其他页面使用带侧边栏的布局 -->
  <AppLayout v-else>
    <RouterView v-slot="{ Component, route }">
      <KeepAlive>
        <component :is="Component" v-if="route.meta.keepAlive" />
      </KeepAlive>
      <component :is="Component" v-if="!route.meta.keepAlive" />
    </RouterView>
  </AppLayout>

  <Toaster />
</template>

<style>
@import "tailwindcss";
</style>
