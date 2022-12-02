export const generateQRCode = (longURL: string, size = 200): string => {
  try {
    const data = `https://qrtag.net/api/qr_transparent_${size}.png?url=${encodeURIComponent(
      longURL
    )}`;
    return data;
  } catch (error) {
    throw error;
  }
};
