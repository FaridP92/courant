import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatSection } from './ChatSection.tsx'

function stubChatApi(reply: object, status = 200) {
  const stub = vi.fn(() =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(reply) }),
  )
  vi.stubGlobal('fetch', stub)
  return stub
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ChatSection', () => {
  it('envoie la question saisie et affiche la réponse avec sa requête SQL dépliable', async () => {
    const stub = stubChatApi({
      answer: 'La France exporte 11,3 GW en ce moment.',
      sql: 'select 1 limit 1',
      rowCount: 1,
    })
    render(<ChatSection />)

    fireEvent.change(screen.getByLabelText('Ta question'), {
      target: { value: 'La France exporte-t-elle ?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Demander' }))

    expect(screen.getByText('Je consulte les données...')).toBeInTheDocument()
    expect(await screen.findByText('La France exporte 11,3 GW en ce moment.')).toBeInTheDocument()
    expect(screen.getByText('voir la requête SQL')).toBeInTheDocument()
    expect(screen.getByText('select 1 limit 1')).toBeInTheDocument()

    const [, options] = stub.mock.calls[0] as unknown as [string, { body: string }]
    expect(JSON.parse(options.body)).toEqual({ question: 'La France exporte-t-elle ?' })
  })

  it('les questions suggérées se posent en un clic', async () => {
    stubChatApi({ answer: 'Réponse suggérée.' })
    render(<ChatSection />)

    fireEvent.click(screen.getByRole('button', { name: /Record de consommation/ }))
    expect(await screen.findByText('Réponse suggérée.')).toBeInTheDocument()
    // la question posée s'affiche dans l'historique
    expect(screen.getByText(/Record de consommation/, { selector: 'p' })).toBeInTheDocument()
  })

  it('un refus du serveur s affiche tel quel, sans requête SQL', async () => {
    stubChatApi({ answer: 'Je ne couvre que les données électriques du tableau de bord.' })
    render(<ChatSection />)

    fireEvent.change(screen.getByLabelText('Ta question'), {
      target: { value: 'Quel temps fera-t-il demain ?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Demander' }))

    expect(
      await screen.findByText('Je ne couvre que les données électriques du tableau de bord.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('voir la requête SQL')).toBeNull()
  })

  it('une panne réseau donne un message honnête, jamais un silence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('réseau coupé'))),
    )
    render(<ChatSection />)

    fireEvent.change(screen.getByLabelText('Ta question'), { target: { value: 'Test ?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Demander' }))

    expect(
      await screen.findByText('Le chat est momentanément indisponible, réessaie dans un instant.'),
    ).toBeInTheDocument()
  })
})
