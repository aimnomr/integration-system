import 'dotenv/config'
import * as ROSLIB from 'roslib'
import mqtt from 'mqtt'

// --- MQTT ---
const mqttClient = mqtt.connect(process.env.MQTT_BROKER)

// --- ROS connection state ---
let currentRos = null
let shouldReconnect = true
let rosbridgeUrl = process.env.ROSBRIDGE_URL

// --- Odom throttle state ---
let lastOdomMsg = null
let lastPos = null
let lastYaw = null
let heartbeatHandle = null
const DIST_THRESHOLD = 0.05         // metres
const HEAD_THRESHOLD = 5 * Math.PI / 180  // 5 degrees in radians
const HEARTBEAT_MS = 5000

// --- Waypoint sequence state ---
let waypointQueue = []
let currentWaypointIdx = 0

// =============================================================
// MQTT
// =============================================================

mqttClient.on('connect', () => {
    console.log('[MQTT] Connected to broker')
    mqttClient.subscribe([
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

mqttClient.on('error', (err) => {
    console.error('[MQTT] Error:', err.message)
})

mqttClient.on('message', (topic, message) => {
    let data = {}
    try { data = JSON.parse(message.toString()) } catch { /* empty payload is valid */ }

    // System control — no ROS required
    if (topic === 'amr/system/connect') { reconnectRos(data.url); return }
    if (topic === 'amr/system/disconnect') { disconnectRos(); return }

    if (!currentRos) {
        console.warn(`[MQTT→ROS] ROS not connected, dropping: ${topic}`)
        return
    }

    switch (topic) {
        case 'amr/cmd/goal':          sendGoal(data);          break
        case 'amr/cmd/waypoints':     startWaypoints(data);    break
        case 'amr/cmd/cancel':        cancelGoal();            break
        case 'amr/cmd/waypoints/retry': retryWaypoint();       break
        case 'amr/cmd/waypoints/skip':  skipWaypoint();        break
    }
})

// =============================================================
// ROS connection
// =============================================================

function createRosConnection() {
    const ros = new ROSLIB.Ros({ url: rosbridgeUrl })
    currentRos = ros

    ros.on('connection', () => {
        console.log('[ROS] Connected to rosbridge')
        setupOdomSubscription(ros)
    })

    ros.on('error', (err) => {
        console.error('[ROS] Error:', err)
    })

    ros.on('close', () => {
        currentRos = null
        clearInterval(heartbeatHandle)
        if (shouldReconnect) {
            console.warn('[ROS] Connection closed — reconnecting in 3s...')
            setTimeout(createRosConnection, 3000)
        } else {
            console.log('[ROS] Disconnected intentionally')
        }
    })
}

function reconnectRos(url) {
    if (url) rosbridgeUrl = url
    shouldReconnect = true
    if (currentRos) currentRos.close()   // close triggers auto-reconnect via ros.on('close')
    else createRosConnection()
}

function disconnectRos() {
    waypointQueue = []
    currentWaypointIdx = 0
    shouldReconnect = false
    if (currentRos) currentRos.close()
}

// =============================================================
// Odometry  (ROS → MQTT)
// =============================================================

function setupOdomSubscription(ros) {
    const odom = new ROSLIB.Topic({
        ros,
        name: '/diff_controller/odom',
        messageType: 'nav_msgs/Odometry'
    })

    heartbeatHandle = setInterval(() => {
        if (lastOdomMsg) publishOdom(lastOdomMsg, 'heartbeat')
    }, HEARTBEAT_MS)

    odom.subscribe((msg) => {
        lastOdomMsg = msg

        const pos = msg.pose.pose.position
        const ori = msg.pose.pose.orientation
        const yaw = Math.atan2(
            2 * (ori.w * ori.z + ori.x * ori.y),
            1 - 2 * (ori.y * ori.y + ori.z * ori.z)
        )

        let trigger = null
        if (!lastPos) {
            trigger = 'heartbeat'
        } else {
            const d = Math.sqrt((pos.x - lastPos.x) ** 2 + (pos.y - lastPos.y) ** 2)
            let dh = Math.abs(yaw - lastYaw)
            if (dh > Math.PI) dh = 2 * Math.PI - dh
            if (d > DIST_THRESHOLD) trigger = 'distance'
            else if (dh > HEAD_THRESHOLD) trigger = 'heading'
        }

        if (trigger) {
            publishOdom(msg, trigger)
            lastPos = { x: pos.x, y: pos.y, z: pos.z }
            lastYaw = yaw
        }
    })
}

function publishOdom(msg, trigger) {
    const pos = msg.pose.pose.position
    const ori = msg.pose.pose.orientation
    const lv = msg.twist.twist.linear.x
    const av = msg.twist.twist.angular.z

    const payload = {
        timestamp: new Date().toISOString(),
        position: { x: pos.x, y: pos.y, z: pos.z },
        orientation: { x: ori.x, y: ori.y, z: ori.z, w: ori.w },
        linear_velocity: lv,
        angular_velocity: av,
        moving: Math.abs(lv) > 0.01 || Math.abs(av) > 0.01,
        trigger,
    }

    mqttClient.publish('amr/state/odom', JSON.stringify(payload), { qos: 1 }, (err) => {
        if (err) console.error('[MQTT] Publish error:', err)
        else console.log(`[ROS→MQTT] amr/state/odom (${trigger})`)
    })
}

// =============================================================
// Navigation commands  (MQTT → ROS)
// =============================================================

function sendGoal(goal) {
    const yaw = goal.angle?.z ?? 0
    const goalTopic = new ROSLIB.Topic({
        ros: currentRos,
        name: process.env.NAV_GOAL_TOPIC || '/move_base_simple/goal',
        messageType: 'geometry_msgs/PoseStamped'
    })
    goalTopic.publish({
        header: { frame_id: 'map', stamp: { sec: 0, nsec: 0 } },
        pose: {
            position: { x: goal.x, y: goal.y, z: 0 },
            orientation: {
                x: 0,
                y: 0,
                z: Math.sin(yaw / 2),
                w: Math.cos(yaw / 2),
            }
        }
    })
    console.log(`[MQTT→ROS] Goal → (${goal.x}, ${goal.y}, yaw=${yaw.toFixed(3)}rad)`)
}

function startWaypoints(data) {
    waypointQueue = data.waypoints ?? []
    currentWaypointIdx = 0
    console.log(`[Waypoints] Starting sequence of ${waypointQueue.length} waypoints`)
    sendNextWaypoint()
}

function sendNextWaypoint() {
    if (currentWaypointIdx >= waypointQueue.length) {
        console.log('[Waypoints] Sequence complete')
        return
    }
    const wp = waypointQueue[currentWaypointIdx]
    console.log(`[Waypoints] Sending ${currentWaypointIdx + 1}/${waypointQueue.length}: ${wp.label}`)
    sendGoal(wp)
}

function retryWaypoint() {
    console.log(`[Waypoints] Retrying waypoint ${currentWaypointIdx + 1}`)
    sendNextWaypoint()
}

function skipWaypoint() {
    console.log(`[Waypoints] Skipping waypoint ${currentWaypointIdx + 1}`)
    currentWaypointIdx++
    sendNextWaypoint()
}

function cancelGoal() {
    waypointQueue = []
    currentWaypointIdx = 0

    const cancelTopic = new ROSLIB.Topic({
        ros: currentRos,
        name: process.env.CANCEL_TOPIC || '/move_base/cancel',
        messageType: 'actionlib_msgs/GoalID'
    })
    cancelTopic.publish({ stamp: { sec: 0, nsec: 0 }, id: '' })
    console.log('[MQTT→ROS] Cancel published')
}

// =============================================================
// Start
// =============================================================

createRosConnection()
