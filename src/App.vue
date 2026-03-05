<script setup lang="ts">
import { useRoute } from 'vue-router'
import {
  Setting,
  Search,
  Cpu,
  List,
} from '@element-plus/icons-vue'

const route = useRoute()
</script>

<template>
  <el-container class="app-container">
    <el-aside width="200px" class="app-aside">
      <div class="app-logo">FF14 Craft Helper</div>
      <el-menu
        :default-active="route.path"
        router
        class="app-menu"
      >
        <el-menu-item index="/">
          <el-icon><Setting /></el-icon>
          <span>配裝管理</span>
        </el-menu-item>
        <el-menu-item index="/recipe">
          <el-icon><Search /></el-icon>
          <span>配方選擇</span>
        </el-menu-item>
        <el-menu-item index="/simulator">
          <el-icon><Cpu /></el-icon>
          <span>製作模擬</span>
        </el-menu-item>
        <el-menu-item index="/bom">
          <el-icon><List /></el-icon>
          <span>材料清單</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-main class="app-main">
      <router-view />
    </el-main>
  </el-container>
</template>

<style>
html, body {
  margin: 0;
  padding: 0;
  height: 100%;
}

#app {
  height: 100%;
}

.app-container {
  height: 100vh;
}

.app-aside {
  background-color: #001529;
  overflow-y: auto;
}

.app-logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 16px;
  font-weight: bold;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.app-menu {
  border-right: none;
  background-color: #001529;
}

.app-menu .el-menu-item {
  color: rgba(255, 255, 255, 0.65);
}

.app-menu .el-menu-item:hover {
  color: #fff;
  background-color: rgba(255, 255, 255, 0.08);
}

.app-menu .el-menu-item.is-active {
  color: #409eff;
  background-color: rgba(64, 158, 255, 0.1);
}

.app-main {
  background-color: #f5f7fa;
  overflow-y: auto;
}
</style>
