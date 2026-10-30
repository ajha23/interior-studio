/**
 * Lets the DOM-level walk "look" drag know that a 3D handler (unit drag, grip, door pull) already
 * took this press. R3F handlers run before window listeners, so they claim first.
 */
let claimed = false;

export function claimPointer(): void {
  claimed = true;
}

export function releasePointer(): void {
  claimed = false;
}

export function pointerClaimed(): boolean {
  return claimed;
}
