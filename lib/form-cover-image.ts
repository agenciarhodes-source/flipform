import { getFormLogoDataUrlSize, isSupportedFormLogoMimeType } from '@/lib/form-logo';

export const FORM_COVER_IMAGE_MAX_BYTES = 300 * 1024;

export function isSupportedFormCoverImageMimeType(value: string): boolean {
  return isSupportedFormLogoMimeType(value);
}

export function isValidFormCoverImageValue(value: string): boolean {
  if (!value.startsWith('data:')) return true;
  const size = getFormLogoDataUrlSize(value);
  return size !== null && size <= FORM_COVER_IMAGE_MAX_BYTES;
}
