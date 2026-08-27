import { authApi, miscApi } from '@api/index';
import { ApiError } from '@api/errors';
import { clearTokens, saveTokens } from '@store/secureStorage';
import { EXISTING_MERCHANT_MOBILE, VALID_OTP, mockState } from '@api/mocks/db';

/**
 * Staff management (Section 6.15) and support tickets (Section 6.17) driven through
 * the real Axios client, so the interceptor chain and error normalization are on
 * the path exactly as they are for a screen.
 */

/** Authenticates and returns the roster to a known two-person state. */
async function signIn(): Promise<void> {
  await clearTokens();
  const tokens = await authApi.verifyOtp({ mobile: EXISTING_MERCHANT_MOBILE, otp: VALID_OTP });
  await saveTokens(tokens);
}

beforeEach(async () => {
  await signIn();

  // `initExistingMerchant` deliberately leaves staff and tickets alone, so tests
  // seed them here rather than leaking rows into each other.
  mockState.staff = [
    { id: 'stf_seed_1', name: 'Priya Deshmukh', mobile: '9812345678', role: 'manager' },
    { id: 'stf_seed_2', name: 'Amit Patil', mobile: '9823456789', role: 'cashier' },
  ];
  mockState.tickets = [];
});

describe('GET /staff', () => {
  it('requires authentication', async () => {
    await clearTokens();
    const error = await miscApi.listStaff().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('unauthorized');
  });

  it('returns the roster with a role on every member', async () => {
    const staff = await miscApi.listStaff();
    expect(staff).toHaveLength(2);
    for (const member of staff) {
      expect(['manager', 'cashier']).toContain(member.role);
      expect(member.id).toBeTruthy();
    }
  });
});

describe('POST /staff', () => {
  it('adds a member and assigns an id', async () => {
    const member = await miscApi.addStaff({
      name: 'Sunita Rao',
      mobile: '9800000011',
      role: 'cashier',
    });

    expect(member.id).toBeTruthy();
    expect(member.name).toBe('Sunita Rao');
    expect(member.role).toBe('cashier');
    await expect(miscApi.listStaff()).resolves.toHaveLength(3);
  });

  it('rejects a duplicate mobile with 409 so the screen can flag that field', async () => {
    const error = await miscApi
      .addStaff({ name: 'Someone Else', mobile: '9812345678', role: 'cashier' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.httpStatus).toBe(409);
    expect(apiError.code).toBe('validation_error');
    // The screen keys off `details.field` to attach the message to the input.
    expect(apiError.details?.['field']).toBe('mobile');
  });

  it('does not add the member when the mobile is a duplicate', async () => {
    await miscApi
      .addStaff({ name: 'Someone Else', mobile: '9812345678', role: 'cashier' })
      .catch(() => undefined);

    await expect(miscApi.listStaff()).resolves.toHaveLength(2);
  });

  it('rejects a malformed mobile', async () => {
    const error = await miscApi
      .addStaff({ name: 'Bad Number', mobile: '12345', role: 'cashier' })
      .catch((e: unknown) => e);

    expect((error as ApiError).code).toBe('validation_error');
  });

  it('rejects an empty name', async () => {
    const error = await miscApi
      .addStaff({ name: '', mobile: '9800000012', role: 'cashier' })
      .catch((e: unknown) => e);

    expect((error as ApiError).code).toBe('validation_error');
  });
});

describe('PATCH /staff/:id — role change (Section 6.15 "edit role")', () => {
  it('changes the role while preserving the id', async () => {
    const updated = await miscApi.updateStaff('stf_seed_2', { role: 'manager' });

    expect(updated.id).toBe('stf_seed_2');
    expect(updated.role).toBe('manager');
    // The reason PATCH exists rather than remove-and-re-add: the id survives.
    expect(updated.name).toBe('Amit Patil');
  });

  it('persists the new role on the roster', async () => {
    await miscApi.updateStaff('stf_seed_2', { role: 'manager' });
    const staff = await miscApi.listStaff();
    expect(staff.find((s) => s.id === 'stf_seed_2')?.role).toBe('manager');
  });

  it('leaves the mobile untouched by a role-only patch', async () => {
    const updated = await miscApi.updateStaff('stf_seed_1', { role: 'cashier' });
    expect(updated.mobile).toBe('9812345678');
  });

  it('rejects an unknown role', async () => {
    const error = await miscApi
      // Deliberately bypasses the compile-time union to prove the server validates.
      .updateStaff('stf_seed_1', { role: 'owner' as 'manager' })
      .catch((e: unknown) => e);

    expect((error as ApiError).code).toBe('validation_error');
  });

  it('reports an unknown member as not_found', async () => {
    const error = await miscApi.updateStaff('stf_missing', { role: 'manager' }).catch((e: unknown) => e);
    expect((error as ApiError).code).toBe('not_found');
  });
});

describe('DELETE /staff/:id', () => {
  it('removes the member', async () => {
    await expect(miscApi.removeStaff('stf_seed_1')).resolves.toEqual({ deleted: true });
    const staff = await miscApi.listStaff();
    expect(staff.map((s) => s.id)).toEqual(['stf_seed_2']);
  });

  it('reports an unknown member as not_found rather than silently succeeding', async () => {
    const error = await miscApi.removeStaff('stf_missing').catch((e: unknown) => e);
    expect((error as ApiError).code).toBe('not_found');
  });

  it('frees the mobile for re-use after removal', async () => {
    await miscApi.removeStaff('stf_seed_1');
    // Re-hiring the same person must not collide with the removed row.
    await expect(
      miscApi.addStaff({ name: 'Priya Deshmukh', mobile: '9812345678', role: 'cashier' }),
    ).resolves.toMatchObject({ role: 'cashier' });
  });
});

describe('support tickets (Section 6.17)', () => {
  it('starts with no tickets', async () => {
    const page = await miscApi.listTickets();
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it('creates a ticket in the open state', async () => {
    const ticket = await miscApi.createTicket({
      subject: 'Settlement missing',
      body: 'Yesterday\u2019s batch has not arrived.',
    });

    expect(ticket.id).toBeTruthy();
    expect(ticket.status).toBe('open');
    expect(ticket.subject).toBe('Settlement missing');
    expect(ticket.createdAt).toBeTruthy();
  });

  it('lists the newest ticket first', async () => {
    await miscApi.createTicket({ subject: 'First', body: 'one' });
    await miscApi.createTicket({ subject: 'Second', body: 'two' });

    const page = await miscApi.listTickets();
    expect(page.items.map((ticket) => ticket.subject)).toEqual(['Second', 'First']);
  });

  it('rejects a ticket with no subject', async () => {
    const error = await miscApi.createTicket({ subject: '', body: 'body' }).catch((e: unknown) => e);
    expect((error as ApiError).code).toBe('validation_error');
  });

  it('rejects a ticket with no body', async () => {
    const error = await miscApi
      .createTicket({ subject: 'subject', body: '' })
      .catch((e: unknown) => e);
    expect((error as ApiError).code).toBe('validation_error');
  });

  it('requires authentication', async () => {
    await clearTokens();
    const error = await miscApi.listTickets().catch((e: unknown) => e);
    expect((error as ApiError).code).toBe('unauthorized');
  });
});
