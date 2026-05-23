<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'

// Fixed left rail — collapsed 56px, expands to 248px on hover. Scroll-spy via
// IntersectionObserver toggles the active item; clicks smooth-scroll using
// window.scrollTo (NOT scrollIntoView, per the design handoff). Section ids are
// set by GaDashboardView.vue.
const items = [
  { id: 'hero', num: '0', label: '概覽' },
  { id: 'sec-1', num: 'ɪ', label: '注意力落在哪裡' },
  { id: 'sec-2', num: 'ɪɪ', label: '流程在哪裡漏' },
  { id: 'sec-3', num: 'ɪɪɪ', label: '誰把份量帶進來' },
  { id: 'sec-4', num: 'ɪᴠ', label: '新訪客在哪一階停下' },
  { id: 'sec-5', num: 'ᴠ', label: '摩擦發生在哪裡' },
  { id: 'sec-6', num: 'ᴠɪ', label: '系統哪裡正在裂' },
]

const activeId = ref<string>('hero')
let observer: IntersectionObserver | null = null

function go(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const top = el.getBoundingClientRect().top + window.scrollY - 40
  window.scrollTo({ top, behavior: 'smooth' })
}

onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) activeId.value = entry.target.id
      })
    },
    { rootMargin: '-30% 0px -55% 0px', threshold: 0 },
  )
  items.forEach((it) => {
    const el = document.getElementById(it.id)
    if (el) observer!.observe(el)
  })
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <nav class="rail-nav" aria-label="Sections">
    <ul>
      <li v-for="it in items" :key="it.id">
        <a
          :href="`#${it.id}`"
          :class="{ active: activeId === it.id }"
          @click.prevent="go(it.id)"
        >
          <span class="num">{{ it.num }}</span>
          <span class="label">{{ it.label }}</span>
        </a>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.rail-nav {
  position: fixed; left: 0; top: 0; bottom: 0;
  width: 56px; z-index: 50;
  background: oklch(0.16 0.014 60 / 0.94);
  border-right: 1px solid oklch(0.42 0.035 60 / 0.22);
  overflow: hidden;
  transition: width 220ms cubic-bezier(0.4, 0, 0.2, 1);
}
.rail-nav:hover, .rail-nav:focus-within { width: 248px; }
.rail-nav ul {
  list-style: none; margin: 0;
  padding: 92px 0 0;
  display: flex; flex-direction: column;
}
.rail-nav li { margin: 0; }
.rail-nav a {
  display: grid;
  grid-template-columns: 56px 1fr;
  align-items: center;
  text-decoration: none;
  color: oklch(0.66 0.024 68);
  padding: 16px 0;
  border-left: 2px solid transparent;
  transition: color 160ms ease-out, background 160ms ease-out, border-left-color 160ms ease-out;
  cursor: pointer;
}
.rail-nav a:hover {
  color: oklch(0.94 0.022 82);
  background: oklch(0.22 0.025 60 / 0.45);
}
.rail-nav a.active {
  color: oklch(0.78 0.15 72);
  background: oklch(0.78 0.15 72 / 0.08);
  border-left-color: oklch(0.78 0.15 72);
}
.rail-nav .num {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic; font-weight: 500;
  font-size: 22px; line-height: 1;
  text-align: center;
}
.rail-nav .label {
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  font-size: 13px; font-weight: 500;
  letter-spacing: 0.04em;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 160ms ease-out 60ms;
  padding-left: 4px;
}
.rail-nav:hover .label, .rail-nav:focus-within .label { opacity: 1; }
.rail-nav::before {
  content: ''; position: absolute; top: 36px; left: 16px; right: 16px;
  height: 1px; background: oklch(0.78 0.15 72); opacity: 0.5;
}
.rail-nav::after {
  content: '吐司工坊 · GA'; position: absolute; top: 50px; left: 14px;
  font-family: 'Fira Code', monospace; font-size: 10px;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: oklch(0.78 0.15 72);
  white-space: nowrap;
  opacity: 0;
  transition: opacity 160ms ease-out 60ms;
}
.rail-nav:hover::after, .rail-nav:focus-within::after { opacity: 1; }
</style>
