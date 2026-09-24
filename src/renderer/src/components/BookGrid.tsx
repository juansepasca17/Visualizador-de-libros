import { forwardRef, memo, type HTMLAttributes } from 'react'
import { VirtuosoGrid } from 'react-virtuoso'
import type { Book } from '@shared/types'
import { HeartIcon, MoreIcon } from './Icons'

export const coverUrl = (b: Book): string | null =>
  b.coverFile ? `lib://cover/${encodeURIComponent(b.coverFile)}?v=${b.coverVersion}` : null

interface CardProps {
  book: Book
  onOpen: (b: Book) => void
  onToggleFav: (b: Book) => void
  onMenu: (b: Book, x: number, y: number) => void
}

export const BookCard = memo(function BookCard({ book, onOpen, onToggleFav, onMenu }: CardProps) {
  const url = coverUrl(book)
  return (
    <div
      className="card"
      role="button"
      tabIndex={0}
      title={`${book.title}${book.author ? ' — ' + book.author : ''}\n${book.path}`}
      onClick={() => onOpen(book)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(book)}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu(book, e.clientX, e.clientY)
      }}
    >
      <div className="cover">
        {url ? (
          <img src={url} alt="" loading="lazy" decoding="async" draggable={false} />
        ) : (
          <div className={'cover-placeholder' + (book.failed ? ' failed' : '')}>
            <span className="ph-title">{book.title}</span>
            {book.author && <span className="ph-author">{book.author}</span>}
            {book.failed && <span className="ph-note">No se pudo leer el PDF</span>}
          </div>
        )}
        <button
          className={'fav-btn' + (book.favorite ? ' on' : '')}
          title={book.favorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
          onClick={(e) => {
            e.stopPropagation()
            onToggleFav(book)
          }}
        >
          <HeartIcon size={18} filled={book.favorite} />
        </button>
        <button
          className="more-btn"
          title="Más opciones"
          onClick={(e) => {
            e.stopPropagation()
            const r = e.currentTarget.getBoundingClientRect()
            onMenu(book, r.left, r.bottom + 4)
          }}
        >
          <MoreIcon size={18} />
        </button>
        {book.year && <span className="year-badge">{book.year}</span>}
      </div>
      <div className="card-meta">
        <div className="card-title">{book.title}</div>
        <div className="card-author">{book.author || ' '}</div>
      </div>
    </div>
  )
})

const List = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function List(props, ref) {
  return <div ref={ref} {...props} className="grid" />
})
const Item = (props: HTMLAttributes<HTMLDivElement>) => <div {...props} className="grid-item" />
// Virtuoso controla el padding vertical de la lista, así que el espacio va en cabecera/pie.
const Header = () => <div className="grid-spacer top" />
const Footer = () => <div className="grid-spacer bottom" />

interface GridProps extends Omit<CardProps, 'book'> {
  books: Book[]
}

export function BookGrid({ books, ...handlers }: GridProps) {
  return (
    <VirtuosoGrid
      className="scroller"
      data={books}
      overscan={600}
      components={{ List, Item, Header, Footer }}
      computeItemKey={(_i, b) => b.id}
      itemContent={(_i, b) => <BookCard book={b} {...handlers} />}
    />
  )
}
