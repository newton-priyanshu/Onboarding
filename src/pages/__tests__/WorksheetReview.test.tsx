import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import WorksheetReview from '../WorksheetReview';

const mockUseAuth = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('../../context/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('../../api/supabase', () => ({
  supabase: { from: mockFrom },
}));

const userId = 'joinee-1';
const worksheetId = 'p1_w1';

/** Each call to supabase.from(...) pops the next queued chain, in call order. */
function queueFromCalls(...chains: unknown[]) {
  let i = 0;
  mockFrom.mockImplementation(() => {
    const chain = chains[i];
    i++;
    return chain;
  });
}

function assignedBuddyChain(assignedBuddyId: string | null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { assigned_buddy_id: assignedBuddyId }, error: null }),
  };
}

function loadSubmissionChain(submission: Record<string, unknown> | null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: submission, error: null }),
  };
}

function loadInstructorChain(instructor: Record<string, unknown> | null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: instructor, error: null }),
  };
}

function updateChain(rows: Record<string, unknown>[]) {
  return {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
}

function renderReview(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/buddy/review/:userId/:worksheetId" element={<WorksheetReview />} />
        <Route path="/admin/review/:userId/:worksheetId" element={<WorksheetReview />} />
      </Routes>
    </MemoryRouter>
  );
}

const instructorRow = { id: userId, full_name: 'Jordan Joinee', email: 'jordan@newton.edu' };

describe('WorksheetReview — approve path (buddy)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      profile: { id: 'buddy-1', role: 'lead_instructor', full_name: 'Buddy Betty', email: 'betty@newton.edu' },
    });
  });

  it('lets an assigned buddy approve a pending_review worksheet, moving it to buddy_approved', async () => {
    const submission = {
      user_id: userId,
      worksheet_id: worksheetId,
      worksheet_data: {},
      review_status: 'pending_review',
      status: 'submitted',
      review_history: [],
    };
    const update = updateChain([{ ...submission, review_status: 'buddy_approved' }]);
    queueFromCalls(
      assignedBuddyChain(null), // no buddy assigned -> allow any buddy
      loadSubmissionChain(submission),
      loadInstructorChain(instructorRow),
      update
    );

    renderReview(`/buddy/review/${userId}/${worksheetId}`);

    const approveBtn = await screen.findByRole('button', { name: /Approve \(Buddy\)/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(update.update).toHaveBeenCalledWith(
        expect.objectContaining({ review_status: 'buddy_approved' })
      );
    });
    // The view re-renders around the new state: the approve/revision action
    // block (only shown while pending) disappears, replaced by the
    // "already buddy-approved" confirmation view.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Approve \(Buddy\)/i })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: /Buddy Approved/i })).toBeInTheDocument();
  });

  it('blocks a buddy who is not the joinee\'s assigned buddy from approving', async () => {
    const submission = {
      user_id: userId,
      worksheet_id: worksheetId,
      worksheet_data: {},
      review_status: 'pending_review',
      status: 'submitted',
      review_history: [],
    };
    queueFromCalls(
      assignedBuddyChain('some-other-buddy'), // assigned to someone else
      loadSubmissionChain(submission),
      loadInstructorChain(instructorRow)
    );

    renderReview(`/buddy/review/${userId}/${worksheetId}`);

    await waitFor(() => {
      expect(screen.getByText(/View-only/i, { exact: false })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /Approve \(Buddy\)/i })).not.toBeInTheDocument();
  });
});

describe('WorksheetReview — needs_revision path', () => {
  it('lets an assigned buddy request revision on a pending_review worksheet, requiring a comment', async () => {
    mockUseAuth.mockReturnValue({
      profile: { id: 'buddy-1', role: 'lead_instructor', full_name: 'Buddy Betty', email: 'betty@newton.edu' },
    });
    const submission = {
      user_id: userId,
      worksheet_id: worksheetId,
      worksheet_data: {},
      review_status: 'pending_review',
      status: 'submitted',
      review_history: [],
    };
    const update = updateChain([{ ...submission, review_status: 'needs_revision' }]);
    queueFromCalls(
      assignedBuddyChain(null),
      loadSubmissionChain(submission),
      loadInstructorChain(instructorRow),
      update
    );

    renderReview(`/buddy/review/${userId}/${worksheetId}`);

    const revisionBtn = await screen.findByRole('button', { name: /Request Revision/i });

    // Without a comment, the client-side guard blocks the request entirely —
    // no supabase call should happen.
    fireEvent.click(revisionBtn);
    await screen.findByText(/Please add a comment/i);
    expect(update.update).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Review Comments/i), { target: { value: 'Please add more detail.' } });
    fireEvent.click(revisionBtn);

    await waitFor(() => {
      expect(update.update).toHaveBeenCalledWith(
        expect.objectContaining({ review_status: 'needs_revision', review_comment: 'Please add more detail.' })
      );
    });
    // Once needs_revision, the buddy action block (only shown while pending)
    // disappears — the joinee must edit and resubmit before it reappears.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Request Revision/i })).not.toBeInTheDocument();
    });
  });

  it('lets a manager request revision on a buddy_approved worksheet, but not from other states', async () => {
    mockUseAuth.mockReturnValue({
      profile: { id: 'manager-1', role: 'academic_head', full_name: 'Manager Mo', email: 'mo@newton.edu' },
    });
    const submission = {
      user_id: userId,
      worksheet_id: worksheetId,
      worksheet_data: {},
      review_status: 'buddy_approved',
      status: 'submitted',
      review_history: [],
    };
    const update = updateChain([{ ...submission, review_status: 'needs_revision' }]);
    // Manager is not a buddy, so checkAssignedBuddy short-circuits without a
    // supabase call — only the two loadData queries, then the update.
    queueFromCalls(loadSubmissionChain(submission), loadInstructorChain(instructorRow), update);

    renderReview(`/admin/review/${userId}/${worksheetId}`);

    const revisionBtn = await screen.findByRole('button', { name: /Request Revision/i });
    fireEvent.change(screen.getByLabelText(/Revision Comments/i), { target: { value: 'Needs more rigor.' } });
    fireEvent.click(revisionBtn);

    await waitFor(() => {
      expect(update.update).toHaveBeenCalledWith(
        expect.objectContaining({ review_status: 'needs_revision', review_comment: 'Needs more rigor.' })
      );
    });
    // A worksheet that's now needs_revision is no longer buddy_approved, so
    // the manager's revision action disappears (it only applies to
    // buddy_approved worksheets).
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Request Revision/i })).not.toBeInTheDocument();
    });
  });

  it('does not show a manager revision action once a worksheet is already fully approved', async () => {
    mockUseAuth.mockReturnValue({
      profile: { id: 'manager-1', role: 'academic_head', full_name: 'Manager Mo', email: 'mo@newton.edu' },
    });
    const submission = {
      user_id: userId,
      worksheet_id: worksheetId,
      worksheet_data: {},
      review_status: 'approved',
      status: 'submitted',
      review_history: [],
      reviewer_name: 'Manager Mo',
    };
    queueFromCalls(loadSubmissionChain(submission), loadInstructorChain(instructorRow));

    renderReview(`/admin/review/${userId}/${worksheetId}`);

    await screen.findByText(/Fully Approved \(Manager\)/i);
    expect(screen.queryByRole('button', { name: /Request Revision/i })).not.toBeInTheDocument();
  });
});
