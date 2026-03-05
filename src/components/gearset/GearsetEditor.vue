<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import type { Gearset } from '@/stores/gearsets'

const props = defineProps<{
  visible: boolean
  gearset: Gearset | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  save: [data: Omit<Gearset, 'id' | 'createdAt'>]
}>()

const CRAFTING_JOBS = ['CRP', 'BSM', 'ARM', 'GSM', 'LTW', 'WVR', 'ALC', 'CUL'] as const

const formRef = ref<FormInstance>()

const defaultForm = () => ({
  name: '',
  job: '',
  level: 90,
  craftsmanship: 0,
  control: 0,
  cp: 0,
})

const form = ref(defaultForm())

const isEdit = computed(() => props.gearset !== null)
const dialogTitle = computed(() => (isEdit.value ? '編輯配裝' : '新增配裝'))

const rules: FormRules = {
  name: [{ required: true, message: '請輸入配裝名稱', trigger: 'blur' }],
  job: [{ required: true, message: '請選擇職業', trigger: 'change' }],
  level: [
    { required: true, message: '請輸入等級', trigger: 'blur' },
    { type: 'number', min: 1, max: 100, message: '等級範圍為 1-100', trigger: 'blur' },
  ],
  craftsmanship: [
    { required: true, message: '請輸入作業精度', trigger: 'blur' },
    { type: 'number', min: 0, message: '數值不可為負數', trigger: 'blur' },
  ],
  control: [
    { required: true, message: '請輸入加工精度', trigger: 'blur' },
    { type: 'number', min: 0, message: '數值不可為負數', trigger: 'blur' },
  ],
  cp: [
    { required: true, message: '請輸入 CP', trigger: 'blur' },
    { type: 'number', min: 0, message: '數值不可為負數', trigger: 'blur' },
  ],
}

watch(
  () => props.visible,
  (val) => {
    if (val) {
      if (props.gearset) {
        form.value = {
          name: props.gearset.name,
          job: props.gearset.job,
          level: props.gearset.level,
          craftsmanship: props.gearset.craftsmanship,
          control: props.gearset.control,
          cp: props.gearset.cp,
        }
      } else {
        form.value = defaultForm()
      }
      formRef.value?.clearValidate()
    }
  },
)

async function handleSave() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  emit('save', { ...form.value })
  emit('update:visible', false)
}

function handleClose() {
  emit('update:visible', false)
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="dialogTitle"
    width="500px"
    destroy-on-close
    @update:model-value="(val: boolean) => emit('update:visible', val)"
    @close="handleClose"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="100px"
      label-position="right"
    >
      <el-form-item label="名稱" prop="name">
        <el-input v-model="form.name" placeholder="例：6.0 畢業裝" />
      </el-form-item>

      <el-form-item label="職業" prop="job">
        <el-select v-model="form.job" placeholder="選擇製作職業" style="width: 100%">
          <el-option
            v-for="job in CRAFTING_JOBS"
            :key="job"
            :label="job"
            :value="job"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="等級" prop="level">
        <el-input-number v-model="form.level" :min="1" :max="100" style="width: 100%" />
      </el-form-item>

      <el-form-item label="作業精度" prop="craftsmanship">
        <el-input-number v-model="form.craftsmanship" :min="0" :max="9999" style="width: 100%" />
      </el-form-item>

      <el-form-item label="加工精度" prop="control">
        <el-input-number v-model="form.control" :min="0" :max="9999" style="width: 100%" />
      </el-form-item>

      <el-form-item label="CP" prop="cp">
        <el-input-number v-model="form.cp" :min="0" :max="9999" style="width: 100%" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" @click="handleSave">儲存</el-button>
    </template>
  </el-dialog>
</template>
