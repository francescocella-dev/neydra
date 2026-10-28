// OFFLINE PROPOSAL ONLY. Not imported by run.mjs or textRequest; no fetch/auth calls.
import { Stop, responseMetadata } from './auth.mjs';

export const PROPOSAL_LIMITS = Object.freeze({
  prefixBytes: 8192, frameBytes: 65_536, totalBytes: 262_144,
  events: 512, reads: 4096, outputCharacters: 16_384, deadlineMs: 10_000,
});

// A deliberately narrow Responses text subset, not a generic EventSource replacement.
// Parsing structure cannot authenticate its producer or prove billing/model entitlement.
export async function inspectMissingMimeFixture(response, overrides = {}) {
  const metadata = responseMetadata(response);
  if (response.status !== 200 || response.headers.get('content-type') !== null || !metadata.hasBodyStream)
    throw Object.assign(new Stop('proposal_not_applicable'), metadata);
  const limits = { ...PROPOSAL_LIMITS };
  for (const [key, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(limits, key) || !Number.isSafeInteger(value) || value <= 0 || value > limits[key])
      throw new Stop('invalid_proposal_limit');
    limits[key] = value; // Tests may tighten budgets, never raise them.
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Stop('proposal_deadline')), limits.deadlineMs);
  });
  let total = 0, frameBytes = 0, events = 0, reads = 0, outputCharacters = 0;
  let line = [], data = [], eventName = null, idSeen = false, afterCR = false, firstLine = true;
  let responseId = null, completed = false, doneMarker = false, eof = false;

  function dispatch() {
    if (!data.length) {
      if (eventName !== null || idSeen) throw new Stop('proposal_frame_without_data');
      return;
    }
    if (++events > limits.events) throw new Stop('proposal_event_limit');
    const payload = data.join('\n');
    if (payload === '[DONE]') {
      if (!completed || doneMarker || eventName !== null) throw new Stop('proposal_premature_done');
      doneMarker = true;
      return;
    }
    let event;
    try { event = JSON.parse(payload); } catch { throw new Stop('proposal_invalid_json'); }
    if (!event || Array.isArray(event) || typeof event.type !== 'string') throw new Stop('proposal_invalid_event');
    if (eventName !== null && eventName !== event.type) throw new Stop('proposal_event_mismatch');
    if (['error', 'response.failed', 'response.incomplete'].includes(event.type)) throw new Stop('proposal_response_failed');
    if (completed || doneMarker) throw new Stop('proposal_event_after_completion');
    if (responseId === null) {
      if (event.type !== 'response.created' || event.response?.status !== 'in_progress' || event.response.error != null ||
          typeof event.response?.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(event.response.id))
        throw new Stop('proposal_missing_created');
      responseId = event.response.id;
      return;
    }
    if (event.type === 'response.output_text.delta') {
      if (typeof event.delta !== 'string') throw new Stop('proposal_invalid_event');
      outputCharacters += event.delta.length;
      if (outputCharacters > limits.outputCharacters) throw new Stop('proposal_output_limit');
    } else if (['response.in_progress', 'response.completed'].includes(event.type)) {
      if (event.response?.id !== responseId || event.response.error != null ||
          event.response.status !== (event.type === 'response.completed' ? 'completed' : 'in_progress'))
        throw new Stop('proposal_invalid_response');
      if (event.type === 'response.completed') completed = true;
    } else {
      // Unknown types and extra created events fail closed pending documented support.
      throw new Stop('proposal_unsupported_event');
    }
  }

  function processLine() {
    let value;
    try { value = decoder.decode(Uint8Array.from(line)); } catch { throw new Stop('proposal_invalid_utf8'); }
    line = [];
    if (firstLine) { firstLine = false; if (value.startsWith('\uFEFF')) value = value.slice(1); }
    if (value === '') {
      dispatch();
      data = []; eventName = null; idSeen = false; frameBytes = 0;
    } else if (!value.startsWith(':')) {
      const colon = value.indexOf(':');
      const field = colon < 0 ? value : value.slice(0, colon);
      let content = colon < 0 ? '' : value.slice(colon + 1);
      if (content.startsWith(' ')) content = content.slice(1);
      if (field === 'data') data.push(content);
      else if (field === 'event' && eventName === null) eventName = content;
      else if (field === 'id' && !idSeen && !content.includes('\0')) idSeen = true;
      else throw new Stop('proposal_invalid_field'); // No retry/reconnection or ignored garbage.
    }
  }

  try {
    while (true) {
      // Bound even a producer emitting endless empty chunks without yielding to timers.
      if (++reads > limits.reads) throw new Stop('proposal_read_limit');
      const { value, done } = await Promise.race([reader.read(), deadline]);
      if (done) { eof = true; break; }
      if (!(value instanceof Uint8Array)) throw new Stop('proposal_invalid_chunk');
      for (const byte of value) {
        if (++total > limits.totalBytes) throw new Stop('proposal_total_limit');
        if (responseId === null && total > limits.prefixBytes) throw new Stop('proposal_prefix_limit');
        // Reserve headroom for LF after a CR-delimited blank line resets the frame.
        if (++frameBytes >= limits.frameBytes) throw new Stop('proposal_frame_limit');
        if (afterCR) { afterCR = false; if (byte === 10) continue; }
        if (byte === 10 || byte === 13) { processLine(); afterCR = byte === 13; }
        else line.push(byte);
      }
    }
    if (line.length) {
      // Validate remaining bytes too; never accept a truncated final UTF-8 sequence.
      try { decoder.decode(Uint8Array.from(line)); } catch { throw new Stop('proposal_invalid_utf8'); }
    }
    if (line.length || data.length || eventName !== null || idSeen) throw new Stop('proposal_truncated_frame');
    if (!completed) throw new Stop('proposal_without_completion');
    return { status: 'UNVERIFIED', mode: 'offline-fixture', ...metadata,
      structureRecognized: 'sse', completedObserved: true };
  } catch (error) {
    throw Object.assign(error instanceof Stop ? error : new Stop('proposal_stream_error'), metadata);
  } finally {
    clearTimeout(timer);
    // A hostile fixture can leave cancel pending: never wait beyond the deadline for cleanup.
    if (!eof) { try { void reader.cancel().catch(() => {}); } catch { /* No raw diagnostics. */ } }
    try { reader.releaseLock(); } catch { /* Pending read was already cancelled. */ }
  }
}
