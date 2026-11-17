# Jam Mode studio

Open Jam Mode to get one armed guitar track. Audio settings in the upper-right lets you refresh devices (requests microphone permission), choose your interface, and select mono input 1 or 2. Only channels exposed by the browser are available. Output selection uses AudioContext.setSinkId when available; otherwise select the output in your operating system.

Record starts at the playhead and plays existing tracks alongside the new take. Stop keeps the take and returns to its start for editing. Add recording layer creates and arms another track. Use headphones and your interface's direct monitoring; the application does not route live input to speakers.

## Zoom and editing

Ctrl/Cmd + wheel zooms horizontally around the beat under the cursor. Alt/Option + wheel over a lane resizes only that track. Timeline −/＋ and its slider zoom around the viewport center; Fit timeline fits the arrangement. The track-height toolbar affects the armed track. Use the horizontal scrollbar/trackpad to pan. None of these controls modifies audio, BPM, clip coordinates, or warp markers.

Click the ruler or an empty lane to seek. Drag a clip to move it, drag an edge to trim, or select it and split at the playhead. Position and length fields use beats. Focused clips move with arrow keys. Edits retain the original audio buffer; Undo keeps the last 30 arrangement changes. The 4/4 ruler adapts between bars, beats, and sixteenths. At 120 BPM, one bar lasts two seconds.

## Warp and tempo

All clip starts are beat-anchored. Original audio remains immutable in a source buffer; sample indices only address that source.

- **Warp off:** the source plays at its natural speed and pitch. Beat width is `(lengthSamples / sampleRate) * (projectBpm / 60)`. Changing BPM changes the clip's beat width while its start remains on the same beat.
- **Warp · Repitch on:** clip start and length remain locked to beats. Markers map absolute source `sampleIndex` to local `beatPosition`, relative to the clip start. Each pair of markers defines a linear mapping for both the waveform and playback. Tempo changes alter duration and pitch, as in a repitch/resampling mode. This is not a pitch-preserving stretch algorithm.

Enable Warp in the selected clip inspector to initialize endpoint markers from the current tempo. Place the playhead inside the clip and click Add marker at playhead. Edit a marker's source sample or beat, then leave the field to apply. Markers must remain in strictly increasing sample/beat order; invalid edits are rejected with a message. Endpoint source indices are fixed; edit the ending beat or Length to stretch the full clip. Disabling Warp returns to natural-rate playback; re-enabling initializes a fresh linear map. Undo can restore prior maps.

Splits and trims interpolate source positions and rebase local warp markers. Warped trims only shorten the current clip; Undo restores the removed portion. Unwarped trim handles can reveal retained source audio. Playback, seeking, loop boundaries, and WAV export use the same marker mapping. Large or abrupt changes between marker slopes may produce audible artifacts.

Loop playback repeats from zero to the configured bar count. Recording runs linearly, even with loop playback enabled. Tempo and marker edits are disabled during playback/recording. This version has no effects, plugins, metronome, count-in, MIDI editor, or MIDI synthesis. The timing model accepts beat-based MIDI coordinates without applying audio sample conversion.

## Saving

Save session stores one current session in IndexedDB on this browser and origin, including BPM, isWarped, and warp markers. Restore is undoable. Schema 3 uses beat-based arrangement positions; old seconds/sample-position sessions migrate using their saved project BPM. Audio stays in memory until saved; export a WAV for a portable mix. Previously saved single-track loops can be imported into the armed track. WAV export includes all unmuted clips at 44.1 kHz stereo with their current warp timing. Lower track levels if the mix distorts.

## Implementation

Reviewed [Audio-Loop-Station's LoopMachine.py](https://github.com/qnguyen345/Audio-Loop-Station/blob/main/LoopMachine.py) and README. Its independent track buffers, shared recording/playback position, track mute, and layering model informed this original JavaScript implementation. No Python source was copied.

`jam-core.js` owns beat-based clips, source sample ranges, validated warp maps, non-destructive edits, scheduling, and WAV encoding. Warped playback schedules source segments at marker-derived rates on a shared AudioContext clock. [Web Audio start offsets/durations refer to source-buffer seconds](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/start), so scheduling converts musical time separately from source time.

`jam-view.js` owns pixelsPerBeat, scrollOffsetBeats, per-track heights, visible ranges, and cached min/max peak pyramids. Offscreen clips and grid lines are culled horizontally and vertically. Waveform pixels query source peaks by piecewise interpolation through warp markers; tempo changes update unwarped sample density without rebuilding source peaks. Ruler labels are separated by at least 76 pixels. Zoom is bounded to 2–1024 pixels/beat and heights to 112–480 pixels; pan clamps at the arrangement origin.

`jam-recorder.js` captures mono PCM on the shared audio clock. `jam-studio.jsx` owns device lifecycle, persistence, and UI. Leaving Jam Mode stops playback/capture and releases the microphone while preserving the arrangement in memory.

Recording requires HTTPS or localhost. Physical interface latency still needs hardware testing. Background-tab scheduling can interrupt loops. Long recordings consume RAM and storage quotas apply; save errors are displayed.

## Validation

Run `node --test tests/*.test.cjs`. Tests cover coordinate invariants, cursor anchoring, independent track resizing, culling, peak buckets, beat/sample conversion, warp interpolation and validation, piecewise scheduling, seeking/loop boundaries, split/trim mappings, migration, PCM capture, and WAV encoding.

Browser verification includes clip selection, Warp toggling, warped versus unwarped BPM scaling, adding/editing markers, save/restore, and WAV export. A generated 220 Hz test tone with two warp segments rendered to a 2.75-second stereo WAV; measured frequencies were 880 Hz and 330 Hz for the warped segments and 220 Hz for the natural-rate segment, matching the configured marker slopes. Real guitar/audio-interface quality and latency require hardware testing.
