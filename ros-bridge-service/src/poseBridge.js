import * as ROSLIB from 'roslib'
import logger from './logger.js'

// Bridges the AMCL map-localised pose (/amcl_pose) to amr/state/pose.
// /amcl_pose is available only when the robot runs in mapping:=false mode.
// Throttled like odomBridge: publish on distance/heading change, plus a heartbeat.

const DIST_THRESHOLD = 0.05
const HEAD_THRESHOLD = 5 * Math.PI / 180
const HEARTBEAT_MS   = 5000

let lastPoseMsg     = null
let lastPos         = null
let lastYaw         = null
let heartbeatHandle = null

function yawOf(o) {
    return Math.atan2(
        2 * (o.w * o.z + o.x * o.y),
        1 - 2 * (o.y * o.y + o.z * o.z)
    )
}

export function setupPoseSubscription(ros, mqttClient) {
    const pose = new ROSLIB.Topic({
        ros,
        name: '/amcl_pose',
        messageType: 'geometry_msgs/PoseWithCovarianceStamped',
    })

    heartbeatHandle = setInterval(() => {
        if (lastPoseMsg) _publishPose(lastPoseMsg, 'heartbeat', mqttClient)
    }, HEARTBEAT_MS)

    pose.subscribe((msg) => {
        lastPoseMsg = msg

        const p   = msg.pose.pose.position
        const yaw = yawOf(msg.pose.pose.orientation)

        let trigger = null
        if (!lastPos) {
            trigger = 'heartbeat'
        } else {
            const d  = Math.sqrt((p.x - lastPos.x) ** 2 + (p.y - lastPos.y) ** 2)
            let   dh = Math.abs(yaw - lastYaw)
            if (dh > Math.PI) dh = 2 * Math.PI - dh
            if (d  > DIST_THRESHOLD) trigger = 'distance'
            else if (dh > HEAD_THRESHOLD) trigger = 'heading'
        }

        if (trigger) {
            _publishPose(msg, trigger, mqttClient)
            lastPos = { x: p.x, y: p.y }
            lastYaw = yaw
        }
    })

    logger.info('Pose subscribed', { topic: '/amcl_pose' })
}

export function teardownPose() {
    clearInterval(heartbeatHandle)
    heartbeatHandle = null
    lastPoseMsg     = null
    lastPos         = null
    lastYaw         = null
}

function _publishPose(msg, trigger, mqttClient) {
    const p = msg.pose.pose.position
    const o = msg.pose.pose.orientation

    const payload = {
        timestamp: new Date().toISOString(),
        px:        p.x,
        py:        p.y,
        qz:        o.z,
        qw:        o.w,
        rz:        yawOf(o),
        moving:    trigger !== 'heartbeat',
        trigger,
    }

    mqttClient.publish('amr/state/pose', JSON.stringify(payload), { qos: 1 }, (err) => {
        if (err) logger.error('Publish failed', { topic: 'amr/state/pose', error: err.message })
        else logger.debug('Published pose', { trigger })
    })
}
