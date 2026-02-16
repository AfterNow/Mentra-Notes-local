import type { AppSession } from "@mentra/sdk";
import { SyncedManager } from "../../../lib/sync";

/**
 * All supported touchpad gestures on the glasses.
 */
export const GESTURES = [
  "single_tap",
  "double_tap",
  "triple_tap",
  "long_press",
  "forward_swipe",
  "backward_swipe",
  "up_swipe",
  "down_swipe",
] as const;

export type GestureName = (typeof GESTURES)[number];

/**
 * InputManager — handles all physical input from the glasses (buttons + touchpad).
 *
 * Registered as a @manager on NotesSession so it has access to the user's
 * session and sibling managers (photo, transcript, etc.).
 */
export class InputManager extends SyncedManager {
  /** Wire up all button and touch listeners on the glasses AppSession */
  setup(appSession: AppSession): void {
    this.setupButtons(appSession);
    this.setupTouch(appSession);
  }

  /** Button press handlers */
  private setupButtons(appSession: AppSession): void {
    appSession.events.onButtonPress(async (button) => {
      console.log(`[Button] ${this._session.userId}: ${button.buttonId} (${button.pressType})`);
    });
  }

  /** Touchpad gesture handlers */
  private setupTouch(appSession: AppSession): void {
    appSession.events.onTouchEvent("single_tap", async () => {
      console.log(`[Touch] ${this._session.userId}: single_tap`);
      await (this._session as any).photo.takePhoto();
    });

    appSession.events.onTouchEvent("double_tap", () => {
      console.log(`[Touch] ${this._session.userId}: double_tap`);
    });

    appSession.events.onTouchEvent("triple_tap", () => {
      console.log(`[Touch] ${this._session.userId}: triple_tap`);
    });

    appSession.events.onTouchEvent("long_press", () => {
      console.log(`[Touch] ${this._session.userId}: long_press`);
    });

    appSession.events.onTouchEvent("forward_swipe", () => {
      console.log(`[Touch] ${this._session.userId}: forward_swipe`);
    });

    appSession.events.onTouchEvent("backward_swipe", () => {
      console.log(`[Touch] ${this._session.userId}: backward_swipe`);
    });

    appSession.events.onTouchEvent("up_swipe", () => {
      console.log(`[Touch] ${this._session.userId}: up_swipe`);
    });

    appSession.events.onTouchEvent("down_swipe", () => {
      console.log(`[Touch] ${this._session.userId}: down_swipe`);
    });
  }
}
