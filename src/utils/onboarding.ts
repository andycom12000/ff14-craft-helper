const KEY = 'onboardingComplete'

export function isOnboardingComplete(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function markOnboardingComplete(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // private mode / storage quota — non-critical
  }
}
