import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { Download, Paperclip, X } from 'lucide-react';
import { ITSM_API } from '../config/api';

const previewCache = new Map();
const inflight = new Map();
const TEXT_PREVIEW_LIMIT = 200000;

function asText(value) {
  return String(value ?? '').trim();
}

function photoKey(photo) {
  if (!photo || typeof photo !== 'object') return '';
  return asText(photo.key || photo.Key);
}

function photoSizeToken(photo) {
  if (!photo || typeof photo !== 'object') return '';
  if (Array.isArray(photo.size)) return photo.size.join('x');
  return asText(photo.size || photo.Size);
}

export function attachmentFileKey(file, thumbnail = false) {
  const photos = Array.isArray(file?.photos) ? file.photos : [];
  if (thumbnail && photos.length) {
    const thumb =
      photos.find((photo) => {
        const size = photoSizeToken(photo);
        return size === '100x100' || size.includes('100');
      }) || photos[0];
    const key = photoKey(thumb);
    if (key) return key;
  }
  return asText(file?.key || file?.Key) || photoKey(photos[0]);
}

function fileExtension(file) {
  const named = asText(file?.name || file?.Name);
  const fromName = named.includes('.') ? named.split('.').pop() : '';
  return asText(file?.fileExtension || file?.FileExtension || fromName).replace(/^\./, '').toLowerCase();
}

const TEXT_EXTS = new Set(['txt', 'csv', 'log', 'json', 'md', 'xml', 'html', 'htm', 'rtf', 'eml']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'webm', 'avi', 'mkv', 'm4v']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac']);
const SLIDE_EXTS = new Set(['ppt', 'pptx', 'odp', 'key']);
const WORD_EXTS = new Set(['doc', 'docx', 'odt', 'pages']);
const EXCEL_EXTS = new Set(['xls', 'xlsx', 'ods', 'numbers']);
const ARCHIVE_EXTS = new Set(['zip', '7z', 'rar', 'tar', 'gz', 'tgz']);
const DOCUMENT_EXTS = new Set([
  ...TEXT_EXTS, ...VIDEO_EXTS, ...AUDIO_EXTS, ...SLIDE_EXTS, ...WORD_EXTS, ...EXCEL_EXTS, ...ARCHIVE_EXTS, 'pdf',
]);

export function attachmentKind(file) {
  const mime = asText(file?.mimeType || file?.type || file?.contentType).toLowerCase();
  const ext = fileExtension(file);
  if (mime.startsWith('image/') || /^(png|jpe?g|gif|webp|bmp|svg|tif|tiff|heic|ico)$/.test(ext)) return 'image';
  if (Array.isArray(file?.photos) && file.photos.length && !DOCUMENT_EXTS.has(ext)) return 'image';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (
    mime.startsWith('text/')
    || mime === 'application/json'
    || mime === 'application/xml'
    || mime === 'application/rtf'
    || TEXT_EXTS.has(ext)
  ) {
    return 'text';
  }
  if (mime.startsWith('video/') || VIDEO_EXTS.has(ext)) return 'video';
  if (mime.startsWith('audio/') || AUDIO_EXTS.has(ext)) return 'audio';
  if (mime.includes('presentationml') || mime.includes('powerpoint') || SLIDE_EXTS.has(ext)) return 'slides';
  if (mime.includes('wordprocessingml') || mime === 'application/msword' || WORD_EXTS.has(ext)) return 'word';
  if (mime.includes('spreadsheetml') || mime.includes('excel') || EXCEL_EXTS.has(ext)) return 'excel';
  if (mime.includes('zip') || mime.includes('compressed') || ARCHIVE_EXTS.has(ext)) return 'zip';
  return 'file';
}

function kindLabel(kind) {
  return (
    {
      image: 'IMG',
      pdf: 'PDF',
      text: 'TXT',
      video: 'VIDEO',
      audio: 'AUDIO',
      slides: 'PPT',
      word: 'DOCX',
      excel: 'XLSX',
      zip: 'ZIP',
      file: 'FILE',
    }[kind] || 'FILE'
  );
}

function cacheId(file, thumbnail) {
  const key = attachmentFileKey(file, thumbnail) || asText(file?.id || file?.name || file?.Name);
  return key ? `${key}|${thumbnail ? 't' : 'f'}` : '';
}

function isGcsSignedUrl(url) {
  const text = asText(url);
  return text.includes('storage.googleapis.com') && text.includes('X-Goog-Algorithm=');
}

function gcsStillFresh(url) {
  if (!isGcsSignedUrl(url)) return false;
  try {
    const parsed = new URL(url);
    const date = parsed.searchParams.get('X-Goog-Date') || '';
    const expires = Number(parsed.searchParams.get('X-Goog-Expires') || 0);
    if (!/^\d{8}T\d{6}Z$/.test(date) || !expires) return false;
    const start = Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(4, 6)) - 1,
      Number(date.slice(6, 8)),
      Number(date.slice(9, 11)),
      Number(date.slice(11, 13)),
      Number(date.slice(13, 15)),
    );
    return Date.now() + 15000 < start + expires * 1000;
  } catch {
    return false;
  }
}

function peekCache(file, thumbnail) {
  const id = cacheId(file, thumbnail);
  if (!id) return '';
  const url = previewCache.get(id) || '';
  if (url.startsWith('data:image/') || url.startsWith('blob:') || gcsStillFresh(url)) return url;
  previewCache.delete(id);
  return '';
}

function isImageFile(file) {
  return attachmentKind(file) === 'image';
}

async function loadPreview({ file, entity, environment, getAuthHeader, thumbnail }) {
  const stored = asText(file?.Url || file?.url);
  if (gcsStillFresh(stored)) return stored;
  const cached = peekCache(file, thumbnail);
  if (cached) return cached;
  const key = attachmentFileKey(file, thumbnail);
  if (!key || !entity || typeof getAuthHeader !== 'function') return '';
  const id = cacheId(file, thumbnail);
  if (id && inflight.has(id)) return inflight.get(id);
  const pending = (async () => {
    const res = await axios.get(`${ITSM_API}/itsm/reports/attachment-preview`, {
      params: {
        entity,
        key,
        thumbnail: thumbnail ? 'true' : 'false',
        ...(environment ? { environment } : {}),
      },
      ...getAuthHeader(),
    });
    const url = asText(res.data?.url);
    if (url) previewCache.set(id, url);
    return url;
  })();
  if (id) inflight.set(id, pending);
  try {
    return await pending;
  } finally {
    if (id) inflight.delete(id);
  }
}

async function loadRenderablePreview(url, kind) {
  if (!url || kind === 'image') return { text: '', objectUrl: '' };
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error('Could not load attachment');
  if (kind === 'text') {
    const text = await res.text();
    if (text.length > TEXT_PREVIEW_LIMIT) {
      return { text: `${text.slice(0, TEXT_PREVIEW_LIMIT)}\n\n… truncated`, objectUrl: '' };
    }
    return { text, objectUrl: '' };
  }
  if (kind === 'pdf' || kind === 'audio' || kind === 'video') {
    const blob = await res.blob();
    const type =
      kind === 'pdf' ? 'application/pdf' : kind === 'audio' ? blob.type || 'audio/mpeg' : blob.type || 'video/mp4';
    return { text: '', objectUrl: URL.createObjectURL(new Blob([blob], { type })) };
  }
  return { text: '', objectUrl: '' };
}

export default function CommentAttachmentPreview({
  file,
  entity = '',
  environment = '',
  getAuthHeader,
  mine = false,
}) {
  const kind = attachmentKind(file);
  const image = isImageFile(file);
  const stored = peekCache(file, image) || (gcsStillFresh(file?.Url || file?.url) ? asText(file?.Url || file?.url) : '');
  const [thumbUrl, setThumbUrl] = useState(stored);
  const [fullUrl, setFullUrl] = useState(peekCache(file, false) || '');
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(image && !stored);
  const [textPreview, setTextPreview] = useState('');
  const [objectUrl, setObjectUrl] = useState('');
  const label = file?.name || file?.Name || 'Attachment';
  const titleId = useId();
  const fileKey = cacheId(file, image);
  const authRef = useRef(getAuthHeader);
  const objectUrlRef = useRef('');
  authRef.current = getAuthHeader;

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const warm = peekCache(file, image);
    setFailed(false);
    setThumbUrl(warm || '');
    setLoading(image && !warm);
    if (!image) {
      setLoading(false);
      return undefined;
    }
    if (!attachmentFileKey(file, true)) {
      setLoading(false);
      return undefined;
    }
    (async () => {
      try {
        const url = await loadPreview({
          file,
          entity,
          environment,
          getAuthHeader: authRef.current,
          thumbnail: true,
        });
        if (cancelled) return;
        if (url) {
          setThumbUrl(url);
          setFailed(false);
        } else if (!warm) {
          setFailed(true);
        }
      } catch {
        if (!cancelled && !warm) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, environment, fileKey, image]);

  const rememberObjectUrl = (next) => {
    if (objectUrlRef.current && objectUrlRef.current !== next) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    objectUrlRef.current = next || '';
    setObjectUrl(next || '');
  };

  const show = async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setLoading(true);
    try {
      const cached = fullUrl || peekCache(file, false);
      let url = cached;
      if (!url) {
        url = await loadPreview({
          file,
          entity,
          environment,
          getAuthHeader: authRef.current,
          thumbnail: false,
        });
      }
      const next = url || thumbUrl;
      if (!next) {
        setFailed(true);
        return;
      }
      setFullUrl(next);
      if (kind === 'text' || kind === 'pdf' || kind === 'audio' || kind === 'video') {
        const rendered = await loadRenderablePreview(next, kind);
        setTextPreview(rendered.text || '');
        rememberObjectUrl(rendered.objectUrl);
      } else {
        setTextPreview('');
        rememberObjectUrl('');
      }
      setOpen(true);
      setFailed(false);
    } catch {
      if (fullUrl || thumbUrl) setOpen(true);
      else setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const href = fullUrl || thumbUrl;
  const lightbox =
    open && href ? (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="itsm-attachment-lightbox"
        className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/80 p-3 sm:p-6 lg:p-10 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        onClick={() => setOpen(false)}
      >
        <div
          className="relative flex max-h-[min(94dvh,960px)] w-full max-w-[min(calc(100vw-1.5rem),72rem)] flex-col overflow-hidden rounded-xl bg-white p-3 shadow-2xl sm:p-4"
          onClick={(event) => event.stopPropagation()}
        >
          <p id={titleId} className="mb-2 max-w-full truncate pr-10 text-xs font-semibold text-slate-700 sm:text-sm">
            {label}
          </p>
          <button
            type="button"
            aria-label="Close attachment"
            onClick={() => setOpen(false)}
            className="absolute right-2 top-2 min-h-11 min-w-11 rounded-md p-2 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
            {image ? (
              <img
                src={href}
                alt={label}
                className="h-auto max-h-[min(78dvh,820px)] w-auto max-w-full object-contain"
              />
            ) : kind === 'pdf' && objectUrl ? (
              <iframe
                title={label}
                src={objectUrl}
                className="h-[min(78dvh,820px)] w-full rounded-md border border-slate-200 bg-slate-50"
              />
            ) : kind === 'text' ? (
              <pre className="max-h-[min(78dvh,820px)] w-full overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-50 p-3 text-left text-xs text-slate-800">
                {textPreview || 'This text file is empty.'}
              </pre>
            ) : kind === 'video' && (objectUrl || href) ? (
              <video src={objectUrl || href} controls className="max-h-[78vh] w-full rounded-md bg-black" />
            ) : kind === 'audio' && (objectUrl || href) ? (
              <audio src={objectUrl || href} controls className="w-full" />
            ) : (
              <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold tracking-wide text-slate-700">
                  {kindLabel(kind)}
                </span>
                <p className="max-w-md text-sm text-slate-600">{label}</p>
                <a
                  href={href}
                  download={label}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  <Download className="h-4 w-4" />
                  Download
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    ) : null;

  return (
    <>
      <button
        type="button"
        title={label}
        aria-label={`View ${label}`}
        data-testid="itsm-comment-attachment"
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        onClick={show}
        className="relative z-20 block cursor-pointer overflow-hidden rounded-md border border-slate-200 bg-white text-left shadow-sm hover:ring-2 hover:ring-teal-500"
      >
        {image && thumbUrl && !failed ? (
          <img
            src={thumbUrl}
            alt={label}
            draggable={false}
            className="pointer-events-none h-24 w-24 object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <span
            className={`inline-flex h-24 w-24 flex-col items-center justify-center gap-1 px-1 text-center text-[10px] font-semibold ${
              mine ? 'text-teal-800' : 'text-slate-600'
            }`}
          >
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-slate-700">
              {kindLabel(kind)}
            </span>
            <span className="line-clamp-2 w-full px-1 text-[9px] font-medium leading-tight">{label}</span>
            <span className="inline-flex items-center gap-0.5 text-[9px]">
              <Paperclip className="h-3 w-3" />
              {loading ? 'Opening…' : failed ? 'Retry' : 'View'}
            </span>
          </span>
        )}
      </button>
      {lightbox && typeof document !== 'undefined' ? createPortal(lightbox, document.body) : null}
    </>
  );
}
