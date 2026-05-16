import 'dotenv/config'
import mqttClient from './src/mqttClient.js'
import { createRosConnection, reconnectRos, disconnectRos, getRos } from './src/rosConnection.js'
import { setupOdomSubscription, teardownOdom } from './src/odomBridge.js'
import { sendGoal, startWaypoints, cancelGoal, retryWaypoint, skipWaypoint, resetWaypoints } from './src/navigation.js'

createRosConnection({
    onConnect:    (ros) => setupOdomSubscription(ros, mqttClient),
    onDisconnect: ()    => teardownOdom(),
})

mqttClient.on('message', (topic, message) => {
    let data = {}
    try { data = JSON.parse(message.toString()) } catch { /* empty payload is valid */ }

    if (topic === 'amr/system/connect')    { reconnectRos(data.url); return }
    if (topic === 'amr/system/disconnect') { resetWaypoints(); disconnectRos(); return }

    const ros = getRos()
    if (!ros) {
        console.warn(`[MQTT→ROS] ROS not connected, dropping: ${topic}`)
        return
    }

    switch (topic) {
        case 'amr/cmd/goal':             sendGoal(ros, data);       break
        case 'amr/cmd/waypoints':        startWaypoints(ros, data); break
        case 'amr/cmd/cancel':           cancelGoal(ros);           break
        case 'amr/cmd/waypoints/retry':  retryWaypoint(ros);        break
        case 'amr/cmd/waypoints/skip':   skipWaypoint(ros);         break
    }
})
