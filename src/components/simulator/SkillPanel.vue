<script setup lang="ts">
import { computed } from 'vue'
import type { CraftState } from '@/engine/simulator'
import { canUseAction } from '@/engine/simulator'
import { getSkillsByLevel, type SkillCategory, type SkillDefinition } from '@/engine/skills'

const props = defineProps<{
  level: number
  craftState: CraftState | null
}>()

const emit = defineEmits<{
  'use-skill': [skillId: string]
}>()

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
            :content="skill.description"
            placement="top"
          >
            <el-button
              :disabled="isDisabled(skill.id)"
              size="small"
              @click="handleClick(skill.id)"
              class="skill-btn"
            >
              <div class="skill-btn-content">
                <span class="skill-name">{{ skill.nameZh }}</span>
                <span class="skill-cp">{{ skill.cp }} CP</span>
              </div>
            </el-button>
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
  gap: 6px;
}

.skill-btn {
  height: auto;
  padding: 6px 10px;
}

.skill-btn-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  line-height: 1.3;
}

.skill-name {
  font-size: 13px;
}

.skill-cp {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
</style>
