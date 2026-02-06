<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'
import { Toaster } from '@/components/ui/sonner'
</script>

<template>
  <AppLayout>
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
