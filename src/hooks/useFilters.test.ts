import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS } from '../lib/filters.ts'
import { useFilters } from './useFilters.ts'

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('useFilters', () => {
  it("part de l'URL courante", () => {
    window.history.replaceState(null, '', '/?range=7d&maturity=C')

    const { result } = renderHook(() => useFilters())

    expect(result.current.filters.range).toBe('7d')
    expect([...result.current.filters.maturity]).toEqual(['C'])
  })

  it("sans paramètre, rend les filtres par défaut sans toucher à l'URL", () => {
    const { result } = renderHook(() => useFilters())

    expect(result.current.filters).toEqual(DEFAULT_FILTERS)
    expect(window.location.search).toBe('')
  })

  it("écrit le changement dans l'URL et rafraîchit l'état", () => {
    const { result } = renderHook(() => useFilters())

    act(() => {
      result.current.setFilters({ range: '30d' })
    })

    expect(window.location.search).toBe('?range=30d')
    expect(result.current.filters.range).toBe('30d')
  })

  it('cumule les critères successifs au lieu de les écraser', () => {
    const { result } = renderHook(() => useFilters())

    act(() => {
      result.current.setFilters({ range: '7d' })
    })
    act(() => {
      result.current.setFilters({ fuels: new Set(['nucleaire', 'eolien']) })
    })

    expect(window.location.search).toBe('?range=7d&fuels=nucleaire,eolien')
    expect(result.current.filters.range).toBe('7d')
    expect([...result.current.filters.fuels]).toEqual(['nucleaire', 'eolien'])
  })

  it("revenir au défaut nettoie l'URL au lieu d'y laisser des paramètres inutiles", () => {
    window.history.replaceState(null, '', '/?range=7d&fuels=nucleaire')

    const { result } = renderHook(() => useFilters())
    act(() => {
      result.current.reset()
    })

    expect(window.location.search).toBe('')
    expect(result.current.filters).toEqual(DEFAULT_FILTERS)
  })

  it('suit la navigation arrière du navigateur', () => {
    const { result } = renderHook(() => useFilters())

    act(() => {
      result.current.setFilters({ range: '7d' })
    })
    // ce que fait le navigateur sur un retour arrière : il restaure l'URL puis notifie
    act(() => {
      window.history.replaceState(null, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(result.current.filters.range).toBe('24h')
  })

  it("un changement identique n'empile pas d'entrée d'historique", () => {
    const { result } = renderHook(() => useFilters())
    act(() => {
      result.current.setFilters({ range: '7d' })
    })
    const lengthAfterFirst = window.history.length

    act(() => {
      result.current.setFilters({ range: '7d' })
    })

    expect(window.history.length).toBe(lengthAfterFirst)
    expect(window.location.search).toBe('?range=7d')
  })
})
