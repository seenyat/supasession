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
