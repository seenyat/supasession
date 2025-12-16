import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import * as Effect from "effect/Effect";
import * as S from "@effect/schema/Schema";
import {
  AnyMessageSchema,
  HelloMessageSchema,
  type AnyMessage,
} from "@supasession/shared";

const PORT = Number(process.env.PORT) || 17777;

interface Client {
  ws: WebSocket;
  role: "producer" | "consumer";
  sessionId: string;
  connectedAt: number;
}

const producers = new Map<string, Client>();
const consumers = new Map<string, Set<Client>>();
const queueVersions = new Map<string, number>();

// Cache last state per session for new consumers
const lastPlayerState = new Map<string, AnyMessage>();
const lastQueueState = new Map<string, AnyMessage>();
const lastLyrics = new Map<string, AnyMessage>();
const lastDebugResponse = new Map<string, any>();

const generateSessionId = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const sendMessage = (ws: WebSocket, message: AnyMessage) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
};

const broadcastToConsumers = (sessionId: string, message: AnyMessage) => {
  const sessionConsumers = consumers.get(sessionId);
  if (sessionConsumers) {
    for (const client of sessionConsumers) {
      sendMessage(client.ws, message);
    }
  }
};

const forwardToProducer = (sessionId: string, message: AnyMessage) => {
  const producer = producers.get(sessionId);
  if (producer) {
    sendMessage(producer.ws, message);
  }
};

const handleMessage = (client: Client, raw: string) => {
  const parseResult = Effect.runSync(
    Effect.either(S.decodeUnknown(AnyMessageSchema)(JSON.parse(raw)))
  );

  if (parseResult._tag === "Left") {
    console.error("Invalid message:", parseResult.left);
    sendMessage(client.ws, {
      v: 1,
      sessionId: client.sessionId,
      kind: "error",
      ts: Date.now(),
      payload: { code: "INVALID_MESSAGE", message: "Failed to parse message" },
    });
    return;
  }

  const message = parseResult.right;

  if (client.role === "producer") {
    if (message.kind === "player_state") {
      lastPlayerState.set(client.sessionId, message);
      broadcastToConsumers(client.sessionId, message);
    } else if (message.kind === "queue_update") {
      const currentVersion = queueVersions.get(client.sessionId) ?? 0;
      const nextVersion = currentVersion + 1;
      queueVersions.set(client.sessionId, nextVersion);
      const withVersion = {
        ...message,
        payload: { ...message.payload, version: nextVersion },
      };
      lastQueueState.set(client.sessionId, withVersion);
      broadcastToConsumers(client.sessionId, withVersion);
    } else if (message.kind === "lyrics") {
      lastLyrics.set(client.sessionId, message);
      broadcastToConsumers(client.sessionId, message);
    } else if ((message as any).kind === "debug_response") {
      // Cache debug response for API retrieval
      lastDebugResponse.set(client.sessionId, (message as any).payload);
      console.log("[Debug Response]", JSON.stringify((message as any).payload, null, 2));
    }
  } else if (client.role === "consumer") {
    if (message.kind === "control") {
      console.log(`[Control] ${JSON.stringify(message.payload)}`);
      forwardToProducer(client.sessionId, message);
    }
  }
};

const getActiveSessions = (): string[] => {
  return Array.from(producers.keys());
};

const handleConnection = (ws: WebSocket, sessionId: string | null, autoJoin: boolean) => {
  let client: Client | null = null;

  ws.on("message", (data) => {
    const raw = data.toString();

    if (!client) {
      try {
        const parsed = JSON.parse(raw);
        
        // Handle discovery request
        if (parsed.kind === "discover") {
          const sessions = getActiveSessions();
          sendMessage(ws, {
            v: 1,
            sessionId: "",
            kind: "sessions",
            ts: Date.now(),
            payload: { sessions },
          } as any);
          return;
        }

        const helloResult = Effect.runSync(
          Effect.either(S.decodeUnknown(HelloMessageSchema)(parsed))
        );

        if (helloResult._tag === "Left") {
          ws.close(1008, "First message must be hello");
          return;
        }

        const hello = helloResult.right;
        
        // Auto-join: if consumer with no sessionId, try to find the only active session
        let finalSessionId = sessionId;
        if (!finalSessionId && hello.payload.role === "consumer" && autoJoin) {
          const sessions = getActiveSessions();
          if (sessions.length === 1) {
            finalSessionId = sessions[0];
            console.log(`Auto-joining consumer to session: ${finalSessionId}`);
          } else if (sessions.length === 0) {
            sendMessage(ws, {
              v: 1,
              sessionId: "",
              kind: "error",
              ts: Date.now(),
              payload: { code: "NO_SESSIONS", message: "No active sessions available" },
            });
            ws.close(1000, "No sessions");
            return;
          } else {
            // Multiple sessions - send list and let client choose
            sendMessage(ws, {
              v: 1,
              sessionId: "",
              kind: "sessions",
              ts: Date.now(),
              payload: { sessions },
            } as any);
            return;
          }
        }
        
        finalSessionId = finalSessionId || generateSessionId();

        client = {
          ws,
          role: hello.payload.role,
          sessionId: finalSessionId,
          connectedAt: Date.now(),
        };

        if (client.role === "producer") {
          producers.set(finalSessionId, client);
          console.log(`Producer connected: ${finalSessionId}`);
        } else {
          if (!consumers.has(finalSessionId)) {
            consumers.set(finalSessionId, new Set());
          }
          consumers.get(finalSessionId)!.add(client);
          console.log(
            `Consumer connected: ${finalSessionId} (${consumers.get(finalSessionId)!.size} total)`
          );
        }

        sendMessage(ws, {
          v: 1,
          sessionId: finalSessionId,
          kind: "welcome",
          ts: Date.now(),
          payload: { sessionId: finalSessionId, connectedAt: client.connectedAt },
        });

        // Send cached state to new consumers
        if (client.role === "consumer") {
          const cachedPlayerState = lastPlayerState.get(finalSessionId);
          const cachedQueueState = lastQueueState.get(finalSessionId);
          const cachedLyrics = lastLyrics.get(finalSessionId);
          
          if (cachedPlayerState) {
            sendMessage(ws, cachedPlayerState);
          }
          if (cachedQueueState) {
            sendMessage(ws, cachedQueueState);
          }
          if (cachedLyrics) {
            sendMessage(ws, cachedLyrics);
          }
        }
      } catch (e) {
        ws.close(1008, "Invalid hello message");
      }
      return;
    }

    handleMessage(client, raw);
  });

  ws.on("close", () => {
    if (!client) return;

    if (client.role === "producer") {
      producers.delete(client.sessionId);
      lastPlayerState.delete(client.sessionId);
      lastQueueState.delete(client.sessionId);
      lastLyrics.delete(client.sessionId);
      console.log(`Producer disconnected: ${client.sessionId}`);
    } else {
      consumers.get(client.sessionId)?.delete(client);
      if (consumers.get(client.sessionId)?.size === 0) {
        consumers.delete(client.sessionId);
      }
      console.log(`Consumer disconnected: ${client.sessionId}`);
    }
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
  });
};

// HTTP server for API endpoints
const HTTP_PORT = Number(process.env.HTTP_PORT) || 17778;

const httpServer = createServer((req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url || "", `http://localhost:${HTTP_PORT}`);

  // GET /api/debug - send debug command and wait for response
  if (url.pathname === "/api/debug" && req.method === "GET") {
    const sessions = getActiveSessions();
    if (sessions.length === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No active sessions" }));
      return;
    }
    const sessionId = sessions[0];
    // Clear old response
    lastDebugResponse.delete(sessionId);
    forwardToProducer(sessionId, {
      v: 1,
      sessionId,
      kind: "control",
      ts: Date.now(),
      payload: { command: "debug" },
    });
    // Wait for response (poll for up to 3 seconds)
    let attempts = 0;
    const checkResponse = () => {
      attempts++;
      const response = lastDebugResponse.get(sessionId);
      if (response) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response, null, 2));
      } else if (attempts < 30) {
        setTimeout(checkResponse, 100);
      } else {
        res.writeHead(504, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Timeout waiting for debug response" }));
      }
    };
    setTimeout(checkResponse, 100);
    return;
  }

  // GET /api/sessions - list active sessions
  if (url.pathname === "/api/sessions" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ sessions: getActiveSessions() }));
    return;
  }

  // POST /api/control - send any control command
  if (url.pathname === "/api/control" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const { command, sessionId: reqSessionId, ...rest } = JSON.parse(body);
        const sessions = getActiveSessions();
        const sessionId = reqSessionId || sessions[0];
        if (!sessionId) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No active sessions" }));
          return;
        }
        forwardToProducer(sessionId, {
          v: 1,
          sessionId,
          kind: "control",
          ts: Date.now(),
          payload: { command, ...rest },
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, sessionId, command }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

httpServer.listen(HTTP_PORT, () => {
  console.log(`📡 HTTP API running on http://localhost:${HTTP_PORT}`);
});

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "", `http://localhost:${PORT}`);
  const sessionId = url.searchParams.get("sessionId");
  const autoJoin = url.searchParams.get("autoJoin") === "true";

  handleConnection(ws, sessionId, autoJoin);
});

console.log(`🚀 SupaSession relay server running on ws://localhost:${PORT}`);

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();

  for (const [sessionId, producer] of producers) {
    if (now - producer.connectedAt > SESSION_TIMEOUT_MS) {
      producer.ws.close(1000, "Session expired");
      producers.delete(sessionId);
    }
  }

  for (const [sessionId, sessionConsumers] of consumers) {
    for (const consumer of sessionConsumers) {
      if (now - consumer.connectedAt > SESSION_TIMEOUT_MS) {
        consumer.ws.close(1000, "Session expired");
        sessionConsumers.delete(consumer);
      }
    }
    if (sessionConsumers.size === 0) {
      consumers.delete(sessionId);
    }
  }
}, 60000);
