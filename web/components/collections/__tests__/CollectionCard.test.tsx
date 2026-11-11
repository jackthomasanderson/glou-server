import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Collection } from '@/lib/collections/types';
import { CollectionCard } from '../CollectionCard';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const collection = { id: 'c1', name: 'Christmas 2026', color: '#aa3355', icon: null, items: [] } as unknown as Collection;

// #656: the card is not a button any more; its name is, stretched over the card.
describe('CollectionCard', () => {
  it('opens from its name and keeps Edit and Delete separate buttons', () => {
    const onClick = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<CollectionCard collection={collection} onClick={onClick} onEdit={onEdit} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Christmas 2026' }));
    expect(onClick).toHaveBeenCalledWith(collection);
    fireEvent.click(screen.getByRole('button', { name: 'actions.edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'actions.delete' }));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('lets the name overlay cover the whole card: no positioned body in between', () => {
    render(<CollectionCard collection={collection} onClick={() => {}} onEdit={() => {}} onDelete={() => {}} />);
    const name = screen.getByRole('button', { name: 'Christmas 2026' });
    expect(name.className).toContain('after:inset-0');
    // HeroUI's CardBody is position: relative; `static` hands the containing
    // block back to the Card, so the footer is covered too.
    const body = name.closest('.static');
    expect(body).not.toBeNull();
    expect(body?.parentElement?.className).toContain('relative');
  });
});
