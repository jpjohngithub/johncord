import mqtt, { MqttClient } from 'mqtt';

// Free, ultra-fast public global MQTT over WebSocket brokers with fallback
const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081'
];

let client: MqttClient | null = null;
const eventListeners: Map<string, Set<(payload: any) => void>> = new Map();
const activeTopics: Set<string> = new Set();
let currentBrokerIndex = 0;

export function getGlobalRealtimeClient(): MqttClient {
  if (!client || !client.connected) {
    initGlobalRealtime();
  }
  return client!;
}

export function initGlobalRealtime() {
  if (client && client.connected) return;

  const brokerUrl = BROKERS[currentBrokerIndex];
  const clientId = `jc_web_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;

  console.log(`🌐 [Johncord Global Realtime] Connecting to global broker: ${brokerUrl}`);

  try {
    client = mqtt.connect(brokerUrl, {
      clientId,
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 2000,
      keepalive: 30
    });

    client.on('connect', () => {
      console.log('⚡ [Johncord Global Realtime] Connected to Global Network!');
      
      // Resubscribe to all active topics
      activeTopics.forEach((topic) => {
        client?.subscribe(topic, { qos: 0 });
      });

      // Announce current user presence
      const userStr = localStorage.getItem('johncord_user');
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          publishGlobalEvent('johncord/global/presence', {
            type: 'user_online',
            user: { ...user, presence: user.presence || 'online' }
          });
        } catch (e) {}
      }
    });

    client.on('message', (topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        const listeners = eventListeners.get(topic);
        if (listeners) {
          listeners.forEach((cb) => {
            try { cb(payload); } catch (err) { console.error('Listener error:', err); }
          });
        }

        // Also notify wildcard listeners if topic matches
        eventListeners.forEach((subs, subTopic) => {
          if (subTopic.endsWith('/#') || subTopic.endsWith('/+')) {
            const prefix = subTopic.replace(/\/[#+]$/, '');
            if (topic.startsWith(prefix)) {
              subs.forEach((cb) => {
                try { cb(payload); } catch (err) { console.error('Wildcard listener error:', err); }
              });
            }
          }
        });
      } catch (e) {}
    });

    client.on('error', (err) => {
      console.warn('⚠️ [Johncord Global Realtime] Broker error:', err);
      // Try next broker
      currentBrokerIndex = (currentBrokerIndex + 1) % BROKERS.length;
    });

    client.on('close', () => {
      // Reconnection handled automatically
    });
  } catch (err) {
    console.warn('Failed to connect to MQTT broker:', err);
  }
}

export function subscribeGlobalTopic(topic: string, callback: (payload: any) => void): () => void {
  if (!eventListeners.has(topic)) {
    eventListeners.set(topic, new Set());
  }
  eventListeners.get(topic)!.add(callback);

  activeTopics.add(topic);

  if (client && client.connected) {
    client.subscribe(topic, { qos: 0 });
  } else {
    initGlobalRealtime();
  }

  return () => {
    const listeners = eventListeners.get(topic);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        eventListeners.delete(topic);
        activeTopics.delete(topic);
        client?.unsubscribe(topic);
      }
    }
  };
}

export function publishGlobalEvent(topic: string, data: any) {
  const payload = JSON.stringify(data);
  if (client && client.connected) {
    client.publish(topic, payload, { qos: 0 });
  } else {
    initGlobalRealtime();
    // Buffer publish on connect
    client?.once('connect', () => {
      client?.publish(topic, payload, { qos: 0 });
    });
  }
}
