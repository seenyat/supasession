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

export const checkLyricsPlus = () => {
  return (
    Spicetify.Config?.custom_apps?.includes('lyrics-plus') ||
    !!document.querySelector("a[href='/lyrics-plus']")
  );
};
