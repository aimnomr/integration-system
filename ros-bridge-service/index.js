import 'dotenv/config'
import mqttClient from './src/mqttClient.js'
import logger from './src/logger.js'
import { createRosConnection, reconnectRos, disconnectRos, getRos } from './src/rosConnection.js'
import { setupOdomSubscription, teardownOdom } from './src/odomBridge.js'
import { setupPoseSubscription, teardownPose } from './src/poseBridge.js'
import { setupNavFeedback, teardownNavFeedback } from './src/navFeedback.js'
import {
    sendGoal, startWaypoints, cancelGoal, retryWaypoint, skipWaypoint,
    resetWaypoints, handleGoalResult,
} from './src/navigation.js'

createRosConnection({
    onConnect: (ros) => {
        setupOdomSubscription(ros, mqttClient)
        setupPoseSubscription(ros, mqttClient)
        setupNavFeedback(ros, mqttClient, (status) => handleGoalResult(ros, status))
    },
    onDisconnect: () => {
        teardownOdom()
        teardownPose()
        teardownNavFeedback()
    },
})

mqttClient.on('message', (topic, message) => {
    let data = {}
    try { data = JSON.parse(message.toString()) } catch { /* empty payload is valid */ }

    if (topic === 'amr/system/connect')    { reconnectRos(data.url); return }
    if (topic === 'amr/system/disconnect') { resetWaypoints(); disconnectRos(); return }

    const ros = getRos()
    if (!ros) {
        logger.warn('ROS not connected, dropping command', { topic })
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
