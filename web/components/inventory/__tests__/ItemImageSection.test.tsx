import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// #645: a refused photo upload said nothing, and an answer that was not JSON
// (a reverse proxy's 413 page, a network cut) left the loading overlay on the
// photo until the form was closed.

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/lib/toast', () => ({ notifyError: vi.fn() }));
// jsdom cannot decode images: the photo is sent as chosen.
vi.mock('@/lib/image-resize', () => ({ downscaleImage: async (file: File) => file }));
vi.mock('../ImagePicker', () => ({ ImagePickerButton: () => null }));

import { notifyError } from '@/lib/toast';
import { UPLOAD_TIMEOUT_MS } from '@/lib/search/client';
import { ItemImageSection } from '../ItemImageSection';

const PREVIOUS_PHOTO = '/uploads/products/previous.jpg';
const onPhotoChange = vi.fn();

function renderSection() {
  return render(<ItemImageSection photoUrl={PREVIOUS_PHOTO} onPhotoChange={onPhotoChange} category="wine" />);
}

function choosePhoto(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['x'], 'label.png', { type: 'image/png' })] } });
}

/** Holds the upload's answer back until the test has seen the overlay. */
function deferFetch() {
  let answer: ((outcome: () => Promise<Response>) => void) | undefined;
  const fetchMock = vi.fn(() => new Promise<Response>((resolve, reject) => {
    answer = (outcome) => { outcome().then(resolve, reject); };
  }));
  vi.stubGlobal('fetch', fetchMock);
  return async (outcome: () => Promise<Response>) => {
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByRole('status')).toBeInTheDocument();
    answer?.(outcome);
  };
}

async function expectRefusedWith(messageKey: string) {
  await waitFor(() => expect(notifyError).toHaveBeenCalledWith(messageKey));
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  expect(onPhotoChange).not.toHaveBeenCalled();
  expect(document.querySelector('img')?.getAttribute('src')).toBe(PREVIOUS_PHOTO);
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ItemImageSection photo upload failures (#645)', () => {
  it('says the photo is too large when a proxy answers 413 with a plain-text page, and stops the overlay', async () => {
    const answer = deferFetch();
    const { container } = renderSection();

    choosePhoto(container);
    await answer(async () => new Response('413 Request Entity Too Large', { status: 413, headers: { 'Content-Type': 'text/plain' } }));

    await expectRefusedWith('itemImage.errors.tooLarge');
  });

  it('says the photo is too large when the API refuses it with FILE_TOO_LARGE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'FILE_TOO_LARGE' }), { status: 413, headers: { 'Content-Type': 'application/json' } }),
    ));
    const { container } = renderSection();

    choosePhoto(container);

    await expectRefusedWith('itemImage.errors.tooLarge');
  });

  it('says the format is not supported when the API refuses the file type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'INVALID_FILE_TYPE' }), { status: 400, headers: { 'Content-Type': 'application/json' } }),
    ));
    const { container } = renderSection();

    choosePhoto(container);

    await expectRefusedWith('itemImage.errors.unsupportedType');
  });

  it('stops the overlay and reports a failure when the network drops', async () => {
    const answer = deferFetch();
    const { container } = renderSection();

    choosePhoto(container);
    await answer(async () => { throw new TypeError('Failed to fetch'); });

    await expectRefusedWith('itemImage.errors.failed');
  });

  it('stops the overlay and reports a failure when a stalled upload reaches its deadline', async () => {
    // The deadline, fired by hand: a stalled request only ends when its signal aborts.
    const deadline = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderSection();

    choosePhoto(container);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(timeout).toHaveBeenCalledWith(UPLOAD_TIMEOUT_MS);
    expect(screen.getByRole('status')).toBeInTheDocument();
    deadline.abort(new DOMException('The operation timed out.', 'TimeoutError'));

    await expectRefusedWith('itemImage.errors.failed');
  });

  it('stops the overlay and reports a failure on a non-JSON success page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Sign in</html>', { status: 200 })));
    const { container } = renderSection();

    choosePhoto(container);

    await expectRefusedWith('itemImage.errors.failed');
  });

  it('uses the stored photo when the upload succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { path: '/uploads/products/new.webp' } }), { status: 200 }),
    ));
    const { container } = renderSection();

    choosePhoto(container);

    await waitFor(() => expect(onPhotoChange).toHaveBeenCalledWith('/uploads/products/new.webp'));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(notifyError).not.toHaveBeenCalled();
  });
});

describe('ItemImageSection photo from an address', () => {
  it('says the image could not be downloaded and keeps the current photo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'FETCH_FAILED' }), { status: 502, headers: { 'Content-Type': 'application/json' } }),
    ));
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'itemImage.pasteUrl' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'https://example.com/label.jpg' } });
    fireEvent.click(screen.getByRole('button', { name: 'actions.confirm' }));

    await expectRefusedWith('itemImage.errors.fetchFailed');
    expect(screen.getByRole('textbox')).toHaveValue('https://example.com/label.jpg');
  });
});
