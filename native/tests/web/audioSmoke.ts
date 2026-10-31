const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
type NativeState = Record<string, unknown>;
export async function audioSmoke(stage: (name: string) => void, offline: () => Promise<Record<string, unknown>>) {
  const call = (method: string, options: unknown = {}) => window.Capacitor.nativePromise("KazanAudio", method, options);
  const until = async (predicate: (state: NativeState) => boolean) => {
    for (let i = 0; i < 120; i++) {
      const state = await call("getState");
      if (state.error) throw new Error("native-player-error");
      if (predicate(state)) return state;
      await sleep(500);
    }
    throw new Error("native-player-timeout");
  };
  stage("native-get-state");
  const initial = await call("getState");
  if (typeof initial.position !== "number") throw new Error("invalid-native-state");
  await call("clearTrack");
  stage("url-guard");
  let rejected = false;
  try { await call("loadTrack", { id: "smoke@ru", url: "http://invalid.example/audio.mp3" }); }
  catch (error) { rejected = (error as {code?: string}).code === "AUDIO_URL_REJECTED"; }
  if (!rejected) throw new Error("missing-url-guard");
  stage("native-load-play");
  await call("loadTrack", { id: "smoke@ru", url: "https://kazan-demo.38-180-191-162.sslip.io/media/ushkova-5e9c3ac57387.mp3", title: "Audio bridge check", artist: "Test", album: "Test", duration: 255, position: 0, speed: 1 });
  await call("play");
  const playing = await until(state => !!state.playing && !state.loading && Number(state.position) > 1.5);
  stage("native-pause");
  const paused = await call("pause"); await sleep(700);
  const still = await call("getState");
  if (still.playing || Math.abs(Number(still.position) - Number(paused.position)) > .2) throw new Error("native-pause-failed");
  stage("native-seek-resume");
  await call("seek", { seconds: 20 });
  await until(state => Math.abs(Number(state.position) - 20) < .5);
  await call("play");
  await until(state => !!state.playing && Number(state.position) > 21);
  stage("native-clear");
  const cleared = await call("clearTrack");
  if (cleared.playing || cleared.placeId !== "") throw new Error("native-clear-failed");
  const offlineResult = await offline();
  return { ok: true, check: "complete", nativeBridge: true, avPlayerAdvanced: true, initialPlaybackSeconds: playing.position, pause: true, seekResume: true, clear: true, offline: offlineResult };
}
