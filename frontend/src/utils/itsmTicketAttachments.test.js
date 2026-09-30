import {
  TICKET_ATTACHMENT_MAX_FILE_BYTES,
  validateTicketAttachments,
} from './itsmTicketAttachments';

const file = (name, size) => ({ name, size });

test('accepts one allowed file under 10 MB', () => {
  expect(validateTicketAttachments([file('shot.png', 1024)])).toBe('');
});

test('rejects disallowed type, oversized file, and a second file', () => {
  expect(validateTicketAttachments([file('notes.txt', 100)])).toMatch(/not allowed/i);
  expect(
    validateTicketAttachments([file('big.pdf', TICKET_ATTACHMENT_MAX_FILE_BYTES + 1)])
  ).toMatch(/10 MB/i);
  expect(validateTicketAttachments([file('a.png', 10), file('b.png', 10)])).toMatch(
    /Only one attachment/i
  );
});
