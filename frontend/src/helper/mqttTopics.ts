import type { FleetResponse } from '@/types/api';

/**
 * VDA5050 topic builder. Topics live under
 * {interfaceName}/{majorVersion}/{manufacturer}/{serial}/{topic} — for this
 * project that's `amr/v2/moverobotic/{serial}/...`. The manufacturer and
 * versions come from /fleet so the UI tolerates a future rebrand.
 */

type TopicName = 'state' | 'connection' | 'order' | 'instantActions';

export function vdaTopic(
  fleet: Pick<FleetResponse, 'interfaceName' | 'majorVersion' | 'manufacturer'>,
  serial: string,
  topic: TopicName,
): string {
  return `${fleet.interfaceName}/${fleet.majorVersion}/${fleet.manufacturer}/${serial}/${topic}`;
}

export function vdaTopicWildcardSerial(
  fleet: Pick<FleetResponse, 'interfaceName' | 'majorVersion' | 'manufacturer'>,
  topic: TopicName,
): string {
  return `${fleet.interfaceName}/${fleet.majorVersion}/${fleet.manufacturer}/+/${topic}`;
}

/** Pull the serial out of an inbound topic string. Returns null if it doesn't
 * match the expected shape. */
export function serialFromTopic(topic: string): string | null {
  const parts = topic.split('/');
  return parts.length >= 5 ? parts[3] ?? null : null;
}
