import { createContext, useContext, ReactNode, useRef } from "react";
import { useInterpret, useActor } from "@xstate/react";
import { createPlayerMachine } from "./playerMachine";

const PlayerServiceContext = createContext<{
  service: ReturnType<typeof useInterpret>;
  setSendControl: (fn: (command: { command: string; [k: string]: any }) => void) => void;
} | null>(null);

export const PlayerServiceProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const sendRef = useRef<(command: { command: string; [k: string]: any }) => void>(() => {});
  const service = useInterpret(createPlayerMachine(() => sendRef.current));
  
  service.onTransition((state) => {
    console.log("[Machine]", state.value, "pending:", state.context.pendingTrackId?.slice(-8));
  });
  return (
    <PlayerServiceContext.Provider
      value={{
        service,
        setSendControl: (fn) => {
          sendRef.current = fn;
        },
      }}
    >
      {children}
    </PlayerServiceContext.Provider>
  );
};

export const usePlayerService = () => {
  const ctx = useContext(PlayerServiceContext);
  if (!ctx) throw new Error("usePlayerService must be used within PlayerServiceProvider");
  return ctx.service;
};

export const usePlayerActor = () => {
  const service = usePlayerService();
  return useActor(service);
};

export const useSetSendControl = () => {
  const ctx = useContext(PlayerServiceContext);
  if (!ctx) throw new Error("useSetSendControl must be used within PlayerServiceProvider");
  return ctx.setSendControl;
};
