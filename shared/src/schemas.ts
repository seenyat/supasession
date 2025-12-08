import * as S from "@effect/schema/Schema";

export const TrackSchema = S.Struct({
  id: S.String,
  name: S.String,
  artists: S.Array(S.String),
  album: S.String,
  albumArtUrl: S.NullOr(S.String),
  albumArtData: S.NullOr(S.String),
  durationMs: S.Number,
});

export const TrackColorsSchema = S.Struct({
  vibrant: S.NullOr(S.String),
  prominent: S.NullOr(S.String),
  desaturated: S.NullOr(S.String),
  lightVibrant: S.NullOr(S.String),
});

export const PlayerStateSchema = S.Struct({
  currentTrack: S.NullOr(TrackSchema),
  isPlaying: S.Boolean,
  positionMs: S.Number,
  tempo: S.NullOr(S.Number),
  volume: S.Number,
  shuffleEnabled: S.Boolean,
  repeatMode: S.Literal("off", "track", "context"),
  colors: S.optional(S.NullOr(TrackColorsSchema)),
});

export const QueueStateSchema = S.Struct({
  current: S.NullOr(TrackSchema),
  next: S.Array(TrackSchema),
  prev: S.Array(TrackSchema),
});

export const LyricLineSchema = S.Struct({
  startTime: S.Number,
  text: S.String,
});

export const LyricsStateSchema = S.Struct({
  trackId: S.String,
  synced: S.NullOr(S.Array(LyricLineSchema)),
  unsynced: S.NullOr(S.Array(S.String)),
});

export const ControlCommandSchema = S.Union(
  S.Struct({ command: S.Literal("play") }),
  S.Struct({ command: S.Literal("pause") }),
  S.Struct({ command: S.Literal("togglePlayPause") }),
  S.Struct({ command: S.Literal("next") }),
  S.Struct({ command: S.Literal("previous") }),
  S.Struct({ command: S.Literal("seek"), positionMs: S.Number }),
  S.Struct({ command: S.Literal("setVolume"), volume: S.Number })
);

export const HelloPayloadSchema = S.Struct({
  role: S.Literal("producer", "consumer"),
});

export const WelcomePayloadSchema = S.Struct({
  sessionId: S.String,
  connectedAt: S.Number,
});

export const ErrorPayloadSchema = S.Struct({
  code: S.String,
  message: S.String,
});

export const BaseMessageSchema = S.Struct({
  v: S.Literal(1),
  sessionId: S.String,
  ts: S.Number,
});

export const HelloMessageSchema = S.extend(
  BaseMessageSchema,
  S.Struct({
    kind: S.Literal("hello"),
    payload: HelloPayloadSchema,
  })
);

export const WelcomeMessageSchema = S.extend(
  BaseMessageSchema,
  S.Struct({
    kind: S.Literal("welcome"),
    payload: WelcomePayloadSchema,
  })
);

export const PlayerStateMessageSchema = S.extend(
  BaseMessageSchema,
  S.Struct({
    kind: S.Literal("player_state"),
    payload: PlayerStateSchema,
  })
);

export const QueueUpdateMessageSchema = S.extend(
  BaseMessageSchema,
  S.Struct({
    kind: S.Literal("queue_update"),
    payload: QueueStateSchema,
  })
);

export const LyricsMessageSchema = S.extend(
  BaseMessageSchema,
  S.Struct({
    kind: S.Literal("lyrics"),
    payload: LyricsStateSchema,
  })
);

export const HeartbeatMessageSchema = S.extend(
  BaseMessageSchema,
  S.Struct({
    kind: S.Literal("heartbeat"),
    payload: S.Struct({}),
  })
);

export const ControlMessageSchema = S.extend(
  BaseMessageSchema,
  S.Struct({
    kind: S.Literal("control"),
    payload: ControlCommandSchema,
  })
);

export const ErrorMessageSchema = S.extend(
  BaseMessageSchema,
  S.Struct({
    kind: S.Literal("error"),
    payload: ErrorPayloadSchema,
  })
);

export const AnyMessageSchema = S.Union(
  HelloMessageSchema,
  WelcomeMessageSchema,
  PlayerStateMessageSchema,
  QueueUpdateMessageSchema,
  LyricsMessageSchema,
  HeartbeatMessageSchema,
  ControlMessageSchema,
  ErrorMessageSchema
);

export type AnyMessage = S.Schema.Type<typeof AnyMessageSchema>;
