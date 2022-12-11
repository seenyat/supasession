export const getSessionMembers = async (join_session_token: string) => {
  try {
    const response = await Spicetify.CosmosAsync.get(
      `https://spclient.wg.spotify.com/social-connect/v2/sessions/info/${join_session_token}`
    );
    return response['session_members'];
  } catch (ex) {
    return null;
  }
  return null;
};

export const setColorOpacity = (opacity: number, color: string): string => {
  if (!color || typeof color !== 'string') {
    return '';
  }
  const matchedColors = color.match(/\d+/g);
  const [r, g, b] = matchedColors || [0, 0, 0];

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

export const checkLyricsPlus = () => {
  return (
    Spicetify.Config?.custom_apps?.includes('lyrics-plus') ||
    !!document.querySelector("a[href='/lyrics-plus']")
  );
};

const getLuminance = (rgb: [number, number, number]) => {
  const [r, g, b] = rgb.map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
};

export const getContrastColor = (color: string): string => {
  // Parse the input color string to extract the red, green, and blue values
  const colors = color.match(/\d+/g);
  if (!colors) {
    return 'black';
  }
  const [r, g, b] = colors.map(Number).slice(0, 3);

  // Calculate the luminance of the input color
  const luminance = getLuminance([r, g, b]);

  // If the luminance is less than or equal to 0.5, return black;
  // otherwise, return white
  return luminance >= 0.5 ? 'black' : 'white';
};
