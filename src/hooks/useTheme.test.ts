import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyTheme, resolveTheme, THEME_STORAGE_KEY, useTheme } from './useTheme.ts'

describe('useTheme', () => {
  beforeEach(() => {
    window.localStorage.removeItem(THEME_STORAGE_KEY)
    delete document.documentElement.dataset.theme
  })
  afterEach(() => {
    window.localStorage.removeItem(THEME_STORAGE_KEY)
    delete document.documentElement.dataset.theme
  })

  it('le jour est le défaut sans préférence système sombre', () => {
    expect(resolveTheme()).toBe('light')
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('light')
  })

  it('le choix mémorisé prime et se pose sur le document', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    expect(resolveTheme()).toBe('dark')
    applyTheme(resolveTheme())
    expect(document.documentElement.dataset.theme).toBe('dark')
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
  })

  it('basculer met à jour le document, le stockage et le hook', () => {
    applyTheme('light')
    const { result } = renderHook(() => useTheme())
    act(() => {
      result.current.toggle()
    })
    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    act(() => {
      result.current.toggle()
    })
    expect(result.current.theme).toBe('light')
  })
})
