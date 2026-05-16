import mqttClient from './mqttClient.js'
import logger from './logger.js'

// Publishes amr/health/connection — rosbridge connection state.
export function publishConnection(connected, rosbridgeUrl) {
    const payload = {
        timestamp:     new Date().toISOString(),
        connected,
        rosbridge_url: rosbridgeUrl ?? null,
    }
    mqttClient.publish('amr/health/connection', JSON.stringify(payload), { qos: 1 }, (err) => {
        if (err) logger.error('Publish failed', { topic: 'amr/health/connection', error: err.message })
        else logger.info('Connection state published', { connected })
    })
}

// Publishes amr/health/error — a bridge-detected fault.
export function reportError(errorType, message, source) {
    const payload = {
        timestamp:  new Date().toISOString(),
        error_type: errorType,
        message:    String(message),
        source,
    }
    mqttClient.publish('amr/health/error', JSON.stringify(payload), { qos: 2 }, (err) => {
        if (err) logger.error('Publish failed', { topic: 'amr/health/error', error: err.message })
    })
}
