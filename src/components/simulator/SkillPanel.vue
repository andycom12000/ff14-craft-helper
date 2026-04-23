<script setup lang="ts">
import { computed } from 'vue'
import type { CraftState } from '@/engine/simulator'
import { canUseAction } from '@/engine/simulator'
import {
  getSkillsByLevel,
  getSkillIconUrl,
  getSkillNameByLocale,
  type SkillCategory,
  type SkillDefinition,
  type SupportedLocale,
} from '@/engine/skills'
import { useLocaleStore } from '@/stores/locale'

const props = defineProps<{
  level: number
  craftState: CraftState | null
}>()

const emit = defineEmits<{
  'use-skill': [skillId: string]
}>()

const localeStore = useLocaleStore()

const currentLocale = computed<SupportedLocale>(() => {
  const raw = localeStore.current
  if (raw === 'en' || raw === 'ja' || raw === 'zh-TW' || raw === 'zh-CN') return raw
  return 'zh-TW'
})

const availableSkills = computed(() => getSkillsByLevel(props.level))

const categoryLabels: Record<SkillCategory, string> = {
  progress: '進展',
  quality: '品質',
  buff: '增益',
  repair: '修復',
  other: '其他',
}

const categories: SkillCategory[] = ['progress', 'quality', 'buff', 'repair', 'other']

function skillsByCategory(category: SkillCategory): SkillDefinition[] {
  return availableSkills.value.filter(s => s.category === category)
}

function isDisabled(skillId: string): boolean {
  if (!props.craftState) return true
  return !canUseAction(props.craftState, skillId)
}

function handleClick(skillId: string) {
  if (!isDisabled(skillId)) {
    emit('use-skill', skillId)
  }
}

function skillDisplayName(skill: SkillDefinition): string {
  return getSkillNameByLocale(skill.id, currentLocale.value)
}

function tooltipContent(skill: SkillDefinition): string {
  const name = skillDisplayName(skill)
  const cp = `${skill.cp} CP`
  return `${name} · ${cp}\n${skill.description}`
}
</script>

<template>
  <div class="skill-panel">
    <el-tabs type="border-card">
      <el-tab-pane
        v-for="cat in categories"
        :key="cat"
        :label="categoryLabels[cat]"
      >
        <div class="skill-grid">
          <el-tooltip
            v-for="skill in skillsByCategory(cat)"
            :key="skill.id"
            :content="tooltipContent(skill)"
            placement="top"
            :show-after="150"
          >
            <button
              type="button"
              class="skill-btn"
              :class="{ 'is-disabled': isDisabled(skill.id) }"
              :disabled="isDisabled(skill.id)"
              :aria-label="skillDisplayName(skill)"
              :title="skillDisplayName(skill)"
              @click="handleClick(skill.id)"
            >
              <template v-if="getSkillIconUrl(skill)">
                <img
                  :src="getSkillIconUrl(skill)!"
                  :alt="skillDisplayName(skill)"
                  class="skill-icon"
                  loading="lazy"
                />
                <span class="skill-name">{{ skillDisplayName(skill) }}</span>
              </template>
              <template v-else>
                <span class="skill-name skill-name-only">{{ skillDisplayName(skill) }}</span>
              </template>
              <span class="skill-cp">{{ skill.cp }} CP</span>
            </button>
          </el-tooltip>
        </div>
        <el-empty
          v-if="skillsByCategory(cat).length === 0"
          description="此分類無可用技能"
          :image-size="60"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.skill-panel {
  margin-top: 8px;
}

.skill-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.skill-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 72px;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-bg-color-overlay, var(--el-bg-color));
  color: var(--el-text-color-primary);
  cursor: pointer;
  transition:
    transform 120ms ease,
    border-color 120ms ease,
    box-shadow 120ms ease,
    background-color 120ms ease;
  line-height: 1.3;
}

.skill-btn:hover:not(.is-disabled) {
  transform: translateY(-1px);
  border-color: var(--app-accent, var(--el-color-primary));
  box-shadow: 0 2px 10px var(--app-accent-glow, rgba(99, 102, 241, 0.15));
}

.skill-btn:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.skill-btn.is-disabled {
  opacity: 0.4;
  cursor: not-allowed;
  filter: grayscale(0.35);
}

.skill-icon {
  width: 40px;
  height: 40px;
  image-rendering: pixelated;
  border-radius: 6px;
}

.skill-name {
  font-size: 12px;
  font-weight: 500;
}

.skill-name-only {
  font-size: 13px;
  padding: 6px 0;
}

.skill-cp {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
</style>
