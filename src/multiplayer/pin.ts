const PIN_LENGTH = 6;
const PEER_ID_PREFIX = "triviunsada-";

export function createSessionPin(random: () => number = Math.random): string {
  const value = Math.floor(random() * 10 ** PIN_LENGTH);
  return value.toString().padStart(PIN_LENGTH, "0");
}

export function peerIdFromPin(pin: string): string {
  return `${PEER_ID_PREFIX}${pin}`;
}
