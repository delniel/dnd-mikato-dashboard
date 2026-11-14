import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FormattedText, RichTextEditor } from './richText'

describe('форматирование описательных текстов', () => {
  it('показывает полужирный текст, заголовки и списки без отображения разметки', () => {
    render(<FormattedText text={'## **Прокачка Хлюпика**\n\n1. **1 ур.** — Бесконечный град ударов\n- Обычное умение'} />)

    expect(screen.getByRole('heading', { name: 'Прокачка Хлюпика' })).toBeInTheDocument()
    expect(screen.getByText('1 ур.')).toHaveProperty('tagName', 'STRONG')
    expect(screen.getAllByRole('list')[0]).toHaveProperty('tagName', 'OL')
    expect(screen.getByText('Обычное умение')).toHaveProperty('tagName', 'LI')
  })

  it('позволяет добавить полужирное выделение кнопкой и оставляет обычный текст безопасным', () => {
    const onChange = vi.fn()
    const { rerender } = render(<RichTextEditor label="Описание" value="Вот текст" onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'Описание' }) as HTMLTextAreaElement
    input.setSelectionRange(4, 9)
    fireEvent.click(screen.getByRole('button', { name: 'Полужирный' }))

    expect(onChange).toHaveBeenCalledWith('Вот **текст**')
    rerender(<FormattedText text={'<script>alert(1)</script>'} />)
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
