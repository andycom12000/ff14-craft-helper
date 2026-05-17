import { describe, it, expect } from 'vitest'
import { detectBrowserFamily, isInAppWebview, getBrowserInfo } from '@/utils/browser-info'

describe('detectBrowserFamily', () => {
  it('detects Chrome', () => {
    expect(detectBrowserFamily(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    )).toBe('chrome')
  })

  it('detects Safari (desktop)', () => {
    expect(detectBrowserFamily(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    )).toBe('safari')
  })

  it('detects Firefox', () => {
    expect(detectBrowserFamily(
      'Mozilla/5.0 (Windows NT 10.0; rv:120.0) Gecko/20100101 Firefox/120.0',
    )).toBe('firefox')
  })

  it('detects Edge as edge (not chrome)', () => {
    expect(detectBrowserFamily(
      'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0',
    )).toBe('edge')
  })

  it('returns other for unknown UA', () => {
    expect(detectBrowserFamily('SomeBot/1.0')).toBe('other')
  })

  it('returns other for empty UA', () => {
    expect(detectBrowserFamily('')).toBe('other')
  })
})

describe('isInAppWebview', () => {
  it('detects Facebook in-app', () => {
    expect(isInAppWebview('Mozilla/5.0 (iPhone) FBAN/FBIOS;FBAV/420.0')).toBe(true)
  })

  it('detects Line in-app', () => {
    expect(isInAppWebview('Mozilla/5.0 (iPhone) Line/13.0.0')).toBe(true)
  })

  it('detects Instagram in-app', () => {
    expect(isInAppWebview('Mozilla/5.0 (iPhone) Instagram 300.0')).toBe(true)
  })

  it('detects Android WebView (wv tag)', () => {
    expect(isInAppWebview('Mozilla/5.0 (Linux; Android 13; wv) Chrome/120.0')).toBe(true)
  })

  it('detects WeChat (MicroMessenger)', () => {
    expect(isInAppWebview('Mozilla/5.0 (iPhone) MicroMessenger/8.0')).toBe(true)
  })

  it('returns false for normal Chrome', () => {
    expect(isInAppWebview(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36',
    )).toBe(false)
  })
})

describe('getBrowserInfo', () => {
  it('returns family + isInAppWebview + uaShort', () => {
    const info = getBrowserInfo(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
    )
    expect(info.family).toBe('chrome')
    expect(info.isInAppWebview).toBe(false)
    expect(info.uaShort.length).toBeLessThanOrEqual(100)
    expect(info.uaShort).toContain('Chrome/120.0')
  })

  it('truncates uaShort to 100 chars', () => {
    const longUa = 'x'.repeat(500)
    const info = getBrowserInfo(longUa)
    expect(info.uaShort.length).toBe(100)
  })

  it('reads navigator.userAgent when called with no argument', () => {
    const info = getBrowserInfo()
    expect(typeof info.family).toBe('string')
    expect(typeof info.isInAppWebview).toBe('boolean')
    expect(typeof info.uaShort).toBe('string')
  })
})
