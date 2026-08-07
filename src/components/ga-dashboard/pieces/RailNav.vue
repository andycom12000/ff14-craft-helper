<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'

// Fixed left rail — collapsed 56px, expands to 248px on hover. Scroll-spy via
// IntersectionObserver toggles the active item; clicks smooth-scroll using
// window.scrollTo (NOT scrollIntoView, per the design handoff). Ids are set
// by GaDashboardView.vue.
//
// Rail reduced to 4 items (spec #194 §E5 / #197): the rail points at page
// landmarks (概覽 / 本期待辦 / two layer sections), while a todo row's own
// `anchor` points at a Layer I chart id — the two positioning systems stay
// separate (spec §C1 / §E5 last line). `本期待辦` has no roman numeral: it's
// the page-level ledger, not a section.
const items = [
  { id: 'hero', num: '0', label: '概覽' },
  { id: 'todo', num: '·', label: '本期待辦' },
  { id: 'sec-why', num: 'I', label: '為什麼會亮' },
  { id: 'sec-context', num: 'II', label: '背景與觀測' },
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
  transition: color 160ms ease-out, background 160ms ease-out;
  cursor: pointer;
}
.rail-nav a:hover {
  color: oklch(0.94 0.022 82);
  background: oklch(0.22 0.025 60 / 0.45);
}
.rail-nav a.active {
  color: oklch(0.78 0.15 72);
  background: oklch(0.78 0.15 72 / 0.10);
}
.rail-nav .num {
  font-family: 'Fira Code', monospace;
  font-weight: 600;
  font-size: 12px; line-height: 1;
  letter-spacing: 0.06em;
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
