import mqtt from 'mqtt'

const client = mqtt.connect(process.env.MQTT_BROKER)

client.on('connect', () => {
    console.log('[MQTT] Connected to broker')
    client.subscribe([
        'amr/cmd/goal',
        'amr/cmd/waypoints',
        'amr/cmd/cancel',
        'amr/cmd/waypoints/retry',
        'amr/cmd/waypoints/skip',
        'amr/system/connect',
        'amr/system/disconnect',
    ], (err) => {
        if (err) console.error('[MQTT] Subscribe error:', err)
        else console.log('[MQTT] Subscribed to command topics')
    })
})

client.on('error', (err) => {
    console.error('[MQTT] Error:', err.message)
})

export default client
