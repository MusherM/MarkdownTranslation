<script setup lang="ts">
import { ref, computed, h } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

const route = useRoute()
const router = useRouter()
const isMobileMenuOpen = ref(false)

// Icon components using h() function
const LanguagesIcon = {
  render() {
    return h('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      width: '20',
      height: '20',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      class: this.class
    }, [
      h('path', { d: 'm5 8 6 6' }),
      h('path', { d: 'm4 14 6-6 2-3' }),
      h('path', { d: 'M2 5h12' }),
      h('path', { d: 'M7 2h1' }),
      h('path', { d: 'm22 22-5-10-5 10' }),
      h('path', { d: 'M14 18h6' })
    ])
  }
}

const BookOpenIcon = {
  render() {
    return h('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      width: '20',
      height: '20',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      class: this.class
    }, [
      h('path', { d: 'M12 7v14' }),
      h('path', { d: 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z' })
    ])
  }
}

const SettingsIcon = {
  render() {
    return h('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      width: '20',
      height: '20',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      class: this.class
    }, [
      h('path', { d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z' }),
      h('circle', { cx: '12', cy: '12', r: '3' })
    ])
  }
}

const MenuIcon = {
  render() {
    return h('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      width: '20',
      height: '20',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round'
    }, [
      h('line', { x1: '4', x2: '20', y1: '12', y2: '12' }),
      h('line', { x1: '4', x2: '20', y1: '6', y2: '6' }),
      h('line', { x1: '4', x2: '20', y1: '18', y2: '18' })
    ])
  }
}

const navItems = [
  { name: '翻译', path: '/translate', icon: LanguagesIcon },
  { name: '词汇表', path: '/glossary', icon: BookOpenIcon },
  { name: '配置', path: '/config', icon: SettingsIcon },
]

const currentPath = computed(() => route.path)

function navigateTo(path: string) {
  router.push(path)
  isMobileMenuOpen.value = false
}
</script>

<template>
  <div class="min-h-screen flex bg-background">
    <!-- Desktop Sidebar -->
    <aside class="hidden md:flex w-64 flex-col border-r bg-background">
      <!-- Logo -->
      <div class="flex h-16 items-center border-b px-6">
        <div class="flex items-center gap-2">
          <div class="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <span class="text-primary-foreground font-bold text-sm">MD</span>
          </div>
          <span class="font-semibold text-lg">翻译工具</span>
        </div>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 p-4 space-y-1">
        <button
          v-for="item in navItems"
          :key="item.path"
          @click="navigateTo(item.path)"
          :class="[
            'w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            currentPath === item.path
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          ]"
        >
          <component :is="item.icon" class="h-5 w-5" />
          {{ item.name }}
        </button>
      </nav>

      <!-- Footer -->
      <div class="border-t p-4">
        <p class="text-xs text-muted-foreground text-center">
          Markdown Translate
        </p>
      </div>
    </aside>

    <!-- Mobile Header -->
    <div class="md:hidden fixed top-0 left-0 right-0 z-50 border-b bg-background">
      <div class="flex h-14 items-center justify-between px-4">
        <!-- Mobile Menu Button -->
        <Dialog v-model:open="isMobileMenuOpen">
          <DialogTrigger as-child>
            <Button variant="ghost" size="icon">
              <MenuIcon class="h-5 w-5" />
              <span class="sr-only">打开菜单</span>
            </Button>
          </DialogTrigger>
          <DialogContent side="left" class="w-72 p-0 gap-0">
            <DialogHeader class="border-b p-4">
              <DialogTitle class="flex items-center gap-2">
                <div class="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                  <span class="text-primary-foreground font-bold text-sm">MD</span>
                </div>
                <span>翻译工具</span>
              </DialogTitle>
            </DialogHeader>
            <nav class="p-4 space-y-1">
              <button
                v-for="item in navItems"
                :key="item.path"
                @click="navigateTo(item.path)"
                :class="[
                  'w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  currentPath === item.path
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                ]"
              >
                <component :is="item.icon" class="h-5 w-5" />
                {{ item.name }}
              </button>
            </nav>
          </DialogContent>
        </Dialog>

        <!-- Logo -->
        <div class="flex items-center gap-2">
          <div class="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
            <span class="text-primary-foreground font-bold text-xs">MD</span>
          </div>
          <span class="font-semibold">翻译工具</span>
        </div>

        <!-- Spacer for balance -->
        <div class="w-9" />
      </div>
    </div>

    <!-- Main Content -->
    <main class="flex-1 flex flex-col min-w-0">
      <!-- Desktop Header -->
      <header class="hidden md:flex h-16 items-center border-b px-6 bg-background">
        <h1 class="text-lg font-semibold">
          {{ navItems.find(item => item.path === currentPath)?.name || '首页' }}
        </h1>
      </header>

      <!-- Page Content -->
      <div class="flex-1 p-4 md:p-6 mt-14 md:mt-0">
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
/* Custom scrollbar for sidebar */
aside::-webkit-scrollbar {
  width: 4px;
}

aside::-webkit-scrollbar-track {
  background: transparent;
}

aside::-webkit-scrollbar-thumb {
  background: hsl(var(--border));
  border-radius: 2px;
}

aside::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground));
}
</style>
