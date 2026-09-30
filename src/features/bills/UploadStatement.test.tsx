import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BillsPage } from './BillsPage';
import { CardsPage } from '../cards/CardsPage';
import { renderWithData, seedCard } from '../../test/renderWithData';
import { readStatement } from '../../statements/readStatement';

vi.mock('../../statements/readStatement', async (orig) => ({ ...(await orig<object>()), readStatement: vi.fn() }));
const mockRead = vi.mocked(readStatement);
const file = () => new File([new Uint8Array([37, 80, 68, 70])], 'st.pdf', { type: 'application/pdf' });
const seed = async (r: import('../../data/repository').Repository) => {
  await seedCard(r, { bank: 'UOB' }, 'uc1', 'UOB One');
};
const good = {
  ok: true as const,
  text: 'UOB statement text',
  bank: 'uob' as const,
  hasReader: true,
  candidates: [
    {
      last4: '3333',
      userCardId: 'uc1',
      readerUsed: true,
      issues: [],
      values: { statementDate: '2026-09-08', dueDate: '2026-09-28', statementBalance: 812.4, minimumDue: 50 },
    },
  ],
};

// One tap: the Bills "Upload statement" control is itself the file picker (iPhone: opens Files).
async function upload(f: File = file()) {
  await userEvent.upload(screen.getByLabelText('Upload statement'), f);
}

describe('Upload statement', () => {
  beforeEach(() => mockRead.mockReset());

  it('shows a spinner while reading', async () => {
    // Held open until the end; the file's beforeEach returns the mock, which Vitest then calls as a teardown.
    let finish!: (v: Awaited<ReturnType<typeof readStatement>>) => void;
    mockRead.mockReturnValue(new Promise((r) => (finish = r)));
    await renderWithData(<BillsPage />, { seed });
    await upload();
    expect(await screen.findByText('Reading…')).toBeInTheDocument();
    expect(document.querySelector('.spinner')).not.toBeNull();
    finish({ ok: false, reason: 'notPdf' });
    expect(await screen.findByText("This file isn't a readable PDF.")).toBeInTheDocument();
  });

  it('reads, reviews and saves a statement, storing last 4 digits on the card', async () => {
    mockRead.mockResolvedValue(good);
    const { repo } = await renderWithData(<BillsPage />, { seed });
    await upload();
    expect(await screen.findByText('Read by: UOB reader. Please check before saving.')).toBeInTheDocument();
    expect(screen.getByLabelText('Statement balance (RM)')).toHaveValue('812.40');
    await userEvent.click(screen.getByRole('button', { name: 'Save statement' }));
    expect(await screen.findByRole('heading', { name: 'Bills' })).toBeInTheDocument();
    expect((await repo.listStatements())[0]).toMatchObject({ source: 'reader', readerBank: 'uob', statementBalance: 812.4 });
    expect((await repo.listUserCards())[0].last4).toBe('3333');
  });

  it('asks for a password, remembers it when ticked', async () => {
    mockRead.mockResolvedValueOnce({ ok: false, reason: 'needsPassword' }).mockResolvedValueOnce({ ok: false, reason: 'wrongPassword' }).mockResolvedValueOnce(good);
    const { repo } = await renderWithData(<BillsPage />, { seed });
    await upload();
    await userEvent.type(await screen.findByLabelText('PDF password'), 'bad');
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Password incorrect.');
    await userEvent.clear(screen.getByLabelText('PDF password'));
    await userEvent.type(screen.getByLabelText('PDF password'), 'good');
    await userEvent.click(screen.getByLabelText('Remember for this card on this device'));
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(mockRead.mock.calls[2][1]).toMatchObject({ password: 'good' });
    await userEvent.click(await screen.findByRole('button', { name: 'Save statement' }));
    await screen.findByRole('heading', { name: 'Bills' });
    expect((await repo.listUserCards())[0].pdfPassword).toBe('good');
  });

  it('refreshes app data after storing card details, so a later Cards save keeps them', async () => {
    mockRead.mockResolvedValueOnce({ ok: false, reason: 'needsPassword' }).mockResolvedValueOnce(good);
    const { repo } = await renderWithData(
      <>
        <BillsPage />
        <CardsPage />
      </>,
      { seed: (r) => seedCard(r, { bank: 'UOB', periodType: 'statement', defaultCycleDay: 1 }, 'uc1', 'UOB One').then(() => undefined) },
    );
    await upload();
    await userEvent.type(await screen.findByLabelText('PDF password'), 'good');
    await userEvent.click(screen.getByLabelText('Remember for this card on this device'));
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Save statement' }));
    await screen.findByRole('heading', { name: 'Bills' });
    expect(await screen.findByRole('button', { name: 'Forget saved PDF password' })).toBeInTheDocument();
    expect(screen.getByLabelText('Last 4 digits')).toHaveValue('3333');
    await userEvent.type(screen.getByLabelText('Statement day (1–28)'), '8');
    await userEvent.click(screen.getByRole('button', { name: 'Save statement day' }));
    await waitFor(async () => expect((await repo.listUserCards())[0].cycleDay).toBe(8));
    expect((await repo.listUserCards())[0]).toMatchObject({ last4: '3333', pdfPassword: 'good' });
  });

  it('falls back to manual entry for scanned PDFs and unknown layouts', async () => {
    mockRead.mockResolvedValueOnce({ ok: false, reason: 'noText' });
    await renderWithData(<BillsPage />, { seed });
    await upload();
    expect(await screen.findByText('This PDF has no text (it may be a scan). Please enter the values manually.')).toBeInTheDocument();
    expect(screen.getByLabelText('Statement date')).toHaveValue('');
  });

  it('remembers the password on the manual (noText) path when ticked', async () => {
    mockRead.mockResolvedValueOnce({ ok: false, reason: 'needsPassword' }).mockResolvedValueOnce({ ok: false, reason: 'noText' });
    const { repo } = await renderWithData(<BillsPage />, { seed });
    await upload();
    await userEvent.type(await screen.findByLabelText('PDF password'), 'good');
    await userEvent.click(screen.getByLabelText('Remember for this card on this device'));
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByText('This PDF has no text (it may be a scan). Please enter the values manually.');
    await userEvent.selectOptions(screen.getByLabelText('Card'), 'uc1');
    await userEvent.type(screen.getByLabelText('Statement date'), '2026-09-08');
    await userEvent.type(screen.getByLabelText('Payment due date'), '2026-09-28');
    await userEvent.type(screen.getByLabelText('Statement balance (RM)'), '100');
    await userEvent.type(screen.getByLabelText('Minimum due (RM)'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Save statement' }));
    await screen.findByRole('heading', { name: 'Bills' });
    expect((await repo.listUserCards())[0].pdfPassword).toBe('good');
  });

  it('leaves the password unset on the manual (noText) path when Remember is not ticked', async () => {
    mockRead.mockResolvedValueOnce({ ok: false, reason: 'needsPassword' }).mockResolvedValueOnce({ ok: false, reason: 'noText' });
    const { repo } = await renderWithData(<BillsPage />, { seed });
    await upload();
    await userEvent.type(await screen.findByLabelText('PDF password'), 'good');
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByText('This PDF has no text (it may be a scan). Please enter the values manually.');
    await userEvent.selectOptions(screen.getByLabelText('Card'), 'uc1');
    await userEvent.type(screen.getByLabelText('Statement date'), '2026-09-08');
    await userEvent.type(screen.getByLabelText('Payment due date'), '2026-09-28');
    await userEvent.type(screen.getByLabelText('Statement balance (RM)'), '100');
    await userEvent.type(screen.getByLabelText('Minimum due (RM)'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Save statement' }));
    await screen.findByRole('heading', { name: 'Bills' });
    expect((await repo.listUserCards())[0].pdfPassword).toBeUndefined();
  });

  it('says when a bank has no reader yet', async () => {
    mockRead.mockResolvedValue({ ok: true, text: 'x', bank: 'pbb', hasReader: false, candidates: [{ readerUsed: false, issues: [], values: {} }] });
    await renderWithData(<BillsPage />, { seed });
    await upload();
    expect(await screen.findByText('No reader for Public Bank yet — please fill in.')).toBeInTheDocument();
  });

  it('shows the extracted text with personal details hidden', async () => {
    mockRead.mockResolvedValue({ ...good, text: 'Card 4000 1234 5678 3333 Balance 812.40' });
    await renderWithData(<BillsPage />, { seed });
    await upload();
    await userEvent.click(await screen.findByText('Show extracted text'));
    expect(screen.getByText('Personal details are partly hidden. Check and remove anything personal before sharing.')).toBeInTheDocument();
    expect(screen.getByText('Card •••• •••• •••• 3333 Balance 812.40')).toBeInTheDocument();
    expect(screen.queryByText(/4000/)).not.toBeInTheDocument();
  });

  it('opens the PDF picker straight from Bills and stays on Bills until a file is chosen', async () => {
    await renderWithData(<BillsPage />, { seed });
    const picker = screen.getByLabelText('Upload statement');
    expect(picker).toHaveAttribute('type', 'file');
    expect(picker.getAttribute('accept')).toContain('application/pdf');
    expect(screen.getByRole('heading', { name: 'Bills' })).toBeInTheDocument();
    expect(mockRead).not.toHaveBeenCalled();
  });

  it('cancels from the file-pick step reached via "Choose another file"', async () => {
    mockRead.mockResolvedValue({ ok: false, reason: 'notPdf' });
    await renderWithData(<BillsPage />, { seed });
    await upload();
    await userEvent.click(await screen.findByRole('button', { name: 'Choose another file' }));
    expect(screen.getByLabelText('Statement PDF')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('heading', { name: 'Bills' })).toBeInTheDocument();
  });

  it('cancels from the password step', async () => {
    mockRead.mockResolvedValue({ ok: false, reason: 'needsPassword' });
    await renderWithData(<BillsPage />, { seed });
    await upload();
    await screen.findByLabelText('PDF password');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('heading', { name: 'Bills' })).toBeInTheDocument();
  });

  it('rejects non-PDF files', async () => {
    mockRead.mockResolvedValue({ ok: false, reason: 'notPdf' });
    await renderWithData(<BillsPage />, { seed });
    await upload();
    expect(await screen.findByText("This file isn't a readable PDF.")).toBeInTheDocument();
  });

  it('skips a card in a multi-candidate statement and saves only the other', async () => {
    mockRead.mockResolvedValue({
      ok: true,
      text: 'RHB statement text',
      bank: 'rhb',
      hasReader: true,
      candidates: [
        {
          last4: '1111',
          userCardId: 'uc1',
          readerUsed: true,
          issues: [],
          values: { statementDate: '2026-09-08', dueDate: '2026-09-28', statementBalance: 0, minimumDue: 0 },
        },
        {
          last4: '2222',
          userCardId: 'uc1',
          readerUsed: true,
          issues: [],
          values: { statementDate: '2026-09-08', dueDate: '2026-09-28', statementBalance: 500, minimumDue: 50 },
        },
      ],
    });
    const { repo } = await renderWithData(<BillsPage />, { seed });
    await upload();
    expect(await screen.findByRole('heading', { name: 'Statement 1 of 2' })).toBeInTheDocument();
    expect(screen.getByText('This card has nothing to pay this month.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip this card' })).toHaveClass('primary');
    expect(screen.getByRole('button', { name: 'Save statement' })).not.toHaveClass('primary');
    await userEvent.click(screen.getByRole('button', { name: 'Skip this card' }));
    expect(await screen.findByRole('heading', { name: 'Statement 2 of 2' })).toBeInTheDocument();
    expect(screen.queryByText('This card has nothing to pay this month.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save statement' })).toHaveClass('primary');
    await userEvent.click(screen.getByRole('button', { name: 'Save statement' }));
    await screen.findByRole('heading', { name: 'Bills' });
    const saved = await repo.listStatements();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ statementBalance: 500, minimumDue: 50 });
  });
});

// Kept outside the describe above (and its `beforeEach(() => mockRead.mockReset())`):
// resetting a vi.mock()-backed mock from a *hook* — rather than inline in the test body —
// before a test that rejects from an async file-input handler trips a vitest/RTL act()
// timing quirk unrelated to this component (confirmed by isolated reproduction: the exact
// same rejection, caught the exact same way, passes when the reset happens inline). Calling
// mockReset() directly in the test body avoids it.
describe('Upload statement — reader errors', () => {
  it('shows a recoverable error when reading throws unexpectedly', async () => {
    mockRead.mockReset();
    mockRead.mockRejectedValue(new Error('boom'));
    const { repo } = await renderWithData(<BillsPage />, { seed });
    await upload();
    expect(await screen.findByText('Something went wrong reading this file.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose another file' })).toBeInTheDocument();
    expect(await repo.listStatements()).toHaveLength(0);
  });

  it('shows a recoverable error when the file itself cannot be read', async () => {
    mockRead.mockReset();
    await renderWithData(<BillsPage />, { seed });
    const broken = file();
    broken.arrayBuffer = () => Promise.reject(new Error('NotReadableError'));
    await upload(broken);
    expect(await screen.findByText('Something went wrong reading this file.')).toBeInTheDocument();
    expect(mockRead).not.toHaveBeenCalled();
  });
});
