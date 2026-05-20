import { useEffect, useState } from 'react';
import { mqttBus, type MqttStatus } from '@/realtime/mqttClient';

export function useMqttStatus(): MqttStatus {
  const [status, setStatus] = useState<MqttStatus>(mqttBus.getStatus());
  useEffect(() => mqttBus.onStatus(setStatus), []);
  return status;
}
