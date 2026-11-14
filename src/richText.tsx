import { useRef, type ReactNode } from 'react'
import { Bold, Code, Heading2, Italic, List, ListOrdered } from 'lucide-react'

function inlineContent(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /(\*\*.+?\*\*|__.+?__|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`)/g
  const nodes: ReactNode[] = []
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index))
    const token = match[0]
    const key = `${keyPrefix}-${match.index}`
    if (token.startsWith('**') || token.startsWith('__')) nodes.push(<strong key={key}>{inlineContent(token.slice(2, -2), key)}</strong>)
    else if (token.startsWith('`')) nodes.push(<code key={key}>{token.slice(1, -1)}</code>)
    else nodes.push(<em key={key}>{inlineContent(token.slice(1, -1), key)}</em>)
    cursor = match.index + token.length
  }

  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

export function FormattedText({ text, className = '' }: { text: string; className?: string }) {
  const blocks: ReactNode[] = []
  const lines = text.split(/\r?\n/)
  let paragraph: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let listItems: string[] = []
  let key = 0

  const flushParagraph = () => {
    if (!paragraph.length) return
    blocks.push(<p key={`p-${key++}`}>{paragraph.map((line, index) => <span key={index}>{index > 0 && <br />}{inlineContent(line, `p-${key}-${index}`)}</span>)}</p>)
    paragraph = []
  }
  const flushList = () => {
    if (!listType || !listItems.length) return
    const ListTag = listType
    blocks.push(<ListTag key={`list-${key++}`}>{listItems.map((item, index) => <li key={index}>{inlineContent(item, `list-${key}-${index}`)}</li>)}</ListTag>)
    listType = null
    listItems = []
  }

  for (const line of lines) {
    const heading = line.match(/^\s{0,3}(#{1,3})\s+(.+)$/)
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/)
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/)
    const nextListType = unordered ? 'ul' : ordered ? 'ol' : null

    if (!line.trim()) {
      flushParagraph()
      flushList()
    } else if (heading) {
      flushParagraph()
      flushList()
      const Heading = `h${heading[1].length}` as 'h1' | 'h2' | 'h3'
      blocks.push(<Heading key={`h-${key++}`}>{inlineContent(heading[2], `h-${key}`)}</Heading>)
    } else if (nextListType) {
      flushParagraph()
      if (listType !== nextListType) flushList()
      listType = nextListType
      listItems.push((unordered ?? ordered)![1])
    } else {
      flushList()
      paragraph.push(line)
    }
  }
  flushParagraph()
  flushList()

  return <div className={`formatted-text ${className}`.trim()}>{blocks.length ? blocks : text}</div>
}

type FormatAction = 'bold' | 'italic' | 'code' | 'heading' | 'unordered' | 'ordered'

const inlineFormats: Partial<Record<FormatAction, [string, string, string]>> = {
  bold: ['**', '**', 'текст'],
  italic: ['*', '*', 'текст'],
  code: ['`', '`', 'текст'],
}

const actions: Array<{ key: FormatAction; label: string; icon: typeof Bold; title: string }> = [
  { key: 'bold', label: 'Полужирный', icon: Bold, title: 'Полужирный' },
  { key: 'italic', label: 'Курсив', icon: Italic, title: 'Курсив' },
  { key: 'code', label: 'Моноширинный', icon: Code, title: 'Моноширинный текст' },
  { key: 'heading', label: 'Подзаголовок', icon: Heading2, title: 'Подзаголовок' },
  { key: 'unordered', label: 'Маркированный список', icon: List, title: 'Маркированный список' },
  { key: 'ordered', label: 'Нумерованный список', icon: ListOrdered, title: 'Нумерованный список' },
]

export function RichTextEditor({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const textarea = useRef<HTMLTextAreaElement>(null)

  const apply = (action: FormatAction) => {
    const input = textarea.current
    if (!input) return
    const start = input.selectionStart
    const end = input.selectionEnd
    const selected = value.slice(start, end)
    let next: string
    let selectionStart = start
    let selectionEnd = end

    const inline = inlineFormats[action]
    if (inline) {
      const content = selected || inline[2]
      const inserted = `${inline[0]}${content}${inline[1]}`
      next = `${value.slice(0, start)}${inserted}${value.slice(end)}`
      selectionStart = start + inline[0].length
      selectionEnd = selectionStart + content.length
    } else {
      const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
      const nextBreak = value.indexOf('\n', end)
      const lineEnd = nextBreak < 0 ? value.length : nextBreak
      const block = value.slice(lineStart, lineEnd)
      const lines = block.split('\n')
      const prefix = action === 'heading' ? '## ' : action === 'unordered' ? '- ' : '1. '
      const matcher = action === 'heading' ? /^##\s?/ : action === 'unordered' ? /^[-*+]\s+/ : /^\d+[.)]\s+/
      const allPrefixed = lines.every((line) => matcher.test(line))
      const updated = lines.map((line) => allPrefixed ? line.replace(matcher, '') : `${prefix}${line}`).join('\n')
      next = `${value.slice(0, lineStart)}${updated}${value.slice(lineEnd)}`
      selectionStart = lineStart
      selectionEnd = lineStart + updated.length
    }

    onChange(next)
    const restoreSelection = () => {
      input.focus()
      input.setSelectionRange(selectionStart, selectionEnd)
    }
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(restoreSelection)
    else window.setTimeout(restoreSelection, 0)
  }

  return <div className="rich-text-editor">
    <div className="format-toolbar" role="toolbar" aria-label={`Форматирование: ${label}`}>
      {actions.map(({ key, label: actionLabel, icon: Icon, title }) => <button key={key} type="button" className="format-button" aria-label={actionLabel} title={title} onMouseDown={(event) => event.preventDefault()} onClick={() => apply(key)}><Icon size={15} /></button>)}
    </div>
    <textarea ref={textarea} aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
    <small>Выделите текст и нажмите кнопку форматирования. Разметка сохраняется вместе с текстом.</small>
  </div>
}
