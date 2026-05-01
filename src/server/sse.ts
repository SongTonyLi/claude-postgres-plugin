interface SSEClient {
  id: string;
  sessionFilter: string | null;
  controller: ReadableStreamDefaultController;
}

export class SSEManager {
  private clients: Map<string, SSEClient> = new Map();

  addClient(id: string, controller: ReadableStreamDefaultController, sessionFilter: string | null): void {
    this.clients.set(id, { id, sessionFilter, controller });
  }

  removeClient(id: string): void {
    this.clients.delete(id);
  }

  broadcast(event: string, data: unknown, sessionId?: string): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const encoder = new TextEncoder();
    const bytes = encoder.encode(payload);

    for (const client of this.clients.values()) {
      if (client.sessionFilter && sessionId && client.sessionFilter !== sessionId) {
        continue;
      }
      try {
        client.controller.enqueue(bytes);
      } catch {
        this.clients.delete(client.id);
      }
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}
