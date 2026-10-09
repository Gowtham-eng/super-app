export const TICKET_ATTACHMENT_MAX_FILES = 1;
export const TICKET_ATTACHMENT_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const TICKET_ATTACHMENT_MAX_TOTAL_BYTES = 10 * 1024 * 1024;
export const TICKET_ATTACHMENT_ACCEPT = '.pdf,.mp4,.docx,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif,image/*';
export const TICKET_ATTACHMENT_HINT =
  'Supported formats: PDF, MP4, DOCX, PNG, JPEG, HEIC, WEBP. One file only, up to 10 MB.';

const ALLOWED_EXT = new Set([
  '.pdf', '.mp4', '.docx', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic', '.heif',
]);
const MIME_TO_EXT = {
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heic',
};

export const ticketAttachmentExtension = (name = '') => {
  const match = String(name || '').trim().toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match ? match[1] : '';
};

export const resolveTicketAttachmentName = (file = {}) => {
  const name = String(file?.name || '').trim() || 'image';
  if (ticketAttachmentExtension(name)) return name;
  const mime = String(file?.type || '').split(';')[0].trim().toLowerCase();
  const guessed = MIME_TO_EXT[mime];
  return guessed ? `${name}${guessed}` : name;
};

export const formatTicketAttachmentSize = (bytes = 0) => {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export const validateTicketAttachments = (files = []) => {
  const list = Array.isArray(files) ? files.filter(Boolean) : [];
  if (list.length > TICKET_ATTACHMENT_MAX_FILES) {
    return `Only one attachment is allowed. ${TICKET_ATTACHMENT_HINT}`;
  }
  for (const file of list) {
    const name = resolveTicketAttachmentName(file);
    const size = Number(file.size) || 0;
    if (!ALLOWED_EXT.has(ticketAttachmentExtension(name))) {
      return `File type is not allowed: ${file.name || name}. ${TICKET_ATTACHMENT_HINT}`;
    }
    if (size <= 0) return `${name} is empty.`;
    if (size > TICKET_ATTACHMENT_MAX_FILE_BYTES) {
      return `File must be 10 MB or smaller. ${TICKET_ATTACHMENT_HINT}`;
    }
  }
  return '';
};
