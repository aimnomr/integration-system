import mqtt from 'mqtt'
import logger from './logger.js'

// Creates an MQTT client. Each Robot owns its own client so it can register a
// per-robot Last-Will — the retained CONNECTIONBROKEN message on its `connection`
// topic. MQTT permits only one Will per connection, hence one client per robot.
export function createMqttClient({ will } = {}) {
    const options = {}
    if (will) {
        options.will = {
            topic:   will.topic,
            payload: will.payload,
            qos:     1,
            retain:  true,
        }
    }

    const client = mqtt.connect(process.env.MQTT_BROKER, options)

    client.on('connect', () => logger.info('Connected to MQTT broker'))
    client.on('error',   (err) => logger.error('MQTT error', { error: err.message }))

    return client
}
