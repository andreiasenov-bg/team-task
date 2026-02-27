const config = require("../config");

function isTranscriptionReady() {
  if (!config.transcription.enabled) return false;
  if (config.transcription.dryRun) return true;
  if (!config.transcription.apiKey) return false;
  return true;
}

async function transcribeAudioBuffer(buffer, mimeType = "audio/ogg", filename = "voice.ogg") {
  if (!isTranscriptionReady()) {
    return { ok: false, error: "transcription_not_configured" };
  }

  if (config.transcription.dryRun) {
    return { ok: true, text: "my tasks" };
  }

  if (config.transcription.provider !== "openai") {
    return { ok: false, error: "unsupported_transcription_provider" };
  }

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType }), filename);
  form.append("model", config.transcription.model);

  const response = await fetch(config.transcription.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.transcription.apiKey}`,
    },
    body: form,
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    return { ok: false, error: "transcription_failed", status: response.status, payload };
  }

  const transcript = payload && payload.text ? String(payload.text).trim() : "";
  if (!transcript) return { ok: false, error: "empty_transcript" };
  return { ok: true, text: transcript };
}

module.exports = {
  isTranscriptionReady,
  transcribeAudioBuffer,
};
