# Audio click noise fix request (WebAudio / Howler / NativeAudio)

## Problem

When changing volume (BGM or SFX) during runtime, a short "click" / "static" noise occurs.

This happens especially when:

- volume parameter is updated instantly (e.g. mute toggle, slider change)
- rapid volume changes (0 ↔ 1, or large delta)

## Root Cause

This is caused by **discontinuous gain changes** in the audio signal.

Instant volume assignment like:

```js
audio.volume = target;
```

creates a discontinuity in the waveform, resulting in audible click noise.

## Required Fix

All volume changes must be **smoothed using ramping**, NOT instant assignment.

### If using Web Audio API

Replace direct gain changes with:

```js
gainNode.gain.cancelScheduledValues(audioContext.currentTime);
gainNode.gain.linearRampToValueAtTime(
  targetVolume,
  audioContext.currentTime + 0.03, // 30ms smoothing
);
```

### If using Howler.js

Replace:

```js
sound.volume(target);
```

With:

```js
sound.fade(currentVolume, targetVolume, 50); // 50ms fade
```

### If using NativeAudio

Implement manual smoothing:

- interpolate volume over 30~50ms
- avoid abrupt jumps

## Additional Constraints

- All BGM and SFX volume updates must use smoothing
- Mute/unmute must also use fade (not instant 0/1 switch)
- Avoid creating new AudioContext per sound
- Ensure only one global AudioContext is used

## Expected Result

- No click / static noise when adjusting volume
- Smooth transitions for BGM and SFX
- Stable audio on low-end Android devices

## Priority

High (affects user experience significantly)
