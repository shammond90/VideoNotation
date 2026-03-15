/**
 * useBroadcastSync — BroadcastChannel hook for dual-window synchronisation.
 *
 * All state sync between the main window and the video popup uses
 * BroadcastChannel on 'cuetation-sync'.
 *
 * Popup → Main:
 *   TIMECODE_UPDATE  { seconds }
 *   PLAYBACK_STATE   { playing }
 *   PLAYBACK_SPEED   { speed }
 *   POPUP_READY
 *   POPUP_CLOSING
 *
 * Main → Popup:
 *   CMD_PLAY / CMD_PAUSE / CMD_SEEK { seconds } / CMD_SPEED { speed }
 *   CMD_LOAD_VIDEO
 *   CUE_UPDATED / CUE_ADDED / CUE_DELETED / ACTIVE_CUE
 */

import { useRef, useCallback, useEffect } from 'react';

const CHANNEL_NAME = 'cuetation-sync';

// ── Message types ──

export interface TimecodeUpdateMsg {
  type: 'TIMECODE_UPDATE';
  seconds: number;
}
export interface PlaybackStateMsg {
  type: 'PLAYBACK_STATE';
  playing: boolean;
}
export interface PlaybackSpeedMsg {
  type: 'PLAYBACK_SPEED';
  speed: number;
}
export interface PopupReadyMsg {
  type: 'POPUP_READY';
}
export interface PopupClosingMsg {
  type: 'POPUP_CLOSING';
}

export interface CmdPlayMsg {
  type: 'CMD_PLAY';
}
export interface CmdPauseMsg {
  type: 'CMD_PAUSE';
}
export interface CmdTogglePlayMsg {
  type: 'CMD_TOGGLE_PLAY';
}
export interface CmdSeekMsg {
  type: 'CMD_SEEK';
  seconds: number;
}
export interface CmdSpeedMsg {
  type: 'CMD_SPEED';
  speed: number;
}
export interface CmdLoadVideoMsg {
  type: 'CMD_LOAD_VIDEO';
  projectId: string;
}

export interface CueUpdatedMsg {
  type: 'CUE_UPDATED';
  cue: unknown;
}
export interface CueAddedMsg {
  type: 'CUE_ADDED';
  cue: unknown;
}
export interface CueDeletedMsg {
  type: 'CUE_DELETED';
  cueId: string;
}
export interface ActiveCueMsg {
  type: 'ACTIVE_CUE';
  cueId: string | null;
}
export interface ConfigShowTimecodeMsg {
  type: 'CONFIG_SHOW_TIMECODE';
  show: boolean;
}

export type SyncMessage =
  | TimecodeUpdateMsg
  | PlaybackStateMsg
  | PlaybackSpeedMsg
  | PopupReadyMsg
  | PopupClosingMsg
  | CmdPlayMsg
  | CmdPauseMsg
  | CmdTogglePlayMsg
  | CmdSeekMsg
  | CmdSpeedMsg
  | CmdLoadVideoMsg
  | CueUpdatedMsg
  | CueAddedMsg
  | CueDeletedMsg
  | ActiveCueMsg
  | ConfigShowTimecodeMsg;

// ── Feature detection ──

export const supportsDualWindow =
  typeof window !== 'undefined' &&
  'BroadcastChannel' in window &&
  'showOpenFilePicker' in window;

// ── Hook ──

export function useBroadcastSync(
  onMessage: (msg: SyncMessage) => void,
) {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const callbackRef = useRef(onMessage);
  callbackRef.current = onMessage;

  // Open channel on mount, close on unmount
  useEffect(() => {
    if (!supportsDualWindow) return;

    const ch = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = ch;

    ch.onmessage = (e: MessageEvent) => {
      if (e.data && typeof e.data.type === 'string') {
        callbackRef.current(e.data as SyncMessage);
      }
    };

    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, []);

  // Send helper
  const send = useCallback((msg: SyncMessage) => {
    channelRef.current?.postMessage(msg);
  }, []);

  return { send };
}
