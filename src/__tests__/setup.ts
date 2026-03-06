// Global test setup - mock fetch by default
import { vi } from 'vitest'

// Provide a global fetch mock that tests can override
globalThis.fetch = vi.fn()
