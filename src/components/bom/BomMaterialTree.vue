<script setup lang="ts">
import type { MaterialNode } from '@/stores/bom'

defineProps<{
  tree: MaterialNode[]
}>()

const emit = defineEmits<{
  'simulate-recipe': [recipeId: number]
  'toggle-collapsed': [node: MaterialNode]
}>()
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <span class="card-title">材料樹狀圖</span>
    </template>

    <el-empty v-if="tree.length === 0" description="尚未計算" :image-size="80" />

    <el-tree
      v-else
      :data="tree"
      :props="{ label: 'name', children: 'children' }"
      default-expand-all
      :expand-on-click-node="false"
    >
      <template #default="{ data }">
        <div class="tree-node">
          <img :src="data.icon" :alt="data.name" class="node-icon" />
          <span class="node-name" :class="{ 'node-collapsed': data.collapsed }">
            {{ data.name }}
          </span>
          <el-tag size="small" type="info" class="node-amount">
            x{{ data.amount }}
          </el-tag>
          <template v-if="data.recipeId">
            <el-button
              :type="data.collapsed ? 'success' : 'warning'"
              size="small"
              text
              @click.stop="emit('toggle-collapsed', data)"
            >
              {{ data.collapsed ? '改為製作' : '改為購買' }}
            </el-button>
            <el-button
              type="primary"
              size="small"
              text
              class="node-simulate"
              @click.stop="emit('simulate-recipe', data.recipeId)"
            >
              加入模擬佇列
            </el-button>
          </template>
        </div>
      </template>
    </el-tree>
  </el-card>
</template>

<style scoped>
.tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.node-icon {
  width: 24px;
  height: 24px;
}

.node-name {
  font-size: 14px;
}

.node-collapsed {
  text-decoration: line-through;
  opacity: 0.6;
}

.node-amount {
  margin-left: 4px;
}

.node-simulate {
  margin-left: auto;
}
</style>
