import * as ROSLIB from 'roslib'

const DIST_THRESHOLD = 0.05
const HEAD_THRESHOLD = 5 * Math.PI / 180
const HEARTBEAT_MS   = 5000

let lastOdomMsg     = null
let lastPos         = null
let lastYaw         = null
let heartbeatHandle = null

export function setupOdomSubscription(ros, mqttClient) {
    const odom = new ROSLIB.Topic({
        ros,
        name: '/diff_controller/odom',
        messageType: 'nav_msgs/Odometry',
    })

    heartbeatHandle = setInterval(() => {
        if (lastOdomMsg) _publishOdom(lastOdomMsg, 'heartbeat', mqttClient)
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
            const d  = Math.sqrt((pos.x - lastPos.x) ** 2 + (pos.y - lastPos.y) ** 2)
            let   dh = Math.abs(yaw - lastYaw)
            if (dh > Math.PI) dh = 2 * Math.PI - dh
            if (d  > DIST_THRESHOLD) trigger = 'distance'
            else if (dh > HEAD_THRESHOLD) trigger = 'heading'
        }

        if (trigger) {
            _publishOdom(msg, trigger, mqttClient)
            lastPos = { x: pos.x, y: pos.y, z: pos.z }
            lastYaw = yaw
        }
    })
}

export function teardownOdom() {
    clearInterval(heartbeatHandle)
    heartbeatHandle = null
    lastOdomMsg     = null
    lastPos         = null
    lastYaw         = null
}

function _publishOdom(msg, trigger, mqttClient) {
    const pos = msg.pose.pose.position
    const ori = msg.pose.pose.orientation
    const lv  = msg.twist.twist.linear.x
    const av  = msg.twist.twist.angular.z

    const payload = {
        timestamp:        new Date().toISOString(),
        position:         { x: pos.x, y: pos.y, z: pos.z },
        orientation:      { x: ori.x, y: ori.y, z: ori.z, w: ori.w },
        linear_velocity:  lv,
        angular_velocity: av,
        moving:           Math.abs(lv) > 0.01 || Math.abs(av) > 0.01,
        trigger,
    }

    mqttClient.publish('amr/state/odom', JSON.stringify(payload), { qos: 1 }, (err) => {
        if (err) console.error('[MQTT] Publish error:', err)
        else console.log(`[ROS→MQTT] amr/state/odom (${trigger})`)
    })
}
