/** Every RoomObject's `configJson` is untrusted, free-form JSON (a config string a client sent
 * and the server stored verbatim after schema-level length validation only) — parse it
 * defensively wherever it's read, never assume it's the shape a given kind expects. */
export function parseObjectConfig(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
