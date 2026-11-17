export const defaults = {
  capacity: 64, reserved: 0, deployment: '', setup: 'motion', mode: 'photo',
  hours: 24, photoRate: 2, videoRate: 2, linked: true, burst: 3,
  photoRes: '8', videoRes: 'HD', videoSeconds: 20,
  lapseUsesCaptureSettings: false, interval: 5, unit: 'minutes', lapseHours: 12,
  photo2: 0.6, photo4: 1.2, photo8: 2.4, photo16: 4.8, photo32: 9.6,
  videoSD: 25, videoHD: 75, videoQHD: 125, video4K: 250
};

export function captureModes(s) {
  const motion = s.setup !== 'lapse';
  const lapse = s.setup !== 'motion';
  const usesCaptureSettings = lapse && s.lapseUsesCaptureSettings;
  return {
    motion, lapse, usesCaptureSettings,
    motionPhoto: motion && s.mode !== 'video',
    motionVideo: motion && s.mode !== 'photo',
    lapsePhoto: lapse && (!usesCaptureSettings || s.mode !== 'video'),
    lapseVideo: usesCaptureSettings && s.mode !== 'photo'
  };
}

export function calculate(s) {
  const modes = captureModes(s);
  const available = Math.max(0, s.capacity - s.reserved) * 1000;
  const motionPhotos = modes.motionPhoto ? s.photoRate * s.hours * s.burst : 0;
  const videoRate = s.mode === 'both' && s.linked ? s.photoRate : s.videoRate;
  const motionVideos = modes.motionVideo ? videoRate * s.hours : 0;
  const seconds = s.interval * (s.unit === 'minutes' ? 60 : 1);
  const intervals = modes.lapse ? Math.ceil(s.lapseHours * 3600 / seconds) : 0;
  const lapsePhotos = modes.lapsePhoto ? intervals * (modes.usesCaptureSettings ? s.burst : 1) : 0;
  const lapseVideos = modes.lapseVideo ? intervals : 0;
  const photos = motionPhotos + lapsePhotos;
  const videos = motionVideos + lapseVideos;
  const photoSize = s['photo' + s.photoRes];
  const videoSize = s['video' + s.videoRes];
  const videoMB = count => count > 0 ? count * s.videoSeconds / 60 * videoSize : 0;
  const segments = [lapsePhotos * photoSize, motionPhotos * photoSize, videoMB(lapseVideos), videoMB(motionVideos)];
  const daily = segments.reduce((sum, amount) => sum + amount, 0);
  const days = available === 0 ? 0 : daily > 0 ? available / daily : null;
  const deploymentMB = s.deployment === '' ? null : daily * s.deployment;
  return {
    available, motionPhotos, lapsePhotos, motionVideos, lapseVideos, photos, videos, segments, daily, days,
    deploymentMB, photoSize, videoSize, usesPhotos: modes.motionPhoto || modes.lapsePhoto, usesVideo: modes.motionVideo || modes.lapseVideo,
    fractionalPhotos: modes.motionPhoto && s.photoRate % 1 !== 0,
    fractionalVideos: modes.motionVideo && videoRate % 1 !== 0
  };
}
