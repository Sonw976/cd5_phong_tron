export const AUDIO_ASSETS = Object.freeze({
  zone1: "nhac-cum1-bac-dang-cung-chung-chau-hanh-quan.mp3",
  zone2: "nhac-cum2-doan-ca-thanh-nien-lam-theo-loi-bac.mp3",
  zone3: "https://upload.wikimedia.org/wikipedia/commons/d/dd/Wolfgang_Amadeus_Mozart_-_Symphony_40_g-moll_-_1._Molto_allegro.ogg"
});

export const MEDIA_ASSETS = Object.freeze({
  lobbyVideo: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
});

export function placeholderImage(width, height, background, text) {
  return `https://placehold.co/${width}x${height}/${background}/FFF?text=${encodeURIComponent(text)}`;
}
