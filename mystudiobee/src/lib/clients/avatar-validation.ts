export const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export function validateAvatarFile(file: File): string | null {
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
    return "Please choose a JPG, PNG, WEBP, or GIF image.";
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return "Image must be 5MB or smaller.";
  }
  return null;
}
