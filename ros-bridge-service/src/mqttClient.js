import mqtt from 'mqtt'
import logger from './logger.js'

const client = mqtt.connect(process.env.MQTT_BROKER)

client.on('connect', () => {
    logger.info('Connected to MQTT broker')
    client.subscribe([
        'amr/cmd/goal',
        'amr/cmd/waypoints',
        'amr/cmd/cancel',
        'amr/cmd/waypoints/retry',
        'amr/cmd/waypoints/skip',
        'amr/system/connect',
        'amr/system/disconnect',
    ], (err) => {
        if (err) logger.error('MQTT subscribe failed', { error: err.message })
        else logger.info('Subscribed to command topics')
    })
})

client.on('error', (err) => {
    logger.error('MQTT error', { error: err.message })
})

export default client
