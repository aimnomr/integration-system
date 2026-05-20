import mqtt, { type MqttClient, type IClientOptions } from 'mqtt';
import { CONFIG } from '@/config';

/**
 * Browser MQTT singleton.
 *
 * One WebSocket connection to Mosquitto (port 9001), shared across the whole
 * app. Multiple components can subscribe to the same topic — the underlying
 * MQTT subscription is reference-counted, so we open one server-side sub no
 * matter how many React hooks are listening.
 *
 * Topic patterns accept `+` and `#` wildcards (standard MQTT). Each incoming
 * message is dispatched to every handler whose pattern matches.
 *
 * Reconnect uses mqtt.js's built-in exponential backoff (capped at 30 s).
 */

export type MqttStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

type Handler<T = unknown> = (payload: T, topic: string) => void;

interface Subscription {
  pattern: string;
  matcher: RegExp;
  handlers: Set<Handler>;
}

class MqttBus {
  private client: MqttClient | null = null;
  private status: MqttStatus = 'offline';
  private subs = new Map<string, Subscription>();
  private statusListeners = new Set<(s: MqttStatus) => void>();

  /** Lazy connect — first subscribe / first status listener opens the WS. */
  private ensureConnected(): MqttClient {
    if (this.client) return this.client;
    const opts: IClientOptions = {
      reconnectPeriod: 2000,        // initial reconnect delay
      connectTimeout: 10_000,
      keepalive: 60,
      clean: true,
      protocolVersion: 5,
    };
    this.setStatus('connecting');
    const c = mqtt.connect(CONFIG.mqttWsUrl, opts);
    c.on('connect', () => this.setStatus('connected'));
    c.on('reconnect', () => this.setStatus('reconnecting'));
    c.on('close', () => this.setStatus('offline'));
    c.on('offline', () => this.setStatus('offline'));
    c.on('error', () => { /* status already reflects this via close */ });
    c.on('message', (topic, payload) => this.dispatch(topic, payload));
    this.client = c;

    // Re-register all subscriptions on (re)connect, in case a reconnect dropped them.
    c.on('connect', () => {
      for (const pattern of this.subs.keys()) c.subscribe(pattern);
    });

    return c;
  }

  subscribe<T = unknown>(pattern: string, handler: Handler<T>): () => void {
    const client = this.ensureConnected();
    let sub = this.subs.get(pattern);
    if (!sub) {
      sub = {
        pattern,
        matcher: patternToRegex(pattern),
        handlers: new Set(),
      };
      this.subs.set(pattern, sub);
      if (client.connected) client.subscribe(pattern);
    }
    sub.handlers.add(handler as Handler);
    return () => this.unsubscribe(pattern, handler as Handler);
  }

  private unsubscribe(pattern: string, handler: Handler) {
    const sub = this.subs.get(pattern);
    if (!sub) return;
    sub.handlers.delete(handler);
    if (sub.handlers.size === 0) {
      this.subs.delete(pattern);
      this.client?.unsubscribe(pattern);
    }
  }

  private dispatch(topic: string, raw: Buffer) {
    let payload: unknown;
    const text = raw.toString('utf8');
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
    for (const sub of this.subs.values()) {
      if (sub.matcher.test(topic)) {
        for (const h of sub.handlers) h(payload, topic);
      }
    }
  }

  onStatus(listener: (s: MqttStatus) => void): () => void {
    // Make sure the client is being constructed once a UI cares about status.
    this.ensureConnected();
    this.statusListeners.add(listener);
    listener(this.status);
    return () => { this.statusListeners.delete(listener); };
  }

  getStatus(): MqttStatus {
    return this.status;
  }

  private setStatus(s: MqttStatus) {
    if (this.status === s) return;
    this.status = s;
    for (const l of this.statusListeners) l(s);
  }
}

function patternToRegex(pattern: string): RegExp {
  // MQTT wildcards: '+' matches a single topic level, '#' matches the rest.
  // Escape regex metacharacters except the two wildcards we re-handle below.
  const escaped = pattern
    .split('')
    .map((ch) => {
      if (ch === '+') return '[^/]+';
      if (ch === '#') return '.*';
      if (/[.*+?^${}()|[\]\\]/.test(ch)) return '\\' + ch;
      return ch;
    })
    .join('');
  return new RegExp('^' + escaped + '$');
}

export const mqttBus = new MqttBus();
