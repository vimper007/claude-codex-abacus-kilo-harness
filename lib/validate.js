const MAX_URL_LENGTH = 2048;

function validateUrl(value) {
  if (!value || typeof value !== 'string') {
    return 'url is required';
  }
  if (value.length > MAX_URL_LENGTH) {
    return `url must be ${MAX_URL_LENGTH} characters or fewer`;
  }
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return 'url must use http or https';
    }
  } catch {
    return 'url is not a valid URL';
  }
  return null; // null = valid
}

module.exports = { validateUrl };
