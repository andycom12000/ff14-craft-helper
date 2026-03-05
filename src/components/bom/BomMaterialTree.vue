<script setup lang="ts">
import type { MaterialNode } from '@/stores/bom'

defineProps<{
  tree: MaterialNode[]
}>()

const emit = defineEmits<{
  'simulate-recipe': [recipeId: number]
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
          <span class="node-name">{{ data.name }}</span>
          <el-tag size="small" type="info" class="node-amount">
            x{{ data.amount }}
          </el-tag>
          <el-button
            v-if="data.recipeId"
            type="primary"
            size="small"
            text
            class="node-simulate"
            @click.stop="emit('simulate-recipe', data.recipeId)"
          >
            模擬製作
          </el-button>
        </div>
      </template>
    </el-tree>
  </el-card>
</template>

<style scoped>
.card-title {
  font-size: 16px;
  font-weight: 600;
}

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

.node-amount {
  margin-left: 4px;
}

.node-simulate {
  margin-left: auto;
}
</style>
