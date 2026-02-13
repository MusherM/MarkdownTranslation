<template>
  <div class="h-screen bg-[#0a0a0f] overflow-hidden snap-container">
    <!-- Hero Section -->
    <section class="relative h-screen w-full flex items-center justify-center snap-section overflow-hidden">
      <!-- Animated Background -->
      <div class="absolute inset-0 hero-gradient-bg"></div>

      <!-- Code Particles Canvas -->
      <canvas ref="particlesCanvas" class="absolute inset-0 w-full h-full opacity-30"></canvas>

      <!-- Floating Code Snippets -->
      <div class="absolute inset-0 overflow-hidden pointer-events-none">
        <div class="floating-code code-1">
          <pre><code class="text-cyan-400/40 text-sm">```markdown
# Hello World
```</code></pre>
        </div>
        <div class="floating-code code-2">
          <pre><code class="text-violet-400/40 text-sm">{ type: "heading" }</code></pre>
        </div>
        <div class="floating-code code-3">
          <pre><code class="text-pink-400/40 text-sm">translate(ast)</code></pre>
        </div>
      </div>

      <!-- Main Content -->
      <div class="relative z-10 text-center px-4 max-w-5xl mx-auto">
        <!-- Badge -->
        <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-8 animate-fade-in">
          <span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
          <span class="text-sm text-gray-300">纯前端 Markdown 翻译工具</span>
        </div>

        <!-- Main Title -->
        <h1 class="text-5xl md:text-7xl lg:text-8xl font-bold mb-6 leading-tight">
          <span class="text-white">Markdown</span>
          <span class="gradient-text animate-glow"> Translate</span>
        </h1>

        <!-- Subtitle -->
        <p class="text-xl md:text-2xl text-gray-400 mb-4 max-w-2xl mx-auto">
          基于 AST 的精准翻译，格式完美保留
        </p>
        <p class="text-gray-500 mb-12 max-w-xl mx-auto">
          使用 OpenAI API，密钥仅在本地使用，支持自定义词汇表，动态注入节省 Token
        </p>

        <!-- CTA Buttons -->
        <div class="flex flex-col sm:flex-row gap-4 justify-center items-center animate-fade-in-up">
          <Button
            size="lg"
            class="bg-gradient-to-r from-cyan-500 to-violet-500 hover:from-cyan-400 hover:to-violet-400 text-white px-8 py-6 text-lg font-semibold rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-[0_0_40px_rgba(6,182,212,0.4)]"
            @click="router.push('/translate')"
          >
            <Sparkles class="w-5 h-5 mr-2" />
            开始翻译
          </Button>
          <Button
            size="lg"
            variant="outline"
            class="border-white/30 bg-white/5 text-white hover:bg-white/15 hover:border-white/50 px-8 py-6 text-lg rounded-xl transition-all duration-300"
            @click="scrollToSection(1)"
          >
            <ChevronDown class="w-5 h-5 mr-2" />
            了解更多
          </Button>
        </div>

        <!-- Stats -->
        <div class="mt-16 grid grid-cols-3 gap-8 max-w-lg mx-auto">
          <div class="text-center">
            <div class="text-3xl md:text-4xl font-bold text-white">100%</div>
            <div class="text-sm text-gray-500">格式保留</div>
          </div>
          <div class="text-center">
            <div class="text-3xl md:text-4xl font-bold text-white">纯前端</div>
            <div class="text-sm text-gray-500">隐私安全</div>
          </div>
          <div class="text-center">
            <div class="text-3xl md:text-4xl font-bold text-white">-40%</div>
            <div class="text-sm text-gray-500">Token 节省</div>
          </div>
        </div>
      </div>

      <!-- Scroll Indicator -->
      <div class="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce cursor-pointer" @click="scrollToSection(1)">
        <ChevronDown class="w-6 h-6 text-gray-500" />
      </div>
    </section>

    <!-- Features Section -->
    <section id="features" ref="featuresSection" class="relative h-screen w-full flex items-center justify-center snap-section overflow-hidden">
      <!-- Background Glow -->
      <div class="absolute inset-0 features-gradient-bg"></div>

      <div class="relative z-10 w-full max-w-6xl mx-auto px-4">
        <!-- Section Title -->
        <div class="text-center mb-12">
          <h2 class="text-4xl md:text-5xl lg:text-6xl font-bold mb-4">
            <span class="text-white">核心</span>
            <span class="gradient-text">特性</span>
          </h2>
          <p class="text-gray-400 text-lg">为开发者打造的智能翻译解决方案</p>
        </div>

        <!-- Feature Cards -->
        <div class="grid md:grid-cols-2 gap-6">
          <!-- Feature 1: AST Translation -->
          <div class="feature-card group" :class="{ 'animate-slide-in': featuresVisible }" @click="scrollToSection(2)">
            <div class="feature-card-border"></div>
            <div class="feature-card-content">
              <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                <FileCode class="w-6 h-6 text-cyan-400" />
              </div>
              <h3 class="text-lg font-semibold text-white mb-2">AST 智能翻译</h3>
              <p class="text-gray-400 text-sm leading-relaxed">
                基于抽象语法树的翻译引擎，精准识别 Markdown 结构，确保标题、列表、代码块等格式在翻译后完美保留。
              </p>
              <div class="mt-3 flex gap-2">
                <span class="px-2 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-xs">格式保留</span>
                <span class="px-2 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-xs">精准解析</span>
              </div>
            </div>
          </div>

          <!-- Feature 2: Privacy -->
          <div class="feature-card group" :class="{ 'animate-slide-in': featuresVisible }" style="animation-delay: 0.1s" @click="scrollToSection(2)">
            <div class="feature-card-border"></div>
            <div class="feature-card-content">
              <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/20 to-violet-500/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                <Shield class="w-6 h-6 text-violet-400" />
              </div>
              <h3 class="text-lg font-semibold text-white mb-2">隐私优先设计</h3>
              <p class="text-gray-400 text-sm leading-relaxed">
                纯前端实现，您的 OpenAI API 密钥仅存储在浏览器本地，内容直接发送至 OpenAI，服务端不保存任何数据。
              </p>
              <div class="mt-3 flex gap-2">
                <span class="px-2 py-1 rounded-full bg-violet-500/10 text-violet-400 text-xs">纯前端</span>
                <span class="px-2 py-1 rounded-full bg-violet-500/10 text-violet-400 text-xs">密钥本地存储</span>
              </div>
            </div>
          </div>

          <!-- Feature 3: Glossary -->
          <div class="feature-card group" :class="{ 'animate-slide-in': featuresVisible }" style="animation-delay: 0.2s" @click="scrollToSection(2)">
            <div class="feature-card-border"></div>
            <div class="feature-card-content">
              <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500/20 to-pink-500/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                <BookOpen class="w-6 h-6 text-pink-400" />
              </div>
              <h3 class="text-lg font-semibold text-white mb-2">智能词汇表</h3>
              <p class="text-gray-400 text-sm leading-relaxed">
                自定义专业术语翻译规则，支持 JSON/CSV 格式导入，确保技术文档中的专业词汇翻译一致准确。
              </p>
              <div class="mt-3 flex gap-2">
                <span class="px-2 py-1 rounded-full bg-pink-500/10 text-pink-400 text-xs">术语一致</span>
                <span class="px-2 py-1 rounded-full bg-pink-500/10 text-pink-400 text-xs">批量导入</span>
              </div>
            </div>
          </div>

          <!-- Feature 4: Dynamic Injection -->
          <div class="feature-card group" :class="{ 'animate-slide-in': featuresVisible }" style="animation-delay: 0.3s" @click="scrollToSection(2)">
            <div class="feature-card-border"></div>
            <div class="feature-card-content">
              <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-500/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                <Zap class="w-6 h-6 text-amber-400" />
              </div>
              <h3 class="text-lg font-semibold text-white mb-2">动态词汇注入</h3>
              <p class="text-gray-400 text-sm leading-relaxed">
                智能分析输入内容，仅注入相关的词汇表条目，相比全量注入可节省高达 40% 的 Token，降低翻译成本。
              </p>
              <div class="mt-3 flex gap-2">
                <span class="px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs">节省 Token</span>
                <span class="px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs">智能匹配</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Scroll Indicator -->
      <div class="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce cursor-pointer" @click="scrollToSection(2)">
        <ChevronDown class="w-6 h-6 text-gray-500" />
      </div>
    </section>

    <!-- Demo Section -->
    <section class="relative h-screen w-full flex items-center justify-center snap-section overflow-hidden">
      <!-- Background -->
      <div class="absolute inset-0 demo-gradient-bg"></div>

      <div class="relative z-10 w-full max-w-6xl mx-auto px-4">
        <!-- Section Title -->
        <div class="text-center mb-8">
          <h2 class="text-4xl md:text-5xl lg:text-6xl font-bold mb-4">
            <span class="text-white">实时</span>
            <span class="gradient-text">演示</span>
          </h2>
          <p class="text-gray-400 text-lg">见证 Markdown 格式的完美保留</p>
        </div>

        <!-- Demo Content -->
        <div class="grid lg:grid-cols-2 gap-6">
          <!-- Input -->
          <div class="demo-panel">
            <div class="demo-header">
              <div class="flex items-center gap-2">
                <div class="w-3 h-3 rounded-full bg-red-500"></div>
                <div class="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div class="w-3 h-3 rounded-full bg-green-500"></div>
              </div>
              <span class="text-sm text-gray-400">输入</span>
            </div>
            <div class="demo-content">
              <pre class="text-sm text-gray-300 font-mono whitespace-pre-wrap"><code>{{ demoInput }}</code></pre>
              <span class="typing-cursor"></span>
            </div>
          </div>

          <!-- Output -->
          <div class="demo-panel">
            <div class="demo-header">
              <div class="flex items-center gap-2">
                <div class="w-3 h-3 rounded-full bg-red-500"></div>
                <div class="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div class="w-3 h-3 rounded-full bg-green-500"></div>
              </div>
              <span class="text-sm text-gray-400">输出</span>
            </div>
            <div class="demo-content">
              <pre class="text-sm text-gray-300 font-mono whitespace-pre-wrap"><code>{{ demoOutput }}</code></pre>
            </div>
          </div>
        </div>
      </div>

      <!-- Scroll Indicator -->
      <div class="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce cursor-pointer" @click="scrollToSection(3)">
        <ChevronDown class="w-6 h-6 text-gray-500" />
      </div>
    </section>

    <!-- CTA Section -->
    <section class="relative h-screen w-full flex items-center justify-center snap-section overflow-hidden">
      <div class="absolute inset-0 cta-gradient-bg"></div>
      <div class="relative z-10 max-w-4xl mx-auto text-center px-4">
        <h2 class="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
          <span class="text-white">准备好开始了吗？</span>
        </h2>
        <p class="text-xl text-gray-400 mb-10">
          免费使用，无需注册，立即体验智能 Markdown 翻译
        </p>
        <Button
          size="lg"
          class="bg-gradient-to-r from-cyan-500 to-violet-500 hover:from-cyan-400 hover:to-violet-400 text-white px-10 py-6 text-lg font-semibold rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-[0_0_60px_rgba(6,182,212,0.5)]"
          @click="router.push('/translate')"
        >
          <Sparkles class="w-5 h-5 mr-2" />
          立即开始翻译
        </Button>

        <!-- Footer Info -->
        <div class="mt-20 flex flex-col md:flex-row justify-center items-center gap-4 text-gray-500 text-sm">
          <div class="flex items-center gap-2">
            <FileCode class="w-4 h-4 text-cyan-400" />
            <span class="text-white font-semibold">Markdown Translate</span>
          </div>
          <span class="hidden md:inline">|</span>
          <span>基于 AST 的 Markdown 翻译工具 | 纯前端 | 隐私优先</span>
        </div>
      </div>

      <!-- Back to Top -->
      <div class="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce cursor-pointer" @click="scrollToSection(0)">
        <ChevronUp class="w-6 h-6 text-gray-500" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  FileCode,
  Shield,
  BookOpen,
  Zap
} from 'lucide-vue-next'

const router = useRouter()
const featuresSection = ref<HTMLElement | null>(null)
const featuresVisible = ref(false)
const particlesCanvas = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)

// Demo typing effect
const demoInput = ref('')
const demoOutput = ref('')
const fullInput = `# 快速开始

## 安装
\`\`\`bash
npm install markdown-translate
\`\`\`

### 特性
- **AST 解析**: 精准识别结构
- *格式保留*: 翻译后格式完美
- ~高效快速~: 智能词汇注入`

const fullOutput = `# Quick Start

## Installation
\`\`\`bash
npm install markdown-translate
\`\`\`

### Features
- **AST Parsing**: Precise structure recognition
- *Format Preserved*: Perfect formatting after translation
- ~Efficient & Fast~: Smart glossary injection`

let typingInterval: ReturnType<typeof setInterval> | null = null
let outputTypingInterval: ReturnType<typeof setInterval> | null = null

// Typing effect for demo
function startTypingEffect() {
  let index = 0
  typingInterval = setInterval(() => {
    if (index <= fullInput.length) {
      demoInput.value = fullInput.slice(0, index)
      index++
    } else {
      if (typingInterval) clearInterval(typingInterval)
      // Start output typing after input completes
      startOutputTyping()
    }
  }, 30)
}

function startOutputTyping() {
  let index = 0
  outputTypingInterval = setInterval(() => {
    if (index <= fullOutput.length) {
      demoOutput.value = fullOutput.slice(0, index)
      index++
    } else {
      if (outputTypingInterval) clearInterval(outputTypingInterval)
      // Restart after delay
      setTimeout(() => {
        demoInput.value = ''
        demoOutput.value = ''
        startTypingEffect()
      }, 3000)
    }
  }, 25)
}

// Scroll to section by index
function scrollToSection(index: number) {
  const container = document.querySelector('.snap-container')
  const sections = container?.querySelectorAll('.snap-section')
  if (sections && sections[index]) {
    sections[index].scrollIntoView({ behavior: 'smooth' })
  }
}

// Intersection Observer for scroll animations
onMounted(() => {
  // Start demo typing
  startTypingEffect()

  // Setup intersection observer
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          featuresVisible.value = true
          observer.unobserve(entry.target)
        }
      })
    },
    { threshold: 0.2 }
  )

  if (featuresSection.value) {
    observer.observe(featuresSection.value)
  }

  // Setup particles
  setupParticles()

  onUnmounted(() => {
    observer.disconnect()
    if (typingInterval) clearInterval(typingInterval)
    if (outputTypingInterval) clearInterval(outputTypingInterval)
  })
})

// Particle animation
function setupParticles() {
  const canvas = particlesCanvas.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const resize = () => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }
  resize()
  window.addEventListener('resize', resize)

  const particles: Array<{
    x: number
    y: number
    vx: number
    vy: number
    size: number
    opacity: number
    char: string
  }> = []

  const chars = ['{', '}', '[', ']', '#', '*', '`', '<', '>', '/']

  for (let i = 0; i < 30; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size: Math.random() * 14 + 10,
      opacity: Math.random() * 0.3 + 0.1,
      char: chars[Math.floor(Math.random() * chars.length)]
    })
  }

  let animationId: number
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    particles.forEach((p) => {
      p.x += p.vx
      p.y += p.vy

      if (p.x < 0 || p.x > canvas.width) p.vx *= -1
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1

      ctx.font = `${p.size}px monospace`
      ctx.fillStyle = `rgba(6, 182, 212, ${p.opacity})`
      ctx.fillText(p.char, p.x, p.y)
    })

    animationId = requestAnimationFrame(animate)
  }
  animate()

  onUnmounted(() => {
    cancelAnimationFrame(animationId)
    window.removeEventListener('resize', resize)
  })
}
</script>

<style scoped>
/* Snap Scrolling */
.snap-container {
  scroll-snap-type: y mandatory;
  overflow-y: scroll;
  scroll-behavior: smooth;
}

.snap-section {
  scroll-snap-align: start;
  scroll-snap-stop: always;
}

/* Gradient Text */
.gradient-text {
  background: linear-gradient(135deg, #06b6d4 0%, #8b5cf6 50%, #ec4899 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Hero Background Animation */
.hero-gradient-bg {
  background:
    radial-gradient(ellipse 80% 50% at 50% -20%, rgba(6, 182, 212, 0.15), transparent),
    radial-gradient(ellipse 60% 40% at 80% 80%, rgba(139, 92, 246, 0.1), transparent),
    radial-gradient(ellipse 50% 30% at 20% 100%, rgba(236, 72, 153, 0.08), transparent);
}

/* Features Background */
.features-gradient-bg {
  background:
    radial-gradient(ellipse 60% 40% at 20% 20%, rgba(6, 182, 212, 0.1), transparent),
    radial-gradient(ellipse 50% 30% at 80% 80%, rgba(139, 92, 246, 0.08), transparent);
}

/* Demo Background */
.demo-gradient-bg {
  background:
    radial-gradient(ellipse 50% 40% at 50% 50%, rgba(139, 92, 246, 0.08), transparent),
    radial-gradient(ellipse 40% 30% at 10% 90%, rgba(6, 182, 212, 0.06), transparent);
}

/* CTA Background */
.cta-gradient-bg {
  background:
    radial-gradient(ellipse 80% 50% at 50% 100%, rgba(6, 182, 212, 0.12), transparent),
    radial-gradient(ellipse 60% 40% at 20% 20%, rgba(236, 72, 153, 0.08), transparent),
    radial-gradient(ellipse 50% 30% at 80% 20%, rgba(139, 92, 246, 0.06), transparent);
}

/* Glowing Animation */
@keyframes glow {
  0%, 100% {
    filter: drop-shadow(0 0 20px rgba(6, 182, 212, 0.5)) drop-shadow(0 0 40px rgba(139, 92, 246, 0.3));
  }
  50% {
    filter: drop-shadow(0 0 30px rgba(6, 182, 212, 0.7)) drop-shadow(0 0 60px rgba(139, 92, 246, 0.5));
  }
}

.animate-glow {
  animation: glow 3s ease-in-out infinite;
}

/* Fade In Animation */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fadeIn 0.8s ease-out forwards;
}

.animate-fade-in-up {
  animation: fadeIn 1s ease-out 0.3s forwards;
  opacity: 0;
}

/* Floating Code Animation */
.floating-code {
  position: absolute;
  font-family: monospace;
  animation: float 20s ease-in-out infinite;
}

.code-1 {
  top: 20%;
  left: 10%;
  animation-delay: 0s;
}

.code-2 {
  top: 60%;
  right: 15%;
  animation-delay: -7s;
}

.code-3 {
  bottom: 20%;
  left: 20%;
  animation-delay: -14s;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0) rotate(0deg);
    opacity: 0.3;
  }
  25% {
    transform: translateY(-30px) rotate(2deg);
    opacity: 0.5;
  }
  50% {
    transform: translateY(-20px) rotate(-1deg);
    opacity: 0.4;
  }
  75% {
    transform: translateY(-40px) rotate(1deg);
    opacity: 0.5;
  }
}

/* Feature Cards */
.feature-card {
  position: relative;
  border-radius: 1rem;
  overflow: hidden;
  opacity: 0;
  transform: translateY(30px);
  cursor: pointer;
}

.feature-card.animate-slide-in {
  animation: slideIn 0.6s ease-out forwards;
}

@keyframes slideIn {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.feature-card-border {
  position: absolute;
  inset: 0;
  border-radius: 1rem;
  padding: 1px;
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.5), rgba(139, 92, 246, 0.3), rgba(236, 72, 153, 0.2));
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}

.feature-card-content {
  position: relative;
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(10px);
  border-radius: 1rem;
  padding: 1.5rem;
  height: 100%;
  transition: background 0.3s ease;
}

.feature-card:hover .feature-card-content {
  background: rgba(255, 255, 255, 0.06);
}

.feature-card:hover .feature-card-border {
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.8), rgba(139, 92, 246, 0.6), rgba(236, 72, 153, 0.4));
  animation: borderRotate 3s linear infinite;
}

@keyframes borderRotate {
  0% {
    background: linear-gradient(0deg, rgba(6, 182, 212, 0.8), rgba(139, 92, 246, 0.6));
  }
  25% {
    background: linear-gradient(90deg, rgba(6, 182, 212, 0.8), rgba(139, 92, 246, 0.6));
  }
  50% {
    background: linear-gradient(180deg, rgba(6, 182, 212, 0.8), rgba(139, 92, 246, 0.6));
  }
  75% {
    background: linear-gradient(270deg, rgba(6, 182, 212, 0.8), rgba(139, 92, 246, 0.6));
  }
  100% {
    background: linear-gradient(360deg, rgba(6, 182, 212, 0.8), rgba(139, 92, 246, 0.6));
  }
}

/* Demo Panel */
.demo-panel {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
  overflow: hidden;
}

.demo-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.02);
}

.demo-content {
  padding: 1rem;
  min-height: 200px;
  max-height: 280px;
  overflow-y: auto;
  position: relative;
}

.typing-cursor {
  display: inline-block;
  width: 2px;
  height: 1.2em;
  background: #06b6d4;
  animation: blink 1s step-end infinite;
  vertical-align: middle;
  margin-left: 2px;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

/* Hide scrollbar for snap container */
.snap-container::-webkit-scrollbar {
  display: none;
}

.snap-container {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* Responsive */
@media (max-width: 768px) {
  .floating-code {
    display: none;
  }

  .demo-content {
    min-height: 150px;
    max-height: 200px;
  }
}
</style>
