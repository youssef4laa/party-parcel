'use client';

import { useEffect, useRef, useState } from 'react';
import type { VoicePayload } from '@/goodies/schema';
import { LIMITS } from '@/config/limits';
import { Field, inputClass, EditorShell } from './shared';
import { useAssetUpload } from './useAssetUpload';
import type { GoodieEditorProps } from './types';

const CANDIDATE_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return CANDIDATE_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

export default function VoiceEditor({ initial, roomToken, onSave, onCancel }: GoodieEditorProps<VoicePayload>) {
  const [assetKey, setAssetKey] = useState(initial?.assetKey);
  const [size, setSize] = useState(initial?.sizeBytes ?? 0);
  const [duration, setDuration] = useState(initial?.durationSeconds ?? 0);
  const [transcript, setTranscript] = useState(initial?.transcript ?? '');
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const { upload, uploading, error, setError } = useAssetUpload(roomToken, 'voice');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => () => stopEverything(), []);

  function stopEverything() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const sampleLevel = () => {
        analyser.getByteTimeDomainData(data);
        const peak = Math.max(...Array.from(data, (v) => Math.abs(v - 128)));
        setLevel(peak / 128);
        rafRef.current = requestAnimationFrame(sampleLevel);
      };
      sampleLevel();

      const mimeType = pickSupportedMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = onRecordingStopped;
      recorder.start();
      startRef.current = Date.now();
      setRecording(true);

      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startRef.current) / 1000;
        if (elapsed >= LIMITS.maxVoiceSeconds) stopRecording();
      }, 250);
    } catch {
      setError('Microphone access was denied or unavailable.');
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
    stopEverything();
  }

  async function onRecordingStopped() {
    const mimeType = recorderRef.current?.mimeType || 'audio/webm';
    const blob = new Blob(chunksRef.current, { type: mimeType });
    const seconds = Math.min(LIMITS.maxVoiceSeconds, (Date.now() - startRef.current) / 1000);
    setDuration(Math.round(seconds));
    const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
    const result = await upload(blob, `voice.${ext}`);
    if (result) {
      setAssetKey(result.assetKey);
      setSize(result.size);
    }
  }

  async function onFileChosen(file: File | undefined) {
    if (!file) return;
    const result = await upload(file);
    if (result) {
      setAssetKey(result.assetKey);
      setSize(result.size);
      setDuration(0); // unknown for a plain upload — recipient player still works without it
    }
  }

  return (
    <EditorShell
      title="Voice"
      onCancel={onCancel}
      onSave={() =>
        onSave({
          id: initial?.id ?? '',
          type: 'voice',
          assetKey: assetKey!,
          durationSeconds: duration,
          transcript: transcript.trim() || undefined,
          sizeBytes: size,
        })
      }
      saveDisabled={!assetKey || uploading || recording}
      error={error}
    >
      <div className="flex items-center gap-3">
        {!recording ? (
          <button
            type="button"
            onClick={startRecording}
            className="border-2 border-[#ff3d8b] bg-[#fff6d5] px-3 py-1.5 font-mono text-sm text-[#ff3d8b] hover:bg-[#ff3d8b] hover:text-[#fff6d5]"
          >
            🎙️ Record
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            className="border-2 border-[#ff3d8b] bg-[#ff3d8b] px-3 py-1.5 font-mono text-sm text-[#fff6d5]"
          >
            ⏹ Stop
          </button>
        )}
        {recording && (
          <div className="flex h-6 items-end gap-0.5" aria-hidden>
            {Array.from({ length: 12 }, (_, i) => (
              <div
                key={i}
                className="w-1.5 bg-[#ff3d8b]"
                style={{ height: `${Math.max(2, level * 24 * (0.5 + Math.random() * 0.5))}px` }}
              />
            ))}
          </div>
        )}
        {uploading && <span className="font-mono text-xs text-[#5e3620]">uploading...</span>}
        {assetKey && !recording && <span className="font-mono text-xs text-[#5e3620]">✓ {duration || '?'}s recorded</span>}
      </div>
      <p className="font-mono text-xs text-[#5e3620]/70">Max {LIMITS.maxVoiceSeconds / 60} minutes. Or upload a file:</p>
      <input
        type="file"
        accept="audio/*"
        onChange={(e) => onFileChosen(e.target.files?.[0])}
        className={inputClass}
      />
      <Field label="Transcript (optional, for accessibility)">
        <textarea value={transcript} onChange={(e) => setTranscript(e.target.value.slice(0, 2000))} rows={2} className={inputClass} />
      </Field>
    </EditorShell>
  );
}
