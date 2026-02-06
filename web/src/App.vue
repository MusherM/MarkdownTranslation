<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'
import { Toaster } from '@/components/ui/sonner'
</script>

<template>
  <AppLayout>
    <RouterView />
  </AppLayout>
  <Toaster />
</template>

<style>
@import "tailwindcss";
</style>
