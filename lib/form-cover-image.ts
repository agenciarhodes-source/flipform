import { FORM_LOGO_MAX_BYTES, getFormLogoDataUrlSize, isSupportedFormLogoMimeType } from '@/lib/form-logo';

export const FORM_COVER_IMAGE_MAX_BYTES = FORM_LOGO_MAX_BYTES;
export const FORM_COVER_IMAGE_WIDTH = 500;
export const FORM_COVER_IMAGE_HEIGHT = 500;

export function isSupportedFormCoverImageMimeType(value: string): boolean {
  return isSupportedFormLogoMimeType(value);
}

export function isValidFormCoverImageValue(value: string): boolean {
  if (!value.startsWith('data:')) return true;
  const size = getFormLogoDataUrlSize(value);
  return size !== null && size <= FORM_COVER_IMAGE_MAX_BYTES;
}
